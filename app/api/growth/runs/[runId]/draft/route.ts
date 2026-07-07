import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateDraft } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  selectedTopicId: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: { params: { runId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(params.runId);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const account = await store.getAccount(run.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const result = await generateDraft({
    tenantId: DEFAULT_TENANT_ID,
    account,
    run,
    selectedTopicId: parsed.data.selectedTopicId,
  });

  result.draft.owner_user_id = result.draft.owner_user_id ?? guard.auth.user.id;
  result.run.owner_user_id = result.run.owner_user_id ?? guard.auth.user.id;
  await store.saveRun(result.run);
  await store.saveDraft(result.draft);
  if (result.usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...result.usage,
      metadata: { action: "draft", runId: run.id, draftId: result.draft.id },
    });
  }

  return NextResponse.json({ run: result.run, draft: result.draft });
}
