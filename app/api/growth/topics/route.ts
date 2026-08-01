import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import {
  buildGrowthTitleFingerprint,
  buildTopicDiversitySignature,
  generateTopicBatch,
  normalizeTitleHistoryFingerprint,
  topicBatchDuplicateProblems,
} from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import type {
  GrowthAccount,
  GrowthRun,
  TitleMethodId,
  TopicCandidate,
} from "@/lib/growth/types";
import {
  buildLearningBrief,
  buildWeeklyReviewResult,
  isWeeklyReviewStale,
} from "@/lib/growth/reviewLearning";
import { ensureRecentTopicSources } from "@/lib/growth/sourceDiscovery";
import {
  freshBenchmarkSourcePlan,
  historicalSourceUrlsByMethod,
  updateBenchmarkSourceUsage,
  withHistoricalBenchmarkSourceUsage,
} from "@/lib/growth/sourceRotation";
import {
  SOURCE_MIGRATION_VERSION,
  sourceSnapshotFitsMethod,
} from "@/lib/growth/sourceMigration";
import {
  buildSingleTitleMutation,
} from "@/lib/growth/singleTitleRegeneration";
import {
  accountForBusinessGeneration,
  accountMatchesWorkspace,
} from "@/lib/growth/businessCompatibility";
import { methodsForPersona, TITLE_METHOD_BY_ID } from "@/lib/growth/methods";
import { sourceIsUsable } from "@/lib/growth/validation";
import { evaluateGrowthTitleQuality } from "@/lib/growth/titleQuality";
import {
  accountProfileVersion,
  markTopicRunConsumed,
  markTopicRunQueued,
  queuedTopicRuns,
  rollingTopicCacheEnabled,
  TOPIC_PREFETCH_MAX,
  TOPIC_PREFETCH_TARGET,
  topicPrefetchEnabled,
} from "@/lib/growth/performanceCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 单次请求只允许完成一轮可交付生成；失败槽位会部分交付而非在同一请求中
// 全批反复重跑，避免命中 Vercel 的 300 秒硬超时。
export const maxDuration = 180;

const DEFAULT_TENANT_ID = "mianbajun";
// 浏览器在请求已经到达服务端后断网时，会以同一个 requestId 再发一次。
// 在最终结果写入前先保留一个极小的 run 占位，避免第二个请求重新调用模型。
// 占位超时后才允许接管，防止某次函数实例异常退出后永久卡住。
const GENERATION_RESERVATION_TTL_MS = 4 * 60 * 1_000;
const inFlightGenerationRequests = new Map<string, number>();

function generationReservationIsFresh(run: GrowthRun) {
  return run.generation_status === "generating"
    && Date.now() - Date.parse(run.updated_at) < GENERATION_RESERVATION_TTL_MS;
}

function pendingGenerationResponse() {
  return NextResponse.json({
    status: "generating" as const,
    retryAfterMs: 1_500,
    message: "刚才点击的这批标题仍在生成，系统正在安全恢复同一批，不会重复生成。",
  });
}

function requestIsAlreadyInFlight(accountId: string, requestId?: string) {
  if (!requestId) return false;
  const key = `${accountId}:${requestId}`;
  const startedAt = inFlightGenerationRequests.get(key);
  if (startedAt && Date.now() - startedAt < GENERATION_RESERVATION_TTL_MS) return true;
  if (startedAt) inFlightGenerationRequests.delete(key);
  inFlightGenerationRequests.set(key, Date.now());
  return false;
}

function releaseInFlightGenerationRequest(accountId: string, requestId?: string) {
  if (requestId) inFlightGenerationRequests.delete(`${accountId}:${requestId}`);
}

function completedGenerationResponse(
  run: GrowthRun,
  account: GrowthAccount,
  options?: { cacheHit?: boolean; message?: string },
) {
  return NextResponse.json({
    status: run.method_deliveries?.some((delivery) => delivery.status !== "ready") ? "partial" : "completed",
    run,
    newTopics: run.topic_pool,
    generatedCount: run.method_deliveries?.filter((delivery) => delivery.title_origin === "new").length ?? run.topic_pool.length,
    retainedCount: run.method_deliveries?.filter((delivery) => delivery.title_origin === "retained").length ?? 0,
    pausedCount: run.method_deliveries?.filter((delivery) => delivery.status === "paused").length ?? 0,
    failedCount: run.method_deliveries?.filter((delivery) => delivery.status === "failed").length ?? 0,
    methodDeliveries: run.method_deliveries ?? [],
    sourceUsageStatus: "passed" as const,
    uniquenessStatus: run.uniqueness_status ?? "passed",
    migrationStatus: run.migration_status ?? "passed",
    structureVersion: run.structure_version ?? SOURCE_MIGRATION_VERSION,
    rotationMode: run.source_rotation?.mode ?? "regenerate_titles",
    changedMethods: run.source_rotation?.changed_method_ids ?? [],
    retainedMethods: run.source_rotation?.retained_method_ids ?? [],
    pausedMethods: run.unavailable_methods ?? [],
    unavailableMethods: run.unavailable_methods ?? [],
    topicSources: account.topic_sources ?? [],
    sourceUsage: account.benchmark_source_usage ?? [],
    sourceRefresh: {
      status: "cached" as const,
      provider: "redfox_daily" as const,
      fetched_count: 0,
      selected_count: 0,
      usable_count: 0,
      message: options?.message ?? "已恢复刚才完成的标题批次，没有重复生成。",
    },
    cacheHit: options?.cacheHit ?? false,
  });
}

const bodySchema = z.object({
  accountId: z.string().min(1),
  businessLine: z.enum(["executive", "overseas_student"]),
  persona: z.enum(["merchant", "buyer", "expert"]),
  week: z.number().int().min(1).max(4).optional(),
  generationMode: z.enum(["default", "explore"]).optional(),
  action: z.enum([
    "regenerate_titles",
    "regenerate_single_title",
    "rotate_single_source",
    "rotate_all_sources",
  ]).optional(),
  methodId: z.string().optional(),
  topicId: z.string().optional(),
  baseRunId: z.string().optional(),
  requestId: z.string().min(8).max(160).optional(),
  requestMode: z.enum(["interactive", "prefetch"]).optional(),
  prefetchTarget: z.number().int().min(1).max(TOPIC_PREFETCH_MAX).optional(),
});

