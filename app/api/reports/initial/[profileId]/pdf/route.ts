import { NextResponse } from "next/server";
import {
  requireSignedOrMianbaAccess,
  signPublicAccessToken,
} from "@/lib/auth/publicAccess";
import { ensureInitialDiagnosis } from "@/lib/reports/initialDiagnosis";
import { getCachedPDF, putCachedPDF, renderPagePDF } from "@/lib/reports/pdf";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const INITIAL_REPORT_RENDER_VERSION = "initial-report-v2-local-route-marker";

function baseUrlFromRequest(req: Request) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const url = new URL(req.url);
  // Vercel 反代后 req.url 的 host 是对外域名；本地就是 localhost
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request, { params }: { params: { profileId: string } }) {
  const access = await requireSignedOrMianbaAccess(req, "initial-report", params.profileId);
  if (access) return access;

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) {
    return NextResponse.json({ error: "not_found", message: "未找到该测评底稿。" }, { status: 404 });
  }

  // 确保判断性文案已生成（正常情况下提交时已异步生成并缓存）
  const diagnosis = await ensureInitialDiagnosis(
    profile,
    (p) => store.saveAssessmentProfile(p),
    (id) => store.getAssessmentProfile(id)
  );

  // 缓存 key 与文案版本绑定：重新生成文案后会自动重渲染
  const version = Buffer.from(`${INITIAL_REPORT_RENDER_VERSION}:${diagnosis.generated_at}:${profile.talent_profile.mode}`).toString("hex").slice(0, 20);
  const cacheKey = `initial-${profile.id}-${version}`;

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (!refresh) {
    const cached = await getCachedPDF(cacheKey);
    if (cached) return pdfResponse(cached, profile.customer_name);
  }

  const pageUrl = new URL(`/reports/initial/${profile.id}`, baseUrlFromRequest(req));
  pageUrl.searchParams.set("access_token", signPublicAccessToken("initial-report", profile.id, 10 * 60));
  try {
    const pdf = await renderPagePDF(pageUrl.toString());
    await putCachedPDF(cacheKey, pdf);
    return pdfResponse(pdf, profile.customer_name);
  } catch (error) {
    console.error("[initial-pdf] 渲染失败：", error);
    return NextResponse.json(
      { error: "pdf_render_failed", message: (error as Error)?.message || "PDF 渲染失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

function pdfResponse(pdf: Buffer, customerName: string) {
  const filename = encodeURIComponent(`职场参谋-初步诊断报告-${customerName}.pdf`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${filename}`,
      "cache-control": "private, max-age=60",
    },
  });
}
