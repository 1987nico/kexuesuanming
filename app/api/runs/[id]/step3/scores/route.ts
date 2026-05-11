import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scoreSchema = z.object({
  opp_idx: z.number().int().min(1),
  score: z.number().int().min(0).max(10),
  reason: z.string().min(1).max(300),
});

const batchSchema = z.object({
  scores: z.array(scoreSchema).min(1),
  finalize: z.boolean().optional(), // 全部 30 项打分完成
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parse = batchSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "validation", issues: parse.error.flatten() }, { status: 400 });
  }
  for (const s of parse.data.scores) {
    await store().saveStep3Score(params.id, s.opp_idx, s.score, s.reason);
  }
  if (parse.data.finalize) {
    await store().updateStatus(params.id, "step4");
  }
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const scores = await store().getStep3Scores(params.id);
  return NextResponse.json({ scores });
}
