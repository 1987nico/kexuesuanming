import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DIRECTION_PREFETCH_THRESHOLD,
  generateNextBatchIfNeeded,
  mergeDirectionSessions,
  recordSwipe,
  sessionClientView,
  sessionUnswipedCards,
} from "@/lib/reports/directionSession";
import { requireSignedOrMianbaAccess } from "@/lib/auth/publicAccess";
import { warmupDeepReportAfterDirectionComplete } from "@/lib/reports/ensureDeepReport";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  card_id: z.string().min(1),
  liked: z.boolean(),
});

/**
 * 记录一次滑动。剩余卡片触底时后台预生成下一批（用户无感知）。
 */
export async function POST(req: Request, { params }: { params: { profileId: string } }) {
  const access = await requireSignedOrMianbaAccess(req, "direction-session", params.profileId);
  if (access) return access;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile?.direction_session) {
    return NextResponse.json({ error: "not_found", message: "测评暂未开放。" }, { status: 404 });
  }
  const session = profile.direction_session;
  if (session.status === "completed") {
    return NextResponse.json({ session: sessionClientView(session) });
  }

  try {
    recordSwipe(session, parsed.data.card_id, parsed.data.liked);
  } catch (error) {
    return NextResponse.json({ error: "invalid_card", message: (error as Error).message }, { status: 400 });
  }
  const latest = await store.getAssessmentProfile(params.profileId);
  const mergedSession = mergeDirectionSessions(latest?.direction_session, session);
  const nextProfile = latest ?? profile;
  nextProfile.direction_session = mergedSession;
  nextProfile.updated_at = mergedSession?.updated_at ?? session.updated_at;
  await store.saveAssessmentProfile(nextProfile);

  const responseSession = nextProfile.direction_session ?? session;
  const justCompleted = responseSession.status === "completed";
  if (justCompleted) {
    warmupDeepReportAfterDirectionComplete(
      params.profileId,
      (p) => store.saveAssessmentProfile(p),
      (id) => store.getAssessmentProfile(id)
    );
  }

  // 触底预生成：后台跑，不阻塞本次滑动响应
  if (
    responseSession.status === "active" &&
    sessionUnswipedCards(responseSession).length <= DIRECTION_PREFETCH_THRESHOLD
  ) {
    const prefetch = generateNextBatchIfNeeded(
      nextProfile,
      (p) => store.saveAssessmentProfile(p),
      (id) => store.getAssessmentProfile(id)
    ).catch((error) => console.warn("[direction-swipes] 预生成下一批失败：", (error as Error)?.message));
    try {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(prefetch);
    } catch {
      void prefetch;
    }
  }

  return NextResponse.json({ session: sessionClientView(responseSession) });
}
