import type { DeepReportGenerated } from "./deepReport";
import type { DirectionSession } from "./directionSession";
import type { InitialDiagnosisGenerated } from "./initialDiagnosis";

export type TalentReportMode = "original-sync" | "local";

export function talentModeLabel(mode: TalentReportMode | string): string {
  if (mode === "original-sync") return "真实同步";
  if (mode === "local") return "本地兜底";
  return String(mode);
}

export interface ValueProfile {
  liked_values: string[];
  excluded_values: string[];
  like_summary: string;
  exclude_summary: string;
  filter_sentence: string;
}

export interface TalentArchetype {
  key: string;
  name: string;
  percentile?: number;
  raw_score?: number;
}

export interface TalentTrait {
  key: string;
  name: string;
  percentile?: number;
  band: "very_low" | "low" | "moderate" | "high" | "very_high";
  explanation?: string;
}

export interface TalentProfile {
  mode: TalentReportMode;
  answer_distribution: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>;
  top_archetypes: TalentArchetype[];
  high_traits: TalentTrait[];
  low_traits: TalentTrait[];
  raw?: unknown;
  evidence?: {
    provider: "principlesyou" | "local";
    session_id?: string;
    synced_at?: string;
    source_hash?: string;
    retry_count?: number;
    fallback_reason?: string;
  };
}

export interface AssessmentProfile {
  id: string;
  tenant_id: string;
  /** 负责该客户的操作者（tenant_users.id）；公开链接提交时为 null，后台可再指派 */
  owner_user_id?: string | null;
  customer_name: string;
  customer_contact?: string;
  survey_answers: Record<string, unknown>;
  value_profile: ValueProfile;
  talent_answers: Record<number, number>;
  talent_profile: TalentProfile;
  // 大报告生成内容（可选；由 /api/reports/deep 生成后回填）
  deep_report?: DeepReportGenerated;
  // 初步诊断报告 LLM 判断层（可选；测评提交后自动生成并缓存）
  initial_diagnosis?: InitialDiagnosisGenerated;
  // 方向感性验证滑卡会话（可选；操作员发起完整咨询报告测评后创建）
  direction_session?: DirectionSession;
  created_at: string;
  updated_at: string;
}

export interface ReportConsistencyIssue {
  code:
    | "value_liked_mismatch"
    | "value_excluded_mismatch"
    | "archetype_mismatch"
    | "high_trait_mismatch"
    | "low_trait_mismatch";
  message: string;
}

export interface ReportProfileReference {
  value_profile: ValueProfile;
  talent_profile: Pick<TalentProfile, "top_archetypes" | "high_traits" | "low_traits" | "mode">;
}

function keysOf<T extends { key: string }>(items: T[]) {
  return items.map((item) => item.key).join("|");
}

function valuesKey(values: string[]) {
  return values.join("|");
}

export function assertReportConsistency(
  profile: AssessmentProfile,
  reportReference: ReportProfileReference
): ReportConsistencyIssue[] {
  const issues: ReportConsistencyIssue[] = [];

  if (valuesKey(profile.value_profile.liked_values) !== valuesKey(reportReference.value_profile.liked_values)) {
    issues.push({
      code: "value_liked_mismatch",
      message: "报告里的喜欢区价值观与 assessment_profile 不一致。",
    });
  }

  if (
    valuesKey(profile.value_profile.excluded_values) !==
    valuesKey(reportReference.value_profile.excluded_values)
  ) {
    issues.push({
      code: "value_excluded_mismatch",
      message: "报告里的排除带价值观与 assessment_profile 不一致。",
    });
  }

  if (keysOf(profile.talent_profile.top_archetypes) !== keysOf(reportReference.talent_profile.top_archetypes)) {
    issues.push({
      code: "archetype_mismatch",
      message: "报告里的天赋原型排序与 assessment_profile 不一致。",
    });
  }

  if (keysOf(profile.talent_profile.high_traits) !== keysOf(reportReference.talent_profile.high_traits)) {
    issues.push({
      code: "high_trait_mismatch",
      message: "报告里的高分关键特质与 assessment_profile 不一致。",
    });
  }

  if (keysOf(profile.talent_profile.low_traits) !== keysOf(reportReference.talent_profile.low_traits)) {
    issues.push({
      code: "low_trait_mismatch",
      message: "报告里的低分关键特质与 assessment_profile 不一致。",
    });
  }

  return issues;
}
