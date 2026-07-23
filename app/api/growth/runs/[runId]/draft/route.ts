import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateDraft } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import { accountForBusinessGeneration } from "@/lib/growth/businessCompatibility";
import {
  buildLearningBrief,
  buildWeeklyReviewResult,
  isWeeklyReviewStale,
} from "@/lib/growth/reviewLearning";
import { recordBenchmarkSourceSelection } from "@/lib/growth/sourceRotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  selectedTopicId: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: { params: { runId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const run = await store.getRun(params.runId);
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const account = await store.getAccount(run.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
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
  const selectedTopic =
    run.topic_pool.find((topic) => topic.id === parsed.data.selectedTopicId) || run.selected_topic || run.topic_pool[0];
  const learningBrief = buildLearningBrief({
    account,
    notes,
    reviews,
    weekly: weeklyReview,
    methodId: selectedTopic?.method_id,
  });

  const result = await generateDraft({
    tenantId: DEFAULT_TENANT_ID,
    account: accountForBusinessGeneration(account),
    run,
    selectedTopicId: parsed.data.selectedTopicId,
    learningBrief,
  });

  result.draft.owner_user_id = result.draft.owner_user_id ?? guard.auth.user.id;
  result.run.owner_user_id = result.run.owner_user_id ?? guard.auth.user.id;
  await store.saveRun(result.run);
  await store.saveDraft(result.draft);
  const sourceSelectionAlreadyRecorded = notes.some((draft) =>
    draft.run_id === run.id
    && draft.method_id === selectedTopic?.method_id
    && draft.source_snapshot?.original_url === selectedTopic?.source_snapshot?.original_url
  );
  if (selectedTopic?.source_snapshot && !sourceSelectionAlreadyRecorded) {
    const latestAccount = await store.getAccount(account.id) ?? account;
    await store.saveAccount({
      ...latestAccount,
      benchmark_source_usage: recordBenchmarkSourceSelection({
        account: latestAccount,
        topic: selectedTopic,
        timestamp: new Date().toISOString(),
      }),
      updated_at: new Date().toISOString(),
    });
  }
  if (result.usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...result.usage,
      metadata: { action: "draft", runId: run.id, draftId: result.draft.id },
    });
  }

  return NextResponse.json({ run: result.run, draft: result.draft });
}
