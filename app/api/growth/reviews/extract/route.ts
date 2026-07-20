import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { isVisionConfigured, llmVisionJSON } from "@/lib/llm/router";
import { growthStore } from "@/lib/growth/store";
import type { GrowthReviewMetrics } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_TENANT_ID = "mianbajun";
const MIN_CONFIDENCE = 0.72;

const imageSchema = z.object({
  dataUrl: z
    .string()
    .max(650_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,/),
  name: z.string().max(120).optional(),
});

const bodySchema = z.object({ images: z.array(imageSchema).min(1).max(6) }).superRefine((value, context) => {
  const totalSize = value.images.reduce((sum, image) => sum + image.dataUrl.length, 0);
  if (totalSize > 4_000_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["images"],
      message: "截图总量过大，请减少张数或裁掉无关区域后重试",
    });
  }
});

type ExtractedField = { value?: number | string | boolean | null; confidence?: number };
type VisionPayload = {
  fields?: Record<string, ExtractedField>;
  traffic_sources?: { value?: Record<string, number>; confidence?: number };
  search_keywords?: { value?: string[]; confidence?: number };
  audience?: {
    value?: GrowthReviewMetrics["audience"];
    confidence?: number;
  };
  warnings?: string[];
};

const numericFields = [
  "impressions",
  "reads",
  "average_view_seconds",
  "likes",
  "saves",
  "comments",
  "shares",
  "follows",
] as const;

function confidence(value?: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : 0;
}

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  if (!isVisionConfigured()) {
    return NextResponse.json({ error: "vision_not_configured", message: "当前未配置截图识别模型。" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await llmVisionJSON<VisionPayload>({
    system: "你是小红书笔记数据截图录入助手。只提取截图中清晰可见的原始数据，不推测、不补齐。",
    user: `
请综合这些截图，提取同一篇小红书笔记发布后24小时的数据。

规则：
- 曝光、观看、平均观看时长、点赞、收藏、评论、分享、涨粉只取截图明确显示的数字。
- 平均观看时长统一换算为秒。
- 流量来源百分比输出0到100的数值，例如首页推荐91%输出91。
- 搜索词最多5个，只取截图明确显示的词。
- 受众只提取年龄、城市、城市等级、兴趣和性别中清晰可见的分布。
- 每个字段返回0到1的confidence；看不清就返回null且confidence低于0.72。
- 不要从点赞、评论等数字反推任何缺失字段。

输出 JSON：
{
  "fields": {
    "impressions": {"value": 0, "confidence": 0.0},
    "reads": {"value": 0, "confidence": 0.0},
    "average_view_seconds": {"value": 0, "confidence": 0.0},
    "likes": {"value": 0, "confidence": 0.0},
    "saves": {"value": 0, "confidence": 0.0},
    "comments": {"value": 0, "confidence": 0.0},
    "shares": {"value": 0, "confidence": 0.0},
    "follows": {"value": 0, "confidence": 0.0}
  },
  "traffic_sources": {"value": {"home": 0, "search": 0, "profile": 0, "other": 0}, "confidence": 0.0},
  "search_keywords": {"value": [], "confidence": 0.0},
  "audience": {"value": {"gender": {}, "age": {}, "cities": {}, "city_tiers": {}, "interests": {}}, "confidence": 0.0},
  "warnings": []
}
`.trim(),
    images: parsed.data.images.map((image) => image.dataUrl),
    maxTokens: 2400,
    temperature: 0.1,
  });

  const prefill: Partial<GrowthReviewMetrics> = { input_source: "screenshot" };
  const confidenceByField: Record<string, number> = {};
  for (const field of numericFields) {
    const extracted = result.data.fields?.[field];
    const score = confidence(extracted?.confidence);
    confidenceByField[field] = score;
    const value = Number(extracted?.value);
    if (score >= MIN_CONFIDENCE && Number.isFinite(value) && value >= 0) {
      (prefill as Record<string, unknown>)[field] = value;
    }
  }

  const trafficConfidence = confidence(result.data.traffic_sources?.confidence);
  confidenceByField.traffic_sources = trafficConfidence;
  if (trafficConfidence >= MIN_CONFIDENCE && result.data.traffic_sources?.value) {
    prefill.traffic_sources = result.data.traffic_sources.value;
  }
  const searchConfidence = confidence(result.data.search_keywords?.confidence);
  confidenceByField.search_keywords = searchConfidence;
  if (searchConfidence >= MIN_CONFIDENCE && Array.isArray(result.data.search_keywords?.value)) {
    prefill.search_keywords = result.data.search_keywords.value.map(String).filter(Boolean).slice(0, 5);
  }
  const audienceConfidence = confidence(result.data.audience?.confidence);
  confidenceByField.audience = audienceConfidence;
  if (audienceConfidence >= MIN_CONFIDENCE && result.data.audience?.value) {
    prefill.audience = result.data.audience.value;
  }

  await growthStore().saveUsage({
    tenant_id: DEFAULT_TENANT_ID,
    user_id: guard.auth.user.id,
    feature: "growth_text",
    provider: result.raw.provider,
    model: result.raw.model,
    input_tokens: result.raw.usage?.inputTokens,
    output_tokens: result.raw.usage?.outputTokens,
    metadata: { action: "review_screenshot_extract", imageCount: parsed.data.images.length },
  });

  return NextResponse.json({
    prefill,
    confidence: confidenceByField,
    warnings: Array.isArray(result.data.warnings) ? result.data.warnings.slice(0, 8) : [],
    lowConfidenceThreshold: MIN_CONFIDENCE,
  });
}
