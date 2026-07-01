import { NextResponse } from "next/server";
import { z } from "zod";
import { generateImageAsset } from "@/lib/image/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(3000),
  negativePrompt: z.string().trim().max(1000).optional(),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const image = await generateImageAsset(parsed.data);
    return NextResponse.json({ image });
  } catch (error) {
    if ((error as Error).message === "image_provider_not_configured") {
      return NextResponse.json(
        { error: "image_provider_not_configured", message: "未配置 OPENAI_API_KEY，暂不能生成 AI 封面图。" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "image_generation_failed" }, { status: 500 });
  }
}
