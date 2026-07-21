import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateDraftVariants } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import { accountForBusinessGeneration } from "@/lib/growth/businessCompatibility";
import {
  buildLearningBrief,
  buildWeeklyReviewResult,
  isWeeklyReviewStale,
} from "@/lib/growth/reviewLearning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  runId: z.string().min(1),
  topicId: z.string().min(1),
  count: z.number().int().min(1).max(3).optional(),
  bodyVersion: z.enum(["short", "long"]).optional(),
  excludeBodies: z.array(z.string()).max(6).optional(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(parsed.data.runId);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const account = await store.getAccount(run.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const topic = run.topic_pool.find((candidate) => candidate.id === parsed.data.topicId);
  if (!topic) return NextResponse.json({ error: "topic_not_found" }, { status: 404 });

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
  const learningBrief = buildLearningBrief({
    account,
    notes,
    reviews,
    weekly: weeklyReview,
    methodId: topic.method_id,
  });

  const { drafts, usage } = await generateDraftVariants({
    tenantId: DEFAULT_TENANT_ID,
    account: accountForBusinessGeneration(account),
    run,
    topic,
    count: parsed.data.count ?? 2,
    bodyVersion: parsed.data.bodyVersion,
    excludeBodies: parsed.data.excludeBodies,
    learningBrief,
  });

  console.info("[growth] draft validation summary", JSON.stringify({
    runId: run.id,
    topicId: topic.id,
    businessLine: account.business_line ?? "executive",
    persona: account.persona,
    methodId: topic.method_id,
    requestedVersion: parsed.data.bodyVersion ?? "both",
    drafts: drafts.map((draft) => ({
      version: draft.selected_body_version,
      status: draft.validation_report?.status ?? "failed",
      autoRepairAttempts: draft.validation_report?.attempts ?? 0,
      totalChars: draft.word_count.total,
      failedChecks: draft.validation_checks
        .filter((check) => check.status !== "passed")
        .map((check) => check.key),
    })),
  }));

  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "draft_variants", runId: run.id, topicId: topic.id },
    });
  }

  return NextResponse.json({ drafts, topic, learningTrace: learningBrief.trace });
}
