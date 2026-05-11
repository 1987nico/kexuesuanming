import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { surveySchema } from "@/lib/survey/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parse = surveySchema.safeParse(body.survey);
  if (!parse.success) {
    return NextResponse.json({ error: "validation", issues: parse.error.flatten() }, { status: 400 });
  }
  await store().saveSurvey(params.id, parse.data, body.principlesYouSummary);
  await store().updateStatus(params.id, "step1");
  return NextResponse.json({ ok: true });
}
