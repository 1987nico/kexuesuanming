import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { reviewDraft } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import {
  buildWeeklyReviewResult,
  getReviewAvailability,
  resolvePublishedAt,
} from "@/lib/growth/reviewLearning";
import {
  appendReviewSnapshot,
  ATTRIBUTION_REVIEW_DELAY_MS,
  BUSINESS_REVIEW_DELAY_MS,
  createReviewSnapshot,
} from "@/lib/growth/reviewCenter";
import type { GrowthReviewMetrics, GrowthReviewWindow } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const metricsSchema = z.object({
  published_at: z.string().optional(),
  note_url: z.string().url().max(500).optional(),
  note_status: z.enum(["normal", "limited", "violation", "deleted"]).optional(),
  promoted: z.boolean().optional(),
  input_source: z.enum(["manual", "screenshot", "excel", "mixed"]).default("manual"),
  impressions: z.number().int().nonnegative(),
  reads: z.number().int().nonnegative(),
  average_view_seconds: z.number().nonnegative().optional(),
  likes: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  shares: z.number().int().nonnegative().optional(),
  profile_visits: z.number().int().nonnegative().optional(),
  follows: z.number().int().nonnegative().optional(),
  comment_keywords: z.array(z.string()).optional(),
  private_messages: z.number().int().nonnegative().optional(),
  qualified_inquiries: z.number().int().nonnegative().optional(),
  diagnosis_199_entries: z.number().int().nonnegative().optional(),
  diagnosis_199_sales: z.number().int().nonnegative().optional(),
  deep_6999_qualified: z.number().int().nonnegative().optional(),
  deep_6999_sales: z.number().int().nonnegative().optional(),
  target_customer_quote: z.string().max(1000).optional(),
  traffic_sources: z
    .object({
      home: z.number().min(0).max(100).optional(),
      search: z.number().min(0).max(100).optional(),
      profile: z.number().min(0).max(100).optional(),
      other: z.number().min(0).max(100).optional(),
    })
    .optional(),
  search_keywords: z.array(z.string().max(80)).max(5).optional(),
  audience: z
    .object({
      gender: z.record(z.number().min(0).max(100)).optional(),
      age: z.record(z.number().min(0).max(100)).optional(),
      cities: z.record(z.number().min(0).max(100)).optional(),
      city_tiers: z.record(z.number().min(0).max(100)).optional(),
      interests: z.record(z.number().min(0).max(100)).optional(),
    })
    .optional(),
});

const reviewWindowSchema = z.enum(["content_24h", "business_7d", "attribution_30d"]);
const createRequestSchema = metricsSchema.extend({ review_window: reviewWindowSchema.optional() });
const patchMetricsSchema = metricsSchema.partial().extend({ review_window: reviewWindowSchema.optional() });

