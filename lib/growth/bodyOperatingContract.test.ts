import { describe, expect, test } from "vitest";
import { compileBodyOperatingContract, formatBodyOperatingContract } from "./bodyOperatingContract";
import type { GrowthAccount, GrowthPersona, TopicCandidate } from "./types";

function account(persona: GrowthPersona, personaSpecific: Record<string, string> = {}) {
  return {
    id: `${persona}-account`, tenant_id: "tenant", business_line: "executive", persona,
    name: `${persona} account`, one_liner: `${persona} 的职业决策账号`,
    target_user: "正在重新判断方向的中高管", core_problem: "方向太多",
    account_value: "提供可执行判断", trust_source: "公开依据", not_doing: "不保结果",
    hypotheses: [], persona_specific: personaSpecific,
    created_at: "2026-08-02T00:00:00.000Z", updated_at: "2026-08-02T00:00:00.000Z",
  } as GrowthAccount;
}

function topic(title: string, promise = "完整兑现标题承诺") {
  return {
    id: "topic", method_group: "native", method_id: "human_pain", method_label: "行业人性痛点",
    generation_mode: "default", title, title_promise: promise,
    target_user: "正在转型的中高管", pain: "方向选择", hook: title,
    follow_reason: "真实判断", test_variable: "有效咨询", expected_signal: "有效咨询",
  } as TopicCandidate;
}

describe("body operating contract v4", () => {
  test("buyer compiles resonance and a soft single action", () => {
    const contract = compileBodyOperatingContract(
      account("buyer", { identity: "34岁裸辞中层" }),
      topic("当了总监，为什么更不敢离职"),
    );
    expect(contract.contract_version).toBe("v4_0");
    expect(contract.content_intent).toBe("buyer_resonance");
    expect(contract.speaker_identity).toContain("34岁");
    expect(contract.primary_action).toContain("当前卡点");
  });

  test("expert compiles category comparison with public evidence", () => {
    const contract = compileBodyOperatingContract(
      account("expert", { comparison_scope: "机构、个人顾问和标准课程" }),
      topic("职业咨询、课程还是自己试，怎么选"),
    );
    expect(contract.content_intent).toBe("expert_category_comparison");
    expect(contract.comparison_scope).toContain("机构");
    expect(contract.evidence_mode).toBe("public_sources");
  });

  test("merchant binds one configured sku", () => {
    const contract = compileBodyOperatingContract(
      account("merchant", { main_offer: "199元初步诊断", conversion_goal: "站内购买诊断" }),
      topic("199元职业诊断到底交付什么"),
    );
    expect(contract.content_intent).toBe("merchant_sku_sale");
    expect(contract.active_sku).toBe("199元初步诊断");
    expect(contract.primary_action).toBe("站内购买诊断");
    expect(formatBodyOperatingContract(contract)).toContain("唯一承接动作");
  });
});
