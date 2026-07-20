import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountId: z.string().min(1),
  status: z.enum(["confirmed", "rejected", "applied"]),
  hypothesis: z.string().min(1).max(500).optional(),
  expected_signal: z.string().min(1).max(500).optional(),
  stop_condition: z.string().min(1).max(500).optional(),
});

export async function PATCH(req: Request, { params }: { params: { experimentId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });

  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const current = account.cycle_experiments?.find((item) => item.id === params.experimentId);
  if (!current) return NextResponse.json({ error: "experiment_not_found" }, { status: 404 });

  const resolved = {
    ...current,
    hypothesis: parsed.data.hypothesis ?? current.hypothesis,
    expected_signal: parsed.data.expected_signal ?? current.expected_signal,
    stop_condition: parsed.data.stop_condition ?? current.stop_condition,
    status: parsed.data.status,
    resolved_at: new Date().toISOString(),
  };
  const cycleExperiments = (account.cycle_experiments ?? []).map((item) => item.id === resolved.id ? resolved : item);
  const weeklyReview = account.weekly_review?.experiment_card?.id === resolved.id
    ? { ...account.weekly_review, experiment_card: resolved }
    : account.weekly_review;
  const weeklySnapshots = (account.weekly_review_snapshots ?? []).map((snapshot) =>
    snapshot.experiment_card?.id === resolved.id ? { ...snapshot, experiment_card: resolved } : snapshot);
  await store.saveAccount({
    ...account,
    cycle_experiments: cycleExperiments,
    weekly_review: weeklyReview,
    stage_review: weeklyReview,
    weekly_review_snapshots: weeklySnapshots,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ experiment: resolved });
}
