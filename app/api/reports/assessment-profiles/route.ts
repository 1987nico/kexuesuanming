import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTalentProfileWithFallback } from "@/lib/reports/principlesyouSync";
import { reportStore } from "@/lib/reports/store";
import type { AssessmentProfile } from "@/lib/reports/assessmentProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const valueProfileSchema = z.object({
  liked_values: z.array(z.string()).min(1),
  excluded_values: z.array(z.string()).min(1),
  like_summary: z.string().min(1),
  exclude_summary: z.string().min(1),
  filter_sentence: z.string().min(1),
});

const bodySchema = z.object({
  customer_name: z.string().min(1).max(80),
  customer_contact: z.string().max(120).optional(),
  survey_answers: z.record(z.unknown()).default({}),
  value_profile: valueProfileSchema,
  talent_answers: z.record(z.coerce.number().int().min(1).max(7)),
});

function numericAnswers(answers: Record<string, number>) {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(answers)) {
    out[Number(key)] = value;
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contact = url.searchParams.get("customer_contact") || undefined;
  const profile = await reportStore().getLatestAssessmentProfile(DEFAULT_TENANT_ID, contact);
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const talentResult = await generateTalentProfileWithFallback(numericAnswers(parsed.data.talent_answers));
  const profile: AssessmentProfile = {
    id: crypto.randomUUID(),
    tenant_id: DEFAULT_TENANT_ID,
    customer_name: parsed.data.customer_name,
    customer_contact: parsed.data.customer_contact,
    survey_answers: parsed.data.survey_answers,
    value_profile: parsed.data.value_profile,
    talent_answers: numericAnswers(parsed.data.talent_answers),
    talent_profile: talentResult.profile,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await reportStore().saveAssessmentProfile(profile);
  return NextResponse.json({
    profile,
    talent_source: talentResult.source,
    attempts: talentResult.attempts,
  });
}
