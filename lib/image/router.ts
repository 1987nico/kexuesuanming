import OpenAI from "openai";

export type ImageProvider = "openai";

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

export function isImageProviderConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!env.OPENAI_API_KEY;
}

export async function generateImageAsset(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
  if (!isImageProviderConfigured()) {
    throw new Error("image_provider_not_configured");
  }

  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = req.negativePrompt
    ? `${req.prompt}\n\n避免出现：${req.negativePrompt}`
    : req.prompt;

  const response = await client.images.generate({
    model,
    prompt,
    size: req.size || "1024x1536",
  });
  const image = response.data?.[0];
  const b64 = image?.b64_json;
  return {
    provider: "openai",
    model,
    imageDataUrl: b64 ? `data:image/png;base64,${b64}` : undefined,
    revisedPrompt: image?.revised_prompt,
  };
}
