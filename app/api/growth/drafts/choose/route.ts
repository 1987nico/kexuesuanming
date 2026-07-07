import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import type { ContentDraft } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  account_id: z.string(),
  run_id: z.string(),
  status: z.enum(["draft", "ready", "published", "reviewed"]).optional(),
  direction: z.enum(["A", "B", "C"]),
  content_type: z.enum(["diagnostic", "tool", "story"]),
  test_variable: z.string(),
  expected_signal: z.string(),
  title: z.string(),
  alternative_titles: z.array(z.string()),
  target_user: z.string(),
  cover_text: z.string(),
  body: z.string(),
  hashtags: z.array(z.string()),
  comment_prompt: z.string(),
  word_count: z.object({
    title: z.number(),
    body_and_tags: z.number(),
    total: z.number(),
    within_limit: z.boolean(),
  }),
  follow_reason: z.string(),
  trust_anchor: z.string(),
  review_points: z.array(z.string()),
  cover_suggestion: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const bodySchema = z.object({ draft: draftSchema });

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(parsed.data.draft.run_id);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  const timestamp = new Date().toISOString();
  const existingDraft = await store.getDraft(parsed.data.draft.id);
  const draft: ContentDraft = {
    ...parsed.data.draft,
    owner_user_id: existingDraft?.owner_user_id ?? guard.auth.user.id,
    status: "ready",
    updated_at: timestamp,
  };
  await store.saveDraft(draft);
  await store.saveRun({
    ...run,
    status: "ready",
    selected_topic: run.topic_pool.find((topic) => topic.id === run.selected_topic?.id) ?? run.selected_topic,
    draft,
    updated_at: timestamp,
  });

  return NextResponse.json({ draft });
}
