import { notFound } from "next/navigation";
import { PrintButton } from "@/components/reports/PrintButton";
import { hasSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { LiteReportView } from "@/components/reports/ReportViews";
import { assertReportConsistency, talentModeLabel } from "@/lib/reports/assessmentProfile";
import { buildLiteReport } from "@/lib/reports/builders";
import { reportStore } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

function tokenFromSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
  const value = searchParams?.access_token ?? searchParams?.token;
  return Array.isArray(value) ? value[0] : value;
}

export default async function LiteReportPage({
  params,
  searchParams,
}: {
  params: { profileId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (!(await hasSignedOrMianbaAccess("initial-report", params.profileId, tokenFromSearchParams(searchParams)))) {
    notFound();
  }

  const profile = await reportStore().getAssessmentProfile(params.profileId);
  if (!profile) notFound();

  const report = buildLiteReport(profile);
  const consistency = assertReportConsistency(profile, report.profile_reference);

  return (
    <main className="report-shell">
      <div className="report-toolbar">
        <div>
          <div className="text-xs tracking-[0.25em] text-gold-700">初步诊断报告</div>
          <h1 className="serif mt-1 text-2xl">初步诊断报告预览：{profile.customer_name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            天赋数据来源：{talentModeLabel(profile.talent_profile.mode)}；一致性检查：{consistency.length ? "未通过" : "通过"}
          </p>
        </div>
        <PrintButton />
      </div>
      {consistency.length > 0 && (
        <div className="report-warning">
          {consistency.map((issue) => (
            <div key={issue.code}>{issue.message}</div>
          ))}
        </div>
      )}
      <LiteReportView report={report} />
    </main>
  );
}
