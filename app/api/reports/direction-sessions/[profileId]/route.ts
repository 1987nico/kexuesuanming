import { NextResponse } from "next/server";
import {
  createDirectionSession,
  finalizeDirectionSessionIfNeeded,
  sessionClientView,
} from "@/lib/reports/directionSession";
import { requireSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 用户端拉取会话状态与未滑卡片。这个接口只读/轻量保存状态，
 * 不调用 LLM，避免真实手机网络下被方向生成拖超时。
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

  const response = NextResponse.json({ session: sessionClientView(profile.direction_session) });
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}
