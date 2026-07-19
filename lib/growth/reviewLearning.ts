import type {
  ContentDraft,
  GrowthAccount,
  GrowthDerivedMetrics,
  GrowthEntryDiagnosis,
  GrowthExperimentVariable,
  GrowthLearningBrief,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthReviewSample,
  MethodAggregate,
  MethodPromotionSuggestion,
  TitleMethodId,
  WeeklyReviewResult,
} from "./types";
import { TITLE_METHOD_BY_ID } from "./methods";

export const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOW_SAMPLE_IMPRESSIONS = 500;
const LOW_SAMPLE_READS = 50;

const finite = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
const rate = (numerator: number | undefined, denominator: number | undefined) => finite(denominator) ? Number((finite(numerator) / finite(denominator)).toFixed(6)) : 0;

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function unique(values: Array<string | undefined>, limit = 6) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].slice(0, limit);
}

const reviewTimestamp = (review: GrowthReview) => review.updated_at || review.metrics.snapshot_at || review.created_at;

export function resolvePublishedAt(draft: ContentDraft, metrics?: GrowthReviewMetrics) {
  return metrics?.published_at || draft.published_at || draft.updated_at || draft.created_at;
}

export function getReviewAvailability(publishedAt: string | undefined, at = new Date()) {
  const publishedMs = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (!Number.isFinite(publishedMs)) return { ready: false, remaining_ms: REVIEW_DELAY_MS, available_at: undefined };
  const availableMs = publishedMs + REVIEW_DELAY_MS;
  return { ready: at.getTime() >= availableMs, remaining_ms: Math.max(0, availableMs - at.getTime()), available_at: new Date(availableMs).toISOString() };
}

export function computeDerivedMetrics(metrics: GrowthReviewMetrics): GrowthDerivedMetrics {
  const reads = finite(metrics.reads);
  const interactions = finite(metrics.likes) + finite(metrics.saves) + finite(metrics.comments) + finite(metrics.shares);
  return {
    ctr: rate(reads, metrics.impressions),
    engagement_rate: reads ? Number((interactions / reads).toFixed(6)) : 0,
    save_rate: rate(metrics.saves, reads), comment_rate: rate(metrics.comments, reads),
    share_rate: rate(metrics.shares, reads), follow_rate: rate(metrics.follows, reads),
    inquiry_rate: rate(metrics.qualified_inquiries, reads),
  };
}

export function evaluateReviewSample(metrics: GrowthReviewMetrics, publishedAt?: string, at = new Date()): GrowthReviewSample {
  if (!getReviewAvailability(publishedAt || metrics.published_at, at).ready) return { status: "not_ready", strategy_eligible: false, reasons: ["发布未满24小时"] };
  if (!metrics.note_url) return { status: "historical_unknown", strategy_eligible: false, reasons: ["缺少原帖链接"] };
  if (!metrics.note_status) return { status: "historical_unknown", strategy_eligible: false, reasons: ["缺少分发状态"] };
  if (metrics.note_status !== "normal") return { status: metrics.note_status, strategy_eligible: false, reasons: [metrics.note_status === "limited" ? "笔记限流" : metrics.note_status === "violation" ? "笔记违规" : "笔记已删除"] };
  if (metrics.promoted === undefined) return { status: "historical_unknown", strategy_eligible: false, reasons: ["缺少投流状态"] };
  if (metrics.promoted) return { status: "paid", strategy_eligible: false, reasons: ["包含投流，不能与自然流量混算"] };
  if (finite(metrics.impressions) < LOW_SAMPLE_IMPRESSIONS || finite(metrics.reads) < LOW_SAMPLE_READS) return { status: "low_sample", strategy_eligible: false, reasons: [`曝光需≥${LOW_SAMPLE_IMPRESSIONS}且阅读需≥${LOW_SAMPLE_READS}`] };
  return { status: "valid", strategy_eligible: true, reasons: [] };
}

export function canonicalizeReviews(reviews: GrowthReview[]) {
  const result = new Map<string, GrowthReview>();
  for (const review of reviews) {
    const current = result.get(review.draft_id);
    if (!current || reviewTimestamp(review).localeCompare(reviewTimestamp(current)) > 0) result.set(review.draft_id, review);
  }
  return [...result.values()].sort((a, b) => reviewTimestamp(b).localeCompare(reviewTimestamp(a)));
}

export interface ReviewBenchmarks {
  note_count: number;
  account_ctr_median?: number;
  direction_ctr_median?: number;
  account_average_view_median?: number;
  account_value_rate_median?: number;
}

