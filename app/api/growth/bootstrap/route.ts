import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAccountAndPlan } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import { GROWTH_PERSONAS, type GrowthPersona } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const personaSchema = z.enum(["merchant", "buyer", "expert"]);

const bodySchema = z.object({
  persona: personaSchema.default("expert"),
  accountName: z.string().min(1).max(80).default("面霸君"),
  targetUser: z.string().max(500).optional(),
  coreProblem: z.string().max(500).optional(),
  trustSource: z.string().max(500).optional(),
  regenerateAccountId: z.string().min(1).optional(),
});

function resolvePersona(value: string | null): GrowthPersona {
  return (GROWTH_PERSONAS as string[]).includes(value ?? "") ? (value as GrowthPersona) : "expert";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const persona = resolvePersona(url.searchParams.get("persona"));
  const store = growthStore();
  const account = await store.getLatestAccountByPersona(DEFAULT_TENANT_ID, persona);
  const plan = account ? await store.getLatestPlan(account.id) : null;
  const runs = account ? await store.listRuns(account.id) : [];
  const drafts = account ? await store.listDrafts(account.id) : [];
  // 以笔记为单元：返回每篇笔记对应的复盘（draftId -> review），供历史查看
  const reviewList = account ? await store.listReviewsByAccount(account.id) : [];
  const reviews: Record<string, (typeof reviewList)[number]> = {};
  for (const review of reviewList) {
    if (!reviews[review.draft_id]) reviews[review.draft_id] = review;
  }
  return NextResponse.json({ persona, account, plan, runs, drafts, reviews });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  // 原地重生成：保留 id 和 created_at，避免每次点新增账号、并让选题等关联数据不丢。
  let createdAt: string | undefined;
  if (parsed.data.regenerateAccountId) {
    const existing = await store.getAccount(parsed.data.regenerateAccountId);
    if (existing) createdAt = existing.created_at;
  }

  const { account, plan, usage } = await generateAccountAndPlan({
    tenantId: DEFAULT_TENANT_ID,
    ...parsed.data,
    createdAt,
  });

  await store.saveAccount(account);
  if (!parsed.data.regenerateAccountId) await store.savePlan(plan);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      feature: "growth_text",
      ...usage,
      metadata: { action: "bootstrap", persona: parsed.data.persona },
    });
  }

  return NextResponse.json({ account, plan });
}
