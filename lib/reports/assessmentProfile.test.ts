import { describe, expect, it } from "vitest";
import { assertReportConsistency, type AssessmentProfile } from "./assessmentProfile";

const profile: AssessmentProfile = {
  id: "profile-1",
  tenant_id: "mianbajun",
  customer_name: "测试用户",
  survey_answers: {},
  value_profile: {
    liked_values: ["学习/进化", "家财万贯", "乐趣/冒险"],
    excluded_values: ["安稳度日", "被爱", "助人为乐"],
    like_summary: "持续学习、商业上行和变化感。",
    exclude_summary: "不靠安稳、讨好和陪伴换钱。",
    filter_sentence: "方向必须同时满足学习、商业上行和变化感。",
  },
  talent_answers: { 1: 4 },
  talent_profile: {
    mode: "original-sync",
    answer_distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0 },
    top_archetypes: [
      { key: "shaper", name: "Shaper", percentile: 94 },
      { key: "commander", name: "Commander", percentile: 88 },
    ],
    high_traits: [
      { key: "creative", name: "Creative", percentile: 78, band: "high" },
      { key: "leadership", name: "Leadership", percentile: 73, band: "high" },
    ],
    low_traits: [
      { key: "practical", name: "Practical", percentile: 12, band: "very_low" },
      { key: "humble", name: "Humble", percentile: 14, band: "very_low" },
    ],
  },
  created_at: "2026-06-30T00:00:00.000Z",
  updated_at: "2026-06-30T00:00:00.000Z",
};

describe("report consistency against assessment_profile", () => {
  it("passes when a report reuses the same value and talent profile", () => {
    const issues = assertReportConsistency(profile, {
      value_profile: profile.value_profile,
      talent_profile: profile.talent_profile,
    });

    expect(issues).toEqual([]);
  });

  it("detects value profile drift", () => {
    const issues = assertReportConsistency(profile, {
      value_profile: {
        ...profile.value_profile,
        liked_values: ["学习/进化", "被爱", "乐趣/冒险"],
      },
      talent_profile: profile.talent_profile,
    });

    expect(issues.map((issue) => issue.code)).toContain("value_liked_mismatch");
  });

  it("detects archetype and trait drift", () => {
    const issues = assertReportConsistency(profile, {
      value_profile: profile.value_profile,
      talent_profile: {
        ...profile.talent_profile,
        top_archetypes: [...profile.talent_profile.top_archetypes].reverse(),
        low_traits: profile.talent_profile.low_traits.slice(0, 1),
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual(["archetype_mismatch", "low_trait_mismatch"]);
  });
});
