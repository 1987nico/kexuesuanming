import { describe, expect, it } from "vitest";
import { accountForBusinessGeneration, isBusinessCompatibleText } from "./businessCompatibility";
import type { GrowthAccount } from "./types";

describe("business compatibility", () => {
  it("hides overseas-student remnants from the executive workspace", () => {
    expect(isBusinessCompatibleText("在C类留学生家长帖子里写孩子求职", "executive")).toBe(false);
    expect(isBusinessCompatibleText("美国Top30硕士投递50份，只拿到2个Offer", "executive")).toBe(false);
    expect(isBusinessCompatibleText("34岁前中层，正在比较创业和体制内", "executive")).toBe(true);
  });

  it("hides executive remnants from the overseas-student workspace", () => {
    expect(isBusinessCompatibleText("记录中高管裸辞后的职业决策", "overseas_student")).toBe(false);
    expect(isBusinessCompatibleText("留学生回国求职的真实复盘", "overseas_student")).toBe(true);
  });

  it("sanitizes generation context without mutating the stored account", () => {
    const account = {
      id: "a1",
      tenant_id: "mianbajun",
      business_line: "executive",
      persona: "buyer",
      name: "面霸君",
      target_user: "中高管",
      core_problem: "转型决策",
      account_value: "真实记录",
      trust_source: "亲历",
      not_doing: "不承诺结果",
      hypotheses: [],
      persona_specific: {
        identity: "34岁前中层",
        bridge: "在留学生家长帖子里写孩子求职",
      },
      content_directions: ["中高管真实复盘", "留学生家长Offer转折帖"],
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
    } satisfies GrowthAccount;

    const sanitized = accountForBusinessGeneration(account);
    expect(sanitized.persona_specific?.bridge).toBe("");
    expect(sanitized.persona_specific?.identity).toBe("34岁前中层");
    expect(sanitized.content_directions).toEqual(["中高管真实复盘"]);
    expect(account.persona_specific?.bridge).toContain("留学生家长");
  });
});
