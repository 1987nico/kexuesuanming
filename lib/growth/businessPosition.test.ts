import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_POSITIONS,
  businessPositionsFromSettings,
  resolveBusinessPosition,
} from "./businessPosition";

describe("business mother positioning", () => {
  it("keeps the two business positions independent", () => {
    const positions = businessPositionsFromSettings({
      business_positions: {
        executive: {
          ...DEFAULT_BUSINESS_POSITIONS.executive,
          main_offer: "新的中高管服务",
        },
      },
    });

    expect(positions.executive.main_offer).toBe("新的中高管服务");
    expect(positions.overseas_student.main_offer).toBe(
      DEFAULT_BUSINESS_POSITIONS.overseas_student.main_offer,
    );
  });

  it("merges a stored legacy partial position with all detailed defaults", () => {
    const position = resolveBusinessPosition(
      {
        business_positions: {
          overseas_student: {
            ...DEFAULT_BUSINESS_POSITIONS.overseas_student,
            target_user: "新的留学生目标人群",
          },
        },
      },
      "overseas_student",
    );

    expect(position.target_user).toBe("新的留学生目标人群");
    expect(position.core_problem).toBeTruthy();
    expect(position.compliance_redline).toBeTruthy();
  });

  it("reads mother positions saved under the pre-v3.2 business keys", () => {
    const legacySettings = {
      business_positions: {
        "executive-career": {
          ...DEFAULT_BUSINESS_POSITIONS.executive,
          main_offer: "上线前保存的中高管服务",
        },
      },
    } as never;

    expect(resolveBusinessPosition(legacySettings, "executive").main_offer).toBe(
      "上线前保存的中高管服务",
    );
  });
});
