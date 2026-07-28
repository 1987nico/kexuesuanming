import type {
  BenchmarkSourceUsage,
  GrowthAccount,
  GrowthRun,
  TitleMethodId,
  TopicCandidate,
  TopicSourceSnapshot,
} from "./types";

const DAY_MS = 86_400_000;

export interface FreshBenchmarkSourceRequirement {
  method_id: TitleMethodId;
  /** 当前业务 × 视角 × 方法下，已经生成过标题的全部母题链接。 */
  used_source_urls: string[];
  /** 候选来源中从未被该方法使用过的链接。 */
  unused_source_urls: string[];
  /** 没有可用的新母题时，该槽位应暂停，而不是复用旧母题。 */
  status: "ready" | "paused";
  pause_reason?: "no_unused_source";
}

function usageKey(input: {
  business_line: GrowthAccount["business_line"];
  persona: GrowthAccount["persona"];
  method_id: TitleMethodId;
  original_url: string;
}) {
  return `${input.business_line ?? "executive"}:${input.persona}:${input.method_id}:${input.original_url}`;
}

function usageMatchesAccount(
  usage: BenchmarkSourceUsage,
  account: GrowthAccount,
) {
  return usage.business_line === (account.business_line ?? "executive")
    && usage.persona === account.persona;
}

/**
 * 返回当前业务 × 视角 × 方法下已经使用过的所有母题。
 *
 * 这里刻意不设置时间窗口：产品规则要求“换一批标题”不能重新使用历史母题，
 * 即使该母题已经超过 30 天。调用方可以按方法取值，再把这些链接排除在来源发现之外。
 */
export function historicalSourceUrlsByMethod(input: {
  account: GrowthAccount;
  runs: GrowthRun[];
  methodIds?: TitleMethodId[];
}) {
  const methods = input.methodIds ? new Set(input.methodIds) : null;
  const urlsByMethod = new Map<TitleMethodId, Set<string>>();
  const add = (methodId: TitleMethodId, url: string | undefined) => {
    if (!url || (methods && !methods.has(methodId))) return;
    const urls = urlsByMethod.get(methodId) ?? new Set<string>();
    urls.add(url);
    urlsByMethod.set(methodId, urls);
  };

  for (const usage of input.account.benchmark_source_usage ?? []) {
    if (!usageMatchesAccount(usage, input.account)) continue;
    add(usage.method_id, usage.original_url);
  }
  for (const run of input.runs) {
    for (const topic of run.topic_pool) {
      add(topic.method_id, topic.source_snapshot?.original_url);
    }
  }

  return new Map(
    [...urlsByMethod.entries()].map(([methodId, urls]) => [
      methodId,
      [...urls].sort(),
    ]),
  );
}

/**
 * 把“每次换一批必须换新母题”的规则收敛为一个可复用的纯函数。
 * 候选来源由来源发现模块提供；本函数只判断它们是否曾被同一方法使用过。
 */
export function freshBenchmarkSourcePlan(input: {
  account: GrowthAccount;
  runs: GrowthRun[];
  methodIds: TitleMethodId[];
  candidateSources?: TopicSourceSnapshot[];
}): FreshBenchmarkSourceRequirement[] {
  const history = historicalSourceUrlsByMethod({
    account: input.account,
    runs: input.runs,
    methodIds: input.methodIds,
  });
  const candidates = input.candidateSources ?? input.account.topic_sources ?? [];

  return [...new Set(input.methodIds)].map((methodId) => {
    const usedSourceUrls = history.get(methodId) ?? [];
    const used = new Set(usedSourceUrls);
    const unusedSourceUrls = [...new Set(candidates
      .filter((source) => source.method_id === methodId)
      .map((source) => source.original_url)
      .filter((url) => !used.has(url)))]
      .sort();

    if (!unusedSourceUrls.length) {
      return {
        method_id: methodId,
        used_source_urls: usedSourceUrls,
        unused_source_urls: [],
        status: "paused" as const,
        pause_reason: "no_unused_source" as const,
      };
    }
    return {
      method_id: methodId,
      used_source_urls: usedSourceUrls,
      unused_source_urls: unusedSourceUrls,
      status: "ready" as const,
    };
  });
}

export function recentSourceUrls(input: {
  account: GrowthAccount;
  runs: GrowthRun[];
  methodIds?: TitleMethodId[];
  now?: Date;
  days?: number;
}) {
  const cutoff = (input.now ?? new Date()).getTime() - (input.days ?? 30) * DAY_MS;
  const methods = input.methodIds ? new Set(input.methodIds) : null;
  const urls = new Set<string>();
  for (const usage of input.account.benchmark_source_usage ?? []) {
    if (!usageMatchesAccount(usage, input.account)) continue;
    if (methods && !methods.has(usage.method_id)) continue;
    if (Date.parse(usage.last_used_at) >= cutoff) urls.add(usage.original_url);
  }
  for (const run of input.runs) {
    if (Date.parse(run.created_at) < cutoff) continue;
    for (const topic of run.topic_pool) {
      if (methods && !methods.has(topic.method_id)) continue;
      if (topic.source_snapshot?.original_url) urls.add(topic.source_snapshot.original_url);
    }
  }
  return [...urls];
}

