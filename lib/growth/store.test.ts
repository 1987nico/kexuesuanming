import { describe, expect, it } from "vitest";
import { inferGrowthBusinessLine } from "./store";
import type { GrowthAccount } from "./types";

function legacyAccount(overrides: Partial<GrowthAccount>): GrowthAccount {
  return {
    id: "legacy-account",
    tenant_id: "mianbajun",
    persona: "buyer",
    name: "面霸君",
    target_user: "",
    core_problem: "",
    account_value: "",
    trust_source: "",
    not_doing: "",
    hypotheses: [],
    created_at: "2026-07-19T00:00:00.000Z",
    updated_at: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("inferGrowthBusinessLine", () => {
  it("识别没有 business_line 的留学生历史人设", () => {
    expect(inferGrowthBusinessLine(legacyAccount({
      name: "面霸君 · 留学生求职老师",
      target_user: "准备回国求职和海外秋招的留学生",
    }))).toBe("overseas_student");
  });

  it("识别没有 business_line 的中高管历史人设", () => {
    expect(inferGrowthBusinessLine(legacyAccount({
      name: "面霸君 · 职业决策顾问",
      core_problem: "中高管职业与事业方向选择",
    }))).toBe("executive");
  });

  it("优先使用新数据的显式业务字段", () => {
    expect(inferGrowthBusinessLine(legacyAccount({
      business_line: "executive",
      target_user: "留学生",
    }))).toBe("executive");
  });
});
