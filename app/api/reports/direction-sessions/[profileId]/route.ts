import { NextResponse } from "next/server";
import {
  generateNextBatchIfNeeded,
  sessionClientView,
} from "@/lib/reports/directionSession";
import { requireSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 用户端拉取会话状态与未滑卡片。卡片不足时同步补生成（首次打开等待第一批）。
 */
export async function GET(req: Request, { params }: { params: { profileId: string } }) {
  const access = await requireSignedOrMianbaAccess(req, "direction-session", params.profileId);
  if (access) return access;

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile?.direction_session) {
    return NextResponse.json({ error: "not_found", message: "测评暂未开放，请联系你的参谋顾问。" }, { status: 404 });
  }

  // 卡片见底时补生成（内部有锁与轮次上限；已有卡片时该调用立即返回）
  await generateNextBatchIfNeeded(profile, (p) => store.saveAssessmentProfile(p));

  return NextResponse.json({ session: sessionClientView(profile.direction_session) });
}
