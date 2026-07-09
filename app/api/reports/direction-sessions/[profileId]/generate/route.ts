import { NextResponse } from "next/server";
import {
  createDirectionSession,
  finalizeDirectionSessionIfNeeded,
  generateNextBatchIfNeeded,
  sessionClientView,
} from "@/lib/reports/directionSession";
import { requireSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 独立生成下一批方向。这个接口可以等待 LLM，
 * 但它不承载“保存滑卡进度”，因此不会把点亮数卡住或回退。
 */
export async function POST(req: Request, { params }: { params: { profileId: string } }) {
  const access = await requireSignedOrMianbaAccess(req, "direction-session", params.profileId);
  if (access) return access;

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile) {
    console.warn("[direction-session:generate] profile_not_found", { profileId: params.profileId });
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
    const response = NextResponse.json({ session: sessionClientView(profile.direction_session) });
    response.headers.set("cache-control", "no-store, max-age=0");
    return response;
  }

  await generateNextBatchIfNeeded(
    profile,
    (p) => store.saveAssessmentProfile(p),
    (id) => store.getAssessmentProfile(id)
  );

  const latest = (await store.getAssessmentProfile(params.profileId)) ?? profile;
  if (latest.direction_session && finalizeDirectionSessionIfNeeded(latest.direction_session)) {
    latest.updated_at = latest.direction_session.updated_at;
    await store.saveAssessmentProfile(latest);
  }

  const response = NextResponse.json({ session: sessionClientView(latest.direction_session ?? profile.direction_session) });
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}