export function sourceUsageCount(
  account: GrowthAccount,
  source: TopicSourceSnapshot | undefined,
) {
  if (!source) return 0;
  return (account.benchmark_source_usage ?? []).find((usage) =>
    usageKey(usage) === usageKey({
      business_line: account.business_line,
      persona: account.persona,
      method_id: source.method_id,
      original_url: source.original_url,
    })
  )?.generated_batch_count ?? 0;
}

export function sourceMethodsDueForRotation(account: GrowthAccount) {
  const latestSourceUrl = new Map<TitleMethodId, string>();
  for (const source of [...(account.topic_sources ?? [])]
    .sort((a, b) => b.collected_at.localeCompare(a.collected_at))) {
    if (!latestSourceUrl.has(source.method_id)) {
      latestSourceUrl.set(source.method_id, source.original_url);
    }
  }
  return (account.benchmark_source_usage ?? [])
    .filter((usage) =>
      usageMatchesAccount(usage, account)
      // 新规则：一个来源只要生成过一批标题，下一次“换一批”就必须换新来源。
      // 兼容历史数据，不依赖旧版“生成满 3 批”才轮换的状态字段。
      && usage.generated_batch_count > 0
      && latestSourceUrl.get(usage.method_id) === usage.original_url
    )
    .map((usage) => usage.method_id);
}

export function updateBenchmarkSourceUsage(input: {
  account: GrowthAccount;
  topics: TopicCandidate[];
  changedMethodIds?: TitleMethodId[];
  timestamp: string;
}): BenchmarkSourceUsage[] {
  const changed = new Set(input.changedMethodIds ?? []);
  const currentLine = input.account.business_line ?? "executive";
  const currentPersona = input.account.persona;
  const next = (input.account.benchmark_source_usage ?? []).map((usage) => {
    if (
      changed.has(usage.method_id)
      && usage.business_line === currentLine
      && usage.persona === currentPersona
    ) {
      return { ...usage, rotation_status: "replaced" as const };
    }
    return usage;
  });
  const byKey = new Map(next.map((usage) => [usageKey(usage), usage]));

  for (const topic of input.topics) {
    const source = topic.source_snapshot;
    if (!source) continue;
    const key = usageKey({
      business_line: currentLine,
      persona: currentPersona,
      method_id: topic.method_id,
      original_url: source.original_url,
    });
    const existing = byKey.get(key);
    const generatedBatchCount = (existing?.generated_batch_count ?? 0) + 1;
    byKey.set(key, {
      business_line: currentLine,
      persona: currentPersona,
      method_id: topic.method_id,
      source_id: source.id,
      original_url: source.original_url,
      first_used_at: existing?.first_used_at ?? input.timestamp,
      last_used_at: input.timestamp,
      generated_batch_count: generatedBatchCount,
      selected_count: existing?.selected_count ?? 0,
      rotation_status: "rotation_recommended",
    });
  }
  return [...byKey.values()]
    .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at));
}

export function withHistoricalBenchmarkSourceUsage(
  account: GrowthAccount,
  runs: GrowthRun[],
) {
  if ((account.benchmark_source_usage ?? []).length) return account;
  let current = account;
  for (const run of [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    current = {
      ...current,
      benchmark_source_usage: updateBenchmarkSourceUsage({
        account: current,
        topics: run.topic_pool,
        timestamp: run.created_at,
      }),
    };
  }
  return current;
}

export function recordBenchmarkSourceSelection(input: {
  account: GrowthAccount;
  topic: TopicCandidate;
  timestamp: string;
}) {
  const source = input.topic.source_snapshot;
  if (!source) return input.account.benchmark_source_usage ?? [];
  const currentLine = input.account.business_line ?? "executive";
  const key = usageKey({
    business_line: currentLine,
    persona: input.account.persona,
    method_id: input.topic.method_id,
    original_url: source.original_url,
  });
  const usages = [...(input.account.benchmark_source_usage ?? [])];
  const index = usages.findIndex((usage) => usageKey(usage) === key);
  if (index >= 0) {
    usages[index] = {
      ...usages[index],
      selected_count: usages[index].selected_count + 1,
      last_used_at: input.timestamp,
    };
  } else {
    usages.unshift({
      business_line: currentLine,
      persona: input.account.persona,
      method_id: input.topic.method_id,
      source_id: source.id,
      original_url: source.original_url,
      first_used_at: input.timestamp,
      last_used_at: input.timestamp,
      generated_batch_count: 0,
      selected_count: 1,
      rotation_status: "active",
    });
  }
  return usages;
}

export function mergeRotatedTopicPool(input: {
  previous: TopicCandidate[];
  generated: TopicCandidate[];
  mode: "rotate_single_source" | "rotate_all_sources";
  methodId?: TitleMethodId;
}) {
  if (input.mode === "rotate_single_source") {
    if (!input.methodId) return input.previous;
    const replacement = input.generated.find((topic) => topic.method_id === input.methodId);
    if (!replacement) return input.previous;
    const hadMethod = input.previous.some((topic) => topic.method_id === input.methodId);
    return hadMethod
      ? input.previous.map((topic) => topic.method_id === input.methodId ? replacement : topic)
      : [...input.previous, replacement].sort((a, b) =>
        (a.method_label || a.method_id).localeCompare(b.method_label || b.method_id)
      );
  }
  return [
    ...input.previous.filter((topic) => topic.method_group !== "benchmark"),
    ...input.generated.filter((topic) => topic.method_group === "benchmark"),
  ];
}
