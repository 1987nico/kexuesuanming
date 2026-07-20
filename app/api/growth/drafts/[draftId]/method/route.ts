import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { TITLE_METHOD_BY_ID } from "@/lib/growth/methods";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const methodSchema = z.enum(["traffic", "human_pain", "tug_of_war", "scarce_material", "superlative", "contrarian", "nostalgia", "inventory", "same_product", "same_effect", "similar_audience", "same_outcome", "viral_framework"]);
const bodySchema = z.object({ method_id: methodSchema, generation_mode: z.enum(["default", "explore"]).default("default") });

export async function PATCH(req: Request, { params }: { params: { draftId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  if (draft.schema_version !== "legacy_v1" && draft.schema_version) {
    return NextResponse.json({ error: "not_legacy", message: "只有历史正文需要人工确认方法归属。" }, { status: 409 });
  }
  const definition = TITLE_METHOD_BY_ID[parsed.data.method_id];
  const updated = {
    ...draft,
    method_group: definition.group,
    method_id: definition.id,
    method_label: definition.label,
    generation_mode: parsed.data.generation_mode,
    method_attribution_status: "confirmed" as const,
    schema_version: "legacy_v1" as const,
    // 旧样本继续留在历史证据区；确认归类不会污染v3.2从零建立的新基线。
    eligible_for_method_learning: false,
    updated_at: new Date().toISOString(),
  };
  await store.saveDraft(updated);
  return NextResponse.json({ draft: updated, entersNewLearning: false });
}
