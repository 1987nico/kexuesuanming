import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import { validateSourceLink } from "@/lib/growth/sourceValidation";
import { benchmarkSourcePolicy, sourceIsUsable } from "@/lib/growth/validation";
import type { TopicSourceSnapshot } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountId: z.string().min(1),
  original_url: z.string().url().refine((url) => /^https?:\/\//i.test(url)).optional(),
  heat_snapshot: z.string().min(1).max(300).optional(),
  published_at: z.string().datetime().optional(),
  verified_by_operator: z.boolean().optional(),
});

function freshness(publishedAt: string): TopicSourceSnapshot["freshness"] {
  const days = Math.max(0, (Date.now() - Date.parse(publishedAt)) / 86_400_000);
  return days <= 3 ? "within_72h" : days <= 7 ? "day_4_to_7" : "historical";
}

export async function PATCH(req: Request, { params }: { params: { sourceId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const sources = account.topic_sources ?? [];
  const current = sources.find((item) => item.id === params.sourceId);
  if (!current) return NextResponse.json({ error: "source_not_found" }, { status: 404 });
  const url = parsed.data.original_url ?? current.original_url;
  const validation = await validateSourceLink(url);
  const publishedAt = parsed.data.published_at ?? current.published_at;
  const refreshedBase: TopicSourceSnapshot = {
    ...current,
    original_url: url,
    heat_snapshot: parsed.data.heat_snapshot ?? current.heat_snapshot,
    published_at: publishedAt,
    collected_at: validation.checked_at,
    link_status: validation.link_status,
    freshness: freshness(publishedAt),
    verified_by_operator:
      validation.link_status === "accessible"
        ? true
        : validation.link_status === "restricted"
          ? parsed.data.verified_by_operator === true
          : false,
  };
  const policy = benchmarkSourcePolicy({
    ...refreshedBase,
    benchmark_pool: undefined,
    source_validity_days: undefined,
  });
  const refreshed: TopicSourceSnapshot = {
    ...refreshedBase,
    benchmark_pool: policy.pool,
    source_validity_days: policy.validityDays,
  };
  await store.saveAccount({
    ...account,
    topic_sources: sources.map((item) => item.id === current.id ? refreshed : item),
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ source: refreshed, validation, usable: sourceIsUsable(refreshed) });
}
