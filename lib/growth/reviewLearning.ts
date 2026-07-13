import type {
  ContentDraft,
  DirectionAggregate,
  GrowthAccount,
  GrowthDerivedMetrics,
  GrowthDirection,
  GrowthEntryDiagnosis,
  GrowthExperimentVariable,
  GrowthLearningBrief,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthReviewSample,
  WeeklyDirectionAction,
  WeeklyReviewResult,
} from "./types";

export const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOW_SAMPLE_IMPRESSIONS = 500;
const LOW_SAMPLE_READS = 50;

function finite(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function rate(numerator: number | undefined, denominator: number | undefined) {
  const d = finite(denominator);
  return d > 0 ? Number((finite(numerator) / d).toFixed(6)) : 0;
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function unique(values: Array<string | undefined>, limit = 6) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].slice(
    0,
    limit,
  );
}

function reviewTimestamp(review: GrowthReview) {
  return review.updated_at || review.metrics.snapshot_at || review.created_at;
}

export function resolvePublishedAt(draft: ContentDraft, metrics?: GrowthReviewMetrics) {
  return metrics?.published_at || draft.published_at || draft.updated_at || draft.created_at;
}

export function getReviewAvailability(publishedAt: string | undefined, at = new Date()) {
  const publishedMs = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (!Number.isFinite(publishedMs)) {
    return { ready: false, remaining_ms: REVIEW_DELAY_MS, available_at: undefined };
  }
  const availableMs = publishedMs + REVIEW_DELAY_MS;
  return {
    ready: at.getTime() >= availableMs,
    remaining_ms: Math.max(0, availableMs - at.getTime()),
    available_at: new Date(availableMs).toISOString(),
  };
}

export function computeDerivedMetrics(metrics: GrowthReviewMetrics): GrowthDerivedMetrics {
  const reads = finite(metrics.reads);
  const interactions =
    finite(metrics.likes) + finite(metrics.saves) + finite(metrics.comments) + finite(metrics.shares);
  return {
    ctr: rate(reads, metrics.impressions),
    engagement_rate: reads > 0 ? Number((interactions / reads).toFixed(6)) : 0,
    save_rate: rate(metrics.saves, reads),
    comment_rate: rate(metrics.comments, reads),
    share_rate: rate(metrics.shares, reads),
    follow_rate: rate(metrics.follows, reads),
    inquiry_rate: rate(metrics.qualified_inquiries, reads),
  };
}

export function evaluateReviewSample(
  metrics: GrowthReviewMetrics,
  publishedAt?: string,
  at = new Date(),
): GrowthReviewSample {
  const availability = getReviewAvailability(publishedAt || metrics.published_at, at);
  if (!availability.ready) {
    return { status: "not_ready", strategy_eligible: false, reasons: ["发布未满24小时"] };
  }
  if (!metrics.note_status) {
    return { status: "historical_unknown", strategy_eligible: false, reasons: ["历史复盘缺少分发状态"] };
  }
  if (metrics.note_status !== "normal") {
    return {
      status: metrics.note_status,
      strategy_eligible: false,
      reasons: [metrics.note_status === "limited" ? "笔记限流" : metrics.note_status === "violation" ? "笔记违规" : "笔记已删除"],
    };
  }
  if (metrics.promoted) {
    return { status: "paid", strategy_eligible: false, reasons: ["包含投流，不能与自然流量混算"] };
  }
  if (finite(metrics.impressions) < LOW_SAMPLE_IMPRESSIONS || finite(metrics.reads) < LOW_SAMPLE_READS) {
    return {
      status: "low_sample",
      strategy_eligible: false,
      reasons: [`曝光需≥${LOW_SAMPLE_IMPRESSIONS}且观看需≥${LOW_SAMPLE_READS}`],
    };
  }
  return { status: "valid", strategy_eligible: true, reasons: [] };
}

