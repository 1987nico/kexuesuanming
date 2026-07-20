import type { AssessmentProfile, ReportProfileReference } from "./assessmentProfile";
import type { DeepReportGenerated } from "./deepReport";
import { DEEP_REPORT_SECTIONS, LITE_REPORT_SECTIONS, type DeepReportShape, type LiteReportShape } from "./reportShapes";

function topNames(items: Array<{ name: string; percentile?: number }>, limit = 3) {
  return items
    .slice(0, limit)
    .map((item) => (typeof item.percentile === "number" ? `${item.name} ${item.percentile}` : item.name));
}

function strongestTalentSentence(profile: AssessmentProfile) {
  const topArchetype = profile.talent_profile.top_archetypes[0];
  const highTraits = profile.talent_profile.high_traits.slice(0, 3).map((trait) => trait.name).join("、");
  if (!topArchetype) return "当前天赋信号需要结合完整报告继续解释。";
  return `主原型更接近「${topArchetype.name}」。高分特质集中在：${highTraits || "待补充"}。`;
}

function weakestTalentSentence(profile: AssessmentProfile) {
  const lowTraits = profile.talent_profile.low_traits.slice(0, 3).map((trait) => trait.name).join("、");
  return lowTraits ? `最需要补偿的特质包括：${lowTraits}。` : "低分特质需要结合具体场景解释。";
}

