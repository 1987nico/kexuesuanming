import type {
  ContentDraft,
  GrowthAccount,
  GrowthRun,
  MethodGenerationMode,
  TopicCandidate,
} from "./types";

// 缓存结构没有变化，沿用v1以保留上线前已经通过质量门禁的可用库存。
export const TOPIC_PREFETCH_GENERATION_VERSION = "topic-prefetch-v1" as const;
export const DRAFT_PREWARM_GENERATION_VERSION = "draft-prewarm-v1" as const;
/** 活跃账号尽量始终保有 6 批可直接消费的标题。 */
export const TOPIC_PREFETCH_TARGET = 6;
/** 低于 3 批时进入高优先级补货，避免用户连续换批后重新等待。 */
export const TOPIC_PREFETCH_LOW_WATERMARK = 3;
export const TOPIC_PREFETCH_MAX = 8;
/**
 * 一批后台库存至少要真正换出 3 个标题，才有资格被用户一键消费。
 * 否则“秒开”只是把上一批原样端回来，速度变快却破坏了换题承诺。
 */
export const TOPIC_PREFETCH_MIN_NEW_TITLES = 3;

const DAY_MS = 24 * 60 * 60 * 1_000;

function stableObject(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableObject).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableObject(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * 轻量、稳定的非加密指纹。不能使用 account.updated_at，因为来源刷新、复盘
 * 等无关写入会让可用缓存误失效；这里只覆盖真正影响标题与正文的人设事实。
 */
export function accountProfileVersion(account: GrowthAccount) {
  const serialized = stableObject({
    business_line: account.business_line,
    persona: account.persona,
    profile_identity: account.profile_identity,
    profile_name: account.profile_name,
    name: account.name,
    one_liner: account.one_liner,
    target_user: account.target_user,
    core_problem: account.core_problem,
    account_value: account.account_value,
    trust_source: account.trust_source,
    not_doing: account.not_doing,
    tone_style: account.tone_style,
    persona_specific: account.persona_specific,
    filter_words: account.filter_words,
    avoid_expressions: account.avoid_expressions,
    compliance_redline: account.compliance_redline,
    private_domain: account.private_domain,
    method_overrides: account.method_overrides,
  });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `profile-v1-${(hash >>> 0).toString(36)}`;
}

export function topicPrefetchEnabled() {
  return process.env.GROWTH_TITLE_PREFETCH_ENABLED !== "false";
}

export function rollingTopicCacheEnabled() {
  return process.env.GROWTH_ROLLING_CACHE_ENABLED !== "false";
}

export function bodyPrewarmEnabled() {
  return process.env.GROWTH_BODY_PREWARM_ENABLED !== "false";
}

export function fastCandidateModelEnabled() {
  return process.env.GROWTH_FAST_MODEL_CANDIDATES_ENABLED === "true";
}

export function topicCacheKey(account: GrowthAccount, mode: MethodGenerationMode) {
  return [
    account.owner_user_id ?? "unowned",
    account.business_line ?? "unknown",
    account.persona,
    account.id,
    accountProfileVersion(account),
    mode,
    TOPIC_PREFETCH_GENERATION_VERSION,
  ].join(":");
}

export function topicCacheTtlMs(topics: TopicCandidate[]) {
  return topics.some((topic) => Boolean(topic.source_snapshot)) ? DAY_MS : 3 * DAY_MS;
}

export function isFreshQueuedTopicRun(
  run: GrowthRun,
  account: GrowthAccount,
  mode: MethodGenerationMode,
  at = Date.now(),
) {
  const newTitleCount = run.method_deliveries?.length
    ? run.method_deliveries.filter((delivery) => (
      delivery.status === "ready" && delivery.title_origin === "new"
    )).length
    // 兼容上线前已经生成、尚未带 method_deliveries 的合格库存。
    : run.topic_pool.length;
  const minimumNewTitles = Math.min(TOPIC_PREFETCH_MIN_NEW_TITLES, run.topic_pool.length);
  return run.prefetch?.status === "queued"
    && run.prefetch.cache_key === topicCacheKey(account, mode)
    && run.prefetch.profile_version === accountProfileVersion(account)
    && run.prefetch.generation_version === TOPIC_PREFETCH_GENERATION_VERSION
    && Date.parse(run.prefetch.expires_at) > at
    && run.generation_status === "completed"
    && run.topic_pool.length > 0
    && newTitleCount >= minimumNewTitles;
}

export function queuedTopicRuns(
  runs: GrowthRun[],
  account: GrowthAccount,
  mode: MethodGenerationMode,
  at = Date.now(),
) {
  return runs
    .filter((run) => run.generation_mode === mode && isFreshQueuedTopicRun(run, account, mode, at))
    .sort((left, right) => (
      (left.prefetch?.queued_at ?? left.created_at).localeCompare(
        right.prefetch?.queued_at ?? right.created_at,
      )
    ));
}

export function visibleTopicRuns(runs: GrowthRun[]) {
  return runs.filter((run) => run.prefetch?.status !== "queued");
}

export function markTopicRunQueued(input: {
  run: GrowthRun;
  account: GrowthAccount;
  mode: MethodGenerationMode;
  batchNumber: number;
  timestamp: string;
}) {
  return {
    ...input.run,
    prefetch: {
      status: "queued" as const,
      cache_key: topicCacheKey(input.account, input.mode),
      profile_version: accountProfileVersion(input.account),
      generation_version: TOPIC_PREFETCH_GENERATION_VERSION,
      batch_number: input.batchNumber,
      queued_at: input.timestamp,
      expires_at: new Date(
        Date.parse(input.timestamp) + topicCacheTtlMs(input.run.topic_pool),
      ).toISOString(),
    },
  };
}

export function markTopicRunConsumed(run: GrowthRun, timestamp: string, requestId?: string) {
  if (!run.prefetch) return run;
  return {
    ...run,
    prefetch: {
      ...run.prefetch,
      status: "consumed" as const,
      consumed_at: timestamp,
      consumed_request_id: requestId,
    },
    updated_at: timestamp,
  };
}

export function draftCacheKey(account: GrowthAccount, topic: TopicCandidate) {
  return [
    account.owner_user_id ?? "unowned",
    account.business_line ?? "unknown",
    account.persona,
    account.id,
    accountProfileVersion(account),
    topic.id,
    topic.title.trim(),
    topic.title_promise.trim(),
    topic.source_snapshot?.id ?? "native",
    DRAFT_PREWARM_GENERATION_VERSION,
  ].join(":");
}

export function freshDraftCache(
  run: GrowthRun,
  account: GrowthAccount,
  topic: TopicCandidate,
  at = Date.now(),
) {
  const key = draftCacheKey(account, topic);
  return run.draft_variant_cache?.find((entry) =>
    entry.cache_key === key
    && entry.topic_id === topic.id
    && entry.profile_version === accountProfileVersion(account)
    && entry.generation_version === DRAFT_PREWARM_GENERATION_VERSION
    && entry.status === "ready"
    && Date.parse(entry.expires_at) > at
    && entry.drafts.length >= 2
    && entry.drafts.every((draft) => draft.certification_status === "certified"),
  );
}

export function withDraftCache(input: {
  run: GrowthRun;
  account: GrowthAccount;
  topic: TopicCandidate;
  drafts: ContentDraft[];
  timestamp: string;
}) {
  const cacheKey = draftCacheKey(input.account, input.topic);
  const ttl = input.topic.source_snapshot ? DAY_MS : 3 * DAY_MS;
  const entry: NonNullable<GrowthRun["draft_variant_cache"]>[number] = {
    topic_id: input.topic.id,
    cache_key: cacheKey,
    profile_version: accountProfileVersion(input.account),
    generation_version: DRAFT_PREWARM_GENERATION_VERSION,
    status: "ready",
    drafts: input.drafts,
    generated_at: input.timestamp,
    expires_at: new Date(Date.parse(input.timestamp) + ttl).toISOString(),
  };
  return {
    ...input.run,
    draft_variant_cache: [
      entry,
      ...(input.run.draft_variant_cache ?? []).filter((item) => item.cache_key !== cacheKey),
    ].slice(0, 12),
    updated_at: input.timestamp,
  };
}
