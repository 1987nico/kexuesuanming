import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { resolveAccountBusinessLine } from "@/lib/growth/businessCompatibility";
import {
  mergeThreeDayReviewCycles,
  reviewWorkspaceAccounts,
  saveSharedReviewCycles,
} from "@/lib/growth/reviewCycleWorkspace";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountId: z.string().min(1),
  action: z.enum(["confirm", "external_history", "exclude", "restore"]),
  draftId: z.string().min(1).optional(),
  useOfficialTime: z.boolean().optional(),
});

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
  if (guard.auth.role !== "admin" && account.owner_user_id && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const workspaceAccounts = await reviewWorkspaceAccounts(store, account, guard.auth.user.id);
  const workspaceAccountIds = new Set(workspaceAccounts.map((item) => item.id));
  const cycles = mergeThreeDayReviewCycles(workspaceAccounts);
  const cycle = cycles.find((item) => item.id === params.cycleId);
  if (!cycle) return NextResponse.json({ error: "cycle_not_found", message: "本轮三日复盘不存在。" }, { status: 404 });
  if (cycle.status !== "draft") {
    return NextResponse.json({ error: "cycle_locked", message: "已完成周期不能再修改匹配关系。" }, { status: 409 });
  }
  const sourceKey = params.sourceKey;
  const note = cycle.notes.find((item) => item.source_key === sourceKey);
  if (!note) return NextResponse.json({ error: "note_not_found", message: "没有找到这条Excel笔记。" }, { status: 404 });

  const now = new Date().toISOString();
  let nextNote = note;

  if (parsed.data.action === "confirm") {
    const draftId = parsed.data.draftId ?? note.match_candidates?.[0]?.draft_id;
    const candidate = note.match_candidates?.find((item) => item.draft_id === draftId);
    if (!candidate || !workspaceAccountIds.has(candidate.account_id)) {
      return NextResponse.json({ error: "candidate_not_found", message: "请选择当前业务下可确认的系统正文。" }, { status: 400 });
    }
    const draft = await store.getDraft(candidate.draft_id);
    if (!draft || draft.account_id !== candidate.account_id) {
      return NextResponse.json({ error: "draft_not_found", message: "候选正文已不存在，请重新上传Excel刷新匹配。" }, { status: 404 });
    }
    const targetAccount = workspaceAccounts.find((item) => item.id === candidate.account_id)!;
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

    nextNote = {
      ...note,
      draft_id: draft.id,
      matched_account_id: targetAccount.id,
      matched_business_line: resolveAccountBusinessLine(targetAccount),
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
      match_scope: targetAccount.id === account.id ? "current_persona" : "same_business_other_persona",
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
  } else if (parsed.data.action === "external_history") {
    nextNote = {
      ...note,
      draft_id: undefined,
      matched_account_id: undefined,
      matched_business_line: undefined,
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
      match_status: "excluded",
      match_reason: "已由运营排除本轮复盘",
      resolution_type: "excluded",
      resolved_at: now,
      content_eligible: false,
      commercial_eligible: false,
      eligibility_reasons: ["运营本轮排除"],
    };
  } else {
    const candidate = note.match_candidates?.[0];
    nextNote = {
      ...note,
      draft_id: undefined,
      matched_account_id: undefined,
      matched_business_line: undefined,
      matched_persona: undefined,
      method_id: undefined,
      method_label: undefined,
      method_group: undefined,
      generation_mode: undefined,
      match_status: candidate ? "suggested" : "external_history",
      match_scope: candidate
        ? candidate.account_id === account.id ? "current_persona" : "same_business_other_persona"
        : "external",
      match_reason: candidate?.match_reason ?? "Excel数据已识别，但当前业务的三个视角中没有对应系统正文",
      resolution_type: candidate ? undefined : "external_history",
      resolved_at: undefined,
      content_eligible: false,
      commercial_eligible: false,
      eligibility_reasons: ["等待批次确认"],
    };
  }

  const updatedCycle = {
    ...cycle,
    notes: cycle.notes.map((item) => item.source_key === sourceKey ? nextNote : item),
    updated_at: now,
  };
  await saveSharedReviewCycles(
    store,
    workspaceAccounts,
    cycles.map((item) => item.id === cycle.id ? updatedCycle : item),
  );
  return NextResponse.json({ note: nextNote, cycle: updatedCycle });
}