export function canonicalizeReviews(reviews: GrowthReview[]) {
  const canonical = new Map<string, GrowthReview>();
  for (const review of reviews) {
    const existing = canonical.get(review.draft_id);
    if (!existing || reviewTimestamp(review).localeCompare(reviewTimestamp(existing)) > 0) {
      canonical.set(review.draft_id, review);
    }
  }
  return [...canonical.values()].sort((a, b) => reviewTimestamp(b).localeCompare(reviewTimestamp(a)));
}

export interface ReviewBenchmarks {
  note_count: number;
  account_ctr_median?: number;
  direction_ctr_median?: number;
  account_average_view_median?: number;
  account_value_rate_median?: number;
}

export function buildReviewBenchmarks(
  draft: ContentDraft,
  notes: ContentDraft[],
  reviews: GrowthReview[],
): ReviewBenchmarks {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const usable = canonicalizeReviews(reviews)
    .filter((review) => review.draft_id !== draft.id)
    .filter((review) => review.sample?.strategy_eligible)
    .slice(0, 10);
  const ctrs = usable.map((review) => review.derived_metrics?.ctr ?? computeDerivedMetrics(review.metrics).ctr);
  const directionCtrs = usable
    .filter((review) => noteById.get(review.draft_id)?.direction === draft.direction)
    .map((review) => review.derived_metrics?.ctr ?? computeDerivedMetrics(review.metrics).ctr);
  const durations = usable.map((review) => finite(review.metrics.average_view_seconds));
  const valueRates = usable.map((review) => {
    const derived = review.derived_metrics ?? computeDerivedMetrics(review.metrics);
    return derived.save_rate + derived.share_rate;
  });
  return {
    note_count: usable.length,
    account_ctr_median: ctrs.length ? median(ctrs) : undefined,
    direction_ctr_median: directionCtrs.length ? median(directionCtrs) : undefined,
    account_average_view_median: durations.length ? median(durations) : undefined,
    account_value_rate_median: valueRates.length ? median(valueRates) : undefined,
  };
}

export function diagnoseEntry(
  metrics: GrowthReviewMetrics,
  benchmarks: ReviewBenchmarks,
  titlePattern = "待模型识别",
  primaryAudience = "待模型识别",
  primaryKeyword = "待模型识别",
): GrowthEntryDiagnosis {
  const derived = computeDerivedMetrics(metrics);
  const ctrBaseline = benchmarks.direction_ctr_median ?? benchmarks.account_ctr_median;
  const valueRate = derived.save_rate + derived.share_rate;
  if (!ctrBaseline || benchmarks.note_count < 2) {
    return {
      title_pattern: titlePattern,
      primary_audience: primaryAudience,
      primary_keyword: primaryKeyword,
      performance: "insufficient",
      benchmark_note_count: benchmarks.note_count,
      account_ctr_median: benchmarks.account_ctr_median,
      direction_ctr_median: benchmarks.direction_ctr_median,
    };
  }
  const strongEntry = derived.ctr >= ctrBaseline * 1.05;
  const strongContent =
    (benchmarks.account_average_view_median
      ? finite(metrics.average_view_seconds) >= benchmarks.account_average_view_median
      : false) ||
    (benchmarks.account_value_rate_median ? valueRate >= benchmarks.account_value_rate_median : false);
  return {
    title_pattern: titlePattern,
    primary_audience: primaryAudience,
    primary_keyword: primaryKeyword,
    performance: strongEntry
      ? strongContent
        ? "strong_aligned"
        : "strong_entry_weak_delivery"
      : strongContent
        ? "weak_entry_strong_content"
        : "weak_both",
    benchmark_note_count: benchmarks.note_count,
    account_ctr_median: benchmarks.account_ctr_median,
    direction_ctr_median: benchmarks.direction_ctr_median,
  };
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

function directionLabel(account: GrowthAccount, direction: GrowthDirection) {
  const index = direction === "A" ? 0 : direction === "B" ? 1 : 2;
  return account.content_directions?.[index] || `方向 ${direction}`;
}

function directionScore(aggregate: DirectionAggregate) {
  return Number(
    (
      finite(aggregate.median_save_rate) * 0.25 +
      finite(aggregate.median_share_rate) * 0.2 +
      finite(aggregate.median_follow_rate) * 0.25 +
      finite(aggregate.median_inquiry_rate) * 0.3 +
      finite(aggregate.avg_comment_rate) * 0.1
    ).toFixed(6),
  );
}

function assignActions(aggregates: DirectionAggregate[], eligibleTotal: number) {
  const ranked = aggregates.filter((item) => (item.valid_count || 0) > 0).sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const aggregate of aggregates) {
    aggregate.action = "explore";
    aggregate.confidence = eligibleTotal <= 2 ? "low" : eligibleTotal <= 9 ? "medium" : "high";
  }
  if (!ranked.length || eligibleTotal <= 2) return;
  if (eligibleTotal <= 5) {
    ranked[0].action = "retest";
    return;
  }
  ranked[0].action = "scale";
  if (ranked[1]) ranked[1].action = "retest";
  const comparable = ranked.length >= 2 && ranked.every((item) => (item.valid_count || 0) >= 3);
  if (eligibleTotal >= 10 && comparable && ranked.length >= 3) {
    ranked[ranked.length - 1].action = "pause";
  }
}

