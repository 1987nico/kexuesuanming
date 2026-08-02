import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import { accountForBusinessGeneration } from "@/lib/growth/businessCompatibility";
import { repairDraftPart } from "@/lib/growth/runner";
import type { ContentDraft } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  draft: z.custom<ContentDraft>(),
  repairType: z.enum(["opening", "fulfillment", "identity", "conversion", "outcome", "compact", "enrich", "rewrite"]),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(parsed.data.draft.run_id);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const account = await store.getAccount(run.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const topic = run.topic_pool.find((item) => item.id === run.selected_topic?.id)
    ?? run.topic_pool.find((item) => item.method_id === parsed.data.draft.method_id);
  if (!topic) return NextResponse.json({ error: "topic_not_found" }, { status: 404 });

  const result = await repairDraftPart({
    draft: parsed.data.draft,
    account: accountForBusinessGeneration(account),
    topic,
    repairType: parsed.data.repairType,
  });

  if (result.usage) {
    await store.saveUsage({
      tenant_id: account.tenant_id,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...result.usage,
      metadata: { action: "draft_repair", draftId: parsed.data.draft.id, repairType: parsed.data.repairType },
    });
  }

  return NextResponse.json({ draft: result.draft });
}
