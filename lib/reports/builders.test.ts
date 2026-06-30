import { describe, expect, it } from "vitest";
import { assertReportConsistency, type AssessmentProfile } from "./assessmentProfile";
import { buildDeepReport, buildLiteReport } from "./builders";
import { DEEP_REPORT_SECTIONS, LITE_REPORT_SECTIONS } from "./reportShapes";

const profile: AssessmentProfile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tenant_id: "mianbajun",
  customer_name: "放放",
  survey_answers: { decision: "创业", time_window: "3个月内" },
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
    answer_distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 1, 7: 1 },
    top_archetypes: [
      { key: "individualist", name: "独立者", percentile: 94 },
      { key: "entertainer", name: "活跃表达者", percentile: 88 },
    ],
    high_traits: [
      { key: "creative", name: "创造性", percentile: 78, band: "high" },
      { key: "leadership", name: "领导倾向", percentile: 73, band: "high" },
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

describe("report builders", () => {
  it("builds a fangfang-style lite report with all required sections", () => {
    const report = buildLiteReport(profile);

    expect(Object.keys(report.sections)).toEqual([...LITE_REPORT_SECTIONS]);
    expect(report.sections.data_appendix).toMatchObject({
      mode: "local",
      answer_distribution: profile.talent_profile.answer_distribution,
    });
    expect(assertReportConsistency(profile, report.profile_reference)).toEqual([]);
  });

  it("builds a nianxue-style deep report that reuses the same assessment_profile", () => {
    const report = buildDeepReport(profile);

    expect(Object.keys(report.sections)).toEqual([...DEEP_REPORT_SECTIONS]);
    expect(report.sections.step1_value_profile).toMatchObject({
      liked_values: profile.value_profile.liked_values,
      excluded_values: profile.value_profile.excluded_values,
    });
    expect(report.sections.step5_vrin).toMatchObject({
      talent_reuse: profile.talent_profile.high_traits,
    });
    expect(assertReportConsistency(profile, report.profile_reference)).toEqual([]);
  });
});
