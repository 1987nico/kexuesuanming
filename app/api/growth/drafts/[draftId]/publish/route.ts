import { NextResponse } from "next/server";
import { logActivity } from "@/lib/auth/activity";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { draftId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });

  const published = {
    ...draft,
    owner_user_id: draft.owner_user_id ?? guard.auth.user.id,
    status: "published" as const,
    updated_at: new Date().toISOString(),
  };
  await store.saveDraft(published);
  await logActivity({
    tenantId: published.tenant_id,
    userId: guard.auth.user.id,
    action: "draft_published",
    entityType: "content_draft",
    entityId: published.id,
    metadata: { title: published.title },
  });

  const run = await store.getRun(draft.run_id);
  if (run) {
    await store.saveRun({
      ...run,
      status: "published",
      draft: published,
      updated_at: published.updated_at,
    });
  }

  return NextResponse.json({ draft: published });
}
