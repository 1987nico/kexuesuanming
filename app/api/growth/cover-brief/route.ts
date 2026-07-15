import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { buildCoverBrief } from "@/lib/growth/coverBrief";

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
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ brief: buildCoverBrief(parsed.data) });
}
