import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ContentDraft, GrowthAccount } from "./types";
import {
  completeThreeDayReviewCycle,
  createThreeDayReviewCycle,
  normalizeReviewTitle,
  OFFICIAL_NOTE_LIST_HEADERS,
  parseOfficialNoteListExcel,
} from "./threeDayReview";

async function officialWorkbook(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(OFFICIAL_NOTE_LIST_HEADERS.map(() => "最多导出排序后前1000条笔记"));
  sheet.addRow([...OFFICIAL_NOTE_LIST_HEADERS]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const account = {
  id: "account",
  tenant_id: "mianbajun",
  business_line: "executive",
  persona: "buyer",
  name: "测试",
  target_user: "中高管",
  core_problem: "职业决策",
  account_value: "判断",
  trust_source: "案例",
  not_doing: "不保证结果",
  hypotheses: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies GrowthAccount;

const draft = {
  id: "draft",
  account_id: account.id,
  tenant_id: account.tenant_id,
  run_id: "run",
  status: "published",
  schema_version: "method_v3_2",
  method_attribution_status: "confirmed",
  method_group: "native",
  method_id: "human_pain",
  method_label: "行业人性痛点",
  generation_mode: "default",
  title: "离职前先过一遍验尸清单",
  published_at: "2026-07-13T23:34:35.000Z",
  created_at: "2026-07-13T23:34:35.000Z",
  updated_at: "2026-07-13T23:34:35.000Z",
} as ContentDraft;

describe("小红书官方笔记列表明细表", () => {
  it("严格读取官方13列并保留官方封面点击率", async () => {
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 16404, 6386, 0.378,
      305, 2, 399, 2, 77, 19, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    expect(parsed.header_row).toBe(2);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].metrics.cover_ctr).toBe(0.378);
    expect(parsed.rows[0].metrics.views).toBe(6386);
    expect(parsed.rows[0].published_at).toBe("2026-07-13T23:34:35.000Z");
  });

  it("拒绝缺少官方表头的文件", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1").addRow(["标题", "阅读"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseOfficialNoteListExcel(buffer)).rejects.toThrow("不是受支持的小红书笔记列表明细表");
  });
});

