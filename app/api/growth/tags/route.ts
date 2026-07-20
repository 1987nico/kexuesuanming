import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateTagMergeSuggestions } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import {
  buildThreeDayLearningSamples,
  buildThreeDayLearningState,
} from "@/lib/growth/threeDayLearning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = z.object({ accountId: z.string() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const drafts = await store.listDrafts(account.id);
  const learningState = buildThreeDayLearningState(account, drafts);
  const eligibleDraftIds = new Set(buildThreeDayLearningSamples(account)
    .filter((sample) => sample.content_eligible && sample.draft_id)
    .map((sample) => sample.draft_id!));
  const eligibleDrafts = drafts.filter((draft) => eligibleDraftIds.has(draft.id)
    && (draft.status === "published" || draft.status === "reviewed"));
  const validCount = learningState.content_eligible_total;
  const uniqueTags = new Set(eligibleDrafts.flatMap((draft) =>
    (draft.raw_body_tags ?? []).filter((tag) => tag.active !== false).map((tag) => tag.text)));
  if (validCount < 30 && uniqueTags.size < 20) return NextResponse.json({ error: "threshold_not_met", message: `当前${validCount}篇有效样本、${uniqueTags.size}个原始标签；达到30篇有效样本或20个标签后整理。` }, { status: 409 });
  const raw = eligibleDrafts.flatMap((draft) => (draft.raw_body_tags ?? [])
    .filter((tag) => tag.active !== false)
    .map((tag) => ({ text: tag.text, draftId: draft.id, title: draft.title })));
  const generated = await generateTagMergeSuggestions(raw);
  const next = { ...account, tag_merge_suggestions: [...generated.suggestions, ...(account.tag_merge_suggestions ?? [])], updated_at: new Date().toISOString() };
  await store.saveAccount(next);
  return NextResponse.json({ suggestions: generated.suggestions });
}

export async function PATCH(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = z.object({ accountId: z.string(), suggestionId: z.string(), action: z.enum(["approve", "reject"]), proposed_name: z.string().trim().min(2).max(12).optional(), definition: z.string().max(500).optional(), member_tags: z.array(z.string()).min(2).optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const suggestion = (account.tag_merge_suggestions ?? []).find((item) => item.id === parsed.data.suggestionId);
  if (!suggestion || suggestion.status !== "pending") return NextResponse.json({ error: "suggestion_not_pending" }, { status: 409 });
  const timestamp = new Date().toISOString();
  const memberTags = parsed.data.member_tags ?? suggestion.member_tags;
  const canonicalId = crypto.randomUUID();
  const suggestions = (account.tag_merge_suggestions ?? []).map((item) => item.id === suggestion.id ? { ...item, proposed_name: parsed.data.proposed_name || item.proposed_name, definition: parsed.data.definition || item.definition, member_tags: memberTags, status: parsed.data.action === "approve" ? "approved" as const : "rejected" as const, resolved_at: timestamp } : item);
  const canonical = parsed.data.action === "approve" ? [...(account.canonical_body_tags ?? []), { id: canonicalId, name: parsed.data.proposed_name || suggestion.proposed_name, definition: parsed.data.definition || suggestion.definition, raw_tags: memberTags, approved_at: timestamp }] : account.canonical_body_tags;
  await store.saveAccount({ ...account, tag_merge_suggestions: suggestions, canonical_body_tags: canonical, updated_at: timestamp });
  if (parsed.data.action === "approve") {
    for (const draft of await store.listDrafts(account.id)) {
      if (!(draft.raw_body_tags ?? []).some((tag) => memberTags.includes(tag.text))) continue;
      await store.saveDraft({ ...draft, raw_body_tags: (draft.raw_body_tags ?? []).map((tag) => memberTags.includes(tag.text) ? { ...tag, canonical_tag_id: canonicalId } : tag), canonical_tag_ids: [...new Set([...(draft.canonical_tag_ids ?? []), canonicalId])], updated_at: timestamp });
    }
  }
  return NextResponse.json({ ok: true });
}