function readSurveyText(profile: AssessmentProfile, keys: string[], fallback = "未填写") {
  for (const key of keys) {
    const value = profile.survey_answers[key];
    if (Array.isArray(value) && value.length > 0) return value.join("、");
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

export function buildLiteCustomerInput(profile: AssessmentProfile) {
  return {
    current_decision: readSurveyText(profile, ["decision_type", "current_decision", "decision", "正在考虑的选择", "当前决策"]),
    time_window: readSurveyText(profile, ["decision_timing", "time_window", "decision_window", "决策时间窗口", "时间窗口"]),
    stuck_point: readSurveyText(profile, ["stuck_point", "pain", "career_confusion", "卡点", "当前最主要的职业或事业困惑"]),
    energy_source: readSurveyText(profile, ["energy_source", "energizing_work", "能量来源"]),
    avoid_state: readSurveyText(profile, ["avoid_state", "想避开的状态"]),
    transferable_assets: readSurveyText(profile, ["transferable_asset", "transferable_assets", "assets", "可迁移资产"]),
    desired_direction: readSurveyText(profile, ["interested_direction", "desired_direction", "toward", "想靠近的方向", "正在考虑的方向"]),
    avoid_direction: readSurveyText(profile, ["excluded_direction", "avoid_direction", "avoid", "明确不碰的方向"]),
  };
}

function buildLiteConsultantView(profile: AssessmentProfile) {
  const input = buildLiteCustomerInput(profile);
  const desired =
    input.desired_direction !== "未填写"
      ? `「${input.desired_direction}」可以进入验证，但必须先拆成小切口。`
      : "候选方向需要先补充，再进入验证。";
  const avoid =
    input.avoid_direction !== "未填写"
      ? `同时要避开「${input.avoid_direction}」，否则容易滑向长期消耗。`
      : `同时要避开排除带：${profile.value_profile.exclude_summary}。`;
  return `${profile.customer_name} 表面上在问「${input.current_decision}」，底层是在问：我适合靠什么形成可持续个人价值。${desired}${avoid} 这次初筛的重点不是鼓励马上投入，而是先把值得验证的方向和必须避开的风险说清楚。`;
}

function buildLiteDirectionSuggestion(profile: AssessmentProfile) {
  const input = buildLiteCustomerInput(profile);
  const mainCut =
    input.desired_direction !== "未填写"
      ? `先围绕「${input.desired_direction}」做最小验证，不直接重投入。`
      : "先补齐候选方向，再结合履历、资源和真实市场反馈收敛主切口。";
  return {
    main_cut: mainCut,
    suitable_forms: [
      "高客单诊断：先卖判断，不卖无限执行。",
      "小样本试点：用真实客户反馈验证付费意愿。",
      "方法论产品：把判断框架沉淀成模板、清单和案例。",
      "90天验证服务：只承诺验证路径和复盘，不承诺结果。",
    ],
    not_recommended_forms: [
      input.avoid_direction !== "未填写" ? input.avoid_direction : "低价纯执行",
      "无边界陪跑",
      "只靠测评结论做重大决策",
      "过早扩团队或重投入",
    ],
    direction_hypothesis:
      input.desired_direction !== "未填写"
        ? `先做一个围绕「${input.desired_direction}」的窄版诊断/试点产品，验证是否有人愿意为判断和方案付费。`
        : "先产出 2-3 个方向假设，再用访谈和付费试点验证。",
  };
}

export function buildReportProfileReference(profile: AssessmentProfile): ReportProfileReference {
  return {
    value_profile: profile.value_profile,
    talent_profile: {
      mode: profile.talent_profile.mode,
      top_archetypes: profile.talent_profile.top_archetypes,
      high_traits: profile.talent_profile.high_traits,
      low_traits: profile.talent_profile.low_traits,
    },
  };
}

export function buildLiteReport(profile: AssessmentProfile): LiteReportShape & { profile_reference: ReportProfileReference } {
  const customerInput = buildLiteCustomerInput(profile);
  const sections: LiteReportShape["sections"] = {
    cover: {
      title: "初步诊断报告",
      subtitle: "基于方向输入、价值观双三圈与天赋测评的初步判断",
      customer_name: profile.customer_name,
      delivery_date: new Date().toISOString().slice(0, 10),
      conclusion: `${profile.customer_name} 的初步方向判断需要同时满足：${profile.value_profile.filter_sentence}`,
      badges: ["初步诊断", "方向初筛", "252题完整", "保密交付"],
    },
    core_diagnosis: {
      main_judgement: `这不是单纯“适合什么职业”的问题，而是要把方向拆成可验证的小切口。${strongestTalentSentence(profile)}`,
      initial_direction: "进入候选池的方向必须承载价值观喜欢区，并避开排除带中的长期消耗。",
      biggest_risk: weakestTalentSentence(profile),
      next_action: "用 90 天做小样本验证：访谈、试点、付费转化、复盘。",
    },
    current_problem: {
      customer_input: customerInput,
      consultant_view: buildLiteConsultantView(profile),
    },
    value_profile: {
      liked_values: profile.value_profile.liked_values,
      excluded_values: profile.value_profile.excluded_values,
      like_summary: profile.value_profile.like_summary,
      exclude_summary: profile.value_profile.exclude_summary,
      filter_sentence: profile.value_profile.filter_sentence,
    },
    talent_archetype: {
      mode: profile.talent_profile.mode,
      top_archetypes: topNames(profile.talent_profile.top_archetypes, 6),
      three_signals: topNames(profile.talent_profile.high_traits, 3),
      career_translation: "这组信号用于判断什么样的工作方式更像优势入口，而不是直接决定职业答案。",
      evidence: profile.talent_profile.evidence,
    },
    work_behavior: {
      thinking: profile.talent_profile.high_traits.slice(0, 2),
      interpersonal: profile.talent_profile.high_traits.slice(2, 4),
      self_drive: profile.talent_profile.high_traits.slice(4, 6),
      key_traits: [...profile.talent_profile.high_traits, ...profile.talent_profile.low_traits],
    },
    direction_suggestion: buildLiteDirectionSuggestion(profile),
    ninety_day_validation: {
      weeks_1_2: "锁定一个窄人群，访谈 10 人，记录真实付费问题。",
      weeks_3_4: "做 3 个诊断样本，产出前后对比。",
      weeks_5_8: "转成 3-5 个付费试点，只交付明确边界。",
      weeks_9_12: "标准化模板、报价和止损线。",
    },
    risk_compensation: {
      strongest: topNames(profile.talent_profile.high_traits, 6),
      needs_compensation: topNames(profile.talent_profile.low_traits, 6),
      system: ["固定交付清单", "目标客户与付费理由表", "每周复盘", "外部反证检查"],
    },
    diagnosis_boundary: {
      completed: "方向初筛、价值观边界、天赋信号、优势组合、风险提醒和 90 天验证框架。",
      not_completed: "不能直接替代完整决策，还需要履历、资源、现金流、客户证据和执行约束。",
    },
    next_decision: {
      missing_information: ["真实履历", "项目经历", "现金流约束", "候选方向评分矩阵", "首批客户路径"],
      next_question: "哪条路径先验证、怎么卖、怎么执行、什么时候止损。",
    },
    data_appendix: {
      mode: profile.talent_profile.mode,
      answer_distribution: profile.talent_profile.answer_distribution,
      evidence: profile.talent_profile.evidence,
      data_integrity: `客户：${profile.customer_name}；252题完整。`,
    },
  };

  return { kind: "lite", sections, profile_reference: buildReportProfileReference(profile) };
}

const DEEP_PENDING = { 提示: "深度诊断报告内容尚未生成。请在深度诊断报告页面点击「生成深度诊断报告」，由系统结合价值观、天赋与初步诊断报告初筛自动生成。" };

export function buildDeepReport(
  profile: AssessmentProfile,
  generated?: DeepReportGenerated
): DeepReportShape & { profile_reference: ReportProfileReference } {
  const g = generated ?? profile.deep_report;
  const highTraitNames = profile.talent_profile.high_traits.slice(0, 8).map((t) => t.name);

  const sections: DeepReportShape["sections"] = {
    conclusion_first: g
      ? { ...g.conclusion_first, 复用底稿编号: profile.id }
      : { ...DEEP_PENDING, 复用底稿编号: profile.id },
    methodology: {
      输入: ["问卷", "价值观双三圈", "252题天赋测评结果", "本人感性打分", "外部市场事实（待人工核实）"],
      推理链: ["Step1 喜欢区", "Step2 方向发散", "Step3 感性验证", "Step4 市场分析", "Step5 资源验证 VRIN", "Step6 失败验尸"],
      输出: "主线、切口、暗线、止损线和 90 天验证实验。",
    },
    step1_value_profile: {
      喜欢区: profile.value_profile.liked_values,
      排除带: profile.value_profile.excluded_values,
      喜欢区小结: profile.value_profile.like_summary,
      排除带小结: profile.value_profile.exclude_summary,
      筛选句: profile.value_profile.filter_sentence,
      天赋交叉验证: strongestTalentSentence(profile),
    },
    step2_direction_expansion: g
      ? { 规则: "只能在喜欢区内发散，不违反排除带。", 候选方向: g.directions }
      : DEEP_PENDING,
    step3_sensory_validation: g
      ? {
          数据来源: g.sensory_from_input ? "方向滑卡点亮结果" : "方向验证结果",
          方向处理表: g.sensory_table,
          ...g.sensory,
        }
      : DEEP_PENDING,
    step4_market_analysis: g
      ? { 免责声明: g.market_disclaimer, 市场总览: g.market_overview ?? [], 各方向市场判断: g.market }
      : DEEP_PENDING,
    step5_vrin: g
      ? { 说明: "V/R/I/N 判断个人胜算，收敛 Top3。", 可复用天赋: highTraitNames, 各方向胜算: g.vrin }
      : DEEP_PENDING,
    step6_premortem: g
      ? { 说明: "先写清楚会怎么输，再设早期信号和止损线。", 各方向验尸: g.premortem }
      : DEEP_PENDING,
    final_recommendations: g ? g.final_recommendations : DEEP_PENDING,
    ninety_day_plan: g ? g.ninety_day_plan : DEEP_PENDING,
    final_judgement: g ? g.final_judgement : DEEP_PENDING,
  };

  return { kind: "deep", sections, profile_reference: buildReportProfileReference(profile) };
}

export function assertKnownReportSections(report: LiteReportShape | DeepReportShape) {
  const expected = report.kind === "lite" ? LITE_REPORT_SECTIONS : DEEP_REPORT_SECTIONS;
  const actual = Object.keys(report.sections);
  return expected.filter((section) => !actual.includes(section));
}
