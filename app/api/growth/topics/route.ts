import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTopicBatch } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import type { GrowthRun } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  accountId: z.string().min(1),
  week: z.number().int().min(1).max(4).optional(),
  count: z.number().int().min(1).max(4).optional(),
  recentSignals: z.string().max(2000).optional(),
});

function now() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const runs = await store.listRuns(account.id);
  let run = runs[0] ?? null;
  // 换一批：排除历史出现过的所有标题（含上一批），保证每次点都是新的。
  const seenTitles = run
    ? Array.from(new Set([...(run.seen_titles ?? []), ...run.topic_pool.map((topic) => topic.title)]))
    : [];

  const { topics, usage } = await generateTopicBatch({
    account,
    week: parsed.data.week ?? run?.week ?? 1,
    count: parsed.data.count ?? 2,
    excludeTitles: seenTitles,
    recentSignals: parsed.data.recentSignals,
  });

  const timestamp = now();
  const nextSeen = Array.from(new Set([...seenTitles, ...topics.map((topic) => topic.title)]));
  if (!run) {
    run = {
      id: crypto.randomUUID(),
      tenant_id: DEFAULT_TENANT_ID,
      account_id: account.id,
      status: "draft",
      week: parsed.data.week ?? 1,
      objective: "每点一次换成 2 个新选题（不与历史重复）。",
      experiment_hypothesis: "换一批看哪个方向/角度更值得写。",
      topic_pool: topics,
      seen_titles: nextSeen,
      created_at: timestamp,
      updated_at: timestamp,
    } satisfies GrowthRun;
  } else {
    // 用新选题替换整个列表，而不是累加。
    run = { ...run, topic_pool: topics, seen_titles: nextSeen, updated_at: timestamp };
  }

  await store.saveRun(run);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      feature: "growth_text",
      ...usage,
      metadata: { action: "topic_batch", runId: run.id },
    });
  }

  return NextResponse.json({ run, newTopics: topics });
}
