import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCoverBrief } from "@/lib/growth/coverBrief";
import { generateImageAsset, isImageProviderConfigured } from "@/lib/image/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().max(4000).optional(),
  coverText: z.string().trim().max(40).optional(),
  targetUser: z.string().trim().max(500).optional(),
  contentType: z.enum(["diagnostic", "tool", "story"]).optional(),
  testVariable: z.string().trim().max(500).optional(),
  count: z.number().int().min(1).max(2).optional(),
  withImage: z.boolean().optional(),
});

const COVER_VARIANTS = [
  { hint: "大字标题版", coverSuffix: "" },
  { hint: "痛点提问版", coverSuffix: "？" },
];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const count = parsed.data.count ?? 2;
  const wantImage = parsed.data.withImage !== false && isImageProviderConfigured();
  const covers = [] as Array<Record<string, unknown>>;

  for (let i = 0; i < count; i++) {
    const variant = COVER_VARIANTS[i % COVER_VARIANTS.length];
    const baseCoverText = parsed.data.coverText || parsed.data.title;
    const brief = buildCoverBrief({
      title: parsed.data.title,
      coverText: `${baseCoverText}${variant.coverSuffix}`.slice(0, 18),
      targetUser: parsed.data.targetUser,
      contentType: parsed.data.contentType,
      testVariable: parsed.data.testVariable,
    });

    let imageDataUrl: string | undefined;
    let imageError: string | undefined;
    if (wantImage) {
      try {
        const image = await generateImageAsset({
          prompt: `${brief.imagePrompt}（版式：${variant.hint}）`,
          negativePrompt: brief.negativePrompt,
          size: "1024x1536",
        });
        imageDataUrl = image.imageDataUrl;
      } catch (error) {
        imageError = (error as Error).message;
      }
    }

    covers.push({ variant: variant.hint, brief, imageDataUrl, imageError });
  }

  return NextResponse.json({ covers, imageProviderConfigured: isImageProviderConfigured() });
}
