import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateTopicPool } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import { buildThreeDayLearningBrief } from "@/lib/growth/threeDayLearning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  accountId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  week: z.number().int().min(1).max(4).optional(),
});

export async function GET() {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const store = growthStore();
  // 工作台隔离：操作者只取「自己的或未归属」账号；管理员不限
  const ownerScope = guard.auth.role === "admin" ? undefined : guard.auth.user.id;
  const account = await store.getLatestAccount(DEFAULT_TENANT_ID, ownerScope);
  if (!account) return NextResponse.json({ runs: [] });
  const runs = await store.listRuns(account.id);
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  // 工作台隔离：操作者只取「自己的或未归属」账号；管理员不限
  const ownerScope = guard.auth.role === "admin" ? undefined : guard.auth.user.id;
  const account = parsed.data.accountId
    ? await store.getAccount(parsed.data.accountId)
    : await store.getLatestAccount(DEFAULT_TENANT_ID, ownerScope);
  if (!account) {
    return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  }
  // 显式传 accountId 时也要校验归属：操作者不能操作他人（且非未归属）的账号
  if (ownerScope && account.owner_user_id != null && account.owner_user_id !== ownerScope) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const plan = parsed.data.planId ? await store.getPlan(parsed.data.planId) : await store.getLatestPlan(account.id);
  const notes = await store.listDrafts(account.id);
  const learningBrief = buildThreeDayLearningBrief({ account, drafts: notes });
  const { run, usage } = await generateTopicPool({
    tenantId: DEFAULT_TENANT_ID,
    account,
    planId: plan?.id,
    week: parsed.data.week,
    learningBrief,
  });

  run.owner_user_id = run.owner_user_id ?? guard.auth.user.id;
  await store.saveRun(run);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "topic_pool", runId: run.id },
    });
  }

  return NextResponse.json({ run });
}
