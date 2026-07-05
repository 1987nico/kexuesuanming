import { describe, expect, it } from "vitest";
import { assertReportConsistency, type AssessmentProfile } from "./assessmentProfile";
import { buildDeepReport, buildLiteReport } from "./builders";
import type { DeepReportGenerated } from "./deepReport";
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

const generatedDeep: DeepReportGenerated = {
  generated_at: "2026-06-30T01:00:00.000Z",
  provider: "doubao",
  model: "doubao-seed-2-1-turbo-260628",
  market_disclaimer: "本节市场分析由 AI 生成，需人工核实真实来源。",
  sensory_from_input: true,
  conclusion_first: { 一句话结论: "先做高客单职业决策诊断的最小验证。", 最终建议: "以判断为核心产品，不卖无限执行。" },
  directions: [
    { 方向: "高客单职业决策诊断", 理由: "组合表达与结构化判断。", 契合价值观: "持续学习、判断被看见。", 排除带护栏: "不做无边界陪跑。" },
  ],
  sensory: { 说明: "采用客户真实打分。", 达标方向: ["高客单职业决策诊断"] },
  market_overview: [
    {
      序号: 1,
      方向: "高客单职业决策诊断",
      五力现状: 58,
      五力未来: 64,
      Δ: 6,
      机会现状: 6.8,
      机会未来: 7,
      合计: 13.8,
      Step4判断: "进入",
    },
  ],
  market: [
    { 方向: "高客单职业决策诊断", 机会判断: "深度决策产品稀缺。", 待核实提示: "行业规模数据待核实。" },
  ],
  vrin: [
    { 方向: "高客单职业决策诊断", 价值V: "高", 稀缺R: "较高", 难模仿I: "较高", 难替代N: "中", 综合胜算: "Top1", 盲点: "线索获取。" },
  ],
  premortem: [
    { 方向: "高客单职业决策诊断", 失败剧本: "交付过重、线索不足。", 早期预警信号: ["连续两周无有效咨询"], 止损线: "连续 6 周无付费试点即暂停。", 对策: ["固定诊断清单"] },
  ],
  final_recommendations: { 主线: "高客单职业决策诊断", 切口: "窄人群诊断", 暗线: "内容沉淀信任", 与小报告的关系: "与小报告初筛一致，进一步收敛。" },
  ninety_day_plan: { 第0到30天: "访谈 10 人。", 第30到60天: "3 个诊断样本。", 第60到90天: "转 3-5 个付费试点。", 止损线: "无付费即暂停。" },
  final_judgement: { 判断: "方向成立，但需先验证付费意愿。" },
};

describe("report builders", () => {
  it("builds a fangfang-style lite report with all required sections", () => {
    const report = buildLiteReport(profile);

    expect(Object.keys(report.sections)).toEqual([...LITE_REPORT_SECTIONS]);
    expect(report.sections.current_problem).toMatchObject({
      customer_input: {
        current_decision: "创业",
        time_window: "3个月内",
      },
    });
    expect(report.sections.data_appendix).toMatchObject({
      mode: "local",
      answer_distribution: profile.talent_profile.answer_distribution,
    });
    expect(assertReportConsistency(profile, report.profile_reference)).toEqual([]);
  });

  it("uses survey desired and avoided directions in the lite report recommendation", () => {
    const report = buildLiteReport({
      ...profile,
      survey_answers: {
        ...profile.survey_answers,
        desired_direction: "个人 IP 咨询、AI 视频",
        avoid_direction: "低价代运营",
      },
    });

    expect(report.sections.direction_suggestion).toMatchObject({
      main_cut: "先围绕「个人 IP 咨询、AI 视频」做最小验证，不直接重投入。",
      not_recommended_forms: expect.arrayContaining(["低价代运营"]),
      direction_hypothesis: "先做一个围绕「个人 IP 咨询、AI 视频」的窄版诊断/试点产品，验证是否有人愿意为判断和方案付费。",
    });
  });

  it("builds a deep report skeleton (pending) that reuses the same assessment_profile", () => {
    const report = buildDeepReport(profile);

    expect(Object.keys(report.sections)).toEqual([...DEEP_REPORT_SECTIONS]);
    expect(report.sections.step1_value_profile).toMatchObject({
      喜欢区: profile.value_profile.liked_values,
      排除带: profile.value_profile.excluded_values,
    });
    // 未生成内容时，各步应为待生成占位
    expect(report.sections.step2_direction_expansion).toMatchObject({
      提示: expect.stringContaining("尚未生成"),
    });
    expect(assertReportConsistency(profile, report.profile_reference)).toEqual([]);
  });

  it("fills deep report steps from generated content and stays consistent", () => {
    const report = buildDeepReport(profile, generatedDeep);

    expect(Object.keys(report.sections)).toEqual([...DEEP_REPORT_SECTIONS]);
    expect(report.sections.step2_direction_expansion).toMatchObject({
      候选方向: generatedDeep.directions,
    });
    expect(report.sections.step4_market_analysis).toMatchObject({
      免责声明: generatedDeep.market_disclaimer,
      市场总览: generatedDeep.market_overview,
      各方向市场判断: generatedDeep.market,
    });
    expect(report.sections.final_recommendations).toMatchObject({
      主线: "高客单职业决策诊断",
    });
    expect(report.sections.step3_sensory_validation).toMatchObject({
      数据来源: "客户本人真实感性验证（方向滑卡点亮）",
    });
    expect(assertReportConsistency(profile, report.profile_reference)).toEqual([]);
  });

  it("prefers profile.deep_report when no explicit generated content is passed", () => {
    const report = buildDeepReport({ ...profile, deep_report: generatedDeep });
    expect(report.sections.final_judgement).toMatchObject({ 判断: generatedDeep.final_judgement["判断"] });
  });
});
