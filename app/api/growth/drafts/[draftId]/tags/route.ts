import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateOpenBodyTags } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { draftId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  const generated = await generateOpenBodyTags(draft);
  const next = { ...draft, raw_body_tags: [...(draft.raw_body_tags ?? []).map((tag) => ({ ...tag, active: false })), ...generated.tags], tagging_status: generated.status, updated_at: new Date().toISOString() };
  await store.saveDraft(next);
  return NextResponse.json({ draft: next });
}

export async function PUT(req: Request, { params }: { params: { draftId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = z.object({ tags: z.array(z.string().trim().min(2).max(8)).max(2) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  const timestamp = new Date().toISOString();
  const tags = parsed.data.tags.map((text) => ({ id: crypto.randomUUID(), text, reason: "运营根据最终正文人工修正", generated_at: timestamp, body_version: draft.selected_body_version || "selected" as const, edited_by_operator: true, active: true }));
  const next = { ...draft, raw_body_tags: [...(draft.raw_body_tags ?? []).map((tag) => ({ ...tag, active: false })), ...tags], tagging_status: tags.length ? "tagged" as const : "unclassified" as const, canonical_tag_ids: [], updated_at: timestamp };
  await store.saveDraft(next);
  return NextResponse.json({ draft: next });
}
