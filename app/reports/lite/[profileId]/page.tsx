import { notFound } from "next/navigation";
import { PrintButton } from "@/components/reports/PrintButton";
import { LiteReportView } from "@/components/reports/ReportViews";
import { assertReportConsistency } from "@/lib/reports/assessmentProfile";
import { buildLiteReport } from "@/lib/reports/builders";
import { reportStore } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

export default async function LiteReportPage({ params }: { params: { profileId: string } }) {
  const profile = await reportStore().getAssessmentProfile(params.profileId);
  if (!profile) notFound();

  const report = buildLiteReport(profile);
  const consistency = assertReportConsistency(profile, report.profile_reference);

  return (
    <main className="report-shell">
      <div className="report-toolbar">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-gold-700">Lite Report</div>
          <h1 className="serif mt-1 text-2xl">小报告预览：{profile.customer_name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            数据模式：{profile.talent_profile.mode}；一致性校验：{consistency.length ? "未通过" : "通过"}
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
