import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_POSITIONS,
  businessPositionsFromSettings,
  resolveAccountBusinessTrack,
} from "./businessPosition";

describe("business positioning", () => {
  it("keeps legacy executive accounts in the executive workspace", () => {
    expect(
      resolveAccountBusinessTrack({
        name: "34岁前中层转型记录",
        target_user: "准备裸辞的中高管",
        core_problem: "离开平台后不知道下一步",
      }),
    ).toBe("executive-career");
  });

  it("recognizes the previous student buyer account before the track field existed", () => {
    expect(
      resolveAccountBusinessTrack({
        name: "留学生家长求职记录",
        target_user: "准备海外秋招的留学生家长",
        core_problem: "不知道招聘节奏",
        persona_specific: { case_mode: "情景演绎" },
      }),
    ).toBe("international-student-career");
  });

  it("merges editable mother-position fields without losing persona profiles", () => {
    const positions = businessPositionsFromSettings({
      business_positions: {
        "international-student-career": {
          ...DEFAULT_BUSINESS_POSITIONS["international-student-career"],
          main_offer: "定制求职陪跑",
        },
      },
    });
    expect(positions["international-student-career"].main_offer).toBe("定制求职陪跑");
    expect(positions["international-student-career"].persona_profiles.buyer.label).toBe(
      "留学生家长",
    );
  });
});
