import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateDraftVariants } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import {
  accountForBusinessGeneration,
  accountMatchesWorkspace,
  isBusinessCompatibleText,
  resolveAccountBusinessLine,
} from "@/lib/growth/businessCompatibility";
import {
  buildLearningBrief,
  buildWeeklyReviewResult,
  isWeeklyReviewStale,
} from "@/lib/growth/reviewLearning";
import {
  appendBodyGenerationHistory,
  bodyHistoryReferences,
  historyExcludingCurrentPair,
} from "@/lib/growth/bodyUniqueness";
import {
  accountProfileVersion,
  bodyPrewarmEnabled,
  freshDraftCache,
  withDraftCache,
} from "@/lib/growth/performanceCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  runId: z.string().min(1),
  topicId: z.string().min(1),
  accountId: z.string().min(1),
  businessLine: z.enum(["executive", "overseas_student"]),
  persona: z.enum(["merchant", "buyer", "expert"]),
  count: z.number().int().min(1).max(3).optional(),
  bodyVersion: z.enum(["short", "long"]).optional(),
  excludeBodies: z.array(z.string()).max(6).optional(),
  requestMode: z.enum(["interactive", "prewarm"]).optional(),
});

export async function POST(req: Request) {
  const requestStartedAt = Date.now();
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(parsed.data.runId);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const account = await store.getAccount(run.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (guard.auth.role !== "admin"
    && ((run.owner_user_id && run.owner_user_id !== guard.auth.user.id)
      || (account.owner_user_id && account.owner_user_id !== guard.auth.user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (run.account_id !== parsed.data.accountId || !accountMatchesWorkspace(account, parsed.data)) {
    return NextResponse.json({
      error: "workspace_context_mismatch",
      message: "业务或视角已经切换，请回到选题重新选择当前业务的标题。",
    }, { status: 409 });
  }
  const topic = run.topic_pool.find((candidate) => candidate.id === parsed.data.topicId);
  if (!topic) return NextResponse.json({ error: "topic_not_found" }, { status: 404 });
  const topicContext = [topic.title, topic.title_promise, topic.target_user, topic.pain].filter(Boolean).join(" ");
  if (!isBusinessCompatibleText(topicContext, parsed.data.businessLine)) {
    return NextResponse.json({
      error: "topic_business_mismatch",
      message: "这个标题属于另一条业务，系统已阻止生成。请在当前业务重新生成选题。",
    }, { status: 409 });
  }
  const generationAccount = accountForBusinessGeneration(account);
  const requestMode = parsed.data.requestMode ?? "interactive";
  const cached = bodyPrewarmEnabled()
    ? freshDraftCache(run, account, topic, Date.now(), parsed.data.bodyVersion)
    : undefined;
  if (cached) {
    const cachedDrafts = parsed.data.bodyVersion
      ? cached.drafts.filter((draft) => draft.selected_body_version === parsed.data.bodyVersion)
      : cached.drafts;
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      metadata: {
        action: requestMode === "prewarm" ? "body_preheat_ready" : "body_shown",
        accountId: account.id,
        businessLine: account.business_line,
        persona: account.persona,
        runId: run.id,
        topicId: topic.id,
        cache_hit: true,
        duration_ms: Date.now() - requestStartedAt,
      },
    });
    const response = NextResponse.json({
      drafts: cachedDrafts,
      topic,
      cacheHit: true,
      prewarm: requestMode === "prewarm",
    });
    response.headers.set("Server-Timing", `growth-draft-cache;dur=${Date.now() - requestStartedAt}`);
    return response;
  }

  const historyStartedAt = Date.now();
  const [notes, runs] = await Promise.all([
    store.listDrafts(account.id),
    store.listRuns(account.id),
  ]);
  const historyDurationMs = Date.now() - historyStartedAt;
  const referenceDraft = parsed.data.bodyVersion === "long"
    ? freshDraftCache(run, account, topic, Date.now(), "short")
      ?.drafts.find((draft) => draft.selected_body_version === "short")
    : undefined;
  const allHistoricalBodies = [
    ...bodyHistoryReferences({ drafts: notes, runs }),
    ...(parsed.data.excludeBodies ?? []).map((body) => ({ body })),
  ];
  const historicalBodies = historyExcludingCurrentPair(
    allHistoricalBodies,
    referenceDraft ? [referenceDraft.body] : [],
  );
  // 渐进式单版本正文使用的是已经锁定的标题合同，不需要先重新计算周复盘
  // 学习摘要。原先这里会额外读取全部复盘并可能写回账号，既不参与确定性
  // 组装，也把数据库尾部延迟带进用户等待路径。旧版“双版本一次生成”入口
  // 仍保留完整学习链路，兼容已有调用。
  let learningBrief: ReturnType<typeof buildLearningBrief> | undefined;
  let learningDurationMs = 0;
  if (!parsed.data.bodyVersion) {
    const learningStartedAt = Date.now();
    const reviews = await store.listReviewsByAccount(account.id, notes.map((draft) => draft.id));
    let weeklyReview = account.weekly_review ?? account.stage_review;
    if (!weeklyReview || isWeeklyReviewStale(weeklyReview, reviews)) {
      weeklyReview = buildWeeklyReviewResult({ account, notes, reviews });
      await store.saveAccount({
        ...account,
        weekly_review: weeklyReview,
        stage_review: weeklyReview,
        updated_at: new Date().toISOString(),
      });
    }
    learningBrief = buildLearningBrief({
      account,
      notes,
      reviews,
      weekly: weeklyReview,
      methodId: topic.method_id,
    });
    learningDurationMs = Date.now() - learningStartedAt;
  }

  let generated: Awaited<ReturnType<typeof generateDraftVariants>>;
  const generationStartedAt = Date.now();
  try {
    generated = await generateDraftVariants({
      tenantId: DEFAULT_TENANT_ID,
      account: generationAccount,
      run,
      topic,
      count: parsed.data.count ?? 2,
      bodyVersion: parsed.data.bodyVersion,
      referenceDraft,
      excludeBodies: parsed.data.excludeBodies,
      historicalBodies,
      learningBrief,
    });
  } catch (error) {
    const incidentId = crypto.randomUUID();
    const reason = error instanceof Error ? error.message : "unknown";
    const failureCode = reason.split(":", 1)[0];
    console.error("[growth] certified draft incident", JSON.stringify({
      incidentId,
      runId: run.id,
      topicId: topic.id,
      businessLine: resolveAccountBusinessLine(account),
      persona: account.persona,
      methodId: topic.method_id,
      failureCode,
      error: reason,
    }));
    if (failureCode === "history_duplicate") {
      return NextResponse.json({
        error: failureCode,
        message: "系统检测到新正文与近90天内容过于相似，原有内容没有被替换。请返回选题换一个角度后再试。",
        incidentId,
      }, { status: 422 });
    }
    if (failureCode === "variant_too_similar") {
      return NextResponse.json({
        error: failureCode,
        message: "短版和长版还没有拉开足够差异，系统已保留原有内容。请重新生成一次。",
        incidentId,
      }, { status: 422 });
    }
    if (failureCode === "provider_timeout" || failureCode === "model_unavailable") {
      return NextResponse.json({
        error: failureCode,
        message: "正文生成服务暂时繁忙，原有内容没有被替换。请稍后再试。",
        incidentId,
      }, { status: 503 });
    }
    if ([
      "structure_repair_failed",
      "identity_repair_failed",
      "fulfillment_repair_failed",
      "conversion_repair_failed",
      "business_mismatch",
    ].includes(failureCode)) {
      return NextResponse.json({
        error: failureCode,
        message: "系统已自动完善正文，但本次仍未达到交付标准，原有内容没有被替换。问题已记录，请换一个标题后再试。",
        incidentId,
      }, { status: 422 });
    }
    return NextResponse.json({
      error: "draft_certification_incident",
      message: "正文生成出现异常，系统已记录处理，原有内容没有被替换。",
      incidentId,
    }, { status: 503 });
  }
  const { drafts, usage } = generated;
  if (drafts.some((draft) => draft.certification_status !== "certified")) {
    const incidentId = crypto.randomUUID();
    console.error("[growth] uncertified draft blocked", JSON.stringify({
      incidentId,
      runId: run.id,
      topicId: topic.id,
      versions: drafts.map((draft) => draft.selected_body_version),
    }));
    return NextResponse.json({
      error: "draft_certification_incident",
      message: "本次正文认证出现异常，系统已记录处理，无需重复点击。",
      incidentId,
    }, { status: 503 });
  }

  console.info("[growth] draft validation summary", JSON.stringify({
    runId: run.id,
    topicId: topic.id,
    businessLine: resolveAccountBusinessLine(account),
    persona: account.persona,
    methodId: topic.method_id,
    requestedVersion: parsed.data.bodyVersion ?? "both",
    parallelRaceEnabled: process.env.GROWTH_PARALLEL_DRAFT_RACE !== "false",
    totalDurationMs: Date.now() - requestStartedAt,
    historyDurationMs,
    learningDurationMs,
    generationDurationMs: Date.now() - generationStartedAt,
    drafts: drafts.map((draft) => ({
      version: draft.selected_body_version,
      status: draft.validation_report?.status ?? "failed",
      certificationStatus: draft.certification_status,
      autoRepairAttempts: draft.validation_report?.attempts ?? 0,
      fallbackUsed: draft.fallback_used ?? false,
      totalChars: draft.word_count.total,
      failedChecks: draft.validation_checks
        .filter((check) => check.status !== "passed")
        .map((check) => check.key),
    })),
  }));

  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "draft_variants", runId: run.id, topicId: topic.id },
    });
  }

  // 生成过但尚未选用的正文也进入账号历史，防止用户反复点击后再次拿到同一篇。
  const historyRun = appendBodyGenerationHistory(run, drafts);
  const cachedRun = bodyPrewarmEnabled()
    ? withDraftCache({
      run: historyRun,
      account,
      topic,
      drafts,
      timestamp: new Date().toISOString(),
    })
    : historyRun;
  await store.saveRun(cachedRun);

  await store.saveUsage({
    tenant_id: DEFAULT_TENANT_ID,
    user_id: guard.auth.user.id,
    feature: "growth_text",
    metadata: {
      action: requestMode === "prewarm" ? "body_preheat_ready" : "body_shown",
      accountId: account.id,
      businessLine: account.business_line,
      persona: account.persona,
      runId: run.id,
      topicId: topic.id,
      cache_hit: false,
      profile_version: accountProfileVersion(account),
      duration_ms: Date.now() - requestStartedAt,
    },
  });

  const response = NextResponse.json({
    drafts,
    topic,
    learningTrace: learningBrief?.trace,
    cacheHit: false,
    prewarm: requestMode === "prewarm",
  });
  response.headers.set("Server-Timing", `growth-draft-variants;dur=${Date.now() - requestStartedAt}`);
  return response;
}
