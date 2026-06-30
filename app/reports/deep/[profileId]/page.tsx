import { notFound } from "next/navigation";
import { PrintButton } from "@/components/reports/PrintButton";
import { DeepReportView } from "@/components/reports/ReportViews";
import { assertReportConsistency } from "@/lib/reports/assessmentProfile";
import { buildDeepReport } from "@/lib/reports/builders";
import { reportStore } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

export default async function DeepReportPage({ params }: { params: { profileId: string } }) {
  const profile = await reportStore().getAssessmentProfile(params.profileId);
  if (!profile) notFound();

  const report = buildDeepReport(profile);
  const consistency = assertReportConsistency(profile, report.profile_reference);

  return (
    <main className="report-shell">
      <div className="report-toolbar">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-gold-700">Deep Report</div>
          <h1 className="serif mt-1 text-2xl">大报告预览：{profile.customer_name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            复用底稿：{profile.id}；一致性校验：{consistency.length ? "未通过" : "通过"}
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
      <DeepReportView report={report} />
    </main>
  );
}