function allocationFor(aggregates: DirectionAggregate[]) {
  const weights: Record<WeeklyDirectionAction, number> = { scale: 50, retest: 30, explore: 20, pause: 10 };
  const raw = aggregates.map((item) => ({ item, weight: weights[item.action || "explore"] }));
  const total = raw.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  let allocated = 0;
  return raw.map((entry, index) => {
    const percentage = index === raw.length - 1 ? 100 - allocated : Math.round((entry.weight / total) * 100);
    allocated += percentage;
    return {
      direction: entry.item.direction,
      percentage,
      action: entry.item.action || "explore",
      reason: `${entry.item.label || `方向${entry.item.direction}`}有${entry.item.valid_count || 0}篇有效样本，方向得分${(
        (entry.item.score || 0) * 100
      ).toFixed(2)}。`,
    };
  });
}

export function buildWeeklyReviewResult(input: {
  account: GrowthAccount;
  notes: ContentDraft[];
  reviews: GrowthReview[];
  at?: Date;
}): WeeklyReviewResult {
  const at = input.at ?? new Date();
  const endMs = at.getTime();
  const start7Ms = endMs - 7 * DAY_MS;
  const start28Ms = endMs - 28 * DAY_MS;
  const noteById = new Map(input.notes.map((note) => [note.id, note]));
  const canonical = canonicalizeReviews(input.reviews);
  const directions: GrowthDirection[] = ["A", "B", "C"];

  const byDirection = directions.map((direction) => {
    const directionNotes = input.notes.filter((note) => note.direction === direction);
    const reviewed = canonical.filter((review) => noteById.get(review.draft_id)?.direction === direction);
    const within28 = reviewed.filter((review) => {
      const note = noteById.get(review.draft_id);
      const publishedMs = Date.parse(resolvePublishedAt(note!, review.metrics));
      return Number.isFinite(publishedMs) && publishedMs >= start28Ms && publishedMs <= endMs;
    });
    const valid = within28.filter((review) => review.sample?.strategy_eligible);
    const recent = valid.filter((review) => {
      const note = noteById.get(review.draft_id)!;
      return Date.parse(resolvePublishedAt(note, review.metrics)) >= start7Ms;
    });
    const derived = valid.map((review) => review.derived_metrics ?? computeDerivedMetrics(review.metrics));
    const classifications: Record<string, number> = {};
    for (const review of within28) {
      classifications[review.classification] = (classifications[review.classification] || 0) + 1;
    }
    const totalReads = valid.reduce((sum, review) => sum + finite(review.metrics.reads), 0);
    const totalSaves = valid.reduce((sum, review) => sum + finite(review.metrics.saves), 0);
    const totalComments = valid.reduce((sum, review) => sum + finite(review.metrics.comments), 0);
    const totalFollows = valid.reduce((sum, review) => sum + finite(review.metrics.follows), 0);
    const aggregate: DirectionAggregate = {
      direction,
      label: directionLabel(input.account, direction),
      note_count: directionNotes.length,
      reviewed_count: reviewed.length,
      valid_count: valid.length,
      recent_7d_count: recent.length,
      rolling_28d_count: valid.length,
      total_reads: totalReads,
      total_saves: totalSaves,
      total_comments: totalComments,
      total_follows: totalFollows,
      avg_save_rate: derived.length ? median(derived.map((item) => item.save_rate)) : 0,
      avg_comment_rate: derived.length ? median(derived.map((item) => item.comment_rate)) : 0,
      median_impressions: median(valid.map((review) => finite(review.metrics.impressions))),
      median_reads: median(valid.map((review) => finite(review.metrics.reads))),
      median_ctr: median(derived.map((item) => item.ctr)),
      median_average_view_seconds: median(valid.map((review) => finite(review.metrics.average_view_seconds))),
      median_save_rate: median(derived.map((item) => item.save_rate)),
      median_share_rate: median(derived.map((item) => item.share_rate)),
      median_follow_rate: median(derived.map((item) => item.follow_rate)),
      median_inquiry_rate: median(derived.map((item) => item.inquiry_rate)),
      evidence_review_ids: valid.map((review) => review.id),
      classifications,
    };
    aggregate.score = directionScore(aggregate);
    return aggregate;
  });

  const eligibleTotal = byDirection.reduce((sum, item) => sum + (item.valid_count || 0), 0);
  assignActions(byDirection, eligibleTotal);
  const ranked = [...byDirection].sort((a, b) => (b.score || 0) - (a.score || 0));
  const best = ranked.find((item) => (item.valid_count || 0) > 0);
  const scaleCandidate = ranked.find((item) => item.action === "scale");
  const retestCandidate = ranked.find((item) => item.action === "retest");
  const paused = ranked.find((item) => item.action === "pause");
  const generatedAt = at.toISOString();
  const recentValidReviews = canonical.filter((review) => {
    if (!review.sample?.strategy_eligible) return false;
    const note = noteById.get(review.draft_id);
    if (!note) return false;
    const publishedMs = Date.parse(resolvePublishedAt(note, review.metrics));
    return Number.isFinite(publishedMs) && publishedMs >= start28Ms && publishedMs <= endMs;
  });
  const repeatTitles = unique(
    recentValidReviews
      .filter((review) => review.entry_diagnosis?.performance === "strong_aligned")
      .map((review) => review.entry_judgement),
  );
  const avoidTitles = unique(
    recentValidReviews
      .filter((review) =>
        ["weak_entry_strong_content", "weak_both"].includes(review.entry_diagnosis?.performance || ""),
      )
      .map((review) => review.entry_judgement),
  );
  const bodyPatterns = unique(
    recentValidReviews.map((review) => review.body_judgement || review.writer_instruction),
  );

  return {
    account_id: input.account.id,
    generated_at: generatedAt,
    learning_version: `weekly-${generatedAt}`,
    period_start: new Date(start7Ms).toISOString(),
    period_end: generatedAt,
    rolling_window_start: new Date(start28Ms).toISOString(),
    note_total: input.notes.length,
    reviewed_total: canonical.length,
    eligible_total: eligibleTotal,
    stale: false,
    source_review_ids: canonical.map((review) => review.id),
    by_direction: byDirection,
    decision: {
      scale_direction: scaleCandidate
        ? `${scaleCandidate.label}：证据达到提高占比门槛，近28天有${scaleCandidate.valid_count || 0}篇有效样本。`
        : retestCandidate
          ? `${retestCandidate.label}：只进入二测，暂不提高固定占比。`
          : `近28天只有${eligibleTotal}篇有效样本，三个方向保持均衡探索。`,
      pause_direction: paused ? `${paused.label}：证据门槛已满足，可降低占比。` : "暂无，不用基于单篇笔记暂停方向。",
      next_focus: scaleCandidate
        ? `下周提高「${scaleCandidate.label}」的内容占比，每篇仍只改变一个实验变量。`
        : retestCandidate
          ? `下周优先完成「${retestCandidate.label}」的二测，但不提高其固定占比。`
          : "三个方向继续均衡探索，先把每个方向的有效样本补足。",
      reusable_pattern: repeatTitles[0] || bodyPatterns[0] || "样本不足，尚未形成稳定模板。",
      summary:
        eligibleTotal <= 2
          ? `近28天只有${eligibleTotal}篇有效样本，本周只探索，不改变方向策略。`
          : `近28天有${eligibleTotal}篇有效样本。方向决策以收藏、分享、关注和有效咨询的中位数为主，不让单篇爆款左右结论。`,
      strategic_hypothesis: scaleCandidate
        ? `保持其它条件稳定，验证「${scaleCandidate.label}」提高占比后能否继续带来目标用户收藏、关注和有效咨询。`
        : retestCandidate
          ? `保持其它条件稳定，再测一次「${retestCandidate.label}」，确认结果能否复现。`
          : "先积累至少3篇有效样本，再提出方向性假设。",
      content_allocation: allocationFor(byDirection),
      title_patterns_to_repeat: repeatTitles,
      title_patterns_to_avoid: avoidTitles,
      body_patterns_to_repeat: bodyPatterns,
    },
  };
}

