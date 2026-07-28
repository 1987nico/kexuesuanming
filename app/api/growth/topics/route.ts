import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import {
  buildGrowthTitleFingerprint,
  buildTopicDiversitySignature,
  generateTopicBatch,
  normalizeTitleHistoryFingerprint,
} from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import type {
  GrowthAccount,
  GrowthRun,
  TitleMethodId,
} from "@/lib/growth/types";
import {
  buildLearningBrief,
  buildWeeklyReviewResult,
  isWeeklyReviewStale,
} from "@/lib/growth/reviewLearning";
import { ensureRecentTopicSources } from "@/lib/growth/sourceDiscovery";
import {
  mergeRotatedTopicPool,
  recentSourceUrls,
  sourceMethodsDueForRotation,
  updateBenchmarkSourceUsage,
  withHistoricalBenchmarkSourceUsage,
} from "@/lib/growth/sourceRotation";
import {
  buildSingleTitleMutation,
  mergeRegeneratedNativeTopic,
} from "@/lib/growth/singleTitleRegeneration";
import {
  accountForBusinessGeneration,
  accountMatchesWorkspace,
} from "@/lib/growth/businessCompatibility";
import { methodsForPersona, TITLE_METHOD_BY_ID } from "@/lib/growth/methods";
import { sourceIsUsable } from "@/lib/growth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_TENANT_ID = "mianbajun";

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
    .filter((source) => source.method_id === methodId && sourceIsUsable(source))
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

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  let account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id && account.owner_user_id !== guard.auth.user.id) {
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
  account = withHistoricalBenchmarkSourceUsage(account, runs);
  const previousRuns = runs.filter((item) => item.generation_mode === generationMode);
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

  if (action === "rotate_single_source" || action === "rotate_all_sources") {
    const excluded = recentSourceUrls({
      account,
      runs,
      methodIds: rotationMethodIds,
    });
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
    // 普通“换一批标题”优先复用有效母题；缺失或硬失效来源由系统补齐。
    const discovered = await ensureRecentTopicSources(account);
    sourceRefreshSummary = discovered.summary;
    account = discovered.account;

    // 同一母题生成满3批后属于软换源：能找到新母题就换，找不到则继续复用一次。
    const dueMethodIds = sourceMethodsDueForRotation(account)
      .filter((methodId) => applicableMethods.some((method) =>
        method.id === methodId && method.sourceRequired
      ));
    if (dueMethodIds.length) {
      const rotated = await ensureRecentTopicSources(account, {
        force: true,
        methodIds: dueMethodIds,
        excludeUrls: recentSourceUrls({ account, runs, methodIds: dueMethodIds }),
      });
      const automaticChanges = changedSources(account, rotated.account, dueMethodIds);
      if (automaticChanges.length) {
        account = accountWithRotatedSources({
          before: account,
          discovered: rotated.account,
          methodIds: dueMethodIds,
          changedMethodIds: automaticChanges,
          dropMissing: false,
        });
        changedMethodIds = automaticChanges;
        sourceRefreshSummary = rotated.summary;
      }
    }
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
  // 当前账号就是“业务×视角”隔离空间；读取全部批次、编辑历史和正文标题，永不只截最近120条。
  const historyTitles = Array.from(new Set([
    ...runs.flatMap((item) => [
    ...(item.seen_titles ?? []),
    ...item.topic_pool.map((topic) => topic.title),
    ]),
    ...notes.map((draft) => draft.title),
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
  runs.forEach((item, batchIndex) => {
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
  const generationInput = (allowSourcePause = false) => ({
    account: account!,
    week: parsed.data.week ?? latestRun?.week ?? 1,
    generationMode,
    excludeTitles: historyTitles,
    historyTitles,
    historyTopics,
    currentTitles,
    learningBrief,
    allowSourcePause,
    methodIds: generationMethodIds,
    directionLocks: action === "regenerate_single_title" && requestedTopic
      ? { [requestedTopic.method_id]: requestedTopic }
      : undefined,
  });
  const rotateSourcesAndRetry = async (
    methodIds: TitleMethodId[],
    maximumAdditionalSources: number,
  ) => {
    let retryError = "";
    const attemptedUrls = new Set([
      ...recentSourceUrls({ account: account!, runs, methodIds }),
      ...(account!.topic_sources ?? [])
        .filter((source) => methodIds.includes(source.method_id))
        .map((source) => source.original_url),
    ]);
    for (let attempt = 1; attempt <= maximumAdditionalSources; attempt += 1) {
      const currentAccount = account!;
      const discovered = await ensureRecentTopicSources(currentAccount, {
        force: true,
        methodIds,
        excludeUrls: [...attemptedUrls],
      });
      sourceRefreshSummary = discovered.summary;
      const sourceChanges = changedSources(currentAccount, discovered.account, methodIds);
      if (!sourceChanges.length) {
        retryError = "近期候选母题已经尝试完毕";
        break;
      }
      for (const source of discovered.account.topic_sources ?? []) {
        if (methodIds.includes(source.method_id)) attemptedUrls.add(source.original_url);
      }
      account = accountWithRotatedSources({
        before: currentAccount,
        discovered: discovered.account,
        methodIds,
        changedMethodIds: sourceChanges,
        dropMissing: false,
      });
      changedMethodIds = [...new Set([...changedMethodIds, ...sourceChanges])];
      try {
        const retry = await generateTopicBatch(generationInput(false));
        return { generated: retry, error: "" };
      } catch (error) {
        retryError = (error as Error).message;
        console.warn(
          `[growth] benchmark source recovery ${attempt}/${maximumAdditionalSources} failed:`,
          retryError,
        );
      }
    }
    return { generated: null, error: retryError };
  };
  try {
    generated = await generateTopicBatch(generationInput(false));
  } catch (error) {
    const firstMessage = (error as Error).message;
    if (action === "regenerate_single_title") {
      console.error("[growth] single title regeneration failed:", firstMessage);
      return NextResponse.json({
        error: "single_title_regeneration_failed",
        message: "暂时没有生成更合适的新标题，当前标题已保留。可以稍后再试，或直接编辑当前标题。",
      }, { status: 422 });
    }
    if (action !== "regenerate_titles") {
      const recovered = await rotateSourcesAndRetry(rotationMethodIds, 2);
      if (recovered.generated) {
        generated = recovered.generated;
      } else {
        console.error(
          "[growth] manual source rotation failed after automatic recovery:",
          recovered.error || firstMessage,
        );
        return NextResponse.json({
          error: "benchmark_rotation_failed",
          message: "今日该方法暂无可用的近期对标，当前标题和原来源已保留。",
        }, { status: 422 });
      }
    } else {
      const sourceMethodIds = new Set((account.topic_sources ?? []).map((source) => source.method_id));
      const sourceRelatedFailure = [...sourceMethodIds].some((methodId) =>
        firstMessage.includes(`${methodId}:`),
      );
      if (!sourceRelatedFailure) {
        console.error("[growth] atomic topic batch failed:", firstMessage);
        return NextResponse.json({
          error: "topic_batch_generation_failed",
          message: "本轮部分槽位与近期母题、句式或素材组合重复，系统自动重试后仍未全部通过；当前批次没有被替换。",
        }, { status: 422 });
      }

      // 每个来源型槽位最多连续尝试3个真实母题（当前母题 + 2个新母题）。
      // 只有完整批次全部通过才提交，任何失败都保留操作者现有标题。
      const swapMethods = applicableMethods
        .filter((method) => method.sourceRequired)
        .map((method) => method.id);
      const recovered = await rotateSourcesAndRetry(swapMethods, 2);
      if (recovered.generated) {
        generated = recovered.generated;
      } else {
        console.error(
          "[growth] atomic topic batch failed after source recovery:",
          recovered.error || firstMessage,
        );
        return NextResponse.json({
          error: "topic_batch_generation_failed",
          message: "系统已自动刷新对标来源，并重新生成重复的母题、句式和素材，但仍未形成完整合格批次；当前标题没有被替换。",
        }, { status: 422 });
      }
    }
  }
  const {
    topics: generatedTopics,
    unavailableMethods: generatedUnavailableMethods,
    usage,
    generationAttempts,
    structureCards,
  } = generated;
  if (action === "rotate_single_source" && !generatedTopics.some((topic) =>
    topic.method_id === requestedMethod!.id
  )) {
    return NextResponse.json({
      error: "benchmark_rotation_failed",
      message: "新母题没有形成通过审核的迁移标题；当前批次和原来源保持不变。",
    }, { status: 422 });
  }
  if (action === "regenerate_single_title" && !generatedTopics.some((topic) =>
    topic.method_id === requestedMethod!.id
  )) {
    return NextResponse.json({
      error: "single_title_regeneration_failed",
      message: "暂时没有生成更合适的新标题，当前标题已保留。可以稍后再试，或直接编辑当前标题。",
    }, { status: 422 });
  }
  if (action === "rotate_all_sources" && generatedTopics.length === 0) {
    return NextResponse.json({
      error: "benchmark_rotation_failed",
      message: "本次找到的新母题均未通过迁移审核；当前批次保持不变。",
    }, { status: 422 });
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
  const topics = action === "regenerate_single_title" && requestedTopic && regeneratedTopic
    ? mergeRegeneratedNativeTopic({
      previous: latestRun?.topic_pool ?? [],
      current: requestedTopic,
      generated: regeneratedTopic,
    })
    : action === "rotate_single_source" || action === "rotate_all_sources"
    ? mergeRotatedTopicPool({
      previous: latestRun?.topic_pool ?? [],
      generated: generatedTopics,
      mode: action,
      methodId: requestedMethod?.id,
    })
    : generatedTopics;
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
  const run: GrowthRun = {
    id: crypto.randomUUID(),
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
    structure_version: "v3_7",
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
    seen_titles: nextSeen,
    title_fingerprints: topics.map((topic) =>
      buildGrowthTitleFingerprint({ account: account!, topic, generationMode })
    ),
    learning_trace: learningBrief.trace,
    created_at: timestamp,
    updated_at: timestamp,
  };

  run.owner_user_id = run.owner_user_id ?? guard.auth.user.id;
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
  await store.saveRun(run);
  await store.saveAccount(account);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: {
        action: "topic_batch",
        runId: run.id,
        generationMode,
        rotationMode: sourceRotationMode,
        changedMethodIds,
      },
    });
  }

  return NextResponse.json({
    status: "completed",
    run,
    newTopics: topics,
    generatedCount: generatedTopics.length,
    sourceUsageStatus: "passed",
    uniquenessStatus: "passed",
    migrationStatus: "passed",
    structureVersion: "v3_7",
    rotationMode: sourceRotationMode,
    changedMethods: reportedChangedMethodIds,
    retainedMethods: sourceRotation.retained_method_ids,
    pausedMethods: unavailableMethods,
    unavailableMethods,
    topicSources: account.topic_sources ?? [],
    sourceUsage: account.benchmark_source_usage ?? [],
    sourceRefresh: sourceRefreshSummary,
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
