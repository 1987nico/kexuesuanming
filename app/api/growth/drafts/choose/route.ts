import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateOpenBodyTags } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import type { ContentDraft } from "@/lib/growth/types";
import { enforceDraftCompliance, withDraftValidation } from "@/lib/growth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  draft: z.object({
    id: z.string(), tenant_id: z.string(), account_id: z.string(), run_id: z.string(), business_line: z.string(),
    method_group: z.enum(["native", "benchmark"]),
    method_id: z.enum(["traffic", "human_pain", "tug_of_war", "scarce_material", "superlative", "contrarian", "nostalgia", "inventory", "same_product", "same_effect", "similar_audience", "same_outcome", "viral_framework"]),
    method_label: z.string(), generation_mode: z.enum(["default", "explore"]),
    title_promise: z.string(), source_snapshot: z.any().optional(),
    selected_body_version: z.enum(["short", "long", "selected"]),
    raw_body_tags: z.array(z.any()).default([]), tagging_status: z.enum(["tagged", "unclassified", "pending"]).default("pending"),
    canonical_tag_ids: z.array(z.string()).default([]), cta_type: z.enum(["soft_bridge", "on_platform_consult", "service_entry"]),
    validation_checks: z.array(z.any()).default([]), test_variable: z.string(), expected_signal: z.string(),
    title: z.string(), alternative_titles: z.array(z.string()), target_user: z.string(), cover_text: z.string(), body: z.string(),
    hashtags: z.array(z.string()), comment_prompt: z.string(), word_count: z.any(), follow_reason: z.string(), trust_anchor: z.string(),
    review_points: z.array(z.string()), cover_suggestion: z.string(), created_at: z.string(), updated_at: z.string(),
  }).passthrough(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });

  const store = growthStore();
  const run = await store.getRun(parsed.data.draft.run_id);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const account = await store.getAccount(parsed.data.draft.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const timestamp = new Date().toISOString();
  const existing = await store.getDraft(parsed.data.draft.id);
  let draft = enforceDraftCompliance({
    ...parsed.data.draft,
    owner_user_id: existing?.owner_user_id ?? guard.auth.user.id,
    status: "ready",
    updated_at: timestamp,
  } as ContentDraft);
  draft = withDraftValidation(draft, account.persona);
  if (draft.validation_report?.status !== "passed") {
    return NextResponse.json({
      error: "validation_gate_failed",
      message: "正文尚未通过身份、兑现和转化植入检查，请重新生成后再选择。",
      checks: draft.validation_checks,
    }, { status: 422 });
  }

  const tagging = await generateOpenBodyTags(draft);
  draft = { ...draft, raw_body_tags: [...(existing?.raw_body_tags ?? []).map((tag) => ({ ...tag, active: false })), ...tagging.tags], tagging_status: tagging.status };
  await store.saveDraft(draft);
  await store.saveRun({ ...run, status: "ready", selected_topic: run.topic_pool.find((topic) => topic.method_id === draft.method_id), draft, updated_at: timestamp });
  if (tagging.usage) await store.saveUsage({ tenant_id: DEFAULT_TENANT_ID, user_id: guard.auth.user.id, feature: "growth_text", ...tagging.usage, metadata: { action: "open_body_tags", draftId: draft.id } });
  return NextResponse.json({ draft });
}