export function buildReviewBenchmarks(draft: ContentDraft, notes: ContentDraft[], reviews: GrowthReview[]): ReviewBenchmarks {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const usable = canonicalizeReviews(reviews).filter((review) => review.draft_id !== draft.id && review.sample?.strategy_eligible).slice(0, 20);
  const ctr = (review: GrowthReview) => review.derived_metrics?.ctr ?? computeDerivedMetrics(review.metrics).ctr;
  const methodCtrs = usable.filter((review) => noteById.get(review.draft_id)?.method_id === draft.method_id).map(ctr);
  const valueRates = usable.map((review) => { const item = review.derived_metrics ?? computeDerivedMetrics(review.metrics); return item.save_rate + item.share_rate; });
  return {
    note_count: usable.length,
    account_ctr_median: usable.length ? median(usable.map(ctr)) : undefined,
    direction_ctr_median: methodCtrs.length ? median(methodCtrs) : undefined,
    account_average_view_median: usable.length ? median(usable.map((review) => finite(review.metrics.average_view_seconds))) : undefined,
    account_value_rate_median: valueRates.length ? median(valueRates) : undefined,
  };
}

export function diagnoseEntry(metrics: GrowthReviewMetrics, benchmarks: ReviewBenchmarks, titlePattern = "待模型识别", primaryAudience = "待模型识别", primaryKeyword = "待模型识别"): GrowthEntryDiagnosis {
  const derived = computeDerivedMetrics(metrics);
  const ctrBaseline = benchmarks.direction_ctr_median ?? benchmarks.account_ctr_median;
  if (!ctrBaseline || benchmarks.note_count < 2) return { title_pattern: titlePattern, primary_audience: primaryAudience, primary_keyword: primaryKeyword, performance: "insufficient", benchmark_note_count: benchmarks.note_count, account_ctr_median: benchmarks.account_ctr_median, direction_ctr_median: benchmarks.direction_ctr_median };
  const strongEntry = derived.ctr >= ctrBaseline * 1.05;
  const valueRate = derived.save_rate + derived.share_rate;
  const strongContent = Boolean((benchmarks.account_average_view_median && finite(metrics.average_view_seconds) >= benchmarks.account_average_view_median) || (benchmarks.account_value_rate_median && valueRate >= benchmarks.account_value_rate_median));
  return { title_pattern: titlePattern, primary_audience: primaryAudience, primary_keyword: primaryKeyword, performance: strongEntry ? strongContent ? "strong_aligned" : "strong_entry_weak_delivery" : strongContent ? "weak_entry_strong_content" : "weak_both", benchmark_note_count: benchmarks.note_count, account_ctr_median: benchmarks.account_ctr_median, direction_ctr_median: benchmarks.direction_ctr_median };
}

export function normalizeExperimentVariable(value?: string): GrowthExperimentVariable {
  const text = value || "";
  if (/开头|钩子|首段/.test(text)) return "opening";
  if (/人群|目标用户|身份/.test(text)) return "audience_expression";
  if (/结构|顺序|清单/.test(text)) return "body_structure";
  if (/案例|证据|数字|事实/.test(text)) return "evidence";
  if (/结尾|承接|转化|咨询/.test(text)) return "closing";
  if (/篇幅|长短|字数/.test(text)) return "length";
  return "title_cover";
}

function aggregateMethod(methodId: TitleMethodId | "legacy", notes: ContentDraft[], reviews: GrowthReview[], personaMedian: number): MethodAggregate {
  const noteIds = new Set(notes.map((note) => note.id));
  const related = reviews.filter((review) => noteIds.has(review.draft_id));
  const valid = related.filter((review) => review.sample?.strategy_eligible);
  const derived = valid.map((review) => review.derived_metrics ?? computeDerivedMetrics(review.metrics));
  const metrics = valid.map((review) => review.metrics);
  const example = notes[0];
  return {
    method_id: methodId,
    method_label: methodId === "legacy" ? "历史未分类" : TITLE_METHOD_BY_ID[methodId].label,
    generation_mode: example?.generation_mode || "legacy",
    note_count: notes.length, reviewed_count: related.length, valid_count: valid.length,
    median_ctr: median(derived.map((item) => item.ctr)), median_save_rate: median(derived.map((item) => item.save_rate)),
    median_share_rate: median(derived.map((item) => item.share_rate)), median_follow_rate: median(derived.map((item) => item.follow_rate)),
    median_inquiry_rate: median(derived.map((item) => item.inquiry_rate)),
    median_impressions: median(metrics.map((item) => finite(item.impressions))),
    median_reads: median(metrics.map((item) => finite(item.reads))),
    median_saves: median(metrics.map((item) => finite(item.saves))),
    median_shares: median(metrics.map((item) => finite(item.shares))),
    median_profile_visits: median(metrics.map((item) => finite(item.profile_visits))),
    median_sales: median(metrics.map((item) => finite(item.diagnosis_199_sales) + finite(item.deep_6999_sales))),
    above_persona_inquiry_median: valid.length > 0 && median(derived.map((item) => item.inquiry_rate)) > personaMedian,
    evidence_review_ids: valid.map((review) => review.id),
  };
}

