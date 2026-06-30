import { describe, expect, it } from "vitest";
import {
  DEEP_REPORT_SECTIONS,
  LITE_REPORT_SECTIONS,
  missingDeepReportSections,
  missingLiteReportSections,
} from "./reportShapes";

describe("report target shapes", () => {
  it("locks the fangfang-style lite report to 12 sections", () => {
    expect(LITE_REPORT_SECTIONS).toEqual([
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
    ]);
  });

  it("locks the nianxue-style deep report to the six-step report sections", () => {
    expect(DEEP_REPORT_SECTIONS).toContain("step4_market_analysis");
    expect(DEEP_REPORT_SECTIONS).toContain("step6_premortem");
    expect(DEEP_REPORT_SECTIONS).toHaveLength(11);
  });

  it("detects missing sections", () => {
    expect(missingLiteReportSections({ kind: "lite", sections: {} as any })).toEqual(LITE_REPORT_SECTIONS);
    expect(missingDeepReportSections({ kind: "deep", sections: {} as any })).toEqual(DEEP_REPORT_SECTIONS);
  });
});
