import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { resolveAccountBusinessLine } from "@/lib/growth/businessCompatibility";
import {
  createReviewSiblingCycle,
  mergeThreeDayReviewCycles,
  reviewAccountsForBusiness,
  reviewOwnerAccounts,
  saveSharedReviewCycles,
} from "@/lib/growth/reviewCycleWorkspace";
import { growthStore } from "@/lib/growth/store";
import { GROWTH_BUSINESS_LINES, type GrowthBusinessLine, type ThreeDayReviewCycle } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountId: z.string().min(1),
  action: z.enum(["confirm", "assign_business", "external_history", "exclude", "restore"]),
  draftId: z.string().min(1).optional(),
  businessLine: z.enum(["executive", "overseas_student"]).optional(),
  useOfficialTime: z.boolean().optional(),
});

function adjustBatchCounters(
  cycle: ThreeDayReviewCycle,
  previousBusiness: GrowthBusinessLine | undefined,
  nextBusiness: GrowthBusinessLine | undefined,
) {
  if (previousBusiness === nextBusiness) return cycle;
  const counts = {
    executive: cycle.batch_business_counts?.executive ?? 0,
    overseas_student: cycle.batch_business_counts?.overseas_student ?? 0,
  };
  let unassigned = cycle.batch_unassigned_count ?? 0;
  if (previousBusiness) counts[previousBusiness] = Math.max(0, counts[previousBusiness] - 1);
  else unassigned = Math.max(0, unassigned - 1);
  if (nextBusiness) counts[nextBusiness] += 1;
  else unassigned += 1;
  return { ...cycle, batch_business_counts: counts, batch_unassigned_count: unassigned };
}

