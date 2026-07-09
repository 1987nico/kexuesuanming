import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { appendPublicAccessToken } from "@/lib/auth/publicAccess";
import { createDirectionSession } from "@/lib/reports/directionSession";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  assessment_profile_id: z.string().uuid(),
});

/**
 * 操作员发起「深度诊断报告测评」：创建（或复用）滑卡会话。
 * 首批方向由用户端生成接口启动，避免后台生成链接时被 LLM 拖超时。
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
