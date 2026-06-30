export type TalentReportMode = "original-sync" | "local";

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
  customer_name: string;
  customer_contact?: string;
  survey_answers: Record<string, unknown>;
  value_profile: ValueProfile;
  talent_answers: Record<number, number>;
  talent_profile: TalentProfile;
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
