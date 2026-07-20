import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { assertReportConsistency } from "@/lib/reports/assessmentProfile";
import { buildLiteReport } from "@/lib/reports/builders";
import { missingLiteReportSections } from "@/lib/reports/reportShapes";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  assessment_profile_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await reportStore().getAssessmentProfile(parsed.data.assessment_profile_id);
  if (!profile) return NextResponse.json({ error: "assessment_profile_not_found" }, { status: 404 });

  const report = buildLiteReport(profile);
  const missing = missingLiteReportSections(report);
  const consistency = assertReportConsistency(profile, report.profile_reference);
  if (missing.length || consistency.length) {
    return NextResponse.json({ error: "report_validation_failed", missing, consistency }, { status: 422 });
  }

  return NextResponse.json({ report, consistency });
}
