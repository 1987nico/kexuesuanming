import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { TITLE_METHOD_BY_ID } from "@/lib/growth/methods";
import { growthStore } from "@/lib/growth/store";
import type { TitleMethodId, TopicSourceSnapshot } from "@/lib/growth/types";
import { validateSourceLink } from "@/lib/growth/sourceValidation";
import { sourceIsUsable } from "@/lib/growth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const methodSchema = z.enum(["traffic", "human_pain", "tug_of_war", "scarce_material", "superlative", "contrarian", "nostalgia", "inventory", "same_product", "same_effect", "similar_audience", "same_outcome", "viral_framework"]);
const sourceSchema = z.object({
  accountId: z.string().min(1), method_id: methodSchema, platform: z.string().min(1).max(40),
  author: z.string().min(1).max(100), original_title: z.string().min(1).max(200),
  original_url: z.string().url().refine((url) => /^https?:\/\//i.test(url), "仅支持http(s)链接"),
  published_at: z.string().datetime(), heat_snapshot: z.string().min(1).max(300),
  migration_note: z.string().max(500).optional(), verified_by_operator: z.boolean().default(false),
});

function freshness(publishedAt: string): TopicSourceSnapshot["freshness"] {
  const days = Math.max(0, (Date.now() - Date.parse(publishedAt)) / 86_400_000);
  return days <= 3 ? "within_72h" : days <= 7 ? "day_4_to_7" : "historical";
}

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = sourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  if (!TITLE_METHOD_BY_ID[parsed.data.method_id].sourceRequired) return NextResponse.json({ error: "source_not_required", message: "该方法不需要外部母题。" }, { status: 400 });
  if (Date.parse(parsed.data.published_at) > Date.now() + 5 * 60 * 1000) return NextResponse.json({ error: "published_at_in_future", message: "来源发布时间不能晚于当前时间。" }, { status: 400 });
  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const validation = await validateSourceLink(parsed.data.original_url);
  const source: TopicSourceSnapshot = {
    id: crypto.randomUUID(), method_id: parsed.data.method_id as TitleMethodId,
    platform: parsed.data.platform, author: parsed.data.author, original_title: parsed.data.original_title,
    original_url: parsed.data.original_url, published_at: parsed.data.published_at,
    heat_snapshot: parsed.data.heat_snapshot, collected_at: validation.checked_at,
    migration_note: parsed.data.migration_note,
    source_provider: "manual",
    verified_by_operator: validation.link_status === "accessible" ? true : parsed.data.verified_by_operator,
    link_status: validation.link_status, freshness: freshness(parsed.data.published_at),
  };
  await store.saveAccount({ ...account, topic_sources: [source, ...(account.topic_sources ?? [])], updated_at: new Date().toISOString() });
  return NextResponse.json({ source, validation, usable: sourceIsUsable(source) });
}

export async function DELETE(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = z.object({ accountId: z.string(), sourceId: z.string() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  await store.saveAccount({ ...account, topic_sources: (account.topic_sources ?? []).filter((source) => source.id !== parsed.data.sourceId), updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
