import ExcelJS from "exceljs";
import type { GrowthReviewMetrics } from "./types";

export const REVIEW_EXCEL_MAX_BYTES = 5 * 1024 * 1024;

type NumericMetricKey =
  | "impressions"
  | "reads"
  | "average_view_seconds"
  | "likes"
  | "saves"
  | "comments"
  | "shares"
  | "profile_visits"
  | "follows";

export const REVIEW_EXCEL_LABELS: Record<NumericMetricKey, string> = {
  impressions: "曝光",
  reads: "阅读",
  average_view_seconds: "平均阅读秒数",
  likes: "点赞",
  saves: "收藏",
  comments: "评论",
  shares: "分享",
  profile_visits: "主页访问",
  follows: "关注",
};

const FIELD_ALIASES: Record<NumericMetricKey, string[]> = {
  impressions: ["曝光", "曝光量", "曝光数", "笔记曝光", "笔记曝光量", "impressions"],
  reads: ["阅读", "阅读量", "阅读数", "观看", "观看量", "观看数", "播放", "播放量", "笔记阅读量", "笔记观看量", "reads", "views"],
  average_view_seconds: ["平均阅读时长", "平均观看时长", "平均阅读秒数", "平均观看秒数", "人均阅读时长", "人均观看时长", "averageviewseconds"],
  likes: ["点赞", "点赞量", "点赞数", "获赞", "获赞数", "likes"],
  saves: ["收藏", "收藏量", "收藏数", "saves", "收藏次数"],
  comments: ["评论", "评论量", "评论数", "comments"],
  shares: ["分享", "分享量", "分享数", "转发", "转发数", "shares"],
  profile_visits: ["主页访问", "主页访问量", "主页访问数", "个人主页访问", "profilevisits"],
  follows: ["关注", "关注量", "关注数", "涨粉", "新增关注", "新增关注数", "新增粉丝", "follows"],
};

const HEADER_TO_FIELD = new Map<string, NumericMetricKey>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[NumericMetricKey, string[]]>) {
  for (const alias of aliases) HEADER_TO_FIELD.set(normalizeHeader(alias), field);
}

export interface ReviewExcelResult {
  prefill: Partial<GrowthReviewMetrics>;
  detected_fields: NumericMetricKey[];
  header_row?: number;
  data_row?: number;
  warnings: string[];
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s_\-—:：/\\·,.，。]+/g, "");
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  if ("result" in value) return value.result;
  if ("richText" in value) return value.richText.map((item) => item.text).join("");
  if ("text" in value) return value.text;
  if ("hyperlink" in value) return value.hyperlink;
  return String(value);
}

function parseDuration(value: string) {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/);
  if (!match) return undefined;
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseMetricValue(value: unknown, field: NumericMetricKey) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "--" || raw === "—") return undefined;
  if (field === "average_view_seconds") {
    const duration = parseDuration(raw);
    if (duration !== undefined) return duration;
  }
  const unit = raw.includes("万") ? 10_000 : raw.includes("千") ? 1_000 : 1;
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const numeric = Number(match[0]) * unit;
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return field === "average_view_seconds" ? Number(numeric.toFixed(2)) : Math.round(numeric);
}

function rowValues(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = worksheet.getRow(rowNumber);
  const maxColumn = Math.min(Math.max(row.cellCount, worksheet.columnCount), 50);
  return Array.from({ length: maxColumn }, (_, index) => cellValue(row.getCell(index + 1).value));
}

function headerMapping(values: unknown[]) {
  const mapping = new Map<number, NumericMetricKey>();
  values.forEach((value, index) => {
    const field = HEADER_TO_FIELD.get(normalizeHeader(value));
    if (field && ![...mapping.values()].includes(field)) mapping.set(index, field);
  });
  return mapping;
}

function extractHorizontal(worksheet: ExcelJS.Worksheet) {
  let best: { row: number; mapping: Map<number, NumericMetricKey> } | undefined;
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 30); rowNumber += 1) {
    const mapping = headerMapping(rowValues(worksheet, rowNumber));
    if (mapping.size >= 2 && (!best || mapping.size > best.mapping.size)) best = { row: rowNumber, mapping };
  }
  if (!best) return undefined;

  for (let rowNumber = best.row + 1; rowNumber <= Math.min(worksheet.rowCount, best.row + 12); rowNumber += 1) {
    const values = rowValues(worksheet, rowNumber);
    const metrics: Partial<Record<NumericMetricKey, number>> = {};
    for (const [columnIndex, field] of best.mapping) {
      const parsed = parseMetricValue(values[columnIndex], field);
      if (parsed !== undefined) metrics[field] = parsed;
    }
    if (metrics.impressions !== undefined && metrics.reads !== undefined) {
      return { metrics, headerRow: best.row, dataRow: rowNumber };
    }
  }
  return { metrics: {}, headerRow: best.row };
}

function extractVertical(worksheet: ExcelJS.Worksheet) {
  const metrics: Partial<Record<NumericMetricKey, number>> = {};
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 50); rowNumber += 1) {
    const values = rowValues(worksheet, rowNumber);
    for (let columnIndex = 0; columnIndex < Math.min(values.length - 1, 20); columnIndex += 1) {
      const field = HEADER_TO_FIELD.get(normalizeHeader(values[columnIndex]));
      if (!field || metrics[field] !== undefined) continue;
      const parsed = parseMetricValue(values[columnIndex + 1], field);
      if (parsed !== undefined) metrics[field] = parsed;
    }
  }
  return metrics;
}

export async function parseReviewExcel(buffer: Buffer): Promise<ReviewExcelResult> {
  if (!buffer.length) throw new Error("Excel文件为空。");
  if (buffer.length > REVIEW_EXCEL_MAX_BYTES) throw new Error("Excel文件不能超过5MB。");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const worksheet = workbook.worksheets.find((item) => item.actualRowCount > 0);
  if (!worksheet) throw new Error("Excel中没有可读取的工作表。");

  const horizontal = extractHorizontal(worksheet);
  const metrics: Partial<Record<NumericMetricKey, number>> = horizontal?.metrics && Object.keys(horizontal.metrics).length
    ? horizontal.metrics
    : extractVertical(worksheet);
  if (metrics.impressions === undefined || metrics.reads === undefined) {
    throw new Error("没有识别到曝光和阅读数据，请上传小红书导出的单篇笔记Excel。");
  }

  const detectedFields = Object.keys(metrics) as NumericMetricKey[];
  const warnings: string[] = [];
  const optionalMissing = (Object.keys(REVIEW_EXCEL_LABELS) as NumericMetricKey[])
    .filter((field) => metrics[field] === undefined)
    .map((field) => REVIEW_EXCEL_LABELS[field]);
  if (optionalMissing.length) warnings.push(`Excel未提供：${optionalMissing.join("、")}；这些字段保持未检查，不会按0计算。`);

  return {
    prefill: { ...metrics, input_source: "excel" },
    detected_fields: detectedFields,
    header_row: horizontal?.headerRow,
    data_row: horizontal?.dataRow,
    warnings,
  };
}
