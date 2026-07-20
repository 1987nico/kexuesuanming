/**
 * 大报告（完整咨询报告）流水线
 *
 * 与小报告对齐的设计：
 * - 复用 assessment profile 底稿（价值观、天赋、问卷）
 * - 衔接小报告 initial_diagnosis 的判断结论
 * - 衔接方向滑卡测评（direction_session）的「点亮」方向作为 Step3 感性验证输入
 * - 生成后缓存到 profile.deep_report，PDF 按内容版本缓存
 */

import type { AssessmentProfile } from "./assessmentProfile";
import type { DeepReportGenerated, SensoryScoreInput } from "./deepReport";
import { generateGoldenDeepReport } from "./goldenDeepPipeline";
import { sessionLikedCards } from "./directionSession";
import { ensureInitialDiagnosis } from "./initialDiagnosis";

/** 方向滑卡「点亮」→ 感性打分（≥7 视为达标） */
export function sensoryScoresFromSession(profile: AssessmentProfile): SensoryScoreInput[] {
  const session = profile.direction_session;
  if (!session) return [];
  return sessionLikedCards(session).map((card) => ({
    direction: card.title,
    score: 8,
    reason: card.one_liner,
  }));
}

function isDeepReportStale(profile: AssessmentProfile): boolean {
  const completedAt = profile.direction_session?.completed_at;
  const generatedAt = profile.deep_report?.generated_at;
  if (!completedAt || !generatedAt) return false;
  return Date.parse(completedAt) > Date.parse(generatedAt);
}

export interface EnsureDeepReportOptions {
  regenerate?: boolean;
  withDiagrams?: boolean;
  loadLatest?: (id: string) => Promise<AssessmentProfile | null>;
}

/**
 * 取缓存或生成并回存。
 * 方向测评完成后会自动触发；报告页 / PDF 路由兜底调用。
 */
export async function ensureDeepReport(
  profile: AssessmentProfile,
  save: (profile: AssessmentProfile) => Promise<void>,
  opts?: EnsureDeepReportOptions
): Promise<DeepReportGenerated> {
  const stale = isDeepReportStale(profile);
  if (profile.deep_report && !opts?.regenerate && !stale) {
    return profile.deep_report;
  }

  // 小报告判断层必须先就绪，大报告与之逻辑一致
  await ensureInitialDiagnosis(profile, save, opts?.loadLatest);

  const { generated } = await generateGoldenDeepReport(profile, {
    initialDiagnosis: profile.initial_diagnosis,
    forceFixture: process.env.GOLDEN_DEEP_FORCE_FIXTURE === "1",
  });

  const latest = opts?.loadLatest ? await opts.loadLatest(profile.id) : null;
  const nextProfile = latest ?? profile;
  nextProfile.deep_report = generated;
  nextProfile.updated_at = new Date().toISOString();
  await save(nextProfile);
  profile.deep_report = generated;
  profile.updated_at = nextProfile.updated_at;
  return generated;
}

/** 方向测评完成时异步预热大报告（不阻塞滑卡响应） */
export function warmupDeepReportAfterDirectionComplete(
  profileId: string,
  save: (profile: AssessmentProfile) => Promise<void>,
  get: (id: string) => Promise<AssessmentProfile | null>
): void {
  const run = async () => {
    const profile = await get(profileId);
    if (!profile?.direction_session || profile.direction_session.status !== "completed") return;
    await ensureDeepReport(profile, save, { loadLatest: get });
  };
  run().catch((error) => console.warn("[ensureDeepReport] 异步预热失败：", (error as Error)?.message));
}
