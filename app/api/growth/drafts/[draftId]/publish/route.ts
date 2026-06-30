import { NextResponse } from "next/server";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { draftId: string } }) {
  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });

  const published = {
    ...draft,
    status: "published" as const,
    updated_at: new Date().toISOString(),
  };
  await store.saveDraft(published);

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
