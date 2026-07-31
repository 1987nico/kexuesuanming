import { describe, expect, test } from "vitest";
import {
  contentUsePolicyFor,
  perspectiveContractFor,
  perspectivePromptContract,
} from "./perspectiveStrategy";
import type { GrowthAccount, GrowthPersona } from "./types";

function account(persona: GrowthPersona, personaSpecific: Record<string, string>): GrowthAccount {
  return {
    id: `${persona}-account`,
    tenant_id: "tenant",
    owner_user_id: "owner",
    business_line: "executive",
    persona,
    profile_name: `${persona} profile`,
    name: `${persona} account`,
    target_user: "正在重新判断方向的中高管",
    core_problem: "候选方向多，但缺少现实验证",
    account_value: "提供可执行判断",
    trust_source: "公开流程与匿名交付样例",
    not_doing: "不承诺确定结果",
    hypotheses: [],
    persona_specific: personaSpecific,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  };
}

describe("perspective generation contract", () => {
  test("merchant binds one configured SKU, commercial terms and one CTA", () => {
    const contract = perspectiveContractFor(account("merchant", {
      main_offer: "199元方向初步诊断",
      price_band: "199元",
      payment_method: "一次性付款",
      sku_delivery: "测评、岗位地图和一次人工解读",
      service_promise: "先判断适配，再决定是否购买",
      promise_conditions: "不包含保录、保薪资或确定上岸",
      conversion_goal: "购买站内诊断",
    }));

    expect(contract.required_elements.join(" ")).toContain("199元方向初步诊断");
    expect(contract.allowed_elements.join(" ")).toContain("一次性付款");
    expect(contract.required_elements.join(" ")).toContain("购买站内诊断");
    expect(contract.prohibited_elements.join(" ")).toContain("第二个SKU");
  });

  test("expert opens configured brand comparison but requires common criteria and evidence", () => {
    const contract = perspectiveContractFor(account("expert", {
      comparison_scope: "机构服务、个人专家和标准课程",
      comparison_brands: "品牌A、品牌B",
      comparison_criteria: "适用对象、交付深度、价格和验证方式",
      comparison_sources: "公开官网与产品页",
      interest_disclosure: "与被比较品牌无直接利益关系",
    }));

    expect(contract.allowed_elements.join(" ")).toContain("品牌A、品牌B");
    expect(contract.required_elements.join(" ")).toContain("适用对象");
    expect(contract.required_elements.join(" ")).toContain("公开官网与产品页");
    expect(contract.prohibited_elements.join(" ")).toContain("传闻");
  });

  test("buyer training simulation stays vivid but cannot enter as fake testimony", () => {
    const contract = perspectiveContractFor(account("buyer", {
      identity: "34岁前中层，正在验证转型方向",
      case_mode: "内部培训模拟",
      case_material: "周一晚上在餐桌前对着两份岗位JD争论",
      original_attempt: "列了十几个方向并反复搜索",
      intervention_action: "把能力证据、市场机会和失败成本拆开",
      stage_result: "先排除一条低胜率方向",
    }));

    expect(contract.required_elements.join(" ")).toContain("餐桌前");
    expect(contract.allowed_elements.join(" ")).toContain("内部培训模拟案例，禁止对外发布");
    expect(contract.prohibited_elements.join(" ")).toContain("不得编造真实品牌Offer");
  });

  test("prompt contract exposes the strategy to title, body and review agents", () => {
    const prompt = perspectivePromptContract(account("merchant", {
      main_offer: "深度决策报告",
      conversion_goal: "购买深度服务",
    }));

    expect(prompt).toContain("当前视角内容任务");
    expect(prompt).toContain("深度决策报告");
    expect(prompt).toContain("购买深度服务");
    expect(prompt).toContain("复盘优先观察");
  });

  test("internal-training buyer content is blocked from publication and learning", () => {
    const policy = contentUsePolicyFor(account("buyer", {
      case_mode: "内部培训模拟",
    }));

    expect(policy.mode).toBe("internal_training");
    expect(policy.publishEligible).toBe(false);
    expect(policy.requiredMarker).toContain("禁止对外发布");
  });

  test("ordinary production personas remain publishable", () => {
    const policy = contentUsePolicyFor(account("merchant", {
      main_offer: "199元初步诊断",
    }));

    expect(policy.mode).toBe("production");
    expect(policy.publishEligible).toBe(true);
    expect(policy.requiredMarker).toBeUndefined();
  });
});
