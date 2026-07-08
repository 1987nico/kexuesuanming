import { notFound } from "next/navigation";
import { hasSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { ensureDeepReport } from "@/lib/reports/ensureDeepReport";
import { toGoldenReportData } from "@/lib/reports/goldenAdapter";
import { renderGoldenReportInner, type GoldenReportData } from "@/lib/reports/goldenReportHtml";
import { reportStore } from "@/lib/reports/store";
import "../deep-report.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "职业 / 事业方向深度诊断报告",
  description: "深度诊断报告：六步决策漏斗 + 方向感性验证 + 市场与资源验证。",
};

function tokenFromSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
  const value = searchParams?.access_token ?? searchParams?.token;
  return Array.isArray(value) ? value[0] : value;
}

function withAccessToken(path: string, token: string | undefined) {
  if (!token) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}access_token=${encodeURIComponent(token)}`;
}

export default async function DeepReportPage({
  params,
  searchParams,
}: {
  params: { profileId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const accessToken = tokenFromSearchParams(searchParams);
  if (!(await hasSignedOrMianbaAccess("deep-report", params.profileId, accessToken))) {
    notFound();
  }

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) notFound();

  const session = profile.direction_session;
  const needsDirection = !session || session.status !== "completed";

  // 新路线优先：若已由 /api/reports/golden 生成 golden_report，直接渲染，不走旧流水线
  const rawProfile = profile as unknown as Record<string, unknown>;
  const goldenReport = rawProfile.golden_report as GoldenReportData | undefined;
  const goldenGeneratedAt = rawProfile.golden_generated_at ? String(rawProfile.golden_generated_at) : undefined;

  let generated = profile.deep_report;
  if (!needsDirection && !goldenReport) {
    generated = await ensureDeepReport(profile, (p) => store.saveAssessmentProfile(p));
  }

  const routeMarker = profile.talent_profile.mode === "local" ? "B" : undefined;
  const reportHtml = goldenReport
    ? renderGoldenReportInner({ ...goldenReport, generatedAt: goldenReport.generatedAt ?? goldenGeneratedAt, routeMarker }, { editable: true })
    : generated
      ? renderGoldenReportInner(toGoldenReportData(profile, generated), { editable: true })
      : null;
  const generatedAt = goldenGeneratedAt ?? generated?.generated_at;
  const reportReady = Boolean(reportHtml);

  return (
    <main className="dr-root">
      <div className="dr-toolbar">
        <div>
          <h1>深度诊断报告：{profile.customer_name}</h1>
          <p>
            {needsDirection
              ? "方向滑卡测评尚未完成，完成后再生成完整报告。"
              : reportReady && generatedAt
                ? `已生成 · ${new Date(generatedAt).toLocaleString("zh-CN")}`
                : "报告生成中..."}
          </p>
        </div>
        <div className="dr-toolbar-actions">
          {reportReady && (
            <a className="dr-btn" href={withAccessToken(`/api/reports/deep/${profile.id}/pdf?refresh=1`, accessToken)}>
              下载 PDF
            </a>
          )}
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
          请先完成「深度诊断报告测评」（方向滑卡）。操作员可在报告交付后台复制测评入口链接发给客户。
          {session ? ` 当前进度：点亮 ${session.swipes.filter((s) => s.liked).length} / ${session.target_likes}。` : ""}
        </div>
      )}

      {reportHtml ? (
        <div
          className="dr-editable-report"
          dangerouslySetInnerHTML={{ __html: reportHtml }}
        />
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