describe("三日复盘周期", () => {
  it("匹配系统笔记、确认批次流量并区分未归因咨询", async () => {
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 16404, 6386, 0.378,
      305, 2, 399, 2, 77, 19, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({
      account,
      drafts: [draft],
      rows: parsed.rows,
      fileName: "笔记列表明细表.xlsx",
      fileSize: buffer.length,
      at: new Date("2026-07-20T00:00:00.000Z"),
    });
    expect(cycle.notes[0].match_status).toBe("matched");
    const completed = completeThreeDayReviewCycle(cycle, {
      trafficConfirmed: true,
      qualifiedInquiries: 2,
      attributions: { [cycle.notes[0].source_key]: 1 },
      completedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(completed.notes[0].content_eligible).toBe(true);
    expect(completed.notes[0].commercial_eligible).toBe(true);
    expect(completed.unattributed_inquiries).toBe(1);
    expect(completed.next_due_at).toBe("2026-07-23T00:00:00.000Z");
  });

  it("未确认流量时只保存描述数据，不进入学习", async () => {
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 1000, 100, 0.1,
      10, 1, 5, 0, 1, 20, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({ account, drafts: [draft], rows: parsed.rows, fileName: "x.xlsx", fileSize: buffer.length });
    const completed = completeThreeDayReviewCycle(cycle, { trafficConfirmed: false, qualifiedInquiries: 0 });
    expect(completed.notes[0].content_eligible).toBe(false);
    expect(completed.notes[0].eligibility_reasons).toContain("流量状态未确认");
  });

  it("全量Excel重复出现的旧笔记不会跨周期重复进入方法学习", async () => {
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 16404, 6386, 0.378,
      305, 2, 399, 2, 77, 19, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({
      account,
      drafts: [draft],
      rows: parsed.rows,
      fileName: "笔记列表明细表.xlsx",
      fileSize: buffer.length,
      at: new Date("2026-07-23T00:00:00.000Z"),
    });
    const completed = completeThreeDayReviewCycle(cycle, {
      trafficConfirmed: true,
      qualifiedInquiries: 0,
      previousLearningDraftIds: [draft.id],
      completedAt: "2026-07-23T00:00:00.000Z",
    });
    expect(completed.notes[0].content_eligible).toBe(false);
    expect(completed.notes[0].commercial_eligible).toBe(false);
    expect(completed.notes[0].eligibility_reasons).toContain("已在历史周期计入学习");
  });

  it("在同一业务的其他视角找到标题与时间时自动匹配", async () => {
    const expertAccount = { ...account, id: "expert-account", persona: "expert" as const };
    const buyerDraft = { ...draft, id: "buyer-draft", account_id: account.id };
    const buffer = await officialWorkbook([[
      "《离职前先过一遍验尸清单》", "2026年07月14日07时34分35秒", "图文", 1000, 100, 0.1,
      10, 1, 5, 0, 1, 20, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({
      account: expertAccount,
      draftContexts: [{ draft: buyerDraft, account_id: account.id, business_line: "executive", persona: "buyer" }],
      rows: parsed.rows,
      fileName: "x.xlsx",
      fileSize: buffer.length,
    });
    expect(cycle.notes[0].match_status).toBe("matched");
    expect(cycle.notes[0].matched_persona).toBe("buyer");
    expect(cycle.notes[0].match_scope).toBe("same_business_other_persona");
  });

  it("同标题但发布时间差异较大时保留为人工候选", async () => {
    const lateDraft = { ...draft, published_at: "2026-07-13T21:00:00.000Z" };
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 1000, 100, 0.1,
      10, 1, 5, 0, 1, 20, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({ account, drafts: [lateDraft], rows: parsed.rows, fileName: "x.xlsx", fileSize: buffer.length });
    expect(cycle.notes[0].match_status).toBe("suggested");
    expect(cycle.notes[0].match_candidates?.[0].draft_id).toBe(lateDraft.id);
    expect(cycle.notes[0].draft_id).toBeUndefined();
  });

  it("系统待发布正文只作为候选，不自动计入方法学习", async () => {
    const readyDraft = { ...draft, status: "ready" as const, published_at: undefined };
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 1000, 100, 0.1,
      10, 1, 5, 0, 1, 20, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({ account, drafts: [readyDraft], rows: parsed.rows, fileName: "x.xlsx", fileSize: buffer.length });
    expect(cycle.notes[0].match_status).toBe("suggested");
    expect(cycle.notes[0].match_candidates?.[0].status).toBe("ready");
  });

  it("系统中不存在的官方Excel笔记标记为系统外历史", async () => {
    const buffer = await officialWorkbook([[
      "系统中从未生成过的标题", "2026年07月15日07时34分35秒", "图文", 1000, 100, 0.1,
      10, 1, 5, 0, 1, 20, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({ account, drafts: [draft], rows: parsed.rows, fileName: "x.xlsx", fileSize: buffer.length });
    expect(cycle.notes[0].match_status).toBe("external_history");
    expect(cycle.notes[0].match_scope).toBe("external");
    expect(cycle.notes[0].content_eligible).toBe(false);
    expect(cycle.notes[0].match_candidates?.[0].draft_id).toBe(draft.id);
  });

  it("未选定草稿不能成为官方笔记的绑定候选", async () => {
    const unfinishedDraft = { ...draft, status: "draft" as const };
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 1000, 100, 0.1,
      10, 1, 5, 0, 1, 20, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const cycle = createThreeDayReviewCycle({ account, drafts: [unfinishedDraft], rows: parsed.rows, fileName: "x.xlsx", fileSize: buffer.length });
    expect(cycle.notes[0].match_status).toBe("external_history");
    expect(cycle.notes[0].match_candidates).toEqual([]);
  });

  it("新周期编号取历史最大值递增，不受重复旧轮次影响", async () => {
    const buffer = await officialWorkbook([[
      draft.title, "2026年07月14日07时34分35秒", "图文", 1000, 100, 0.1,
      10, 1, 5, 0, 1, 20, 0,
    ]]);
    const parsed = await parseOfficialNoteListExcel(buffer);
    const prior = createThreeDayReviewCycle({ account, drafts: [draft], rows: parsed.rows, fileName: "x.xlsx", fileSize: buffer.length });
    const cycle = createThreeDayReviewCycle({
      account,
      drafts: [draft],
      rows: parsed.rows,
      fileName: "x.xlsx",
      fileSize: buffer.length,
      previousCycles: [
        { ...prior, id: "old-5", cycle_number: 5, status: "completed", completed_at: "2026-07-18T00:00:00.000Z" },
        { ...prior, id: "old-2", cycle_number: 2, status: "completed", completed_at: "2026-07-19T00:00:00.000Z" },
      ],
    });
    expect(cycle.cycle_number).toBe(6);
  });

  it("标题归一化忽略全半角、书名号、空格和常见标点", () => {
    expect(normalizeReviewTitle("《离职前，先过一遍 验尸清单！》"))
      .toBe(normalizeReviewTitle("离职前先过一遍验尸清单"));
  });
});
