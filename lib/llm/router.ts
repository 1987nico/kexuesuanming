/**
 * LLMRouter —— 模型路由与故障转移
 *
 * 设计目标：
 * - 前端只调 API；模型/Provider 切换不影响前端。
 * - 价值验证阶段：主推理走 Claude（推理质量），故障/超时降级到 DeepSeek。
 * - 上小程序时：把 PRIMARY 切到国产模型即可，无需改任何前端代码。
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type Provider = "anthropic" | "deepseek" | "openai" | "doubao";

export interface LLMRequest {
  system: string;
  user: string;
  // JSON 模式：要求模型输出严格 JSON
  json?: boolean;
  // 最大 token
  maxTokens?: number;
  temperature?: number;
  /** 单次供应商请求的上限；未设置时沿用 SDK 默认行为。 */
  timeoutMs?: number;
  /** JSON 解析失败后的模型重试次数，默认2次。 */
  jsonRetries?: number;
}

export interface LLMResponse {
  text: string;
  provider: Provider;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface LLMVisionRequest extends LLMRequest {
  images: string[];
}

// 火山方舟（豆包）默认接入点：OpenAI 兼容协议
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";

const PRIMARY_PROVIDER = (process.env.LLM_PRIMARY_PROVIDER || "anthropic") as Provider;
const PRIMARY_MODEL = process.env.LLM_PRIMARY_MODEL || "claude-sonnet-4-5-20250929";
const FALLBACK_PROVIDER = (process.env.LLM_FALLBACK_PROVIDER || "deepseek") as Provider;
const FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL || "deepseek-chat";

async function callAnthropic(req: LLMRequest, model: string): Promise<LLMResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.7,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  }, req.timeoutMs ? { signal: AbortSignal.timeout(req.timeoutMs) } : undefined);
  const text = r.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return {
    text,
    provider: "anthropic",
    model,
    usage: { inputTokens: r.usage?.input_tokens, outputTokens: r.usage?.output_tokens },
  };
}

