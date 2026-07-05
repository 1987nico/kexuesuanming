import { NextResponse } from "next/server";
import { ensureDeepReport } from "@/lib/reports/ensureDeepReport";
import { getCachedPDF, putCachedPDF, renderPagePDF } from "@/lib/reports/pdf";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function baseUrlFromRequest(req: Request) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request, { params }: { params: { profileId: string } }) {
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

  const generated = await ensureDeepReport(profile, (p) => store.saveAssessmentProfile(p));
  const version = Buffer.from(generated.generated_at).toString("hex").slice(0, 12);
  const cacheKey = `deep-${profile.id}-${version}`;

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (!refresh) {
    const cached = await getCachedPDF(cacheKey);
    if (cached) return pdfResponse(cached, profile.customer_name);
  }

  const pageUrl = `${baseUrlFromRequest(req)}/reports/deep/${profile.id}`;
  try {
    const pdf = await renderPagePDF(pageUrl, { pageSelector: ".dr-page" });
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
  const filename = encodeURIComponent(`${customerName}-职业事业方向科学算命咨询报告.pdf`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${filename}`,
      "cache-control": "private, max-age=60",
    },
  });
}
