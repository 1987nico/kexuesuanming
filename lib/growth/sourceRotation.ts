import type {
  BenchmarkSourceUsage,
  GrowthAccount,
  GrowthRun,
  TitleMethodId,
  TopicCandidate,
  TopicSourceSnapshot,
} from "./types";

const DAY_MS = 86_400_000;

function usageKey(input: {
  business_line: GrowthAccount["business_line"];
  persona: GrowthAccount["persona"];
  method_id: TitleMethodId;
  original_url: string;
}) {
  return `${input.business_line ?? "executive"}:${input.persona}:${input.method_id}:${input.original_url}`;
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
      usage.business_line === (account.business_line ?? "executive")
      && usage.persona === account.persona
      && usage.rotation_status === "rotation_recommended"
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
      rotation_status: generatedBatchCount >= 3 ? "rotation_recommended" : "active",
    });
  }
  return [...byKey.values()]
    .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
    .slice(0, 300);
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
  return usages.slice(0, 300);
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
