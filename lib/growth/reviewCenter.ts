import type {
  ContentDraft,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthReviewSnapshot,
  GrowthReviewWindow,
  MetricConfirmationStatus,
  ReviewInputSource,
} from "./types";
import { REVIEW_DELAY_MS, resolvePublishedAt } from "./reviewLearning";

export const BUSINESS_REVIEW_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
export const ATTRIBUTION_REVIEW_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

export function fixedCycleId(at = new Date()) {
  const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return `week-${date.toISOString().slice(0, 10)}`;
}

export type ReviewTaskState =
  | "waiting_content"
  | "content_due"
  | "waiting_business"
  | "business_due"
  | "complete";

export interface ReviewProgress {
  state: ReviewTaskState;
  published_at?: string;
  content_available_at?: string;
  business_available_at?: string;
  attribution_available_at?: string;
  content_complete: boolean;
  business_complete: boolean;
  attribution_complete: boolean;
  attribution_ready: boolean;
  data_complete: boolean;
}

function availableAt(publishedAt: string | undefined, delay: number) {
  const publishedMs = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  return Number.isFinite(publishedMs) ? new Date(publishedMs + delay).toISOString() : undefined;
}

export function businessMetricStatus(metrics?: GrowthReviewMetrics): MetricConfirmationStatus {
  if (!metrics || metrics.qualified_inquiries === undefined) return "unknown";
  return metrics.qualified_inquiries === 0 ? "confirmed_zero" : "confirmed_value";
}

export function reviewHasWindow(review: GrowthReview | undefined, window: GrowthReviewWindow) {
  return Boolean(review?.snapshots?.some((snapshot) => snapshot.review_window === window));
}

export function resolveReviewProgress(
  draft: ContentDraft,
  review?: GrowthReview,
  at = new Date(),
): ReviewProgress {
  const publishedAt = resolvePublishedAt(draft, review?.metrics);
  const publishedMs = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  const nowMs = at.getTime();
  const contentReady = Number.isFinite(publishedMs) && nowMs >= publishedMs + REVIEW_DELAY_MS;
  const businessReady = Number.isFinite(publishedMs) && nowMs >= publishedMs + BUSINESS_REVIEW_DELAY_MS;
  const attributionReady = Number.isFinite(publishedMs) && nowMs >= publishedMs + ATTRIBUTION_REVIEW_DELAY_MS;
  const contentComplete = Boolean(
    review?.content_reviewed_at
      || reviewHasWindow(review, "content_24h")
      // v3.2 历史合并复盘没有窗口字段；存在复盘即可视为内容数据已录入。
      || (review && !review.snapshots?.length),
  );
  const businessComplete = Boolean(
    review?.business_reviewed_at
      || reviewHasWindow(review, "business_7d")
      // 旧记录若明确保存了有效咨询，保留其已确认语义，不伪造空值。
      || (review && !review.snapshots?.length && review.metrics.qualified_inquiries !== undefined),
  );
  const attributionComplete = Boolean(
    review?.attribution_reviewed_at || reviewHasWindow(review, "attribution_30d"),
  );
  const dataComplete = contentComplete && businessComplete;

  let state: ReviewTaskState;
  if (!contentComplete) state = contentReady ? "content_due" : "waiting_content";
  else if (!businessComplete) state = businessReady ? "business_due" : "waiting_business";
  else state = "complete";

  return {
    state,
    published_at: publishedAt,
    content_available_at: availableAt(publishedAt, REVIEW_DELAY_MS),
    business_available_at: availableAt(publishedAt, BUSINESS_REVIEW_DELAY_MS),
    attribution_available_at: availableAt(publishedAt, ATTRIBUTION_REVIEW_DELAY_MS),
    content_complete: contentComplete,
    business_complete: businessComplete,
    attribution_complete: attributionComplete,
    attribution_ready: attributionReady,
    data_complete: dataComplete,
  };
}

export function createReviewSnapshot(input: {
  window: GrowthReviewWindow;
  metrics: GrowthReviewMetrics;
  inputSource?: ReviewInputSource;
  previous?: GrowthReview;
  capturedAt?: string;
}): GrowthReviewSnapshot {
  const previousForWindow = [...(input.previous?.snapshots ?? [])]
    .reverse()
    .find((snapshot) => snapshot.review_window === input.window);
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const confirmations: GrowthReviewSnapshot["metric_confirmation_status"] = {};
  for (const [key, value] of Object.entries(input.metrics)) {
    if (typeof value !== "number") continue;
    confirmations[key as keyof GrowthReviewMetrics] = value === 0 ? "confirmed_zero" : "confirmed_value";
  }
  return {
    id: crypto.randomUUID(),
    review_window: input.window,
    metrics: input.metrics,
    input_source: input.inputSource ?? input.metrics.input_source ?? "manual",
    captured_at: capturedAt,
    supersedes_snapshot_id: previousForWindow?.id,
    metric_confirmation_status: confirmations,
  };
}

export function appendReviewSnapshot(
  review: GrowthReview,
  snapshot: GrowthReviewSnapshot,
  previous?: GrowthReview,
): GrowthReview {
  const historicalSnapshots = review.snapshots?.length
    ? review.snapshots
    : previous?.snapshots ?? [];
  const next: GrowthReview = {
    ...review,
    snapshots: [...historicalSnapshots, snapshot],
    content_reviewed_at: review.content_reviewed_at ?? previous?.content_reviewed_at,
    business_reviewed_at: review.business_reviewed_at ?? previous?.business_reviewed_at,
    attribution_reviewed_at: review.attribution_reviewed_at ?? previous?.attribution_reviewed_at,
    business_metrics_status: businessMetricStatus(review.metrics),
  };
  if (snapshot.review_window === "content_24h") next.content_reviewed_at = snapshot.captured_at;
  if (snapshot.review_window === "business_7d") next.business_reviewed_at = snapshot.captured_at;
  if (snapshot.review_window === "attribution_30d") next.attribution_reviewed_at = snapshot.captured_at;
  return next;
}

export function perThousandImpressions(metrics?: GrowthReviewMetrics) {
  if (!metrics?.impressions || metrics.qualified_inquiries === undefined) return undefined;
  return Number(((metrics.qualified_inquiries / metrics.impressions) * 1000).toFixed(3));
}

export function inquiryQualificationRate(metrics?: GrowthReviewMetrics) {
  if (!metrics?.private_messages || metrics.qualified_inquiries === undefined) return undefined;
  return Number((metrics.qualified_inquiries / metrics.private_messages).toFixed(6));
}
