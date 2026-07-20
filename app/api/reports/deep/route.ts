import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { appendPublicAccessToken } from "@/lib/auth/publicAccess";
import { assertReportConsistency } from "@/lib/reports/assessmentProfile";
import { buildDeepReport } from "@/lib/reports/builders";
import { ensureDeepReport } from "@/lib/reports/ensureDeepReport";
import { missingDeepReportSections } from "@/lib/reports/reportShapes";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  assessment_profile_id: z.string().uuid(),
  regenerate: z.boolean().optional(),
  with_diagrams: z.boolean().optional(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = reportStore();
  const profile = await store.getAssessmentProfile(parsed.data.assessment_profile_id);
  if (!profile) return NextResponse.json({ error: "assessment_profile_not_found" }, { status: 404 });

  if (!profile.direction_session || profile.direction_session.status !== "completed") {
    return NextResponse.json(
      { error: "direction_incomplete", message: "方向滑卡测评尚未完成。" },
      { status: 422 }
    );
  }

  const generated = await ensureDeepReport(profile, (p) => store.saveAssessmentProfile(p), {
    regenerate: parsed.data.regenerate,
    withDiagrams: parsed.data.with_diagrams,
    loadLatest: (id) => store.getAssessmentProfile(id),
  });

  const effectiveProfile = { ...profile, deep_report: generated };
  const report = buildDeepReport(effectiveProfile, generated);
  const missing = missingDeepReportSections(report);
  const consistency = assertReportConsistency(effectiveProfile, report.profile_reference);
  if (missing.length || consistency.length) {
    return NextResponse.json({ error: "report_validation_failed", missing, consistency }, { status: 422 });
  }

  return NextResponse.json({
    report,
    consistency,
    generated: true,
    talent_source: effectiveProfile.talent_profile.mode,
    sensory_from_input: generated.sensory_from_input ?? false,
    report_url: appendPublicAccessToken(`/reports/deep/${profile.id}`, "deep-report", profile.id),
    pdf_url: appendPublicAccessToken(`/api/reports/deep/${profile.id}/pdf`, "deep-report", profile.id),
  });
}
