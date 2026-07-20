import ExcelJS from "exceljs";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthExperimentVariable,
  ThreeDayDerivedMetrics,
  ThreeDayNoteMetrics,
  ThreeDayNoteSnapshot,
  ThreeDayReviewCycle,
  ThreeDayTrafficStatus,
} from "./types";

export const THREE_DAY_REVIEW_DELAY_MS = 72 * 60 * 60 * 1000;
export const THREE_DAY_MIN_NOTE_AGE_MS = 24 * 60 * 60 * 1000;
export const OFFICIAL_NOTE_LIST_MAX_BYTES = 5 * 1024 * 1024;

export const OFFICIAL_NOTE_LIST_HEADERS = [
  "笔记标题",
  "首次发布时间",
  "体裁",
  "曝光",
  "观看量",
  "封面点击率",
  "点赞",
  "评论",
  "收藏",
  "涨粉",
  "分享",
  "人均观看时长",
  "弹幕",
] as const;

export interface OfficialNoteListRow {
  source_key: string;
  source_title?: string;
  published_at: string;
  content_format: string;
  metrics: ThreeDayNoteMetrics;
}

export interface OfficialNoteListResult {
  rows: OfficialNoteListRow[];
  header_row: number;
  warnings: string[];
}

type CompleteCycleInput = {
  trafficConfirmed: boolean;
  trafficExceptions?: Record<string, ThreeDayTrafficStatus>;
  confirmedSuggested?: string[];
  excludedSourceKeys?: string[];
  previousLearningSourceKeys?: string[];
  previousLearningDraftIds?: string[];
  qualifiedInquiries: number;
  attributions?: Record<string, number>;
  diagnosis199Entries?: number;
  diagnosis199Sales?: number;
  deep6999Qualified?: number;
  deep6999Sales?: number;
  completedAt?: string;
};

const normalizeHeader = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, "");
const normalizeTitle = (value: unknown) => String(value ?? "").trim().replace(/[\s“”"'《》]/g, "").toLowerCase();

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("result" in value) return value.result;
  if ("richText" in value) return value.richText.map((item) => item.text).join("");
  if ("text" in value) return value.text;
  if ("hyperlink" in value) return value.hyperlink;
  return String(value);
}

function parseOfficialDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2})时(\d{1,2})分(\d{1,2})秒$/);
  if (!match) throw new Error(`无法识别首次发布时间：${text || "空值"}`);
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
    Number(second),
  )).toISOString();
}

