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
} from "@/lib/growth/bodyUniqueness";

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
});

export async function POST(req: Request) {
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

  const notes = await store.listDrafts(account.id);
  const runs = await store.listRuns(account.id);
  const historicalBodies = [
    ...bodyHistoryReferences({ drafts: notes, runs }),
    ...(parsed.data.excludeBodies ?? []).map((body) => ({ body })),
  ];
  const reviews = await store.listReviewsByAccount(account.id);
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
  const learningBrief = buildLearningBrief({
    account,
    notes,
    reviews,
    weekly: weeklyReview,
    methodId: topic.method_id,
  });

  let generated: Awaited<ReturnType<typeof generateDraftVariants>>;
  try {
    generated = await generateDraftVariants({
      tenantId: DEFAULT_TENANT_ID,
      account: generationAccount,
      run,
      topic,
      count: parsed.data.count ?? 2,
      bodyVersion: parsed.data.bodyVersion,
      excludeBodies: parsed.data.excludeBodies,
      historicalBodies,
      learningBrief,
    });
  } catch (error) {
    const incidentId = crypto.randomUUID();
    const reason = error instanceof Error ? error.message : "unknown";
    console.error("[growth] certified draft incident", JSON.stringify({
      incidentId,
      runId: run.id,
      topicId: topic.id,
      businessLine: resolveAccountBusinessLine(account),
      persona: account.persona,
      methodId: topic.method_id,
      error: reason,
    }));
    if (
      reason.startsWith("draft_unique_")
      || reason.startsWith("draft_history_")
      || reason.startsWith("draft_variant_similarity")
    ) {
      return NextResponse.json({
        error: "draft_uniqueness_failed",
        message: "本次未形成可交付的新正文，原有内容没有被替换。请稍后再试。",
        incidentId,
      }, { status: 422 });
    }
    return NextResponse.json({
      error: "draft_certification_incident",
      message: "本次正文认证出现异常，系统已记录处理，无需重复点击。",
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
  await store.saveRun(appendBodyGenerationHistory(run, drafts));

  return NextResponse.json({ drafts, topic, learningTrace: learningBrief.trace });
}
