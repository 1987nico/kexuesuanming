import type {
  BusinessSettings,
  GrowthBusinessLine,
  GrowthBusinessPosition,
} from "./types";

export const DEFAULT_BUSINESS_POSITIONS: Record<GrowthBusinessLine, GrowthBusinessPosition> = {
  overseas_student: {
    business_line: "overseas_student",
    service_category: "留学生回国求职方向规划与秋招陪跑",
    target_user: "准备海外秋招或回国求职的留学生，以及关注孩子就业结果的家长",
    core_problem: "学历和经历不差，但目标岗位、招聘节奏、简历面试与投递动作彼此脱节，容易错过窗口或盲目海投",
    main_offer: "求职方向诊断＋目标岗位地图＋简历/面试辅导＋秋招陪跑",
    differentiation: "先把方向、岗位和招聘节奏定清楚，再进入简历、面试与投递；不是只修改一份简历",
    trust_source: "专业老师陪跑流程、匿名交付案例、真实招聘节点复盘与可验证的方法清单",
    compliance_redline: "不保Offer、不虚构真实录取结果、不泄露学生隐私，不用焦虑或互动换资料",
  },
  executive: {
    business_line: "executive",
    service_category: "中高管职业与事业方向决策咨询",
    target_user: "35岁上下、正在转型换挡、裸辞、离开体制或考虑创业的中高管与成熟职场人",
    core_problem: "能力和经历很多，却不知道下一步方向、个人胜算与失败风险，难以把平台价值转成个人市场价值",
    main_offer: "职业方向初步诊断报告＋深度决策报告＋咨询陪跑",
    differentiation: "把个人画像、市场机会、个人胜算、失败风险和90天验证放进同一套决策系统",
    trust_source: "252题测评、六步决策漏斗、匿名交付样例与真人把关",
    compliance_redline: "不承诺收益、不用玄学描述效果、客户信息匿名，不用泛焦虑换阅读",
  },
};

export function resolveBusinessPosition(
  settings: Pick<BusinessSettings, "business_positions"> | null | undefined,
  businessLine: GrowthBusinessLine,
): GrowthBusinessPosition {
  const fallback = DEFAULT_BUSINESS_POSITIONS[businessLine];
  const storedPositions = settings?.business_positions as
    | Record<string, Partial<GrowthBusinessPosition> | undefined>
    | undefined;
  // v3.2 上线前母定位曾使用下面两个旧键。读取时映射，不要求先跑数据库迁移。
  const legacyKey = businessLine === "overseas_student"
    ? "international-student-career"
    : "executive-career";
  const stored = storedPositions?.[businessLine] ?? storedPositions?.[legacyKey];
  const merged = { ...fallback, ...stored };
  return {
    business_line: businessLine,
    service_category: merged.service_category,
    target_user: merged.target_user,
    core_problem: merged.core_problem,
    main_offer: merged.main_offer,
    differentiation: merged.differentiation,
    trust_source: merged.trust_source,
    compliance_redline: merged.compliance_redline,
  };
}

export function businessPositionsFromSettings(
  settings?: Pick<BusinessSettings, "business_positions"> | null,
) {
  return {
    overseas_student: resolveBusinessPosition(settings, "overseas_student"),
    executive: resolveBusinessPosition(settings, "executive"),
  } satisfies Record<GrowthBusinessLine, GrowthBusinessPosition>;
}
