export const LITE_REPORT_SECTIONS = [
  "cover",
  "core_diagnosis",
  "current_problem",
  "value_profile",
  "talent_archetype",
  "work_behavior",
  "direction_suggestion",
  "ninety_day_validation",
  "risk_compensation",
  "diagnosis_boundary",
  "next_decision",
  "data_appendix",
] as const;

export const DEEP_REPORT_SECTIONS = [
  "conclusion_first",
  "methodology",
  "step1_value_profile",
  "step2_direction_expansion",
  "step3_sensory_validation",
  "step4_market_analysis",
  "step5_vrin",
  "step6_premortem",
  "final_recommendations",
  "ninety_day_plan",
  "final_judgement",
] as const;

export type LiteReportSection = (typeof LITE_REPORT_SECTIONS)[number];
export type DeepReportSection = (typeof DEEP_REPORT_SECTIONS)[number];

export interface LiteReportShape {
  kind: "lite";
  sections: Record<LiteReportSection, unknown>;
}

export interface DeepReportShape {
  kind: "deep";
  sections: Record<DeepReportSection, unknown>;
}

export function missingLiteReportSections(report: Partial<LiteReportShape>) {
  const sections = report.sections || {};
  return LITE_REPORT_SECTIONS.filter((section) => !(section in sections));
}

export function missingDeepReportSections(report: Partial<DeepReportShape>) {
  const sections = report.sections || {};
  return DEEP_REPORT_SECTIONS.filter((section) => !(section in sections));
}
