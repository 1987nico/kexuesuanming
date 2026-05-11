import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  respondentId: z.string().uuid(),
  oppIdx: z.number().int().min(1).max(30),
  score: z.number().int().min(0).max(10),
  reason: z.string().max(300).optional().nullable(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parse = bodySchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "validation", issues: parse.error.flatten() }, { status: 400 });
  }
  const { respondentId, oppIdx, score, reason } = parse.data;

  // 校验受访者存在
  const respondent = await store().getQuickRespondent(respondentId);
  if (!respondent) {
    return NextResponse.json({ error: "respondent_not_found" }, { status: 404 });
  }

  await store().upsertQuickScore(
    respondentId,
    oppIdx,
    score,
    reason?.trim() || undefined
  );
  return NextResponse.json({ ok: true });
}
