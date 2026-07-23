import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import {
  activeThreeDayCycle,
  buildThreeDayReviewNotes,
  createThreeDayReviewCycle,
  OFFICIAL_NOTE_LIST_MAX_BYTES,
  parseOfficialNoteListExcel,
  type ReviewDraftContext,
} from "@/lib/growth/threeDayReview";
import { resolveAccountBusinessLine } from "@/lib/growth/businessCompatibility";
import {
  mergeThreeDayReviewCycles,
  reviewAccountsForBusiness,
  reviewOwnerAccounts,
  saveSharedReviewCycles,
} from "@/lib/growth/reviewCycleWorkspace";
import { GROWTH_BUSINESS_LINES, type GrowthBusinessLine, type ThreeDayReviewCycle } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function batchCounts(cycles: ThreeDayReviewCycle[]) {
  const notes = cycles.flatMap((cycle) => cycle.notes);
  return {
    matched: notes.filter((note) => note.match_status === "matched").length,
    suggested: notes.filter((note) => note.match_status === "suggested").length,
    external_history: notes.filter((note) => note.match_status === "external_history" || note.match_status === "unmatched").length,
    excluded: notes.filter((note) => note.match_status === "excluded").length,
  };
}

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
  if (guard.auth.role !== "admin" && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceFileHash = createHash("sha256").update(buffer).digest("hex");
    const parsed = await parseOfficialNoteListExcel(buffer);
    const ownerAccounts = await reviewOwnerAccounts(store, account, guard.auth.user.id);
    const draftContexts: ReviewDraftContext[] = (await Promise.all(ownerAccounts.map(async (ownerAccount) => {
      const drafts = await store.listDrafts(ownerAccount.id);
      return drafts.map((draft) => ({
        draft,
        account_id: ownerAccount.id,
        business_line: resolveAccountBusinessLine(ownerAccount),
        persona: ownerAccount.persona,
      }));
    }))).flat();

    const currentBusinessLine = resolveAccountBusinessLine(account);
    const preparedNotes = buildThreeDayReviewNotes(parsed.rows, draftContexts, {
      ...account,
      business_line: currentBusinessLine,
    });
    const businessCounts: Record<GrowthBusinessLine, number> = { executive: 0, overseas_student: 0 };
    let unassignedCount = 0;
    for (const note of preparedNotes) {
      if (note.assigned_business_line) businessCounts[note.assigned_business_line] += 1;
      else unassignedCount += 1;
    }

    const cyclesByBusiness = new Map<GrowthBusinessLine, ThreeDayReviewCycle[]>();
    for (const businessLine of GROWTH_BUSINESS_LINES) {
      cyclesByBusiness.set(
        businessLine,
        mergeThreeDayReviewCycles(reviewAccountsForBusiness(ownerAccounts, businessLine)),
      );
    }
    const allExistingCycles = [...cyclesByBusiness.values()].flat();
    const duplicateCompleted = allExistingCycles
      .find((cycle) => cycle.status === "completed" && cycle.source_file_hash === sourceFileHash);
    if (duplicateCompleted) {
      const duplicateBatch = allExistingCycles.filter((cycle) => cycle.status === "completed"
        && (duplicateCompleted.import_batch_id
          ? cycle.import_batch_id === duplicateCompleted.import_batch_id
          : cycle.id === duplicateCompleted.id));
      const currentCycle = duplicateBatch.find((cycle) => cycle.business_line === currentBusinessLine)
        ?? duplicateCompleted;
      return NextResponse.json({
        cycle: currentCycle,
        cycles: duplicateBatch,
        counts: batchCounts(duplicateBatch),
        businessCounts: currentCycle.batch_business_counts,
        unassignedCount: currentCycle.batch_unassigned_count ?? 0,
        duplicate: true,
        message: `该文件已在第${duplicateCompleted.cycle_number}轮完成复盘，没有重复创建。`,
        warnings: parsed.warnings,
      });
    }

    const existingSameFile = allExistingCycles
      .find((cycle) => cycle.status === "draft" && cycle.source_file_hash === sourceFileHash);
    if (existingSameFile) {
      const existingBatch = allExistingCycles.filter((cycle) => cycle.status === "draft"
        && (existingSameFile.import_batch_id
          ? cycle.import_batch_id === existingSameFile.import_batch_id
          : cycle.id === existingSameFile.id));
      const currentCycle = existingBatch.find((cycle) => cycle.business_line === currentBusinessLine)
        ?? existingSameFile;
      return NextResponse.json({
        cycle: currentCycle,
        cycles: existingBatch,
        counts: batchCounts(existingBatch),
        businessCounts: currentCycle.batch_business_counts ?? businessCounts,
        unassignedCount: currentCycle.batch_unassigned_count ?? unassignedCount,
        duplicate: true,
        message: "该Excel已导入当前复盘批次，已保留现有匹配和人工确认结果。",
        warnings: parsed.warnings,
      });
    }

    const importBatchId = crypto.randomUUID();
    const businessesToCreate = GROWTH_BUSINESS_LINES.filter((businessLine) =>
      businessLine === currentBusinessLine
      || businessCounts[businessLine] > 0
      || preparedNotes.some((note) => note.business_assignment_status === "ambiguous"
        && note.match_candidates?.some((candidate) => candidate.business_line === businessLine)));
    const cycleIds = Object.fromEntries(businessesToCreate.map((businessLine) => {
      const existing = activeThreeDayCycle(cyclesByBusiness.get(businessLine));
      return [businessLine, existing?.id ?? crypto.randomUUID()];
    })) as Partial<Record<GrowthBusinessLine, string>>;

    const createdCycles: ThreeDayReviewCycle[] = [];
    for (const businessLine of businessesToCreate) {
      const businessAccounts = reviewAccountsForBusiness(ownerAccounts, businessLine);
      if (!businessAccounts.length) continue;
      const targetAccount = businessAccounts.find((item) => item.persona === account.persona) ?? businessAccounts[0];
      const existingCycles = cyclesByBusiness.get(businessLine) ?? [];
      const existingDraftCycle = activeThreeDayCycle(existingCycles);
      const childNotes = preparedNotes.filter((note) =>
        note.assigned_business_line === businessLine
        || (businessLine === currentBusinessLine && !note.assigned_business_line));
      const cycle = createThreeDayReviewCycle({
        account: { ...targetAccount, business_line: businessLine },
        rows: parsed.rows,
        preparedNotes: childNotes,
        fileName: file.name,
        fileSize: file.size,
        importBatchId,
        sourceFileHash,
        batchTotalRows: parsed.rows.length,
        batchBusinessCounts: businessCounts,
        batchUnassignedCount: unassignedCount,
        siblingCycleIds: cycleIds,
        cycleId: cycleIds[businessLine],
        previousCycles: existingCycles,
        existingDraftCycle,
      });
      await saveSharedReviewCycles(
        store,
        businessAccounts,
        [...existingCycles.filter((item) => item.id !== cycle.id), cycle]
          .sort((a, b) => a.cycle_number - b.cycle_number),
      );
      createdCycles.push(cycle);
    }

    const currentCycle = createdCycles.find((cycle) => cycle.business_line === currentBusinessLine)
      ?? createdCycles[0];
    if (!currentCycle) throw new Error("当前账号没有可保存复盘批次的业务人设。");
    const totalCounts = {
      matched: preparedNotes.filter((note) => note.match_status === "matched").length,
      suggested: preparedNotes.filter((note) => note.match_status === "suggested").length,
      external_history: preparedNotes.filter((note) => note.match_status === "external_history" || note.match_status === "unmatched").length,
      excluded: preparedNotes.filter((note) => note.match_status === "excluded").length,
    };
    return NextResponse.json({
      cycle: currentCycle,
      cycles: createdCycles,
      counts: totalCounts,
      businessCounts,
      unassignedCount,
      duplicate: Boolean(existingSameFile),
      warnings: parsed.warnings,
    });
  } catch (error) {
    return NextResponse.json({ error: "invalid_official_excel", message: (error as Error).message }, { status: 400 });
  }
}