export function isWeeklyReviewStale(weekly: WeeklyReviewResult | undefined, reviews: GrowthReview[]) {
  if (!weekly) return true;
  const latest = canonicalizeReviews(reviews)[0];
  return Boolean(latest && reviewTimestamp(latest).localeCompare(weekly.generated_at) > 0);
}

export function buildLearningBrief(input: {
  account: GrowthAccount;
  notes: ContentDraft[];
  reviews: GrowthReview[];
  weekly: WeeklyReviewResult;
  direction?: GrowthDirection;
}): GrowthLearningBrief {
  const noteById = new Map(input.notes.map((note) => [note.id, note]));
  const relevant = canonicalizeReviews(input.reviews)
    .filter((review) => !input.direction || noteById.get(review.draft_id)?.direction === input.direction)
    .filter((review) => review.sample?.strategy_eligible)
    .slice(0, 10);
  const directionAggregate = input.direction
    ? input.weekly.by_direction.find((item) => item.direction === input.direction)
    : undefined;
  const latest = relevant[0];
  const experimentVariable = latest?.experiment_variable || normalizeExperimentVariable(latest?.next_variable);
  const sourceReviewIds = unique(
    [...(directionAggregate?.evidence_review_ids || []), ...relevant.map((review) => review.id)],
    12,
  );
  const basis = unique([
    input.weekly.decision.summary,
    directionAggregate
      ? `${directionAggregate.label}当前决策为${directionAggregate.action}，有效样本${directionAggregate.valid_count || 0}篇。`
      : input.weekly.decision.next_focus,
    latest?.manager_instruction,
  ]);
  return {
    trace: {
      version: input.weekly.learning_version || `weekly-${input.weekly.generated_at}`,
      generated_at: new Date().toISOString(),
      weekly_review_generated_at: input.weekly.generated_at,
      source_review_ids: sourceReviewIds,
      direction_action: directionAggregate?.action,
      basis,
    },
    weekly_strategy: `${input.weekly.decision.next_focus} ${input.weekly.decision.strategic_hypothesis || ""}`.trim(),
    topic_guidance: unique(relevant.map((review) => review.topic_instruction)),
    title_guidance: unique([
      ...(input.weekly.decision.title_patterns_to_repeat || []),
      ...relevant.map((review) => review.entry_judgement),
    ]),
    body_guidance: unique([
      ...(input.weekly.decision.body_patterns_to_repeat || []),
      ...relevant.map((review) => review.writer_instruction),
    ]),
    experiment_variable: experimentVariable,
  };
}

export function formatLearningBrief(brief: GrowthLearningBrief) {
  return [
    `周策略：${brief.weekly_strategy}`,
    `选题要求：${brief.topic_guidance.join("；") || "暂无，继续积累样本"}`,
    `标题入口经验：${brief.title_guidance.join("；") || "暂无"}`,
    `正文经验：${brief.body_guidance.join("；") || "暂无"}`,
    `本轮唯一实验变量：${brief.experiment_variable}`,
    `证据版本：${brief.trace.version}`,
  ].join("\n");
}
