import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { stageReview } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  accountId: z.string().min(1),
  snapshot: z.boolean().default(true),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const notes = await store.listDrafts(account.id);
  const reviews = await store.listReviewsByAccount(account.id);

  const snapshots = account.weekly_review_snapshots ?? [];
  const { result, usage } = await stageReview({ account, notes, reviews, previous: snapshots.at(-1) });
  const updatedAt = new Date().toISOString();
  await store.saveAccount({
    ...account,
    weekly_review: result,
    stage_review: result,
    weekly_review_snapshots: parsed.data.snapshot ? [...snapshots, result].slice(-12) : snapshots,
    updated_at: updatedAt,
  });

  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "weekly_review", accountId: account.id, learningVersion: result.learning_version },
    });
  }

  return NextResponse.json({ result, snapshotSaved: parsed.data.snapshot });
}
