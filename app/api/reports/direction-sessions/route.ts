import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { appendPublicAccessToken } from "@/lib/auth/publicAccess";
import {
  createDirectionSession,
  lockDirectionGenerationIfNeeded,
  runLockedDirectionGeneration,
} from "@/lib/reports/directionSession";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  assessment_profile_id: z.string().uuid(),
});

/**
 * 操作员发起「深度诊断报告测评」：创建（或复用）滑卡会话并启动首批方向生成。
 */
export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = reportStore();
  const profile = await store.getAssessmentProfile(parsed.data.assessment_profile_id);
  if (!profile) {
    return NextResponse.json({ error: "not_found", message: "未找到该测评底稿。" }, { status: 404 });
  }

  const surveyPath = appendPublicAccessToken(`/survey/directions/${profile.id}`, "direction-session", profile.id);

  if (!profile.direction_session) {
    profile.direction_session = createDirectionSession();
    profile.updated_at = new Date().toISOString();
    await store.saveAssessmentProfile(profile);
  }

  if (profile.direction_session.status === "active" && profile.direction_session.rounds_generated === 0) {
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
      ).catch((error) => console.warn("[direction-sessions] 首批方向生成失败：", (error as Error)?.message));
      try {
        const { waitUntil } = await import("@vercel/functions");
        waitUntil(generation);
      } catch {
        void generation;
      }
    }
  }

  const session = profile.direction_session;
  return NextResponse.json({
    survey_url: surveyPath,
    session: {
      status: session.status,
      rounds_generated: session.rounds_generated,
      swiped_count: session.swipes.length,
      likes: session.swipes.filter((swipe) => swipe.liked).length,
      generating: session.generating,
    },
  });
}
