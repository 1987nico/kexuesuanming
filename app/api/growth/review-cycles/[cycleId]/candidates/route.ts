import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { resolveAccountBusinessLine } from "@/lib/growth/businessCompatibility";
import { mergeThreeDayReviewCycles, reviewOwnerAccounts, reviewWorkspaceAccounts } from "@/lib/growth/reviewCycleWorkspace";
import { growthStore } from "@/lib/growth/store";
import { normalizeReviewTitle, reviewTitleSimilarity } from "@/lib/growth/threeDayReview";
import type { ThreeDayMatchCandidate } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { cycleId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "";
  const sourceKey = url.searchParams.get("sourceKey") || "";
  const query = url.searchParams.get("q")?.trim() || "";
  if (!accountId || !sourceKey || Array.from(query).length < 2) {
    return NextResponse.json({ error: "validation", message: "请输入至少2个字搜索系统正文。" }, { status: 400 });
  }

  const store = growthStore();
  const account = await store.getAccount(accountId);
  if (!account) return NextResponse.json({ error: "account_not_found", message: "当前人设不存在。" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const workspaceAccounts = await reviewWorkspaceAccounts(store, account, guard.auth.user.id);
  const ownerAccounts = await reviewOwnerAccounts(store, account, guard.auth.user.id);
  const cycle = mergeThreeDayReviewCycles(workspaceAccounts).find((item) => item.id === params.cycleId);
  if (!cycle || cycle.status !== "draft") {
    return NextResponse.json({ error: "cycle_not_found", message: "当前待确认周期不存在。" }, { status: 404 });
  }
  const note = cycle.notes.find((item) => item.source_key === sourceKey);
  if (!note) return NextResponse.json({ error: "note_not_found", message: "没有找到这条Excel笔记。" }, { status: 404 });

  const normalizedQuery = normalizeReviewTitle(query);
  const candidates = (await Promise.all(ownerAccounts.map(async (workspaceAccount) => {
    const drafts = await store.listDrafts(workspaceAccount.id);
    return drafts
      .filter((draft) => draft.status !== "draft")
      .filter((draft) => normalizeReviewTitle(draft.title).includes(normalizedQuery))
      .map((draft) => ({
        draft_id: draft.id,
        account_id: workspaceAccount.id,
        business_line: resolveAccountBusinessLine(workspaceAccount),
        persona: workspaceAccount.persona,
        title: draft.title,
        status: draft.status,
        published_at: draft.published_at ?? draft.distributed_at,
        title_similarity: reviewTitleSimilarity(note.source_title, draft.title),
        time_delta_seconds: draft.published_at || draft.distributed_at
          ? Math.round(Math.abs(Date.parse(draft.published_at ?? draft.distributed_at!) - Date.parse(note.published_at)) / 1000)
          : undefined,
        match_reason: "运营从两条业务、六个视角的全部正文中搜索并选择",
      } satisfies ThreeDayMatchCandidate));
  }))).flat()
    .sort((a, b) => b.title_similarity - a.title_similarity || (b.published_at || "").localeCompare(a.published_at || ""))
    .slice(0, 20);

  return NextResponse.json({ candidates });
}
