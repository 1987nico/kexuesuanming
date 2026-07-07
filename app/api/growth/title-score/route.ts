import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { scoreTitle } from "@/lib/growth/titleScore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  targetUser: z.string().trim().max(500).optional(),
  coreProblem: z.string().trim().max(500).optional(),
  topic: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ score: scoreTitle(parsed.data) });
}