export async function PATCH(
  req: Request,
  { params }: { params: { cycleId: string; sourceKey: string } },
) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found", message: "当前人设不存在。" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ownerAccounts = await reviewOwnerAccounts(store, account, guard.auth.user.id);
  const ownerAccountIds = new Set(ownerAccounts.map((item) => item.id));
  const workspaces = new Map<GrowthBusinessLine, { accounts: typeof ownerAccounts; cycles: ThreeDayReviewCycle[] }>();
  for (const businessLine of GROWTH_BUSINESS_LINES) {
    const accounts = reviewAccountsForBusiness(ownerAccounts, businessLine);
    workspaces.set(businessLine, { accounts, cycles: mergeThreeDayReviewCycles(accounts) });
  }
  const allCycles = [...workspaces.values()].flatMap((workspace) => workspace.cycles);
  const cycle = allCycles.find((item) => item.id === params.cycleId);
  if (!cycle) return NextResponse.json({ error: "cycle_not_found", message: "本轮三日复盘不存在。" }, { status: 404 });
  if (cycle.status !== "draft") {
    return NextResponse.json({ error: "cycle_locked", message: "已完成周期不能再修改匹配关系。" }, { status: 409 });
  }
  const note = cycle.notes.find((item) => item.source_key === params.sourceKey);
  if (!note) return NextResponse.json({ error: "note_not_found", message: "没有找到这条Excel笔记。" }, { status: 404 });

  const now = new Date().toISOString();
  let nextNote = note;

  if (parsed.data.action === "confirm") {
    const draftId = parsed.data.draftId ?? note.match_candidates?.[0]?.draft_id ?? note.draft_id;
    let candidate = note.match_candidates?.find((item) => item.draft_id === draftId);
    if (!candidate && draftId) {
      const searchedDraft = await store.getDraft(draftId);
      const searchedAccount = searchedDraft
        ? ownerAccounts.find((item) => item.id === searchedDraft.account_id)
        : undefined;
      if (searchedDraft && searchedAccount && searchedDraft.status !== "draft") {
        candidate = {
          draft_id: searchedDraft.id,
          account_id: searchedAccount.id,
          business_line: resolveAccountBusinessLine(searchedAccount),
          persona: searchedAccount.persona,
          title: searchedDraft.title,
          status: searchedDraft.status,
          published_at: searchedDraft.published_at ?? searchedDraft.distributed_at,
          title_similarity: 0,
          match_reason: note.match_status === "suggested" && note.draft_id === draftId
            ? "旧版建议匹配，等待人工确认"
            : "运营从两条业务、六个视角的正文中搜索并选择",
        };
      }
    }
    if (!candidate || !ownerAccountIds.has(candidate.account_id)) {
      return NextResponse.json({ error: "candidate_not_found", message: "请选择当前账号下可确认的系统正文。" }, { status: 400 });
    }
    const draft = await store.getDraft(candidate.draft_id);
    if (!draft || draft.account_id !== candidate.account_id) {
      return NextResponse.json({ error: "draft_not_found", message: "候选正文已不存在，请重新上传Excel刷新匹配。" }, { status: 404 });
    }
    if (draft.status === "draft") {
      return NextResponse.json({ error: "draft_not_ready", message: "未选定草稿不能绑定为已发布笔记。" }, { status: 409 });
    }
    if (draft.status === "ready" && !parsed.data.useOfficialTime) {
      return NextResponse.json({ error: "official_time_required", message: "待发布正文必须采用官方首次发布时间后才能绑定。" }, { status: 409 });
    }
    const targetAccount = ownerAccounts.find((item) => item.id === candidate!.account_id)!;
    const targetBusiness = resolveAccountBusinessLine(targetAccount);
    const officialPublishedAt = note.official_published_at ?? note.published_at;
    const systemPublishedAt = draft.published_at ?? draft.distributed_at;
    const timeDelta = systemPublishedAt
      ? Math.round(Math.abs(Date.parse(systemPublishedAt) - Date.parse(officialPublishedAt)) / 1000)
      : undefined;

    if (parsed.data.useOfficialTime) {
      await store.saveDraft({
        ...draft,
        status: draft.status === "reviewed" ? "reviewed" : "published",
        published_at: officialPublishedAt,
        distributed_at: officialPublishedAt,
        publication_history: [
          ...(draft.publication_history ?? []),
          {
            previous_status: draft.status,
            previous_published_at: systemPublishedAt,
            official_published_at: officialPublishedAt,
            source: "official_excel",
            corrected_at: now,
          },
        ],
        updated_at: now,
      });
    }

    const currentBusiness = resolveAccountBusinessLine(account);
    nextNote = {
      ...note,
      draft_id: draft.id,
      matched_account_id: targetAccount.id,
      matched_business_line: targetBusiness,
      assigned_business_line: targetBusiness,
      business_assignment_status: "manual_confirmed",
      business_assignment_confidence: candidate.title_similarity,
      business_assignment_reason: `已人工确认归入${targetBusiness === "executive" ? "中高管业务" : "留学生业务"}`,
      matched_persona: targetAccount.persona,
      system_title: draft.title,
      system_published_at: parsed.data.useOfficialTime ? officialPublishedAt : systemPublishedAt,
      official_published_at: officialPublishedAt,
      published_at_delta_seconds: parsed.data.useOfficialTime ? 0 : timeDelta,
      method_id: draft.method_id,
      method_label: draft.method_label,
      method_group: draft.method_group,
      generation_mode: draft.generation_mode,
      match_status: "matched",
      match_scope: targetBusiness !== currentBusiness
        ? "cross_business"
        : targetAccount.id === account.id ? "current_persona" : "same_business_other_persona",
      match_confidence: candidate.title_similarity,
      match_reason: parsed.data.useOfficialTime
        ? `已人工绑定${targetAccount.persona === "merchant" ? "商家" : targetAccount.persona === "buyer" ? "买家" : "专家"}视角正文，并采用官方首次发布时间`
        : `已人工确认绑定${targetAccount.persona === "merchant" ? "商家" : targetAccount.persona === "buyer" ? "买家" : "专家"}视角正文`,
      resolution_type: parsed.data.useOfficialTime ? "official_time" : "confirmed",
      resolved_at: now,
      content_eligible: false,
      commercial_eligible: false,
      eligibility_reasons: ["等待批次确认"],
    };
  } else if (parsed.data.action === "assign_business") {
    if (!parsed.data.businessLine) {
      return NextResponse.json({ error: "business_line_required", message: "请选择要归入的业务。" }, { status: 400 });
    }
    nextNote = {
      ...note,
      assigned_business_line: parsed.data.businessLine,
      business_assignment_status: "manual_confirmed",
      business_assignment_confidence: 1,
      business_assignment_reason: `已人工归入${parsed.data.businessLine === "executive" ? "中高管业务" : "留学生业务"}`,
      match_status: "external_history",
      match_scope: "external",
      match_reason: "业务归属已确认，但未找到对应系统正文；只做描述统计",
      resolution_type: "external_history",
      resolved_at: now,
      content_eligible: false,
      commercial_eligible: false,
      eligibility_reasons: ["系统外历史笔记，不进入方法学习"],
    };
  } else if (parsed.data.action === "external_history") {
    nextNote = {
      ...note,
      draft_id: undefined,
      matched_account_id: undefined,
      matched_business_line: undefined,
      assigned_business_line: cycle.business_line,
      business_assignment_status: "manual_confirmed",
      business_assignment_confidence: 1,
      business_assignment_reason: `已确认归入${cycle.business_line === "executive" ? "中高管业务" : "留学生业务"}`,
      matched_persona: undefined,
      method_id: undefined,
      method_label: undefined,
      method_group: undefined,
      generation_mode: undefined,
      match_status: "external_history",
      match_scope: "external",
      match_reason: "已确认为系统外历史笔记；保留平台数据，只做描述统计",
      resolution_type: "external_history",
      resolved_at: now,
      content_eligible: false,
      commercial_eligible: false,
      eligibility_reasons: ["系统外历史笔记，不进入方法学习"],
    };
  } else if (parsed.data.action === "exclude") {
    nextNote = {
      ...note,
      business_assignment_status: "excluded",
      match_status: "excluded",
      match_reason: "已由运营排除本轮复盘",
      resolution_type: "excluded",
      resolved_at: now,
      content_eligible: false,
      commercial_eligible: false,
      eligibility_reasons: ["运营本轮排除"],
    };
  } else {
    const strongCandidates = (note.match_candidates ?? []).filter((candidate) =>
      candidate.title_similarity === 1
      || (candidate.title_similarity >= 0.88 && (candidate.time_delta_seconds ?? Infinity) <= 24 * 60 * 60)
      || (candidate.time_delta_seconds ?? Infinity) <= 5 * 60);
    const candidateBusinesses = new Set(strongCandidates.map((candidate) => candidate.business_line));
    const candidate = strongCandidates[0];
    const ambiguous = candidateBusinesses.size > 1;
    nextNote = {
      ...note,
      draft_id: undefined,
      matched_account_id: undefined,
      matched_business_line: undefined,
      assigned_business_line: !ambiguous ? candidate?.business_line : undefined,
      business_assignment_status: ambiguous ? "ambiguous" : candidate ? "suggested" : "external_history",
      business_assignment_confidence: candidate?.title_similarity ?? 0,
      business_assignment_reason: ambiguous
        ? "两条业务都有候选，需要人工确认"
        : candidate?.match_reason ?? "尚未确认业务归属",
      matched_persona: undefined,
      method_id: undefined,
      method_label: undefined,
      method_group: undefined,
      generation_mode: undefined,
      match_status: candidate ? "suggested" : "external_history",
      match_scope: candidate
        ? candidate.business_line === cycle.business_line
          ? candidate.account_id === account.id ? "current_persona" : "same_business_other_persona"
          : "cross_business"
        : "external",
      match_reason: ambiguous
        ? "两条业务都找到可匹配正文，需要人工确认业务归属"
        : candidate?.match_reason ?? "Excel数据已识别，但尚未确认对应的系统正文",
      resolution_type: candidate ? undefined : "external_history",
      resolved_at: undefined,
      content_eligible: false,
      commercial_eligible: false,
      eligibility_reasons: ["等待批次确认"],
    };
  }

  const previousBusiness = note.assigned_business_line;
  const nextBusiness = nextNote.assigned_business_line;
  const targetBusiness = nextBusiness ?? cycle.business_line;
  const targetWorkspace = workspaces.get(targetBusiness);
  if (!targetWorkspace?.accounts.length) {
    return NextResponse.json({ error: "target_business_missing", message: "目标业务还没有可保存复盘的人设。" }, { status: 409 });
  }
  let targetCycle = targetBusiness === cycle.business_line
    ? cycle
    : targetWorkspace.cycles.find((item) => item.status === "draft" && item.import_batch_id === cycle.import_batch_id);
  if (!targetCycle && targetBusiness !== cycle.business_line && cycle.import_batch_id) {
    const targetAccount = targetWorkspace.accounts.find((item) => item.persona === cycle.persona)
      ?? targetWorkspace.accounts[0];
    targetCycle = createReviewSiblingCycle(cycle, targetAccount, { now });
    targetWorkspace.cycles = [...targetWorkspace.cycles, targetCycle];
  }
  if (!targetCycle) {
    return NextResponse.json({ error: "target_cycle_missing", message: "目标业务的复盘子批次创建失败，请稍后重试。" }, { status: 409 });
  }
  const siblingCycleIds = cycle.import_batch_id
    ? {
        ...(cycle.sibling_cycle_ids ?? {}),
        [cycle.business_line]: cycle.id,
        [targetBusiness]: targetCycle.id,
      }
    : cycle.sibling_cycle_ids;

  const updatedById = new Map<string, ThreeDayReviewCycle>();
  if (targetCycle.id === cycle.id) {
    updatedById.set(cycle.id, {
      ...cycle,
      notes: cycle.notes.map((item) => item.source_key === note.source_key ? nextNote : item),
      updated_at: now,
    });
  } else {
    updatedById.set(cycle.id, {
      ...cycle,
      notes: cycle.notes.filter((item) => item.source_key !== note.source_key),
      source_row_count: Math.max(0, cycle.source_row_count - 1),
      updated_at: now,
    });
    updatedById.set(targetCycle.id, {
      ...targetCycle,
      notes: [...targetCycle.notes.filter((item) => item.source_key !== note.source_key), nextNote],
      source_row_count: targetCycle.notes.some((item) => item.source_key === note.source_key)
        ? targetCycle.source_row_count
        : targetCycle.source_row_count + 1,
      updated_at: now,
    });
  }

  for (const businessLine of GROWTH_BUSINESS_LINES) {
    const workspace = workspaces.get(businessLine)!;
    if (!workspace.accounts.length) continue;
    let changed = false;
    const nextCycles = workspace.cycles.map((item) => {
      let next = updatedById.get(item.id) ?? item;
      if (cycle.import_batch_id && item.import_batch_id === cycle.import_batch_id) {
        next = { ...next, sibling_cycle_ids: siblingCycleIds };
        changed = true;
      }
      if (cycle.import_batch_id && item.import_batch_id === cycle.import_batch_id && previousBusiness !== nextBusiness) {
        next = adjustBatchCounters(next, previousBusiness, nextBusiness);
        changed = true;
      }
      if (updatedById.has(item.id)) changed = true;
      return next;
    });
    if (changed) await saveSharedReviewCycles(store, workspace.accounts, nextCycles);
  }

  return NextResponse.json({
    note: nextNote,
    cycle: updatedById.get(cycle.id) ?? cycle,
    targetCycle: updatedById.get(targetCycle.id) ?? targetCycle,
  });
}
