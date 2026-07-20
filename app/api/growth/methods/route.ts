import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { methodApplicability } from "@/lib/growth/methods";
import { growthStore } from "@/lib/growth/store";
import { buildThreeDayLearningState } from "@/lib/growth/threeDayLearning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const methodSchema = z.enum(["traffic", "human_pain", "tug_of_war", "scarce_material", "superlative", "contrarian", "nostalgia", "inventory", "same_product", "same_effect", "similar_audience", "same_outcome", "viral_framework"]);

export async function PATCH(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = z.object({ accountId: z.string(), methodId: methodSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (methodApplicability(account.persona, parsed.data.methodId, account.method_overrides) !== "explore") return NextResponse.json({ error: "not_explore_method" }, { status: 409 });
  const drafts = await store.listDrafts(account.id);
  const learningState = buildThreeDayLearningState(account, drafts);
  const suggestion = learningState.promotion_suggestions.find((item) => item.method_id === parsed.data.methodId);
  if (!suggestion) return NextResponse.json({ error: "promotion_threshold_not_met" }, { status: 409 });
  const next = {
    ...account,
    method_overrides: { ...(account.method_overrides ?? {}), [parsed.data.methodId]: "default" as const },
    three_day_learning_state: learningState,
    updated_at: new Date().toISOString(),
  };
  await store.saveAccount(next);
  return NextResponse.json({ account: next });
}