function eligibleForNewMethodLearning(note: ContentDraft) {
  if (note.schema_version === "legacy_v1") return false;
  return note.eligible_for_method_learning !== false;
}

export function buildWeeklyReviewResult(input: { account: GrowthAccount; notes: ContentDraft[]; reviews: GrowthReview[]; previous?: WeeklyReviewResult; at?: Date }): WeeklyReviewResult {
  const at = input.at ?? new Date();
  const endMs = at.getTime();
  const start7 = endMs - 7 * DAY_MS;
  const start28 = endMs - 28 * DAY_MS;
  const learningNotes = input.notes.filter(eligibleForNewMethodLearning);
  const noteById = new Map(learningNotes.map((note) => [note.id, note]));
  const canonical = canonicalizeReviews(input.reviews);
  const rolling = canonical.filter((review) => {
    const note = noteById.get(review.draft_id);
    if (!note) return false;
    const published = Date.parse(resolvePublishedAt(note, review.metrics));
    return Number.isFinite(published) && published >= start28 && published <= endMs;
  });
  const valid = rolling.filter((review) => review.sample?.strategy_eligible);
  const personaMedian = median(valid.map((review) => (review.derived_metrics ?? computeDerivedMetrics(review.metrics)).inquiry_rate));
  const methodIds = unique(learningNotes.map((note) => note.method_id || "legacy"), 30) as Array<TitleMethodId | "legacy">;
  const byMethod = methodIds.map((methodId) => aggregateMethod(methodId, learningNotes.filter((note) => (note.method_id || "legacy") === methodId), rolling, personaMedian));

  const canonicalName = new Map((input.account.canonical_body_tags ?? []).map((tag) => [tag.id, tag.name]));
  const tagMap = new Map<string, Set<string>>();
  for (const note of learningNotes.filter((item) => item.status === "published" || item.status === "reviewed")) {
    const activeTags = (note.raw_body_tags ?? []).filter((tag) => tag.active !== false);
    const names = activeTags.map((tag) => tag.canonical_tag_id ? canonicalName.get(tag.canonical_tag_id) || tag.text : tag.text);
    for (const name of names) {
      if (!tagMap.has(name)) tagMap.set(name, new Set());
      tagMap.get(name)!.add(note.id);
    }
  }
  const byTag = [...tagMap.entries()].map(([tag, draftIds]) => {
    const related = rolling.filter((review) => draftIds.has(review.draft_id));
    const eligible = related.filter((review) => review.sample?.strategy_eligible);
    return { tag, note_count: draftIds.size, valid_count: eligible.length, median_inquiry_rate: median(eligible.map((review) => (review.derived_metrics ?? computeDerivedMetrics(review.metrics)).inquiry_rate)) };
  }).sort((a, b) => b.valid_count - a.valid_count || b.note_count - a.note_count);

  const previousByMethod = new Map((input.previous?.by_method ?? []).map((item) => [item.method_id, item]));
  const previousCycleComplete = Boolean(input.previous && Date.parse(input.previous.generated_at) <= start7);
  const promotionSuggestions: MethodPromotionSuggestion[] = valid.length < 30 ? [] : byMethod
    .filter((item) => previousCycleComplete && item.generation_mode === "explore" && item.valid_count >= 5 && item.above_persona_inquiry_median && previousByMethod.get(item.method_id)?.above_persona_inquiry_median)
    .map((item) => ({ method_id: item.method_id as TitleMethodId, method_label: item.method_label, reason: "连续两个复盘周期的有效咨询率高于本视角中位数，且至少有5篇有效样本；仍需运营人工确认。", valid_count: item.valid_count, median_inquiry_rate: item.median_inquiry_rate }));

  const topMethod = valid.length >= 30 ? [...byMethod].filter((item) => item.valid_count > 0).sort((a, b) => b.median_inquiry_rate - a.median_inquiry_rate)[0] : undefined;
  const repeatTitles = unique(rolling.filter((review) => review.entry_diagnosis?.performance === "strong_aligned").map((review) => review.entry_judgement));
  const avoidTitles = unique(rolling.filter((review) => ["weak_entry_strong_content", "weak_both"].includes(review.entry_diagnosis?.performance || "")).map((review) => review.entry_judgement));
  const bodyPatterns = unique(rolling.map((review) => review.body_judgement || review.writer_instruction));
  const generatedAt = at.toISOString();
  return {
    account_id: input.account.id, generated_at: generatedAt, learning_version: `weekly-${generatedAt}`,
    period_start: new Date(start7).toISOString(), period_end: generatedAt, rolling_window_start: new Date(start28).toISOString(),
    note_total: learningNotes.length, reviewed_total: rolling.length, eligible_total: valid.length, stale: false,
    source_review_ids: rolling.map((review) => review.id), by_method: byMethod, by_tag: byTag,
    promotion_suggestions: promotionSuggestions, by_direction: [],
    decision: {
      scale_direction: topMethod ? `描述性领先：${topMethod.method_label}，有效咨询率中位数${(topMethod.median_inquiry_rate * 100).toFixed(2)}%。` : "有效样本不足30篇，只展示数据，不评选最佳方法。",
      pause_direction: "不基于模型评分暂停方法。",
      next_focus: valid.length < 30 ? `继续积累有效样本（当前${valid.length}/30）。` : "复测咨询率较高的方法，同时保留单变量实验。",
      reusable_pattern: repeatTitles[0] || bodyPatterns[0] || "样本不足，尚未形成稳定模板。",
      summary: valid.length < 30 ? `近28天有${valid.length}篇有效样本，只做描述性复盘。` : `近28天有${valid.length}篇有效样本，按有效咨询率描述方法表现。`,
      strategic_hypothesis: topMethod ? `复测${topMethod.method_label}能否继续带来具体处境型咨询。` : "继续验证不同方法带来的有效咨询差异。",
      title_patterns_to_repeat: repeatTitles, title_patterns_to_avoid: avoidTitles, body_patterns_to_repeat: bodyPatterns,
    },
  };
}

