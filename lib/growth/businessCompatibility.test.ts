import { describe, expect, it } from "vitest";
import {
  accountForBusinessGeneration,
  accountMatchesWorkspace,
  isBusinessCompatibleText,
  resolveAccountBusinessLine,
} from "./businessCompatibility";
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

  it("recognizes a legacy overseas account instead of defaulting it to executive", () => {
    const account = {
      id: "legacy-overseas",
      tenant_id: "mianbajun",
      persona: "expert",
      name: "面霸君 · 留学生求职老师",
      target_user: "准备回国求职的留学生",
      core_problem: "海外秋招和回国求职节奏脱节",
      account_value: "求职方向判断",
      trust_source: "真实秋招陪跑",
      not_doing: "不保Offer",
      hypotheses: [],
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
    } satisfies GrowthAccount;

    expect(resolveAccountBusinessLine(account)).toBe("overseas_student");
    const sanitized = accountForBusinessGeneration(account);
    expect(sanitized.business_line).toBe("overseas_student");
    // 历史缺少显式业务归属时仍可用于只读兼容展示，但不能自动进入正常工作区。
    expect(accountMatchesWorkspace(account, {
      accountId: account.id,
      businessLine: "overseas_student",
      persona: "expert",
    })).toBe(false);
    expect(accountMatchesWorkspace(account, {
      accountId: account.id,
      businessLine: "executive",
      persona: "expert",
    })).toBe(false);
  });

  it("replaces mixed core fields before generation", () => {
    const account = {
      id: "mixed",
      tenant_id: "mianbajun",
      business_line: "executive",
      persona: "buyer",
      name: "留学生家长",
      target_user: "准备秋招的留学生",
      core_problem: "孩子投递没回音",
      account_value: "Offer复盘",
      trust_source: "秋招陪跑",
      not_doing: "不保Offer",
      hypotheses: [],
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
    } satisfies GrowthAccount;
    const sanitized = accountForBusinessGeneration(account);
    expect(sanitized.name).toContain("转型中的中高管");
    expect(sanitized.target_user).toContain("中高管");
    expect(sanitized.core_problem).toContain("平台价值");
    expect(sanitized.trust_source).toContain("252题测评");
  });

  it("allows a user-created profile to generate inside its explicitly saved workspace", () => {
    const account = {
      id: "created-overseas",
      tenant_id: "mianbajun",
      owner_user_id: "user-1",
      business_line: "overseas_student",
      persona: "buyer",
      profile_name: "留学生本人号",
      profile_creation_request_id: "create-request-123",
      name: "留学生本人号",
      target_user: "准备回国求职的留学生",
      core_problem: "海外秋招和回国求职节奏脱节",
      account_value: "求职方向判断",
      trust_source: "真实秋招陪跑",
      // 早期模型补全遗留的冲突字段不应让已经明确归属的账号无法生成标题。
      one_liner: "34岁前中层裸辞找方向",
      not_doing: "不保Offer",
      hypotheses: [],
      created_at: "2026-07-30T00:00:00.000Z",
      updated_at: "2026-07-30T00:00:00.000Z",
    } satisfies GrowthAccount;

    expect(accountMatchesWorkspace(account, {
      accountId: account.id,
      businessLine: "overseas_student",
      persona: "buyer",
    })).toBe(true);
    expect(accountMatchesWorkspace(account, {
      accountId: account.id,
      businessLine: "executive",
      persona: "buyer",
    })).toBe(false);
    expect(accountMatchesWorkspace(account, {
      accountId: account.id,
      businessLine: "overseas_student",
      persona: "expert",
    })).toBe(false);
  });

  it("still blocks conflicting legacy profiles that were not explicitly created in this workspace", () => {
    const account = {
      id: "legacy-conflict",
      tenant_id: "mianbajun",
      business_line: "overseas_student",
      persona: "buyer",
      name: "中高管裸辞记录",
      target_user: "正在转型的中高管",
      core_problem: "职业决策",
      account_value: "方向判断",
      trust_source: "亲历",
      not_doing: "不承诺结果",
      hypotheses: [],
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:00.000Z",
    } satisfies GrowthAccount;

    expect(accountMatchesWorkspace(account, {
      accountId: account.id,
      businessLine: "overseas_student",
      persona: "buyer",
    })).toBe(false);
  });
});