async function saveReview(req: Request, { params }: { params: { draftId: string } }, mode: "create" | "update") {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = (mode === "update" ? patchMetricsSchema : createRequestSchema).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  if (draft.status !== "published" && draft.status !== "reviewed") {
    return NextResponse.json({ error: "draft_not_published", message: "请先标记实际发布时间。" }, { status: 409 });
  }

  const existingReview = await store.getReviewByDraft(draft.id);
  if (mode === "update" && !existingReview) {
    return NextResponse.json({ error: "review_not_found", message: "这篇正文还没有复盘，请先使用首次复盘。" }, { status: 404 });
  }
  const { review_window: requestedWindow, ...metricsPatch } = parsed.data;
  const reviewWindow: GrowthReviewWindow = requestedWindow ?? "content_24h";
  const changedFields = Object.keys(metricsPatch).filter((key) => (metricsPatch as Record<string, unknown>)[key] !== undefined);
  const metricsInput = mode === "update"
    ? { ...(existingReview?.metrics ?? {}), ...metricsPatch }
    : metricsPatch;
  const fullMetrics = metricsSchema.safeParse(metricsInput);
  if (!fullMetrics.success) {
    return NextResponse.json({ error: "incomplete_review", message: "历史复盘缺少必要指标，请补齐后再保存。", issues: fullMetrics.error.flatten() }, { status: 400 });
  }

  const publishedAt = resolvePublishedAt(draft, fullMetrics.data);
  const availability = getReviewAvailability(publishedAt);
  if (!availability.ready) {
    return NextResponse.json(
      {
        error: "review_not_ready",
        message: "发布满24小时后才能提交正式复盘。",
        availableAt: availability.available_at,
        remainingSeconds: Math.ceil(availability.remaining_ms / 1000),
      },
      { status: 409 },
    );
  }
  if (reviewWindow === "business_7d") {
    const publishedMs = Date.parse(publishedAt);
    const businessAvailableAt = new Date(publishedMs + BUSINESS_REVIEW_DELAY_MS);
    if (Date.now() < businessAvailableAt.getTime()) {
      return NextResponse.json(
        { error: "business_review_not_ready", message: "发布满7天后才能确认有效咨询并进入方法学习。", availableAt: businessAvailableAt.toISOString() },
        { status: 409 },
      );
    }
    if (fullMetrics.data.qualified_inquiries === undefined) {
      return NextResponse.json(
        { error: "qualified_inquiries_unconfirmed", message: "请确认有效咨询数量；确认没有时填写0，不能留空。" },
        { status: 400 },
      );
    }
  }
  if (reviewWindow === "attribution_30d") {
    const attributionAvailableAt = new Date(Date.parse(publishedAt) + ATTRIBUTION_REVIEW_DELAY_MS);
    if (Date.now() < attributionAvailableAt.getTime()) {
      return NextResponse.json(
        { error: "attribution_review_not_ready", message: "发布满30天后才能补充成交归因。", availableAt: attributionAvailableAt.toISOString() },
        { status: 409 },
      );
    }
  }

  const notes = await store.listDrafts(draft.account_id);
  const existingReviews = await store.listReviewsByAccount(draft.account_id);

  const generated = await reviewDraft({
    tenantId: DEFAULT_TENANT_ID,
    draft,
    metrics: { ...fullMetrics.data, published_at: publishedAt, snapshot_at: new Date().toISOString() },
    existingReview,
    notes,
    reviews: existingReviews,
  });
  const snapshot = createReviewSnapshot({
    window: reviewWindow,
    metrics: metricsPatch as GrowthReviewMetrics,
    inputSource: fullMetrics.data.input_source,
    previous: existingReview ?? undefined,
  });
  const review = appendReviewSnapshot(generated.review, snapshot, existingReview ?? undefined);
  const usage = generated.usage;
  review.owner_user_id = review.owner_user_id ?? guard.auth.user.id;
  await store.saveReview(review);
  const reviewedDraft = {
    ...draft,
    status: "reviewed" as const,
    original_post_url: fullMetrics.data.note_url || draft.original_post_url,
    distributed_at: publishedAt,
    is_paid_distribution: fullMetrics.data.promoted,
    updated_at: new Date().toISOString(),
  };
  await store.saveDraft(reviewedDraft);

  const run = await store.getRun(draft.run_id);
  if (run) {
    await store.saveRun({
      ...run,
      status: "reviewed",
      draft: reviewedDraft,
      review,
      updated_at: reviewedDraft.updated_at,
    });
  }

  const account = await store.getAccount(draft.account_id);
  let weeklyReview = account?.weekly_review ?? account?.stage_review ?? null;
  if (account) {
    const currentReviews = await store.listReviewsByAccount(account.id);
    weeklyReview = buildWeeklyReviewResult({ account, notes, reviews: currentReviews, previous: account.weekly_review_snapshots?.at(-1) });
    await store.saveAccount({
      ...account,
      weekly_review: weeklyReview,
      stage_review: weeklyReview,
      updated_at: new Date().toISOString(),
    });
  }

  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "review", draftId: draft.id },
    });
  }

  return NextResponse.json({ draft: reviewedDraft, review, weeklyReview, changedFields });
}

export async function POST(req: Request, context: { params: { draftId: string } }) {
  return saveReview(req, context, "create");
}

export async function PATCH(req: Request, context: { params: { draftId: string } }) {
  return saveReview(req, context, "update");
}
