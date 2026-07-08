import { notFound } from "next/navigation";
import { InitialDiagnosisReport } from "@/components/reports/InitialDiagnosisReport";
import { PrintButton } from "@/components/reports/PrintButton";
import { hasSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { ensureInitialDiagnosis } from "@/lib/reports/initialDiagnosis";
import { reportStore } from "@/lib/reports/store";
import "../initial-report.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "初步诊断报告",
  description: "基于方向输入、价值观双三圈与天赋测评的初步判断。",
};

function tokenFromSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
  const value = searchParams?.access_token ?? searchParams?.token;
  return Array.isArray(value) ? value[0] : value;
}

export default async function InitialDiagnosisReportPage({
  params,
  searchParams,
}: {
  params: { profileId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (!(await hasSignedOrMianbaAccess("initial-report", params.profileId, tokenFromSearchParams(searchParams)))) {
    notFound();
  }

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) notFound();

  // 提交后已异步生成并缓存；这里兜底：首次访问若还没生成，同步生成一次
  const diagnosis = await ensureInitialDiagnosis(profile, (p) => store.saveAssessmentProfile(p));

  return (
    <main className="ir-root">
      <div className="ir-toolbar">
        <div>
          <h1>初步诊断报告：{profile.customer_name}</h1>
          <p>交付时间：{new Date(diagnosis.generated_at).toLocaleString("zh-CN")}</p>
        </div>
        <div className="ir-toolbar-actions">
          <PrintButton label="一键生成 PDF" />
        </div>
      </div>
      <div className="ir-editable-report" contentEditable suppressContentEditableWarning>
        <InitialDiagnosisReport profile={profile} diagnosis={diagnosis} />
      </div>
    </main>
  );
}
