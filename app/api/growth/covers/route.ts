import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
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
  buyerC: z.boolean().optional(),
  caseMode: z.enum(["真实案例", "情景演绎"]).optional(),
  caseMaterial: z.string().trim().max(2000).optional(),
  structureName: z.string().trim().max(40).optional(),
  count: z.number().int().min(1).max(2).optional(),
  withImage: z.boolean().optional(),
});

const COVER_VARIANTS = [
  { hint: "大字标题版", coverSuffix: "" },
  { hint: "痛点提问版", coverSuffix: "？" },
];

const BUYER_C_COVER_VARIANTS = [
  { hint: "招聘现场版", coverSuffix: "" },
  { hint: "结果对照版", coverSuffix: "" },
];

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const count = parsed.data.count ?? 2;
  const wantImage = parsed.data.withImage !== false && isImageProviderConfigured();
  const covers = [] as Array<Record<string, unknown>>;
  const variants = parsed.data.buyerC ? BUYER_C_COVER_VARIANTS : COVER_VARIANTS;

  for (let i = 0; i < count; i++) {
    const variant = variants[i % variants.length];
    const baseCoverText = parsed.data.coverText || parsed.data.title;
    const brief = buildCoverBrief({
      title: parsed.data.title,
      body: parsed.data.body,
      coverText: `${baseCoverText}${variant.coverSuffix}`.slice(0, 18),
      targetUser: parsed.data.targetUser,
      contentType: parsed.data.contentType,
      testVariable: parsed.data.testVariable,
      styleHint: variant.hint,
      buyerC: parsed.data.buyerC,
      caseMode: parsed.data.caseMode,
      caseMaterial: parsed.data.caseMaterial,
      structureName: parsed.data.structureName,
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
