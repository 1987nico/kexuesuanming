import type { AssessmentProfile, ReportProfileReference } from "./assessmentProfile";
import type { DeepReportInputs, VRINScore } from "./deepReportInputs";
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

function buildLiteCustomerInput(profile: AssessmentProfile) {
  return {
    current_decision: readSurveyText(profile, ["current_decision", "decision", "正在考虑的选择", "当前决策"]),
    time_window: readSurveyText(profile, ["time_window", "decision_window", "决策时间窗口", "时间窗口"]),
    stuck_point: readSurveyText(profile, ["stuck_point", "pain", "career_confusion", "卡点", "当前最主要的职业或事业困惑"]),
    energy_source: readSurveyText(profile, ["energy_source", "energizing_work", "能量来源"]),
    transferable_assets: readSurveyText(profile, ["transferable_assets", "assets", "可迁移资产"]),
    desired_direction: readSurveyText(profile, ["desired_direction", "toward", "想靠近的方向", "正在考虑的方向"]),
    avoid_direction: readSurveyText(profile, ["avoid_direction", "avoid", "明确不碰的方向", "想避开的状态"]),
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

function vrinTotal(score: VRINScore) {
  return score.overall_score ?? score.value + score.rarity + score.imitability + score.non_substitutability;
}

function vrinTop3(scores: VRINScore[] = []) {
  return [...scores]
    .sort((left, right) => vrinTotal(right) - vrinTotal(left))
    .slice(0, 3)
    .map((score) => ({
      direction: score.direction,
      total: vrinTotal(score),
      value: score.value,
      rarity: score.rarity,
      imitability: score.imitability,
      non_substitutability: score.non_substitutability,
      evidence: score.evidence,
      blind_spot: score.blind_spot,
    }));
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
      title: "职场参谋｜初步诊断报告",
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
      data_integrity: `客户：${profile.customer_name}；252题结果模式：${profile.talent_profile.mode}。`,
    },
  };

  return { kind: "lite", sections, profile_reference: buildReportProfileReference(profile) };
}

export function buildDeepReport(
  profile: AssessmentProfile,
  deepInputs?: DeepReportInputs
): DeepReportShape & { profile_reference: ReportProfileReference } {
  const sections: DeepReportShape["sections"] = {
    conclusion_first: {
      final_advice: "大报告结论必须在小报告初筛基础上进一步收敛，不得无解释翻案。",
      source_profile_id: profile.id,
    },
    methodology: {
      input: ["问卷", "价值观双三圈", `PrinciplesYou 252题结果(${profile.talent_profile.mode})`, "感性打分", "外部市场事实"],
      reasoning: ["Step1 喜欢区", "Step2 方向发散", "Step3 感性验证", "Step4 市场分析", "Step5 VRIN", "Step6 失败验尸"],
      output: "主线、切口、暗线、止损线和 90 天实验。",
    },
    step1_value_profile: {
      liked_values: profile.value_profile.liked_values,
      excluded_values: profile.value_profile.excluded_values,
      like_summary: profile.value_profile.like_summary,
      exclude_summary: profile.value_profile.exclude_summary,
      talent_cross_check: strongestTalentSentence(profile),
    },
    step2_direction_expansion: {
      rule: "只能在 Step1 喜欢区内发散，不能违反排除带。",
      ...(deepInputs
        ? { directions: deepInputs.direction_expansion ?? [] }
        : { placeholder: "后续由六步漏斗根据履历与输入生成 30 个方向。" }),
    },
    step3_sensory_validation: {
      rule: "只保留本人感性打分 ≥7 的方向进入市场分析。",
      ...(deepInputs
        ? {
            sensory_scores: deepInputs.sensory_scores ?? [],
            qualified_directions: (deepInputs.sensory_scores ?? [])
              .filter((score) => score.score >= 7)
              .map((score) => score.direction),
          }
        : { placeholder: "后续接入多轮感性打分文档。" }),
    },
    step4_market_analysis: {
      framework: "PEST 修正波特五力：现状威胁 + P/E/S/T = 未来威胁。",
      requires_external_evidence: true,
      ...(deepInputs ? { market_evidence: deepInputs.market_evidence ?? [] } : {}),
    },
    step5_vrin: {
      framework: "V/R/I/N 判断个人胜算，结合 Step4 机会分收敛 Top3。",
      talent_reuse: profile.talent_profile.high_traits,
      ...(deepInputs
        ? {
            scores: deepInputs.vrin_scores ?? [],
            top3: vrinTop3(deepInputs.vrin_scores),
          }
        : {}),
    },
    step6_premortem: {
      framework: "先写 12 个月后怎么输，再设早期信号和止损线。",
      must_not_conflict_with_lite_risks: true,
      ...(deepInputs ? { scenarios: deepInputs.premortem ?? [] } : {}),
    },
    final_recommendations: {
      rule: "若推荐与小报告初步方向不同，必须解释新增证据和收敛逻辑。",
    },
    ninety_day_plan: {
      rule: "Day 0-30 / Day 30-60 / Day 60-90，写继续条件和止损线。",
    },
    final_judgement: {
      rule: "最后判断必须回扣价值观、天赋、市场和执行约束。",
    },
  };

  return { kind: "deep", sections, profile_reference: buildReportProfileReference(profile) };
}

export function assertKnownReportSections(report: LiteReportShape | DeepReportShape) {
  const expected = report.kind === "lite" ? LITE_REPORT_SECTIONS : DEEP_REPORT_SECTIONS;
  const actual = Object.keys(report.sections);
  return expected.filter((section) => !actual.includes(section));
}
