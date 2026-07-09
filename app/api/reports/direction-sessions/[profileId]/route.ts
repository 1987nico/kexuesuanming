import { NextResponse } from "next/server";
import {
  createDirectionSession,
  finalizeDirectionSessionIfNeeded,
  lockDirectionGenerationIfNeeded,
  runLockedDirectionGeneration,
  sessionClientView,
} from "@/lib/reports/directionSession";
import { requireSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 用户端拉取会话状态与未滑卡片。卡片不足时只启动后台补生成，
 * 状态接口本身必须快速返回，避免真实手机网络下被 LLM 生成拖超时。
 */
export async function GET(req: Request, { params }: { params: { profileId: string } }) {
  const access = await requireSignedOrMianbaAccess(req, "direction-session", params.profileId);
  if (access) return access;

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) {
    console.warn("[direction-session:get] profile_not_found", { profileId: params.profileId });
    return NextResponse.json({ error: "not_found", message: "没有找到这份测评，请联系你的参谋顾问重新发送。" }, { status: 404 });
  }

  if (!profile.direction_session) {
    profile.direction_session = createDirectionSession();
    profile.updated_at = new Date().toISOString();
    await store.saveAssessmentProfile(profile);
  }

  if (finalizeDirectionSessionIfNeeded(profile.direction_session)) {
    profile.updated_at = profile.direction_session.updated_at;
    await store.saveAssessmentProfile(profile);
  }

  // 首次公开打开或卡片见底时补生成；这里只抢锁并快速返回，耗时生成交给 waitUntil。
  const generationProfile = await lockDirectionGenerationIfNeeded(
    profile,
    (p) => store.saveAssessmentProfile(p),
    (id) => store.getAssessmentProfile(id)
  );
  if (generationProfile) {
    const generation = runLockedDirectionGeneration(
      generationProfile,
      (p) => store.saveAssessmentProfile(p),
      (id) => store.getAssessmentProfile(id)
    ).catch((error) => console.warn("[direction-session:get] 后台生成方向失败：", (error as Error)?.message));
    try {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(generation);
    } catch {
      void generation;
    }
  }

  return NextResponse.json({ session: sessionClientView(profile.direction_session) });
}
