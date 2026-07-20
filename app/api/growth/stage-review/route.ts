import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { stageReview } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import { fixedCycleId } from "@/lib/growth/reviewCenter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  accountId: z.string().min(1),
  snapshot: z.boolean().default(true),
  periodId: z.string().min(1).max(80).optional(),
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
  const periodId = parsed.data.periodId ?? fixedCycleId();
  if (parsed.data.snapshot && snapshots.some((snapshot) => snapshot.period_id === periodId)) {
    return NextResponse.json(
      { error: "cycle_snapshot_exists", message: "本周期策略快照已经保存，实时汇总不会覆盖它。" },
      { status: 409 },
    );
  }
  const { result, usage } = await stageReview({ account, notes, reviews, previous: snapshots.at(-1) });
  result.period_id = periodId;
  const decisionMethod = (result.eligible_total || 0) >= 30
    ? [...result.by_method]
      .filter((item) => item.valid_count >= 5)
      .sort((a, b) => b.median_inquiry_rate - a.median_inquiry_rate)[0]
    : undefined;
  const experimentCard = {
    id: crypto.randomUUID(),
    account_id: account.id,
    period_id: periodId,
    target_user: account.target_user,
    method_id: decisionMethod?.method_id === "legacy" ? undefined : decisionMethod?.method_id,
    method_label: decisionMethod?.method_label,
    generation_mode: decisionMethod?.generation_mode === "legacy" ? undefined : decisionMethod?.generation_mode,
    hypothesis: result.decision.strategic_hypothesis || "继续验证不同标题方法带来的有效咨询差异。",
    experiment_variable: "title_cover" as const,
    expected_signal: "目标用户说出具体处境、候选路径或决策冲突",
    stop_condition: decisionMethod ? "完成至少5篇同方法有效样本后再决定放大。" : "总样本或方法样本未达门槛时只积累证据，不改变方法状态。",
    evidence_review_ids: result.source_review_ids ?? [],
    status: "pending" as const,
    created_at: new Date().toISOString(),
  };
  result.experiment_card = experimentCard;
  const updatedAt = new Date().toISOString();
  await store.saveAccount({
    ...account,
    weekly_review: result,
    stage_review: result,
    weekly_review_snapshots: parsed.data.snapshot ? [...snapshots, result].slice(-12) : snapshots,
    cycle_experiments: [...(account.cycle_experiments ?? []), experimentCard].slice(-12),
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
