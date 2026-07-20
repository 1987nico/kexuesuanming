import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateTopicBatch } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import type { GrowthRun } from "@/lib/growth/types";
import {
  buildLearningBrief,
  buildWeeklyReviewResult,
  isWeeklyReviewStale,
} from "@/lib/growth/reviewLearning";
import { ensureRecentTopicSources } from "@/lib/growth/sourceDiscovery";
import { accountForBusinessGeneration } from "@/lib/growth/businessCompatibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  accountId: z.string().min(1),
  week: z.number().int().min(1).max(4).optional(),
  generationMode: z.enum(["default", "explore"]).optional(),
});

const updateTitleSchema = z.object({
  runId: z.string().min(1),
  topicId: z.string().min(1),
  title: z.string().trim().min(1, "标题不能为空").refine(
    (value) => Array.from(value).length <= 20,
    "小红书标题不能超过20个字",
  ),
});

function now() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  let account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  // 生成选题前先按需调用真实的每日职业榜；当天已校验完整则直接复用，避免重复扣费。
  const discovered = await ensureRecentTopicSources(account);
  if (discovered.account !== account) {
    account = discovered.account;
    await store.saveAccount(account);
  }

  const notes = await store.listDrafts(account.id);
  const reviews = await store.listReviewsByAccount(account.id);
  let weeklyReview = account.weekly_review ?? account.stage_review;
  if (!weeklyReview || isWeeklyReviewStale(weeklyReview, reviews)) {
    weeklyReview = buildWeeklyReviewResult({ account, notes, reviews });
    await store.saveAccount({
      ...account,
      weekly_review: weeklyReview,
      stage_review: weeklyReview,
      updated_at: new Date().toISOString(),
    });
  }
  const learningBrief = buildLearningBrief({ account, notes, reviews, weekly: weeklyReview });

  const runs = await store.listRuns(account.id);
  const generationMode = parsed.data.generationMode ?? "default";
  let run = runs.find((item) => item.generation_mode === generationMode) ?? null;
  const currentTitles = run?.topic_pool.map((topic) => topic.title) ?? [];
  const seenTitles = run
    ? Array.from(new Set([...(run.seen_titles ?? []), ...currentTitles])).slice(-120)
    : [];

  const { topics, unavailableMethods, usage } = await generateTopicBatch({
    account: accountForBusinessGeneration(account),
    week: parsed.data.week ?? run?.week ?? 1,
    generationMode,
    excludeTitles: seenTitles,
    currentTitles,
    learningBrief,
  });

  const timestamp = now();
  const nextSeen = Array.from(new Set([...seenTitles, ...topics.map((topic) => topic.title)])).slice(-120);
  if (!run) {
    run = {
      id: crypto.randomUUID(),
      tenant_id: DEFAULT_TENANT_ID,
      account_id: account.id,
      status: "draft",
      week: parsed.data.week ?? 1,
      objective: generationMode === "default" ? "按当前视角的默认方法各生成1个标题。" : "按当前视角的探索方法各生成1个标题。",
      experiment_hypothesis: "用有效咨询率验证标题方法，而不是依赖主观评分。",
      generation_mode: generationMode,
      topic_pool: topics,
      unavailable_methods: unavailableMethods,
      seen_titles: nextSeen,
      learning_trace: learningBrief.trace,
      created_at: timestamp,
      updated_at: timestamp,
    } satisfies GrowthRun;
  } else {
    // 用新选题替换整个列表，而不是累加。
    run = { ...run, generation_mode: generationMode, topic_pool: topics, unavailable_methods: unavailableMethods, seen_titles: nextSeen, learning_trace: learningBrief.trace, updated_at: timestamp };
  }

  run.owner_user_id = run.owner_user_id ?? guard.auth.user.id;
  await store.saveRun(run);
  const confirmedExperiment = [...(account.cycle_experiments ?? [])].reverse().find((item) => item.status === "confirmed");
  if (confirmedExperiment) {
    const applied = { ...confirmedExperiment, status: "applied" as const, resolved_at: timestamp };
    const cycleExperiments = (account.cycle_experiments ?? []).map((item) => item.id === applied.id ? applied : item);
    const weekly = weeklyReview.experiment_card?.id === applied.id
      ? { ...weeklyReview, experiment_card: applied }
      : weeklyReview;
    await store.saveAccount({
      ...account,
      cycle_experiments: cycleExperiments,
      weekly_review: weekly,
      stage_review: weekly,
      updated_at: timestamp,
    });
  }
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "topic_batch", runId: run.id, generationMode },
    });
  }

  return NextResponse.json({
    run,
    newTopics: topics,
    unavailableMethods,
    topicSources: account.topic_sources ?? [],
    sourceRefresh: discovered.summary,
  });
}

export async function PATCH(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const parsed = updateTitleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(parsed.data.runId);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const currentTopic = run.topic_pool.find((topic) => topic.id === parsed.data.topicId);
  if (!currentTopic) return NextResponse.json({ error: "topic_not_found" }, { status: 404 });

  const timestamp = now();
  const topic = { ...currentTopic, title: parsed.data.title, updated_at: timestamp };
  const updatedRun: GrowthRun = {
    ...run,
    owner_user_id: run.owner_user_id ?? guard.auth.user.id,
    topic_pool: run.topic_pool.map((item) => item.id === topic.id ? topic : item),
    selected_topic: run.selected_topic?.id === topic.id ? topic : run.selected_topic,
    seen_titles: Array.from(new Set([...(run.seen_titles ?? []), topic.title])),
    updated_at: timestamp,
  };
  await store.saveRun(updatedRun);

  return NextResponse.json({ run: updatedRun, topic });
}