function parseNonNegative(value: unknown, label: string, integer = true) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}必须是非负数。`);
  return integer ? Math.round(number) : Number(number.toFixed(6));
}

function derive(metrics: ThreeDayNoteMetrics): ThreeDayDerivedMetrics {
  const denominator = metrics.views;
  if (!denominator) return {};
  const rate = (value: number) => Number((value / denominator).toFixed(6));
  return {
    like_rate: rate(metrics.likes),
    comment_rate: rate(metrics.comments),
    save_rate: rate(metrics.saves),
    share_rate: rate(metrics.shares),
    follow_rate: rate(metrics.follows),
    value_rate: rate(metrics.saves + metrics.shares),
    interaction_rate: rate(metrics.likes + metrics.comments + metrics.saves + metrics.shares),
  };
}

function sourceKey(title: string | undefined, publishedAt: string, contentFormat: string) {
  return `${normalizeTitle(title)}|${publishedAt}|${normalizeHeader(contentFormat)}`;
}

export async function parseOfficialNoteListExcel(buffer: Buffer): Promise<OfficialNoteListResult> {
  if (!buffer.length) throw new Error("Excel文件为空。");
  if (buffer.length > OFFICIAL_NOTE_LIST_MAX_BYTES) throw new Error("Excel文件不能超过5MB。");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const worksheet = workbook.worksheets.find((item) => item.actualRowCount > 0);
  if (!worksheet) throw new Error("Excel中没有可读取的工作表。");

  let headerRow = 0;
  let headerMap = new Map<string, number>();
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const candidate = new Map<string, number>();
    for (let column = 1; column <= Math.min(worksheet.columnCount, 40); column += 1) {
      const header = normalizeHeader(cellValue(row.getCell(column).value));
      if (header) candidate.set(header, column);
    }
    if (OFFICIAL_NOTE_LIST_HEADERS.every((header) => candidate.has(header))) {
      headerRow = rowNumber;
      headerMap = candidate;
      break;
    }
  }
  if (!headerRow) {
    throw new Error(`不是受支持的小红书笔记列表明细表，必须包含：${OFFICIAL_NOTE_LIST_HEADERS.join("、")}。`);
  }

  const rows: OfficialNoteListRow[] = [];
  const warnings: string[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= Math.min(worksheet.rowCount, headerRow + 1000); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const get = (header: typeof OFFICIAL_NOTE_LIST_HEADERS[number]) => cellValue(row.getCell(headerMap.get(header)!).value);
    const publishedRaw = get("首次发布时间");
    const formatRaw = String(get("体裁") ?? "").trim();
    const titleRaw = String(get("笔记标题") ?? "").trim();
    if (!publishedRaw && !formatRaw && !titleRaw) continue;
    const publishedAt = parseOfficialDate(publishedRaw);
    const metrics: ThreeDayNoteMetrics = {
      impressions: parseNonNegative(get("曝光"), "曝光"),
      views: parseNonNegative(get("观看量"), "观看量"),
      cover_ctr: parseNonNegative(get("封面点击率"), "封面点击率", false),
      likes: parseNonNegative(get("点赞"), "点赞"),
      comments: parseNonNegative(get("评论"), "评论"),
      saves: parseNonNegative(get("收藏"), "收藏"),
      follows: parseNonNegative(get("涨粉"), "涨粉"),
      shares: parseNonNegative(get("分享"), "分享"),
      avg_view_seconds: parseNonNegative(get("人均观看时长"), "人均观看时长", false),
      danmaku: parseNonNegative(get("弹幕"), "弹幕"),
    };
    rows.push({
      source_key: sourceKey(titleRaw || undefined, publishedAt, formatRaw),
      source_title: titleRaw || undefined,
      published_at: publishedAt,
      content_format: formatRaw,
      metrics,
    });
    if (!titleRaw) warnings.push(`第${rowNumber}行笔记标题为空，需要根据发布时间人工匹配。`);
  }
  if (!rows.length) throw new Error("表格中没有可读取的笔记数据。");
  return { rows, header_row: headerRow, warnings };
}

function draftPublishedAt(draft: ContentDraft) {
  return draft.published_at || draft.distributed_at;
}

function attachDraft(row: OfficialNoteListRow, drafts: ContentDraft[]): ThreeDayNoteSnapshot {
  const availableDrafts = drafts.filter((draft) =>
    draft.status === "published" || draft.status === "reviewed");
  const rowTime = Date.parse(row.published_at);
  const withinFiveMinutes = (draft: ContentDraft) => {
    const publishedAt = draftPublishedAt(draft);
    return Boolean(publishedAt) && Math.abs(Date.parse(publishedAt!) - rowTime) <= 5 * 60 * 1000;
  };
  const exact = availableDrafts.filter((draft) =>
    withinFiveMinutes(draft) && normalizeTitle(draft.title) === normalizeTitle(row.source_title));
  const timeOnly = availableDrafts.filter(withinFiveMinutes);
  const draft = exact.length === 1 ? exact[0] : exact.length === 0 && timeOnly.length === 1 ? timeOnly[0] : undefined;
  const matchStatus = exact.length === 1 ? "matched" : draft ? "suggested" : "unmatched";
  const matchReason = exact.length === 1
    ? "标题与首次发布时间匹配"
    : draft
      ? "仅首次发布时间唯一匹配，需要人工确认"
      : "当前业务与视角下未找到唯一笔记";
  return {
    ...row,
    draft_id: draft?.id,
    method_id: draft?.method_id,
    method_label: draft?.method_label,
    method_group: draft?.method_group,
    generation_mode: draft?.generation_mode,
    match_status: matchStatus,
    match_reason: matchReason,
    derived: derive(row.metrics),
    traffic_status: "unknown",
    content_eligible: false,
    commercial_eligible: false,
    eligibility_reasons: ["等待批次确认"],
  };
}

export function createThreeDayReviewCycle(input: {
  account: GrowthAccount;
  drafts: ContentDraft[];
  rows: OfficialNoteListRow[];
  fileName: string;
  fileSize: number;
  previousCycles?: ThreeDayReviewCycle[];
  at?: Date;
  existingDraftCycle?: ThreeDayReviewCycle;
}) {
  const now = input.at ?? new Date();
  const nowIso = now.toISOString();
  const completed = (input.previousCycles ?? []).filter((cycle) => cycle.status === "completed");
  const previous = [...completed].sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""))[0];
  const sortedDates = input.rows.map((row) => row.published_at).sort();
  return {
    id: input.existingDraftCycle?.id ?? crypto.randomUUID(),
    account_id: input.account.id,
    business_line: input.account.business_line ?? "executive",
    persona: input.account.persona,
    cycle_number: input.existingDraftCycle?.cycle_number ?? completed.length + 1,
    status: "draft" as const,
    started_at: input.existingDraftCycle?.started_at ?? previous?.completed_at ?? nowIso,
    due_at: input.existingDraftCycle?.due_at ?? previous?.next_due_at ?? nowIso,
    source_file_name: input.fileName,
    source_file_size: input.fileSize,
    source_row_count: input.rows.length,
    source_date_from: sortedDates[0],
    source_date_to: sortedDates.at(-1),
    imported_at: nowIso,
    traffic_confirmed: false,
    notes: input.rows.map((row) => attachDraft(row, input.drafts)),
    created_at: input.existingDraftCycle?.created_at ?? nowIso,
    updated_at: nowIso,
  } satisfies ThreeDayReviewCycle;
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function decide(notes: ThreeDayNoteSnapshot[], qualifiedInquiries: number) {
  const eligible = notes.filter((note) => note.content_eligible);
  if (eligible.length < 3) {
    return {
      keep: [],
      retest_or_pause: ["有效内容样本不足3篇，本轮只保存数据，不暂停任何方法。"],
      next_variable: "title_cover" as GrowthExperimentVariable,
      next_variable_reason: "先积累同一体裁、同一数据口径下的入口样本。",
      summary: `本轮有${eligible.length}篇有效内容样本，暂不形成方法结论。`,
    };
  }
  const coverMedian = median(eligible.map((note) => note.metrics.cover_ctr));
  const valueMedian = median(eligible.map((note) => note.derived.value_rate ?? 0));
  const ranked = [...eligible].sort((a, b) => {
    const score = (note: ThreeDayNoteSnapshot) =>
      (coverMedian ? note.metrics.cover_ctr / coverMedian : 0)
      + (valueMedian ? (note.derived.value_rate ?? 0) / valueMedian : 0);
    return score(b) - score(a);
  });
  const keep = ranked.slice(0, 2).map((note) =>
    `${note.method_label || "已确认方法"}｜${note.source_title || "未命名笔记"}`);
  const weakEntryStrongContent = eligible.filter((note) =>
    note.metrics.cover_ctr < coverMedian && (note.derived.value_rate ?? 0) >= valueMedian).length;
  const strongEntryWeakContent = eligible.filter((note) =>
    note.metrics.cover_ctr >= coverMedian && (note.derived.value_rate ?? 0) < valueMedian).length;
  let nextVariable: GrowthExperimentVariable = "evidence";
  let reason = "入口和内容价值都需要继续积累证据。";
  if (weakEntryStrongContent >= strongEntryWeakContent && weakEntryStrongContent > 0) {
    nextVariable = "title_cover";
    reason = "本轮更多笔记表现为内容有价值但入口偏弱，下一轮只调整标题与封面。";
  } else if (strongEntryWeakContent > 0) {
    nextVariable = "opening";
    reason = "本轮更多笔记入口较强但正文承接偏弱，下一轮只调整开头。";
  } else if (qualifiedInquiries === 0) {
    nextVariable = "closing";
    reason = "内容指标成立但未出现有效咨询，下一轮只调整站内承接。";
  }
  return {
    keep,
    retest_or_pause: [`复测：${ranked.at(-1)?.method_label || "当前方法"}，暂不因单轮数据暂停。`],
    next_variable: nextVariable,
    next_variable_reason: reason,
    summary: `本轮${eligible.length}篇有效内容样本，产生${qualifiedInquiries}个有效咨询。`,
  };
}

export function completeThreeDayReviewCycle(cycle: ThreeDayReviewCycle, input: CompleteCycleInput) {
  if (!Number.isInteger(input.qualifiedInquiries) || input.qualifiedInquiries < 0) {
    throw new Error("有效咨询必须是大于等于0的整数。");
  }
  const now = input.completedAt ? new Date(input.completedAt) : new Date();
  const nowIso = now.toISOString();
  const confirmedSuggested = new Set(input.confirmedSuggested ?? []);
  const excluded = new Set(input.excludedSourceKeys ?? []);
  const previousLearningSourceKeys = new Set(input.previousLearningSourceKeys ?? []);
  const previousLearningDraftIds = new Set(input.previousLearningDraftIds ?? []);
  const attributions = input.attributions ?? {};
  const attributionTotal = Object.values(attributions).reduce((sum, value) => sum + value, 0);
  if (attributionTotal > input.qualifiedInquiries) throw new Error("单篇归因数量不能超过本周期有效咨询总数。");
  const fullAttribution = attributionTotal === input.qualifiedInquiries;

  const notes = cycle.notes.map((note) => {
    const matchStatus = excluded.has(note.source_key)
      ? "excluded" as const
      : note.match_status === "suggested" && confirmedSuggested.has(note.source_key)
        ? "matched" as const
        : note.match_status;
    const trafficStatus = input.trafficExceptions?.[note.source_key]
      ?? (input.trafficConfirmed ? "organic_normal" : "unknown");
    const reasons: string[] = [];
    if (matchStatus !== "matched") reasons.push(matchStatus === "excluded" ? "运营本轮排除" : "未完成系统笔记匹配");
    if (!note.method_id) reasons.push("标题方法未确认");
    if (previousLearningSourceKeys.has(note.source_key) || (note.draft_id && previousLearningDraftIds.has(note.draft_id))) {
      reasons.push("已在历史周期计入学习");
    }
    if (now.getTime() - Date.parse(note.published_at) < THREE_DAY_MIN_NOTE_AGE_MS) reasons.push("发布未满24小时");
    if (note.metrics.impressions < 500 || note.metrics.views < 50) reasons.push("曝光需≥500且观看量需≥50");
    if (trafficStatus !== "organic_normal") reasons.push(trafficStatus === "unknown" ? "流量状态未确认" : "非自然正常分发");
    const contentEligible = reasons.length === 0;
    const explicitAttribution = attributions[note.source_key];
    const attributedInquiries = input.qualifiedInquiries === 0
      ? 0
      : explicitAttribution !== undefined
        ? explicitAttribution
        : fullAttribution && contentEligible
          ? 0
          : undefined;
    return {
      ...note,
      match_status: matchStatus,
      traffic_status: trafficStatus,
      content_eligible: contentEligible,
      commercial_eligible: contentEligible && attributedInquiries !== undefined,
      attributed_inquiries: attributedInquiries,
      eligibility_reasons: reasons,
    };
  });
  const decision = decide(notes, input.qualifiedInquiries);
  return {
    ...cycle,
    status: "completed" as const,
    completed_at: nowIso,
    next_due_at: new Date(now.getTime() + THREE_DAY_REVIEW_DELAY_MS).toISOString(),
    traffic_confirmed: input.trafficConfirmed,
    notes,
    qualified_inquiries: input.qualifiedInquiries,
    unattributed_inquiries: input.qualifiedInquiries - attributionTotal,
    diagnosis_199_entries: input.diagnosis199Entries,
    diagnosis_199_sales: input.diagnosis199Sales,
    deep_6999_qualified: input.deep6999Qualified,
    deep_6999_sales: input.deep6999Sales,
    decision,
    updated_at: nowIso,
  } satisfies ThreeDayReviewCycle;
}

export function activeThreeDayCycle(cycles: ThreeDayReviewCycle[] = []) {
  return [...cycles].reverse().find((cycle) => cycle.status === "draft");
}

export function latestCompletedThreeDayCycle(cycles: ThreeDayReviewCycle[] = []) {
  return [...cycles]
    .filter((cycle) => cycle.status === "completed")
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""))[0];
}

export function nextThreeDayDueAt(cycles: ThreeDayReviewCycle[] = [], at = new Date()) {
  return latestCompletedThreeDayCycle(cycles)?.next_due_at ?? at.toISOString();
}
