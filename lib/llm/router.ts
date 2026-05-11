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

export type Provider = "anthropic" | "deepseek" | "openai";

export interface LLMRequest {
  system: string;
  user: string;
  // JSON 模式：要求模型输出严格 JSON
  json?: boolean;
  // 最大 token
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  provider: Provider;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

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
  });
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

async function callOpenAICompat(req: LLMRequest, provider: Provider, model: string): Promise<LLMResponse> {
  const apiKey =
    provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY;
  const baseURL = provider === "deepseek" ? "https://api.deepseek.com/v1" : undefined;
  const client = new OpenAI({ apiKey, baseURL });
  const r = await client.chat.completions.create({
    model,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 4096,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
  });
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
  return false;
}

export async function llmComplete(req: LLMRequest): Promise<LLMResponse> {
  const primaryOK = hasKey(PRIMARY_PROVIDER);
  const fallbackOK = hasKey(FALLBACK_PROVIDER);
  if (!primaryOK && !fallbackOK) {
    throw new Error(
      `未配置任何 AI 模型 API key。请在 .env 中设置以下任一变量：${
        PRIMARY_PROVIDER === "anthropic" ? "ANTHROPIC_API_KEY" : "DEEPSEEK_API_KEY"
      } 或 OPENAI_API_KEY`
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
  for (let i = 0; i < 2; i++) {
    const raw = await llmComplete(finalReq);
    const parsed = safeParseJSON<T>(raw.text);
    if (parsed !== null) return { data: parsed, raw };
    lastError = new Error("LLM 返回非合法 JSON: " + raw.text.slice(0, 200));
  }
  throw lastError;
}
