import OpenAI from "openai";
import { generateJimengImage, isVolcengineConfigured } from "./volcengine";

export type ImageProvider = "volcengine" | "openai";

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
}

export interface ImageGenerationResult {
  provider: ImageProvider;
  model: string;
  imageDataUrl?: string;
  revisedPrompt?: string;
}

function resolveProvider(env: NodeJS.ProcessEnv = process.env): ImageProvider | null {
  const explicit = env.IMAGE_PROVIDER as ImageProvider | undefined;
  if (explicit === "volcengine" && isVolcengineConfigured(env)) return "volcengine";
  if (explicit === "openai" && env.OPENAI_API_KEY) return "openai";
  // 未显式指定时：优先国内火山即梦，其次 OpenAI
  if (isVolcengineConfigured(env)) return "volcengine";
  if (env.OPENAI_API_KEY) return "openai";
  return null;
}

export function isImageProviderConfigured(env: NodeJS.ProcessEnv = process.env) {
  return resolveProvider(env) !== null;
}

function parseSize(size?: ImageGenerationRequest["size"]) {
  const [w, h] = (size || "1024x1536").split("x").map((n) => Number(n));
  return { width: w || 1024, height: h || 1536 };
}

export async function generateImageAsset(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error("image_provider_not_configured");
  }

  if (provider === "volcengine") {
    const { width, height } = parseSize(req.size);
    const prompt = req.negativePrompt ? `${req.prompt}\n\n避免出现：${req.negativePrompt}` : req.prompt;
    const { imageUrl, model } = await generateJimengImage({ prompt, width, height });
    return { provider: "volcengine", model, imageDataUrl: imageUrl };
  }

  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = req.negativePrompt ? `${req.prompt}\n\n避免出现：${req.negativePrompt}` : req.prompt;
  const response = await client.images.generate({ model, prompt, size: req.size || "1024x1536" });
  const image = response.data?.[0];
  const b64 = image?.b64_json;
  return {
    provider: "openai",
    model,
    imageDataUrl: b64 ? `data:image/png;base64,${b64}` : undefined,
    revisedPrompt: image?.revised_prompt,
  };
}
