import { notFound } from "next/navigation";
import { DeepConsultationReport } from "@/components/reports/DeepConsultationReport";
import { PrintButton } from "@/components/reports/PrintButton";
import { ensureDeepReport } from "@/lib/reports/ensureDeepReport";
import { reportStore } from "@/lib/reports/store";
import "../deep-report.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "职业 / 事业方向科学算命咨询报告",
  description: "完整咨询报告：六步决策漏斗 + 方向感性验证 + 市场与资源验证。",
};

export default async function DeepReportPage({ params }: { params: { profileId: string } }) {
  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) notFound();

  const session = profile.direction_session;
  const needsDirection = !session || session.status !== "completed";
  let generated = profile.deep_report;

  if (!needsDirection) {
    generated = await ensureDeepReport(profile, (p) => store.saveAssessmentProfile(p));
  }

  return (
    <main className="dr-root">
      <div className="dr-toolbar">
        <div>
          <h1>完整咨询报告：{profile.customer_name}</h1>
          <p>
            {needsDirection
              ? "方向滑卡测评尚未完成，完成后再生成完整报告。"
              : generated
                ? `已生成 · ${generated.sensory_from_input ? "含真实感性验证" : "AI 预判"} · ${new Date(generated.generated_at).toLocaleString("zh-CN")}`
                : "报告生成中..."}
          </p>
        </div>
        <div className="dr-toolbar-actions">
          {generated && (
            <a className="dr-btn" href={`/api/reports/deep/${profile.id}/pdf`}>
              下载 PDF
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      {needsDirection && (
        <div
          style={{
            width: "210mm",
            maxWidth: "calc(100vw - 32px)",
            margin: "0 auto 20px",
            padding: "16px 20px",
            borderRadius: 16,
            background: "#fff8e8",
            fontSize: 14,
            color: "#5a4a20",
          }}
        >
          请先完成「完整咨询报告测评」（方向滑卡）。操作员可在报告交付后台复制测评入口链接发给客户。
          {session ? ` 当前进度：点亮 ${session.swipes.filter((s) => s.liked).length} / ${session.target_likes}。` : ""}
        </div>
      )}

      {generated ? (
        <DeepConsultationReport profile={profile} generated={generated} />
      ) : (
        <div
          style={{
            width: "210mm",
            maxWidth: "calc(100vw - 32px)",
            margin: "0 auto",
            padding: 40,
            textAlign: "center",
            background: "white",
            borderRadius: 16,
            color: "#6f7886",
          }}
        >
          报告内容尚未生成。方向测评完成后系统将自动生成，或请稍候刷新页面。
        </div>
      )}
    </main>
  );
}
