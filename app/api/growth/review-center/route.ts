import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import { resolveReviewProgress } from "@/lib/growth/reviewCenter";
import { isMethodWeeklyReview } from "@/lib/growth/reviewLearning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const accountId = new URL(req.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "account_id_required" }, { status: 400 });

  const store = growthStore();
  const account = await store.getAccount(accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const drafts = await store.listDrafts(account.id);
  const reviews = await store.listReviewsByAccount(account.id, drafts.map((draft) => draft.id));
  const reviewByDraft = new Map(reviews.map((review) => [review.draft_id, review]));
  const currentDrafts = drafts.filter((draft) =>
    draft.schema_version !== "legacy_v1"
    && (draft.status === "published" || draft.status === "reviewed"));
  const tasks = currentDrafts.map((draft) => ({
    draft,
    review: reviewByDraft.get(draft.id) ?? null,
    progress: resolveReviewProgress(draft, reviewByDraft.get(draft.id)),
  }));
  const counts = Object.fromEntries(
    ["waiting_content", "content_due", "waiting_business", "business_due", "complete"].map((state) => [
      state,
      tasks.filter((task) => task.progress.state === state).length,
    ]),
  );
  const storedWeekly = account.weekly_review ?? account.stage_review;

  return NextResponse.json({
    accountId: account.id,
    tasks,
    counts,
    currentCycle: isMethodWeeklyReview(storedWeekly) ? storedWeekly : null,
    cycleSnapshots: account.weekly_review_snapshots ?? [],
  });
}