const updateTitleSchema = z.object({
  runId: z.string().min(1),
  topicId: z.string().min(1),
  accountId: z.string().min(1),
  businessLine: z.enum(["executive", "overseas_student"]),
  persona: z.enum(["merchant", "buyer", "expert"]),
  title: z.string().trim().min(1, "标题不能为空").refine(
    (value) => Array.from(value).length <= 20,
    "小红书标题不能超过20个字",
  ).optional(),
  syncPromise: z.boolean().optional(),
}).refine((value) => value.title || value.syncPromise, {
  message: "需要提供标题或同步正文承诺",
});

function syncedPromise(title: string, current: string) {
  const promisedCount = title.match(/(\d+|[一二三四五六七八九十两]+)(?=[项条步个份张])/u)?.[0];
  let promise = current.trim();
  if (promisedCount) {
    promise = promise.replace(/(\d+|[一二三四五六七八九十两]+)(?=[项条步个份张])/u, promisedCount);
  }
  return `围绕“${title}”自然展开并完整兑现；${promise.replace(/^围绕“[^”]+”自然展开并完整兑现；/u, "")}`;
}

function now() {
  return new Date().toISOString();
}

function sourceForMethod(account: GrowthAccount, methodId: TitleMethodId) {
  return [...(account.topic_sources ?? [])]
    .filter((source) => source.method_id === methodId
      && sourceIsUsable(source)
      && sourceSnapshotFitsMethod(source, account.business_line ?? "executive").passed)
    .sort((a, b) => b.collected_at.localeCompare(a.collected_at))[0];
}

function changedSources(
  before: GrowthAccount,
  after: GrowthAccount,
  methodIds: TitleMethodId[],
) {
  return methodIds.filter((methodId) => {
    const previous = sourceForMethod(before, methodId);
    const next = sourceForMethod(after, methodId);
    return Boolean(next && (!previous || previous.original_url !== next.original_url));
  });
}

function accountWithRotatedSources(input: {
  before: GrowthAccount;
  discovered: GrowthAccount;
  methodIds: TitleMethodId[];
  changedMethodIds: TitleMethodId[];
  dropMissing: boolean;
}) {
  const targets = new Set(input.methodIds);
  const changed = new Set(input.changedMethodIds);
  const replacements = input.methodIds.flatMap((methodId) => {
    if (!changed.has(methodId)) return [];
    const source = sourceForMethod(input.discovered, methodId);
    return source ? [source] : [];
  });
  return {
    ...input.discovered,
    topic_sources: [
      ...replacements,
      ...(input.before.topic_sources ?? []).filter((source) =>
        !targets.has(source.method_id) || (!input.dropMissing && !changed.has(source.method_id))
      ),
    ],
    updated_at: now(),
  };
}

/**
 * 槽位级交付：新标题只替换自身方法；未通过的槽位继续沿用上一批，
 * 绝不因为一个槽位暂停而清空已经可用的标题。
 */
function mergeDeliveredTopicPool(input: {
  previous: TopicCandidate[];
  generated: TopicCandidate[];
  methods: ReturnType<typeof methodsForPersona>;
}) {
  const previousByMethod = new Map(input.previous.map((topic) => [topic.method_id, topic]));
  const generatedByMethod = new Map(input.generated.map((topic) => [topic.method_id, topic]));
  return input.methods.flatMap((method) => {
    const topic = generatedByMethod.get(method.id) ?? previousByMethod.get(method.id);
    return topic ? [topic] : [];
  });
}

/**
 * v3.8 的语义槽位是来源型标题能否继续展示的最低依据。旧 v3.7 标题没有
 * 这份可核验链路，下一次生成时必须暂停或重新产出，不能被“保留上一批”逻辑
 * 悄悄带回页面。
 */
function retainableTopicUnderCurrentSourceMigration(topic: TopicCandidate) {
  const method = TITLE_METHOD_BY_ID[topic.method_id];
  return !method?.sourceRequired || topic.structure_version === SOURCE_MIGRATION_VERSION;
}

/**
 * 正常“换一批”时，只把未曾用于该方法的新母题放进本轮账号上下文。
 *
 * 这一步不能只依赖自动热榜：运营手工补充、但尚未使用过的有效来源同样
 * 应该优先可用。找不到新来源的槽位则主动移除旧来源，让生成器给出“暂停”，
 * 而不是悄悄沿用历史母题。
 */
