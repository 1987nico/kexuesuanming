import { describe, expect, it } from "vitest";
import { assertReportConsistency, type AssessmentProfile } from "./assessmentProfile";
import { buildDeepReport, buildLiteReport } from "./builders";
import type { DeepReportInputs } from "./deepReportInputs";
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

const deepInputs: DeepReportInputs = {
  direction_expansion: [
    {
      name: "高客单职业决策诊断",
      rationale: "把表达、判断和结构化咨询能力组合成可售卖服务。",
      value_fit: "满足持续学习和个人判断被看见。",
      excluded_value_guardrail: "不做无边界陪跑。",
    },
  ],
  sensory_scores: [
    { direction: "高客单职业决策诊断", score: 9, reason: "想到真实客户访谈会兴奋。" },
    { direction: "低价简历代改", score: 5, reason: "执行感强但长期消耗。" },
  ],
  market_evidence: [
    {
      direction: "高客单职业决策诊断",
      opportunity_score: 8,
      pest: {
        political: ["就业政策鼓励灵活就业与职业技能提升。"],
        economic: ["中产家庭愿意为关键职业转折付费。"],
        social: ["35岁转型焦虑带来持续咨询需求。"],
        technological: ["AI 降低资料整理成本，但提高判断差异化价值。"],
      },
      five_forces: {
        rivalry: ["泛职业咨询竞争者多，但深度决策产品稀缺。"],
        new_entrants: ["低门槛入局会拉低低价市场信任。"],
        substitutes: ["免费内容和 AI 问答可替代浅层建议。"],
        supplier_power: ["高质量案例和访谈样本是核心供给约束。"],
        buyer_power: ["客户会用结果确定性压价，需要明确交付边界。"],
      },
      external_facts: [{ source: "访谈样本", finding: "3 位转型客户都愿意为明确止损线付费。" }],
    },
  ],
  vrin_scores: [
    {
      direction: "高客单职业决策诊断",
      value: 9,
      rarity: 8,
      imitability: 8,
      non_substitutability: 7,
      evidence: ["既能共情焦虑，也能建立验证框架。"],
    },
    {
      direction: "组织人才盘点工作坊",
      value: 8,
      rarity: 7,
      imitability: 7,
      non_substitutability: 7,
      evidence: ["可复用咨询框架，但 B 端成交周期较长。"],
    },
    {
      direction: "个人 IP 内容产品",
      value: 7,
      rarity: 7,
      imitability: 6,
      non_substitutability: 6,
      evidence: ["表达优势明显，变现需要长期内容资产。"],
    },
    {
      direction: "低价简历代改",
      value: 4,
      rarity: 3,
      imitability: 2,
      non_substitutability: 2,
      evidence: ["容易被模板和 AI 工具替代。"],
    },
  ],
  premortem: [
    {
      direction: "高客单职业决策诊断",
      failure_story: "12个月后输在交付过重、线索不足、案例没有沉淀。",
      likely_causes: ["每单定制过多", "内容获客节奏不稳定", "没有设置筛选门槛"],
      early_signals: ["连续两周无有效咨询", "交付时长超过报价假设", "客户只问情绪安慰"],
      stop_loss_line: "连续 6 周没有付费试点或单案毛利低于 50% 即暂停。",
      countermeasures: ["固定诊断清单", "每周发布 2 篇案例复盘", "预筛客户问题和预算"],
    },
  ],
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
    expect(report.sections.step3_sensory_validation).toMatchObject({
      placeholder: "后续接入多轮感性打分文档。",
    });
    expect(assertReportConsistency(profile, report.profile_reference)).toEqual([]);
  });

  it("fills nianxue-style deep report steps from structured inputs", () => {
    const report = buildDeepReport(profile, deepInputs);

    expect(report.sections.step4_market_analysis).toMatchObject({
      market_evidence: [
        {
          pest: {
            political: ["就业政策鼓励灵活就业与职业技能提升。"],
            economic: ["中产家庭愿意为关键职业转折付费。"],
            social: ["35岁转型焦虑带来持续咨询需求。"],
            technological: ["AI 降低资料整理成本，但提高判断差异化价值。"],
          },
          five_forces: {
            rivalry: ["泛职业咨询竞争者多，但深度决策产品稀缺。"],
          },
          external_facts: [{ source: "访谈样本", finding: "3 位转型客户都愿意为明确止损线付费。" }],
        },
      ],
    });
    expect(report.sections.step5_vrin).toMatchObject({
      top3: [
        { direction: "高客单职业决策诊断", total: 32 },
        { direction: "组织人才盘点工作坊", total: 29 },
        { direction: "个人 IP 内容产品", total: 26 },
      ],
    });
    expect(report.sections.step6_premortem).toMatchObject({
      scenarios: [
        {
          failure_story: "12个月后输在交付过重、线索不足、案例没有沉淀。",
          early_signals: ["连续两周无有效咨询", "交付时长超过报价假设", "客户只问情绪安慰"],
          stop_loss_line: "连续 6 周没有付费试点或单案毛利低于 50% 即暂停。",
        },
      ],
    });
  });
});