function openAICompatConfig(provider: Provider): { apiKey?: string; baseURL?: string } {
  if (provider === "deepseek") {
    return { apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com/v1" };
  }
  if (provider === "doubao") {
    return { apiKey: process.env.ARK_API_KEY, baseURL: ARK_BASE_URL };
  }
  // OpenAI：支持第三方中转（OPENAI_BASE_URL），不设则走官方
  return { apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined };
}

async function callOpenAICompat(req: LLMRequest, provider: Provider, model: string): Promise<LLMResponse> {
  const { apiKey, baseURL } = openAICompatConfig(provider);
  const client = new OpenAI({ apiKey, baseURL });
  // 豆包 seed 系列默认带思考链，写标题/正文这类任务不需要，关闭后速度快 10 倍以上。
  // 需要更强推理时可设 ARK_THINKING=enabled 或 auto。
  const doubaoThinking =
    provider === "doubao"
      ? { thinking: { type: (process.env.ARK_THINKING || "disabled") as "disabled" | "enabled" | "auto" } }
      : {};
  const r = await client.chat.completions.create({
    model,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 4096,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
    ...doubaoThinking,
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, req.timeoutMs
    ? { signal: AbortSignal.timeout(req.timeoutMs) }
    : undefined);
  const text = r.choices?.[0]?.message?.content ?? "";
  return {
    text,
    provider,
    model,
    usage: { inputTokens: r.usage?.prompt_tokens, outputTokens: r.usage?.completion_tokens },
  };
}

async function callProvider(req: LLMRequest, provider: Provider, model: string): Promise<LLMResponse> {
  if (provider === "anthropic") return callAnthropic(req, model);
  return callOpenAICompat(req, provider, model);
}

function hasKey(provider: Provider): boolean {
  if (provider === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (provider === "deepseek") return !!process.env.DEEPSEEK_API_KEY;
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  if (provider === "doubao") return !!process.env.ARK_API_KEY;
  return false;
}

export async function llmComplete(req: LLMRequest): Promise<LLMResponse> {
  const primaryOK = hasKey(PRIMARY_PROVIDER);
  // 生产环境可能把主、备都配置成同一个供应商和同一个模型。
  // 这种情况下超时后再次调用同一路由只会把等待时间翻倍，不是真正的故障转移。
  const fallbackIsDistinct = FALLBACK_PROVIDER !== PRIMARY_PROVIDER || FALLBACK_MODEL !== PRIMARY_MODEL;
  const fallbackOK = hasKey(FALLBACK_PROVIDER) && fallbackIsDistinct;
  if (!primaryOK && !fallbackOK) {
    throw new Error(
      "未配置任何 AI 模型 API key。请在 .env 中设置以下任一变量：ARK_API_KEY（豆包/火山方舟）、DEEPSEEK_API_KEY、ANTHROPIC_API_KEY 或 OPENAI_API_KEY"
    );
  }
  // 主路径
  if (primaryOK) {
    try {
      return await callProvider(req, PRIMARY_PROVIDER, PRIMARY_MODEL);
    } catch (e) {
      console.warn("[LLMRouter] primary failed:", (e as Error)?.message);
      if (!fallbackOK) throw e;
    }
  }
  // 兜底
  return callProvider(req, FALLBACK_PROVIDER, FALLBACK_MODEL);
}

/**
 * 强制 JSON 输出 —— 自动重试 + 容错解析。
 */
export async function llmJSON<T = unknown>(req: LLMRequest): Promise<{ data: T; raw: LLMResponse }> {
  const { safeParseJSON } = await import("@/lib/utils");
  const finalReq: LLMRequest = {
    ...req,
    json: true,
    system: req.system + "\n\n严格要求：仅输出合法 JSON，不要任何额外文字、解释、Markdown 代码块。",
  };
  let lastError: unknown = null;
  for (let i = 0; i < Math.max(1, req.jsonRetries ?? 2); i++) {
    const raw = await llmComplete(finalReq);
    const parsed = safeParseJSON<T>(raw.text);
    if (parsed !== null) return { data: parsed, raw };
    lastError = new Error("LLM 返回非合法 JSON: " + raw.text.slice(0, 200));
  }
  throw lastError;
}

function visionRoute(): { provider: "doubao" | "openai"; model: string } | null {
  const requested = process.env.LLM_VISION_PROVIDER as Provider | undefined;
  const requestedModel = process.env.LLM_VISION_MODEL;
  if (requested === "doubao" && process.env.ARK_API_KEY && requestedModel) {
    return { provider: "doubao", model: requestedModel };
  }
  if (requested === "openai" && process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: requestedModel || "gpt-4o-mini" };
  }
  if (PRIMARY_PROVIDER === "doubao" && process.env.ARK_API_KEY) {
    return { provider: "doubao", model: requestedModel || PRIMARY_MODEL };
  }
  if (PRIMARY_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: requestedModel || PRIMARY_MODEL };
  }
  if (process.env.ARK_API_KEY && requestedModel) {
    return { provider: "doubao", model: requestedModel };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: requestedModel || "gpt-4o-mini" };
  }
  return null;
}

export function isVisionConfigured() {
  return visionRoute() !== null;
}

async function callVisionOpenAICompat(
  req: LLMVisionRequest,
  provider: "doubao" | "openai",
  model: string,
): Promise<LLMResponse> {
  const { apiKey, baseURL } = openAICompatConfig(provider);
  const client = new OpenAI({ apiKey, baseURL });
  const content = [
    { type: "text", text: req.user },
    ...req.images.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const doubaoThinking =
    provider === "doubao"
      ? { thinking: { type: (process.env.ARK_THINKING || "disabled") as "disabled" | "enabled" | "auto" } }
      : {};
  const response: any = await client.chat.completions.create({
    model,
    temperature: req.temperature ?? 0.1,
    max_tokens: req.maxTokens ?? 2000,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
    ...doubaoThinking,
  } as any);
  return {
    text: response.choices?.[0]?.message?.content ?? "",
    provider,
    model,
    usage: {
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    },
  };
}

export async function llmVisionJSON<T = unknown>(
  req: LLMVisionRequest,
): Promise<{ data: T; raw: LLMResponse }> {
  const route = visionRoute();
  if (!route) throw new Error("未配置可识别截图的视觉模型");
  if (!req.images.length) throw new Error("至少需要一张截图");
  const { safeParseJSON } = await import("@/lib/utils");
  const finalReq: LLMVisionRequest = {
    ...req,
    json: true,
    system: `${req.system}\n\n严格要求：仅输出合法 JSON，不要任何额外文字、解释、Markdown 代码块。`,
  };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callVisionOpenAICompat(finalReq, route.provider, route.model);
    const parsed = safeParseJSON<T>(raw.text);
    if (parsed !== null) return { data: parsed, raw };
    lastError = new Error(`视觉模型返回非合法 JSON: ${raw.text.slice(0, 200)}`);
  }
  throw lastError;
}