function accountWithFreshBenchmarkSources(input: {
  before: GrowthAccount;
  discovered: GrowthAccount;
  runs: GrowthRun[];
  methodIds: TitleMethodId[];
}) {
  const plans = freshBenchmarkSourcePlan({
    account: input.before,
    runs: input.runs,
    methodIds: input.methodIds,
    candidateSources: input.discovered.topic_sources,
  });
  const occupiedUrls = new Set<string>();
  const replacements = input.methodIds.flatMap((methodId) => {
    const plan = plans.find((item) => item.method_id === methodId);
    if (!plan || plan.status !== "ready") return [];
    const usedForMethod = new Set(plan.used_source_urls);
    const source = [...(input.discovered.topic_sources ?? [])]
      .filter((item) => item.method_id === methodId)
      .filter((item) => sourceIsUsable(item))
      .filter((item) => sourceSnapshotFitsMethod(item, input.before.business_line ?? "executive").passed)
      .filter((item) => !usedForMethod.has(item.original_url))
      .filter((item) => !occupiedUrls.has(item.original_url))
      .sort((a, b) => b.collected_at.localeCompare(a.collected_at))[0];
    if (!source) return [];
    occupiedUrls.add(source.original_url);
    return [source];
  });
  const targets = new Set(input.methodIds);
  return {
    ...input.discovered,
    topic_sources: [
      ...replacements,
      ...(input.discovered.topic_sources ?? []).filter((source) => !targets.has(source.method_id)),
    ],
    updated_at: now(),
  };
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now();
  const cronAuthorized = Boolean(
    process.env.CRON_SECRET
    && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`,
  );
  const guard = cronAuthorized ? null : await requireMianbaApiAuth();
  if (guard && "response" in guard) return guard.response;
  const authRole = cronAuthorized ? "admin" : guard!.auth.role;
  const authUserId = cronAuthorized ? "system-growth-prefetch" : guard!.auth.user.id;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  let account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (authRole !== "admin" && account.owner_user_id && account.owner_user_id !== authUserId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!accountMatchesWorkspace(account, parsed.data)) {
    return NextResponse.json({
      error: "workspace_context_mismatch",
      message: "业务或视角已经切换，请等待当前业务加载完成后再生成选题。",
    }, { status: 409 });
  }
  account = accountForBusinessGeneration(account);
  const action = parsed.data.action ?? "regenerate_titles";
  const generationMode = parsed.data.generationMode ?? "default";
  const applicableMethods = methodsForPersona(
    account.persona,
    generationMode,
    account.method_overrides,
  );
  const requestedMethod = parsed.data.methodId && parsed.data.methodId in TITLE_METHOD_BY_ID
    ? TITLE_METHOD_BY_ID[parsed.data.methodId as TitleMethodId]
    : null;
  if (
    action === "rotate_single_source"
    && (!requestedMethod
      || !requestedMethod.sourceRequired
      || !applicableMethods.some((method) => method.id === requestedMethod.id))
  ) {
    return NextResponse.json({
      error: "invalid_rotation_method",
      message: "当前业务、视角或生成区域不包含这个来源型方法。",
    }, { status: 400 });
  }
  if (
    action === "regenerate_single_title"
    && (!requestedMethod
      || requestedMethod.group !== "native"
      || !applicableMethods.some((method) => method.id === requestedMethod.id)
      || !parsed.data.topicId)
  ) {
    return NextResponse.json({
      error: "invalid_single_title_method",
      message: "当前业务、视角或生成区域不包含这个原生法标题。",
    }, { status: 400 });
  }
  const notes = await store.listDrafts(account.id);
  const reviews = await store.listReviewsByAccount(account.id);
  const runs = await store.listRuns(account.id);
  const requestMode = parsed.data.requestMode ?? "interactive";
  const freshQueuedRuns = queuedTopicRuns(runs, account, generationMode);
  const previouslyConsumed = requestMode === "interactive" && parsed.data.requestId
    ? runs.find((run) => run.prefetch?.consumed_request_id === parsed.data.requestId)
    : undefined;
  if (previouslyConsumed) {
    return completedGenerationResponse(previouslyConsumed, account, {
      cacheHit: true,
      message: "已恢复刚才切换完成的标题批次，没有再次消耗下一批。",
    });
  }
  // 用户点击“生成/换一批”时，优先消费已经完成全部门禁的后台批次。
  // 消费动作只改运行状态，不重新调用模型，因此速度与实时生成质量完全解耦。
  if (
    requestMode === "interactive"
    && action === "regenerate_titles"
    && topicPrefetchEnabled()
    && rollingTopicCacheEnabled()
    && freshQueuedRuns.length > 0
  ) {
    // 预生成发生在用户操作之前。即使后台补货请求按顺序运行，跨函数实例、
    // 页面重开或补货任务重叠仍可能让两批库存基于同一份旧历史生成。消费前
    // 必须再用“用户此刻真正看过的标题”做一次零模型硬校验，避免把只换一个
    // 近义词的缓存标题连续展示给用户。失败库存仅标记过期，原始记录仍保留。
    const visibleHistoryTitles = Array.from(new Set([
      ...runs
        .filter((run) => run.prefetch?.status !== "queued" && run.prefetch?.status !== "expired")
        .flatMap((run) => run.topic_pool.map((topic) => topic.title)),
      ...notes.map((draft) => draft.title),
    ].filter(Boolean)));
    let queuedForConsumption: GrowthRun | undefined;
    const skippedQueuedRunIds = new Set<string>();
    for (const queuedRun of freshQueuedRuns) {
      const duplicateProblems = topicBatchDuplicateProblems(
        queuedRun.topic_pool,
        visibleHistoryTitles,
        [],
        account.business_line ?? "executive",
      );
      if (!duplicateProblems.length) {
        queuedForConsumption = queuedRun;
        break;
      }
      const expiredAt = now();
      skippedQueuedRunIds.add(queuedRun.id);
      const failedMethodIds = [...new Set(duplicateProblems.flatMap((problem) => {
        const methodId = problem.split(":", 1)[0] as TitleMethodId;
        return methodId in TITLE_METHOD_BY_ID ? [methodId] : [];
      }))];
      await store.saveRun({
        ...queuedRun,
        generation_status: "failed",
        uniqueness_status: "failed",
        prefetch: queuedRun.prefetch ? {
          ...queuedRun.prefetch,
          status: "expired",
          expires_at: expiredAt,
        } : queuedRun.prefetch,
        generation_diagnostics: {
          ...(queuedRun.generation_diagnostics ?? {}),
          total_ms: queuedRun.generation_diagnostics?.total_ms ?? 0,
          failure_phase: "cache_consumption_novelty",
          failed_method_ids: failedMethodIds,
        },
        updated_at: expiredAt,
      });
      console.warn("[growth] skipped stale prefetched title batch at consumption", {
        run_id: queuedRun.id,
        duplicate_problems: duplicateProblems.slice(0, 6),
      });
    }
    if (!queuedForConsumption) {
      return pendingGenerationResponse();
    }
    const timestamp = now();
    const consumed = markTopicRunConsumed(queuedForConsumption, timestamp, parsed.data.requestId);
    await store.saveRun(consumed);
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: account.owner_user_id ?? authUserId,
      feature: "growth_text",
      metadata: {
        action: "topic_batch_swapped",
        accountId: account.id,
        businessLine: account.business_line,
        persona: account.persona,
        generationMode,
        runId: consumed.id,
        cache_hit: true,
        queue_remaining: freshQueuedRuns.filter((run) => (
          run.id !== consumed.id && !skippedQueuedRunIds.has(run.id)
        )).length,
        duration_ms: Date.now() - requestStartedAt,
      },
    });
    const response = completedGenerationResponse(consumed, account, {
      cacheHit: true,
      message: "新一批标题已准备好并立即切换，后台会继续补充后续批次。",
    });
    response.headers.set("Server-Timing", `growth-topic-cache;dur=${Date.now() - requestStartedAt}`);
    return response;
  }
  // 页面打开后会无感预生成标题。如果操作者紧接着点击“换一批”，不能再并行
  // 启动第二条模型链路：两路会争抢时限和配额，既更慢，也更容易让严格门禁
  // 拒绝整批。这里让交互请求短轮询同一个账号；后台批次完成后，下一次轮询
  // 会在上面的缓存分支中立即消费。若后台失败，失败占位关闭后才走实时兜底。
  const activeAccountGeneration = runs.find((run) =>
    run.generation_status === "generating" && generationReservationIsFresh(run)
  );
  if (requestMode === "interactive" && action === "regenerate_titles" && activeAccountGeneration) {
    return pendingGenerationResponse();
  }
  // 后台滚动补批始终保持小队列。达到目标后直接返回现有缓存，避免烧掉无效
  // token；硬上限用于阻止多个页面同时预取导致库存失控。
  if (
    requestMode === "prefetch"
    && (!topicPrefetchEnabled() || !rollingTopicCacheEnabled()
      || freshQueuedRuns.length >= Math.min(parsed.data.prefetchTarget ?? TOPIC_PREFETCH_TARGET, TOPIC_PREFETCH_MAX))
  ) {
    const existing = freshQueuedRuns[0];
    if (existing) {
      return completedGenerationResponse(existing, account, {
        cacheHit: true,
        message: "后台标题库存已经充足。",
      });
    }
    return NextResponse.json({
      status: "completed" as const,
      prefetchStatus: "disabled" as const,
      cacheHit: false,
      message: "标题预生成当前未启用。",
    });
  }
  // 不把 store 的返回顺序当成隐式合同：标题历史进入模型时必须始终是最新在前。
  // 服务端仍使用完整历史做门禁，模型只取这份列表的前 160 条近期标题。
  const runsNewestFirst = [...runs].sort((left, right) => (
    Date.parse(right.created_at) - Date.parse(left.created_at)
  ));
  const notesNewestFirst = [...notes].sort((left, right) => (
    Date.parse(right.updated_at) - Date.parse(left.updated_at)
  ));
  // 浏览器可能在服务端保存成功后断开。本次请求带着同一个 requestId 重试时，
  // 必须返回原批次，不能再次生成或覆盖标题。
  const idempotentRun = parsed.data.requestId
    ? runs.find((run) => run.generation_request_id === parsed.data.requestId)
    : undefined;
  if (idempotentRun && generationReservationIsFresh(idempotentRun)) {
    return pendingGenerationResponse();
  }
  if (idempotentRun?.generation_status === "completed") {
    return completedGenerationResponse(idempotentRun, account);
  }
  if (requestIsAlreadyInFlight(account.id, parsed.data.requestId)) {
    return pendingGenerationResponse();
  }
  account = withHistoricalBenchmarkSourceUsage(account, runs);
  // 断网恢复时的“生成中”占位不能被当成上一批标题；它没有题目，也绝不能
  // 影响单槽换题、来源轮换和历史去重。
  const previousRuns = runsNewestFirst.filter((item) =>
    item.generation_mode === generationMode
    && item.topic_pool.length > 0
    && (requestMode === "prefetch" || item.prefetch?.status !== "queued")
  );
  const latestRun = parsed.data.baseRunId
    ? previousRuns.find((run) => run.id === parsed.data.baseRunId) ?? previousRuns[0] ?? null
    : previousRuns[0] ?? null;
  if (action !== "regenerate_titles" && !latestRun) {
    return NextResponse.json({
      error: "rotation_requires_batch",
      message: "请先生成一批标题，再进行单槽更新。",
    }, { status: 409 });
  }
  const requestedTopic = action === "regenerate_single_title"
    ? latestRun?.topic_pool.find((topic) =>
      topic.id === parsed.data.topicId
      && topic.method_id === requestedMethod!.id
      && topic.method_group === "native"
    )
    : undefined;
  if (action === "regenerate_single_title" && !requestedTopic) {
    return NextResponse.json({
      error: "single_title_topic_not_found",
      message: "当前标题批次已经变化，请刷新后再换标题。",
    }, { status: 409 });
  }
  if (
    action === "regenerate_single_title"
    && (requestedTopic?.title_promise_status === "stale"
      || requestedTopic?.title_promise_status === "invalid")
  ) {
    return NextResponse.json({
      error: "single_title_direction_not_synced",
      message: "当前手工标题与正文承诺尚未同步，请先更新正文承诺，再换标题。",
    }, { status: 409 });
  }
  if (
    action === "regenerate_single_title"
    && requestedMethod?.sourceRequired
    && !sourceIsUsable(requestedTopic?.source_snapshot)
  ) {
    return NextResponse.json({
      error: "single_title_source_unavailable",
      message: requestedMethod.id === "traffic"
        ? "当前热点已超过有效期，请先点击“换一个热点”，再生成新标题。"
        : "当前来源已经失效，请先更换来源。",
    }, { status: 422 });
  }
  if (action === "regenerate_single_title" && requestedTopic?.source_snapshot) {
    account = {
      ...account,
      topic_sources: [
        requestedTopic.source_snapshot,
        ...(account.topic_sources ?? []).filter((source) =>
          source.method_id !== requestedTopic.method_id
        ),
      ],
    };
  }

  const sourceAccountBefore = account;
  const benchmarkMethods = applicableMethods.filter((method) =>
    method.group === "benchmark" && method.sourceRequired
  );
  const rotationMethodIds = action === "rotate_single_source"
    ? [requestedMethod!.id]
    : benchmarkMethods.map((method) => method.id);
  let changedMethodIds: TitleMethodId[] = [];
  let sourceRefreshSummary: Awaited<ReturnType<typeof ensureRecentTopicSources>>["summary"];
  const sourceStartedAt = Date.now();

  if (action === "rotate_single_source" || action === "rotate_all_sources") {
    // “换一个母题”和“换一批标题”遵循同一规则：同一业务×视角×方法下，
    // 已经使用过的来源永久不再回收。否则超过 30 天仍可能悄悄复用旧母题。
    const historical = historicalSourceUrlsByMethod({
      account,
      runs,
      methodIds: rotationMethodIds,
    });
    const excluded = [...new Set([...historical.values()].flat())];
    const discovered = await ensureRecentTopicSources(account, {
      force: true,
      methodIds: rotationMethodIds,
      excludeUrls: excluded,
    });
    sourceRefreshSummary = discovered.summary;
    changedMethodIds = changedSources(account, discovered.account, rotationMethodIds);
    if (
      (action === "rotate_single_source" && !changedMethodIds.includes(requestedMethod!.id))
      || (action === "rotate_all_sources" && changedMethodIds.length === 0)
    ) {
      return NextResponse.json({
        error: "no_new_benchmark_source",
        message: "近30天来源已排除后，暂时没有找到新的合格母题；当前批次保持不变。",
        sourceRefresh: sourceRefreshSummary,
      }, { status: 422 });
    }
    account = accountWithRotatedSources({
      before: account,
      discovered: discovered.account,
      methodIds: rotationMethodIds,
      changedMethodIds,
      dropMissing: action === "rotate_all_sources",
    });
  } else if (action === "regenerate_titles") {
    // “换一批标题”里的对标槽位必须换从未使用过的新母题。
    // 找不到新来源时只暂停该槽位，绝不复用旧母题、更不拖死原生法。
    const sourceMethodIds = benchmarkMethods.map((method) => method.id);
    const allHistoricalSourceUrls = historicalSourceUrlsByMethod({
      account,
      runs,
      methodIds: sourceMethodIds,
    });
    const hasUnusedCurrentSource = new Set(sourceMethodIds.filter((methodId) => {
      const used = new Set(allHistoricalSourceUrls.get(methodId) ?? []);
      return (account!.topic_sources ?? []).some((source) =>
        source.method_id === methodId
        && sourceIsUsable(source)
        && sourceSnapshotFitsMethod(source, account!.business_line ?? "executive").passed
        && !used.has(source.original_url)
      );
    }));
    const methodsNeedingDiscovery = sourceMethodIds.filter((methodId) => !hasUnusedCurrentSource.has(methodId));
    // 新发现的母题不能与任何历史对标槽位共用，避免“换了方法却仍是旧母题”。
    const excluded = [...new Set([...allHistoricalSourceUrls.values()].flat())];
    const discovered = methodsNeedingDiscovery.length
      ? await ensureRecentTopicSources(account, {
        force: true,
        methodIds: methodsNeedingDiscovery,
        excludeUrls: excluded,
      })
      : {
        account,
        summary: {
          status: "cached" as const,
          provider: "redfox_daily" as const,
          rank_date: "",
          fetched_count: 0,
          selected_count: hasUnusedCurrentSource.size,
          usable_count: hasUnusedCurrentSource.size,
          message: "当前已有从未使用过的有效母题，本轮直接使用，不重复请求热榜。",
        },
      };
    sourceRefreshSummary = discovered.summary;
    const freshAccount = accountWithFreshBenchmarkSources({
      before: account,
      discovered: discovered.account,
      methodIds: sourceMethodIds,
      runs,
    });
    changedMethodIds = changedSources(account, freshAccount, sourceMethodIds);
    account = freshAccount;
  } else {
    sourceRefreshSummary = {
      status: "cached",
      provider: "redfox_daily",
      rank_date: "",
      fetched_count: 0,
      selected_count: 0,
      usable_count: 0,
      message: "保留当前选题方向和来源，只更新这个标题的表达。",
    };
  }
  const sourceElapsedMs = Date.now() - sourceStartedAt;

  let weeklyReview = account.weekly_review ?? account.stage_review;
  if (!weeklyReview || isWeeklyReviewStale(weeklyReview, reviews)) {
    weeklyReview = buildWeeklyReviewResult({ account, notes, reviews });
    account = {
      ...account,
      weekly_review: weeklyReview,
      stage_review: weeklyReview,
      updated_at: new Date().toISOString(),
    };
  }
  const learningBrief = buildLearningBrief({ account, notes, reviews, weekly: weeklyReview });
  const currentTitles = latestRun?.topic_pool.map((topic) => topic.title) ?? [];
  // 标题历史分成两层：
  // 1. 已经真正交付到页面或进入正文的标题，继续执行严格语义去重；
  // 2. 失败批次里被门禁拒绝的草稿，只禁止原样再次出现，并用于提示模型换角度。
  //
  // 旧实现把 seen_titles 全部并入正式历史。失败草稿因此会在下一次请求中
  // 拥有和已交付标题相同的语义否决权，连补齐身份后的正确版本也会被挡住。
  const deliveredHistoryTitles = Array.from(new Set([
    ...runsNewestFirst.flatMap((item) => item.topic_pool.map((topic) => topic.title)),
    ...notesNewestFirst.map((draft) => draft.title),
  ].filter(Boolean)));
  const attemptedHistoryTitles = Array.from(new Set([
    ...runsNewestFirst.flatMap((item) => item.seen_titles ?? []),
    ...deliveredHistoryTitles,
  ].filter(Boolean)));
  // 单槽换题和换母题会把未变化的槽位复制到新 run。这里按“方法×标题指纹”
  // 去重，避免同一个旧标题被误算成近5批里重复使用了很多次。
  const historyTopicMap = new Map<string, {
    method_id: TitleMethodId;
    title: string;
    sentence_frame?: string;
    mother_topic_key?: string;
    material_signature?: string;
    source_id?: string;
    batch_index: number;
  }>();
  runsNewestFirst.forEach((item, batchIndex) => {
    item.topic_pool.forEach((topic) => {
      const historyKey = `${topic.method_id}:${normalizeTitleHistoryFingerprint(topic.title)}`;
      if (historyTopicMap.has(historyKey)) return;
      const stored = item.title_fingerprints?.find((fingerprint) =>
        fingerprint.method_id === topic.method_id && fingerprint.title === topic.title
      );
      const diversity = stored?.sentence_frame && stored?.mother_topic_key && stored?.material_signature
        ? stored
        : buildTopicDiversitySignature(topic, account!.business_line ?? "executive");
      historyTopicMap.set(historyKey, {
        method_id: topic.method_id,
        title: topic.title,
        sentence_frame: diversity.sentence_frame,
        mother_topic_key: diversity.mother_topic_key,
        material_signature: diversity.material_signature,
        source_id: stored?.source_id ?? topic.source_snapshot?.id,
        batch_index: batchIndex,
      });
    });
  });
  const historyTopics = [...historyTopicMap.values()];

  const generationMethodIds = action === "rotate_single_source"
    ? [requestedMethod!.id]
    : action === "regenerate_single_title"
      ? [requestedMethod!.id]
    : action === "rotate_all_sources"
      ? rotationMethodIds
      : undefined;
  let generated: Awaited<ReturnType<typeof generateTopicBatch>>;
  const generationStartedAt = Date.now();
  const generationInput = (allowSourcePause = false) => ({
    account: account!,
    week: parsed.data.week ?? latestRun?.week ?? 1,
    generationMode,
    excludeTitles: attemptedHistoryTitles,
    historyTitles: deliveredHistoryTitles,
    historyTopics,
    currentTitles,
    learningBrief,
    allowSourcePause,
    methodIds: generationMethodIds,
    directionLocks: action === "regenerate_single_title" && requestedTopic
      ? { [requestedTopic.method_id]: requestedTopic }
      : undefined,
  });
  // 把幂等键先落到 run 里，再进入模型调用。这样即使第一个请求的响应在
  // 浏览器侧丢失，第二个同 requestId 请求也只会等候/读取这一批，不会再开一批。
  let generationReservation: GrowthRun | undefined;
  const generationAccountId = account.id;
  if (parsed.data.requestId) {
    const currentRuns = await store.listRuns(account.id);
    const existingRequest = currentRuns.find((item) =>
      item.generation_request_id === parsed.data.requestId
    );
    if (existingRequest && generationReservationIsFresh(existingRequest)) {
      return pendingGenerationResponse();
    }
    if (existingRequest?.generation_status === "completed") {
      return completedGenerationResponse(existingRequest, account);
    }
    const reservationTimestamp = now();
    generationReservation = {
      id: existingRequest?.id ?? crypto.randomUUID(),
      tenant_id: DEFAULT_TENANT_ID,
      owner_user_id: existingRequest?.owner_user_id ?? account.owner_user_id ?? authUserId,
      account_id: account.id,
      status: "draft",
      week: parsed.data.week ?? latestRun?.week ?? 1,
      objective: "正在生成当前业务与视角的一批新标题。",
      experiment_hypothesis: "生成完成后再进入标题方法验证。",
      generation_mode: generationMode,
      generation_status: "generating",
      generation_request_id: parsed.data.requestId,
      topic_pool: [],
      created_at: existingRequest?.created_at ?? reservationTimestamp,
      updated_at: reservationTimestamp,
    };
    await store.saveRun(generationReservation);
  }
  const markGenerationReservationFailed = async (
    diagnostics?: Partial<NonNullable<GrowthRun["generation_diagnostics"]>>,
    rejectedTitles: string[] = [],
  ) => {
    if (!generationReservation) {
      releaseInFlightGenerationRequest(generationAccountId, parsed.data.requestId);
      return;
    }
    try {
      await store.saveRun({
        ...generationReservation,
        generation_status: "failed",
        uniqueness_status: "failed",
        generation_diagnostics: {
          total_ms: Date.now() - requestStartedAt,
          ...diagnostics,
        },
        // 即使这一批没有交付，也把已经被门禁拒绝的候选记进当前业务×视角的
        // 历史排除池。否则用户点击“再换一批”时，模型可能原样给回同一批失败题。
        seen_titles: Array.from(new Set([
          ...(generationReservation.seen_titles ?? []),
          ...rejectedTitles,
        ])).slice(-160),
        updated_at: now(),
      });
    } catch (error) {
      // 原始生成错误比“写入诊断失败”更应交给操作者；过期占位随后可安全接管。
      console.error("[growth] failed to close generation reservation:", (error as Error).message);
    } finally {
      releaseInFlightGenerationRequest(generationAccountId, parsed.data.requestId);
    }
  };
  try {
    // 每一轮只生成一次候选并按槽位返回。任何未通过的槽位暂停/保留，
    // 不再在用户请求中进行“整批三轮 + 自动换源两轮”的长链重跑。
    generated = await generateTopicBatch(generationInput(true));
  } catch (error) {
    await markGenerationReservationFailed({
      source_ms: sourceElapsedMs,
      failure_phase: "unknown",
    });
    console.error("[growth] topic generation unexpectedly failed:", (error as Error).message);
    return NextResponse.json({
      error: "topic_generation_unavailable",
      message: "标题生成服务暂时不可用，当前标题没有被替换。请稍后再试。",
    }, { status: 503 });
  }
  const {
    topics: generatedTopics,
    unavailableMethods: generatedUnavailableMethods,
    methodDeliveries: generatedMethodDeliveries,
    usage,
    generationAttempts,
    structureCards,
    nativeTitleAudit,
    rejectedTitles,
  } = generated;
  const generationElapsedMs = Date.now() - generationStartedAt;

  // 原生法没有“缺少外部来源”的合理暂停理由。若其中任何一个槽位没有
  // 交付新标题，整批就不写入、不替换旧批次；否则会把“半批/旧标题”误标成
  // 用户刚刚换出的新标题。对标和蹭流量仍可因真实母题不足而透明暂停。
  const failedNativeDeliveries = generatedMethodDeliveries.filter((delivery) => {
    const method = TITLE_METHOD_BY_ID[delivery.method_id];
    return method && !method.sourceRequired && delivery.status !== "ready";
  });
  if (failedNativeDeliveries.length) {
    const nativeAuditUnavailable = nativeTitleAudit?.status === "timeout"
      || nativeTitleAudit?.status === "incomplete"
      || nativeTitleAudit?.status === "unavailable";
    await markGenerationReservationFailed({
      source_ms: sourceElapsedMs,
      generation_ms: generationElapsedMs,
      failure_phase: nativeAuditUnavailable ? "native_audit" : "native_generation",
      failed_method_ids: failedNativeDeliveries.map((delivery) => delivery.method_id),
      native_title_audit: nativeTitleAudit,
      rejected_candidate_count: rejectedTitles?.length ?? 0,
    }, rejectedTitles ?? []);
    console.warn("[growth] native title generation incomplete", {
      failed_method_ids: failedNativeDeliveries.map((delivery) => delivery.method_id),
      native_title_audit: nativeTitleAudit,
    });
    // 操作者不需要看模型或服务端细节，但需要知道哪一个标题槽位没有通过，
    // 否则只看到“有1个未通过”无法判断是系统故障还是自己操作有误。
    const failedNativeSummary = failedNativeDeliveries.map((delivery) => {
      const label = delivery.method_label || TITLE_METHOD_BY_ID[delivery.method_id]?.label || delivery.method_id;
      return `${label}：${delivery.reason || "未生成新的合格标题"}`;
    }).join("；");
    return NextResponse.json({
      error: "native_title_generation_incomplete",
      message: nativeAuditUnavailable
        ? "系统内部的标题新颖度复核暂未完成，当前标题没有被替换；请稍后再试。"
        : `本轮有${failedNativeDeliveries.length}个原生法标题未通过质量或去重门禁，当前批次没有被替换；系统已保留原有标题。未通过槽位：${failedNativeSummary}`,
      failedMethods: failedNativeDeliveries.map((delivery) => ({
        method_id: delivery.method_id,
        method_label: delivery.method_label,
        reason: delivery.reason || "未生成新的合格标题",
      })),
      sourceRefresh: sourceRefreshSummary,
    }, { status: 503 });
  }
  if (structureCards.length) {
    const replacementKeys = new Set(structureCards.map((card) =>
      `${card.business_line}:${card.persona}:${card.method_id}:${card.source_id}`
    ));
    account = {
      ...account,
      benchmark_structure_cards: [
        ...structureCards,
        ...(account.benchmark_structure_cards ?? []).filter((card) =>
          !replacementKeys.has(`${card.business_line}:${card.persona}:${card.method_id}:${card.source_id}`)
          && Date.parse(card.expires_at) > Date.now()
        ),
      ].slice(0, 120),
      updated_at: now(),
    };
  }

  const timestamp = now();
  const regeneratedTopic = action === "regenerate_single_title"
    ? generatedTopics.find((topic) => topic.method_id === requestedMethod!.id)
    : undefined;
  const retainablePreviousTopics = (latestRun?.topic_pool ?? []).filter(
    retainableTopicUnderCurrentSourceMigration,
  );
  const topics = mergeDeliveredTopicPool({
    previous: retainablePreviousTopics,
    generated: generatedTopics,
    methods: applicableMethods,
  });
  const rotatedMethods = new Set(rotationMethodIds);
  const unavailableMethods = action === "regenerate_single_title"
    ? (latestRun?.unavailable_methods ?? []).filter((item) =>
      item.method_id !== requestedMethod!.id
    )
    : action === "rotate_single_source"
    ? [
      ...(latestRun?.unavailable_methods ?? []).filter((item) => item.method_id !== requestedMethod!.id),
      ...(generatedUnavailableMethods ?? []),
    ]
    : action === "rotate_all_sources"
      ? [
        ...(latestRun?.unavailable_methods ?? []).filter((item) => !rotatedMethods.has(item.method_id)),
        ...(generatedUnavailableMethods ?? []),
      ]
      : generatedUnavailableMethods;
  const previousByMethod = new Map(retainablePreviousTopics.map((topic) => [topic.method_id, topic]));
  const methodDeliveries = generatedMethodDeliveries.map((delivery) => {
    if (delivery.status === "ready") return delivery;
    const previous = previousByMethod.get(delivery.method_id);
    return previous
      ? {
        ...delivery,
        title_origin: "retained" as const,
        retained_from_run_id: latestRun?.id,
      }
      : delivery;
  });
  const pausedMethodIds = unavailableMethods?.map((item) => item.method_id) ?? [];
  const sourceRotationMode = action === "regenerate_titles" && changedMethodIds.length
    ? "automatic_rotation"
    : action;
  const previousSourceIds = changedMethodIds.flatMap((methodId) => {
    const source = sourceForMethod(sourceAccountBefore, methodId);
    return source ? [source.id] : [];
  });
  const newSourceIds = changedMethodIds.flatMap((methodId) => {
    const source = sourceForMethod(account!, methodId);
    return source ? [source.id] : [];
  });
  account = {
    ...account,
    benchmark_source_usage: updateBenchmarkSourceUsage({
      account,
      topics: generatedTopics,
      changedMethodIds,
      timestamp,
    }),
    updated_at: timestamp,
  };
  const nextSeen = Array.from(new Set([
    ...(latestRun?.seen_titles ?? []),
    ...(rejectedTitles ?? []),
    ...topics.map((topic) => topic.title),
  ]));
  const reportedChangedMethodIds = action === "regenerate_single_title"
    ? [requestedMethod!.id]
    : changedMethodIds;
  const sourceRotation: NonNullable<GrowthRun["source_rotation"]> = {
    mode: sourceRotationMode,
    requested_method_id: requestedMethod?.id,
    changed_method_ids: reportedChangedMethodIds,
    retained_method_ids: topics
      .map((topic) => topic.method_id)
      .filter((methodId) => !reportedChangedMethodIds.includes(methodId)),
    paused_method_ids: pausedMethodIds,
    previous_source_ids: previousSourceIds,
    new_source_ids: newSourceIds,
    created_at: timestamp,
  };
  // 每次生成都是一个独立批次。旧批次继续保留，前台可查看并恢复最近3批；
  // 新批次失败时不会覆盖当前批次，也不会清空操作者已经编辑或选中的标题。
  let run: GrowthRun = {
    id: generationReservation?.id ?? crypto.randomUUID(),
    tenant_id: DEFAULT_TENANT_ID,
    account_id: account.id,
    status: "draft",
    week: parsed.data.week ?? latestRun?.week ?? 1,
    objective: generationMode === "default" ? "按当前视角的默认方法各生成1个标题。" : "按当前视角的探索方法各生成1个标题。",
    experiment_hypothesis: "用有效咨询率验证标题方法，而不是依赖主观评分。",
    generation_mode: generationMode,
    generation_status: "completed",
    uniqueness_status: "passed",
    generation_attempts: generationAttempts,
    generation_request_id: parsed.data.requestId,
    structure_version: SOURCE_MIGRATION_VERSION,
    migration_status: "passed",
    source_rotation: sourceRotation,
    title_mutation: action === "regenerate_single_title" && requestedTopic && regeneratedTopic && latestRun
      ? buildSingleTitleMutation({
        parentRunId: latestRun.id,
        current: requestedTopic,
        generated: regeneratedTopic,
        generationAttempts,
        createdAt: timestamp,
      })
      : undefined,
    topic_pool: topics,
    unavailable_methods: unavailableMethods,
    method_deliveries: methodDeliveries,
    seen_titles: nextSeen,
    title_fingerprints: topics.map((topic) =>
      buildGrowthTitleFingerprint({ account: account!, topic, generationMode })
    ),
    learning_trace: learningBrief.trace,
    created_at: generationReservation?.created_at ?? timestamp,
    updated_at: timestamp,
  };

  if (requestMode === "prefetch") {
    run = markTopicRunQueued({
      run,
      account,
      mode: generationMode,
      batchNumber: freshQueuedRuns.length + 1,
      timestamp,
    });
  }

  run.owner_user_id = run.owner_user_id ?? account.owner_user_id ?? authUserId;
  const confirmedExperiment = [...(account.cycle_experiments ?? [])].reverse().find((item) => item.status === "confirmed");
  if (confirmedExperiment) {
    const applied = { ...confirmedExperiment, status: "applied" as const, resolved_at: timestamp };
    const cycleExperiments = (account.cycle_experiments ?? []).map((item) => item.id === applied.id ? applied : item);
    const weekly = weeklyReview.experiment_card?.id === applied.id
      ? { ...weeklyReview, experiment_card: applied }
      : weeklyReview;
    account = {
      ...account,
      cycle_experiments: cycleExperiments,
      weekly_review: weekly,
      stage_review: weekly,
      updated_at: timestamp,
    };
  }
  const saveStartedAt = Date.now();
  run.generation_diagnostics = {
    total_ms: saveStartedAt - requestStartedAt,
    source_ms: sourceElapsedMs,
    generation_ms: generationElapsedMs,
    save_ms: 0,
    native_title_audit: nativeTitleAudit,
  };
  await store.saveRun(run);
  await store.saveAccount(account);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: account.owner_user_id ?? authUserId,
      feature: "growth_text",
      ...usage,
      metadata: {
        action: "topic_batch",
        runId: run.id,
        generationMode,
        rotationMode: sourceRotationMode,
        changedMethodIds,
        requestMode,
        cache_hit: false,
        profile_version: accountProfileVersion(account),
      },
    });
  }
  releaseInFlightGenerationRequest(account.id, parsed.data.requestId);

  return NextResponse.json({
    status: methodDeliveries.some((delivery) => delivery.status !== "ready") ? "partial" : "completed",
    run,
    newTopics: topics,
    generatedCount: generatedTopics.length,
    retainedCount: methodDeliveries.filter((delivery) => delivery.title_origin === "retained").length,
    pausedCount: methodDeliveries.filter((delivery) => delivery.status === "paused").length,
    failedCount: methodDeliveries.filter((delivery) => delivery.status === "failed").length,
    methodDeliveries,
    sourceUsageStatus: "passed",
    uniquenessStatus: "passed",
    migrationStatus: "passed",
    structureVersion: SOURCE_MIGRATION_VERSION,
    rotationMode: sourceRotationMode,
    changedMethods: reportedChangedMethodIds,
    retainedMethods: sourceRotation.retained_method_ids,
    pausedMethods: unavailableMethods,
    unavailableMethods,
    topicSources: account.topic_sources ?? [],
    sourceUsage: account.benchmark_source_usage ?? [],
    sourceRefresh: sourceRefreshSummary,
    cacheHit: false,
    prefetchStatus: requestMode === "prefetch" ? "queued" : undefined,
  });
}

export async function PATCH(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const parsed = updateTitleSchema.safeParse(await req.json().catch(() => ({})));
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
      message: "业务或视角已经切换，请重新选择当前业务的标题。",
    }, { status: 409 });
  }
  const currentTopic = run.topic_pool.find((topic) => topic.id === parsed.data.topicId);
  if (!currentTopic) return NextResponse.json({ error: "topic_not_found" }, { status: 404 });

  const timestamp = now();
  const nextTitle = parsed.data.title ?? currentTopic.title;
  if (parsed.data.title) {
    const supportedFacts = [
      account.target_user,
      account.core_problem,
      account.trust_source,
      account.account_value,
      account.one_liner,
      account.follow_reason,
      ...Object.values(account.persona_specific ?? {}),
    ].filter((value): value is string => typeof value === "string" && value.trim().length >= 4);
    const quality = evaluateGrowthTitleQuality(nextTitle, { supportedFacts });
    if (!quality.acceptable) {
      const labels: Record<string, string> = {
        too_long: "超过20字",
        traditional_chinese: "含繁体字",
        garbled_latin_cjk: "含中英文乱码拼接",
        unsupported_factual_claim: "含没有事实依据的具体身份、金额或成果",
        unnatural_jargon: "含不自然的生造黑话",
        incomplete_sentence: "是残缺半句话，缺少必要动作或补语",
        generic_title: "只有抽象对照，缺少具体人物、场景或动作",
        empty: "为空",
      };
      return NextResponse.json({
        error: "title_quality_failed",
        message: `这个标题暂不能保存：${quality.reasons.map((reason) => labels[reason] || "质量不合格").join("、")}。`,
      }, { status: 422 });
    }
  }
  const topic = parsed.data.syncPromise
    ? {
      ...currentTopic,
      title: nextTitle,
      title_promise: syncedPromise(nextTitle, currentTopic.title_promise),
      title_promise_status: "synced" as const,
      title_promise_validation: "标题与正文承诺已同步",
      updated_at: timestamp,
    }
    : {
      ...currentTopic,
      title: nextTitle,
      title_promise_status: nextTitle === currentTopic.title ? currentTopic.title_promise_status ?? "synced" as const : "stale" as const,
      title_promise_validation: nextTitle === currentTopic.title ? currentTopic.title_promise_validation : "标题已修改，请重新同步正文承诺",
      updated_at: timestamp,
    };
  const updatedRun: GrowthRun = {
    ...run,
    owner_user_id: run.owner_user_id ?? guard.auth.user.id,
    topic_pool: run.topic_pool.map((item) => item.id === topic.id ? topic : item),
    selected_topic: run.selected_topic?.id === topic.id ? topic : run.selected_topic,
    seen_titles: Array.from(new Set([...(run.seen_titles ?? []), topic.title])),
    updated_at: timestamp,
  };
  await store.saveRun(updatedRun);

  return NextResponse.json({ run: updatedRun, topic });
}
