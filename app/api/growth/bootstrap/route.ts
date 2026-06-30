import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAccountAndPlan } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  accountName: z.string().min(1).max(80).default("面霸君"),
  targetUser: z.string().max(500).optional(),
  coreProblem: z.string().max(500).optional(),
  trustSource: z.string().max(500).optional(),
});

export async function GET() {
  const store = growthStore();
  const account = await store.getLatestAccount(DEFAULT_TENANT_ID);
  const plan = account ? await store.getLatestPlan(account.id) : null;
  const runs = account ? await store.listRuns(account.id) : [];
  const drafts = account ? await store.listDrafts(account.id) : [];
  return NextResponse.json({ account, plan, runs, drafts });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { account, plan, usage } = await generateAccountAndPlan({
    tenantId: DEFAULT_TENANT_ID,
    ...parsed.data,
  });

  const store = growthStore();
  await store.saveAccount(account);
  await store.savePlan(plan);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      feature: "growth_text",
      ...usage,
      metadata: { action: "bootstrap" },
    });
  }

  return NextResponse.json({ account, plan });
}
