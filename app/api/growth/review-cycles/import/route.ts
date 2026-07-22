import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import {
  activeThreeDayCycle,
  createThreeDayReviewCycle,
  OFFICIAL_NOTE_LIST_MAX_BYTES,
  parseOfficialNoteListExcel,
  type ReviewDraftContext,
} from "@/lib/growth/threeDayReview";
import { resolveAccountBusinessLine } from "@/lib/growth/businessCompatibility";
import {
  mergeThreeDayReviewCycles,
  reviewWorkspaceAccounts,
  saveSharedReviewCycles,
} from "@/lib/growth/reviewCycleWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const form = await req.formData().catch(() => null);
  const accountId = String(form?.get("accountId") ?? "");
  const file = form?.get("file");
  if (!accountId) return NextResponse.json({ error: "account_id_required", message: "缺少账号ID。" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required", message: "请选择小红书笔记列表明细表。" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "unsupported_file", message: "只支持小红书官方.xlsx文件。" }, { status: 400 });
  }
  if (file.size > OFFICIAL_NOTE_LIST_MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: "Excel文件不能超过5MB。" }, { status: 413 });
  }

  const store = growthStore();
  const account = await store.getAccount(accountId);
  if (!account) return NextResponse.json({ error: "account_not_found", message: "当前人设不存在。" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseOfficialNoteListExcel(buffer);
    const workspaceAccounts = await reviewWorkspaceAccounts(store, account, guard.auth.user.id);
    const draftContexts: ReviewDraftContext[] = (await Promise.all(workspaceAccounts.map(async (workspaceAccount) => {
      const drafts = await store.listDrafts(workspaceAccount.id);
      return drafts.map((draft) => ({
        draft,
        account_id: workspaceAccount.id,
        business_line: resolveAccountBusinessLine(workspaceAccount),
        persona: workspaceAccount.persona,
      }));
    }))).flat();
    const existingCycles = mergeThreeDayReviewCycles(workspaceAccounts);
    const existingDraftCycle = activeThreeDayCycle(existingCycles);
    const cycle = createThreeDayReviewCycle({
      account: { ...account, business_line: resolveAccountBusinessLine(account) },
      draftContexts,
      rows: parsed.rows,
      fileName: file.name,
      fileSize: file.size,
      previousCycles: existingCycles,
      existingDraftCycle,
    });
    const cycles = [
      ...existingCycles.filter((item) => item.id !== cycle.id),
      cycle,
    ].sort((a, b) => a.cycle_number - b.cycle_number);
    await saveSharedReviewCycles(store, workspaceAccounts, cycles);

    const counts = {
      matched: cycle.notes.filter((note) => note.match_status === "matched").length,
      suggested: cycle.notes.filter((note) => note.match_status === "suggested").length,
      external_history: cycle.notes.filter((note) => note.match_status === "external_history" || note.match_status === "unmatched").length,
      excluded: cycle.notes.filter((note) => note.match_status === "excluded").length,
    };
    return NextResponse.json({ cycle, counts, warnings: parsed.warnings });
  } catch (error) {
    return NextResponse.json({ error: "invalid_official_excel", message: (error as Error).message }, { status: 400 });
  }
}
