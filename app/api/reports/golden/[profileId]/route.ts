import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { appendPublicAccessToken } from "@/lib/auth/publicAccess";
import { runGoldenReport } from "@/lib/reports/goldenPipeline";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 全新独立路线：一次性生成「金样本体例」深度诊断报告。
 * 数字由 deepMath 算、文本由豆包出、渲染用金样本渲染器，产出永远是金样本这张脸。
 */
export async function POST(req: Request, { params }: { params: { profileId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) return NextResponse.json({ error: "assessment_profile_not_found" }, { status: 404 });

  if (!profile.direction_session || profile.direction_session.status !== "completed") {
    return NextResponse.json(
      { error: "direction_incomplete", message: "方向滑卡测评尚未完成。" },
      { status: 422 }
    );
  }

  try {
    const data = await runGoldenReport(profile);
    // 存到 profile（新字段，不动旧 deep_report）
    (profile as unknown as Record<string, unknown>).golden_report = data;
    (profile as unknown as Record<string, unknown>).golden_generated_at = new Date().toISOString();
    profile.updated_at = new Date().toISOString();
    await store.saveAssessmentProfile(profile);

    return NextResponse.json({
      ok: true,
      report_url: appendPublicAccessToken(`/reports/deep/${profile.id}`, "deep-report", profile.id),
      pdf_url: `${appendPublicAccessToken(`/api/reports/deep/${profile.id}/pdf`, "deep-report", profile.id)}&refresh=1`,
      sections: {
        market: data.market.length,
        vrin: data.vrin.length,
        premortem: data.premortem?.length ?? 0,
        hasVerdict: Boolean(data.verdict),
      },
    });
  } catch (error) {
    console.error("[golden] 生成失败：", error);
    return NextResponse.json(
      { error: "golden_generate_failed", message: (error as Error)?.message || "生成失败，请稍后重试。" },
      { status: 500 }
    );
  }
}
