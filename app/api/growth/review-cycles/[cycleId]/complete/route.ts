import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import { completeThreeDayReviewCycle } from "@/lib/growth/threeDayReview";
import {
  mergeThreeDayReviewCycles,
  reviewWorkspaceAccounts,
  saveSharedReviewCycles,
} from "@/lib/growth/reviewCycleWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trafficStatusSchema = z.enum(["unknown", "organic_normal", "paid", "limited", "violation", "deleted"]);
const bodySchema = z.object({
  accountId: z.string().min(1),
  trafficConfirmed: z.boolean(),
  trafficExceptions: z.record(trafficStatusSchema).optional(),
  confirmedSuggested: z.array(z.string()).optional(),
  excludedSourceKeys: z.array(z.string()).optional(),
  qualifiedInquiries: z.number().int().nonnegative(),
  attributions: z.record(z.number().int().nonnegative()).optional(),
  diagnosis199Entries: z.number().int().nonnegative().optional(),
  diagnosis199Sales: z.number().int().nonnegative().optional(),
  deep6999Qualified: z.number().int().nonnegative().optional(),
  deep6999Sales: z.number().int().nonnegative().optional(),
});

export async function POST(req: Request, { params }: { params: { cycleId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });

  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const workspaceAccounts = await reviewWorkspaceAccounts(store, account, guard.auth.user.id);
  const cycles = mergeThreeDayReviewCycles(workspaceAccounts);
  const cycle = cycles.find((item) => item.id === params.cycleId);
  if (!cycle) return NextResponse.json({ error: "cycle_not_found", message: "本轮三日复盘不存在。" }, { status: 404 });
  if (cycle.status !== "draft") {
    return NextResponse.json({ error: "cycle_locked", message: "已完成周期不能覆盖，请创建修订版本。" }, { status: 409 });
  }

  try {
    const previousLearningSourceKeys = cycles
      .filter((item) => item.id !== cycle.id && item.status === "completed")
      .flatMap((item) => item.notes)
      .filter((note) => note.content_eligible)
      .map((note) => note.source_key);
    const previousLearningDraftIds = cycles
      .filter((item) => item.id !== cycle.id && item.status === "completed")
      .flatMap((item) => item.notes)
      .filter((note) => note.content_eligible && note.draft_id)
      .map((note) => note.draft_id!);
    const completed = completeThreeDayReviewCycle(cycle, {
      ...parsed.data,
      previousLearningSourceKeys,
      previousLearningDraftIds,
    });
    await saveSharedReviewCycles(
      store,
      workspaceAccounts,
      cycles.map((item) => item.id === completed.id ? completed : item),
    );
    return NextResponse.json({ cycle: completed });
  } catch (error) {
    return NextResponse.json({ error: "cycle_completion_failed", message: (error as Error).message }, { status: 400 });
  }
}
