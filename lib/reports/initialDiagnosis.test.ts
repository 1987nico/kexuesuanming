import { describe, expect, it } from "vitest";
import type { AssessmentProfile } from "./assessmentProfile";
import { buildFallbackDiagnosis, findBannedTerms, initialDiagnosisSchema } from "./initialDiagnosis";

const profile: AssessmentProfile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tenant_id: "mianbajun",
  customer_name: "放放",
  survey_answers: {
    decision_type: "创业",
    decision_timing: "3个月内大概率要动",
    stuck_point: "不知道自己适合什么",
    energy_source: "做判断和决策",
    avoid_state: "做看起来体面但没复利的事",
    transferable_asset: "行业经验",
    interested_direction: "个人 IP 咨询、AI 视频",
    excluded_direction: "低价代运营",
  },
  value_profile: {
    liked_values: ["学习/进化", "了解世界", "被爱"],
    excluded_values: ["安稳度日", "优哉游哉", "创新"],
    like_summary: "持续学习升级，看见更大的世界，并获得真实认可。",
    exclude_summary: "只求安稳舒适，停在小圈安全感，或为新奇而创新。",
    filter_sentence: "能持续学习、连接更大的世界、让个人判断被看见。",
  },
  talent_answers: { 5: 6, 6: 4, 11: 7 },
  talent_profile: {
    mode: "local",
    answer_distribution: { 1: 6, 2: 5, 3: 28, 4: 66, 5: 55, 6: 58, 7: 34 },
    top_archetypes: [
      { key: "individualist", name: "独立者", percentile: 94 },
      { key: "entertainer", name: "活跃表达者", percentile: 88 },
      { key: "adventurer", name: "冒险者", percentile: 87 },
    ],
    high_traits: [
      { key: "creative", name: "创造性", percentile: 78, band: "high" },
      { key: "leadership", name: "领导倾向", percentile: 73, band: "high" },
      { key: "status-seeking", name: "认可与地位追求", percentile: 73, band: "high" },
    ],
    low_traits: [
      { key: "practical", name: "务实性", percentile: 12, band: "very_low" },
      { key: "humble", name: "谦逊开放", percentile: 14, band: "very_low" },
    ],
    evidence: { provider: "local", fallback_reason: "test" },
  },
  created_at: "2026-06-30T00:00:00.000Z",
  updated_at: "2026-06-30T00:00:00.000Z",
};

describe("initial diagnosis fallback", () => {
  it("produces schema-valid fields without any LLM call", () => {
    const fallback = buildFallbackDiagnosis(profile);
    const parsed = initialDiagnosisSchema.safeParse(fallback);
    expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues, null, 2)).toBe(true);
  });

  it("mentions the customer's own direction and avoids banned internal terms", () => {
    const fallback = buildFallbackDiagnosis(profile);
    expect(fallback.recommended_cut).toContain("个人 IP 咨询、AI 视频");
    expect(fallback.one_line_conclusion).toContain("放放");
    expect(findBannedTerms(fallback)).toEqual([]);
  });

  it("flags banned internal terms", () => {
    const fallback = buildFallbackDiagnosis(profile);
    const polluted = { ...fallback, main_judgement: "这份小报告使用了科学算命方法论。" };
    expect(findBannedTerms(polluted)).toEqual(expect.arrayContaining(["科学算命", "小报告"]));
  });
});
