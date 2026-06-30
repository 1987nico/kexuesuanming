import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewDraft } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const metricsSchema = z.object({
  published_at: z.string().optional(),
  note_url: z.string().optional(),
  impressions: z.number().int().nonnegative().optional(),
  reads: z.number().int().nonnegative().optional(),
  ctr: z.number().nonnegative().optional(),
  likes: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  shares: z.number().int().nonnegative().optional(),
  profile_visits: z.number().int().nonnegative().optional(),
  follows: z.number().int().nonnegative().optional(),
  comment_keywords: z.array(z.string()).optional(),
  private_messages: z.number().int().nonnegative().optional(),
});

export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const body = await req.json().catch(() => ({}));
  const parsed = metricsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });

  const { review, usage } = await reviewDraft({
    tenantId: DEFAULT_TENANT_ID,
    draft,
    metrics: parsed.data,
  });
  await store.saveReview(review);
  const reviewedDraft = {
    ...draft,
    status: "reviewed" as const,
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

  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      feature: "growth_text",
      ...usage,
      metadata: { action: "review", draftId: draft.id },
    });
  }

  return NextResponse.json({ draft: reviewedDraft, review });
}