export function isMethodWeeklyReview(value: unknown): value is WeeklyReviewResult {
  if (!value || typeof value !== "object") return false;
  const review = value as Partial<WeeklyReviewResult>;
  return Boolean(
    review.decision
    && typeof review.decision === "object"
    && typeof review.generated_at === "string"
    && Array.isArray(review.by_method)
    && Array.isArray(review.by_tag)
    && Array.isArray(review.promotion_suggestions),
  );
}

export function isWeeklyReviewStale(weekly: WeeklyReviewResult | undefined, reviews: GrowthReview[]) {
  if (!isMethodWeeklyReview(weekly)) return true;
  const latest = canonicalizeReviews(reviews)[0];
  return Boolean(latest && reviewTimestamp(latest).localeCompare(weekly.generated_at) > 0);
}

export function buildLearningBrief(input: { account: GrowthAccount; notes: ContentDraft[]; reviews: GrowthReview[]; weekly: WeeklyReviewResult; methodId?: TitleMethodId }): GrowthLearningBrief {
  const noteById = new Map(input.notes.map((note) => [note.id, note]));
  const relevant = canonicalizeReviews(input.reviews).filter((review) => !input.methodId || noteById.get(review.draft_id)?.method_id === input.methodId).filter((review) => review.sample?.strategy_eligible).slice(0, 10);
  const aggregate = input.methodId ? input.weekly.by_method.find((item) => item.method_id === input.methodId) : undefined;
  const latest = relevant[0];
  const experiment = latest?.experiment_variable || normalizeExperimentVariable(latest?.next_variable);
  const basis = unique([input.weekly.decision.summary, aggregate ? `${aggregate.method_label}有${aggregate.valid_count}篇有效样本。` : input.weekly.decision.next_focus, latest?.manager_instruction]);
  return {
    trace: { version: input.weekly.learning_version || `weekly-${input.weekly.generated_at}`, generated_at: new Date().toISOString(), weekly_review_generated_at: input.weekly.generated_at, source_review_ids: unique([...(aggregate?.evidence_review_ids || []), ...relevant.map((review) => review.id)], 12), basis },
    weekly_strategy: `${input.weekly.decision.next_focus} ${input.weekly.decision.strategic_hypothesis || ""}`.trim(),
    topic_guidance: unique(relevant.map((review) => review.topic_instruction)),
    title_guidance: unique([...(input.weekly.decision.title_patterns_to_repeat || []), ...relevant.map((review) => review.entry_judgement)]),
    body_guidance: unique([...(input.weekly.decision.body_patterns_to_repeat || []), ...relevant.map((review) => review.writer_instruction)]),
    experiment_variable: experiment,
  };
}

export function formatLearningBrief(brief: GrowthLearningBrief) {
  return [`周策略：${brief.weekly_strategy}`, `选题要求：${brief.topic_guidance.join("；") || "暂无"}`, `标题入口经验：${brief.title_guidance.join("；") || "暂无"}`, `正文经验：${brief.body_guidance.join("；") || "暂无"}`, `本轮唯一实验变量：${brief.experiment_variable}`, `证据版本：${brief.trace.version}`].join("\n");
}
