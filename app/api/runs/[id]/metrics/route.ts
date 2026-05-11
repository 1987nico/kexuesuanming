import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const metricsSchema = z.object({
  satisfaction_score: z.number().int().min(1).max(5).optional(),
  shocking_count: z.number().int().min(0).max(5).optional(),
  would_recommend: z.number().int().min(-100).max(100).optional(),
  feedback_text: z.string().max(2000).optional(),
  thirty_day_action_taken: z.boolean().optional(),
  step3_completion_rate: z.number().min(0).max(1).optional(),
  step3_total_time_sec: z.number().int().min(0).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parse = metricsSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }
  await store().saveMetrics(params.id, parse.data);
  return NextResponse.json({ ok: true });
}
