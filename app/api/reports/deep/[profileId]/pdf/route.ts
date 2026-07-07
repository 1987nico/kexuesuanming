import { NextResponse } from "next/server";
import { requireSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { ensureDeepReport } from "@/lib/reports/ensureDeepReport";
import { GOLDEN_REPORT_RENDER_VERSION, renderGoldenReportHtml, type GoldenReportData } from "@/lib/reports/goldenReportHtml";
import { toGoldenReportData } from "@/lib/reports/goldenAdapter";
import { getCachedPDF, putCachedPDF, renderHtmlPDF } from "@/lib/reports/pdf";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: Request, { params }: { params: { profileId: string } }) {
  const access = await requireSignedOrMianbaAccess(req, "deep-report", params.profileId);
  if (access) return access;

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) {
    return NextResponse.json({ error: "not_found", message: "未找到该测评底稿。" }, { status: 404 });
  }

  if (!profile.direction_session || profile.direction_session.status !== "completed") {
    return NextResponse.json(
      { error: "direction_incomplete", message: "方向滑卡测评尚未完成，无法生成交付 PDF。" },
      { status: 422 }
    );
  }

  const rawProfile = profile as unknown as Record<string, unknown>;
  const goldenReport = rawProfile.golden_report as GoldenReportData | undefined;
  const goldenGeneratedAt = rawProfile.golden_generated_at ? String(rawProfile.golden_generated_at) : undefined;

  let data: GoldenReportData;
  let versionSource = goldenGeneratedAt ?? profile.updated_at;
  if (goldenReport) {
    data = { ...goldenReport, generatedAt: goldenReport.generatedAt ?? goldenGeneratedAt };
  } else {
    const generated = await ensureDeepReport(profile, (p) => store.saveAssessmentProfile(p));
    data = toGoldenReportData(profile, generated);
    versionSource = generated.generated_at;
  }

  const version = Buffer.from(`${GOLDEN_REPORT_RENDER_VERSION}:${versionSource}`).toString("hex").slice(0, 20);
  const cacheKey = `deep-${profile.id}-${version}`;

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (!refresh) {
    const cached = await getCachedPDF(cacheKey);
    if (cached) return pdfResponse(cached, profile.customer_name);
  }

  try {
    const html = renderGoldenReportHtml(data);
    const pdf = await renderHtmlPDF(html, { pageSelector: ".golden-doc" });
    await putCachedPDF(cacheKey, pdf);
    return pdfResponse(pdf, profile.customer_name);
  } catch (error) {
    console.error("[deep-pdf] 渲染失败：", error);
    return NextResponse.json(
      { error: "pdf_render_failed", message: (error as Error)?.message || "PDF 渲染失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

function pdfResponse(pdf: Buffer, customerName: string) {
  const filename = encodeURIComponent(`${customerName}-职业事业方向深度诊断报告.pdf`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${filename}`,
      "cache-control": "private, max-age=60",
    },
  });
}
