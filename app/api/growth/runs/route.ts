import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTopicPool } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  accountId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  week: z.number().int().min(1).max(4).optional(),
  recentSignals: z.string().max(2000).optional(),
});

export async function GET() {
  const store = growthStore();
  const account = await store.getLatestAccount(DEFAULT_TENANT_ID);
  if (!account) return NextResponse.json({ runs: [] });
  const runs = await store.listRuns(account.id);
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const account = parsed.data.accountId
    ? await store.getAccount(parsed.data.accountId)
    : await store.getLatestAccount(DEFAULT_TENANT_ID);
  if (!account) {
    return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  }

  const plan = parsed.data.planId ? await store.getPlan(parsed.data.planId) : await store.getLatestPlan(account.id);
  const { run, usage } = await generateTopicPool({
    tenantId: DEFAULT_TENANT_ID,
    account,
    planId: plan?.id,
    week: parsed.data.week,
    recentSignals: parsed.data.recentSignals,
  });

  await store.saveRun(run);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      feature: "growth_text",
      ...usage,
      metadata: { action: "topic_pool", runId: run.id },
    });
  }

  return NextResponse.json({ run });
}
