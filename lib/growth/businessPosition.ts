import type {
  BusinessSettings,
  GrowthAccount,
  GrowthBusinessPosition,
  GrowthBusinessTrack,
} from "./types";

export const DEFAULT_BUSINESS_POSITIONS: Record<GrowthBusinessTrack, GrowthBusinessPosition> = {
  "international-student-career": {
    track: "international-student-career",
    label: "留学生求职辅导",
    short_label: "留学生求职",
    service_category: "留学生回国求职方向规划与秋招陪跑",
    target_user: "准备海外秋招或回国求职的留学生，以及关注孩子就业结果的家长",
    core_problem: "学历和经历不差，但目标岗位、招聘节奏、简历面试与投递动作彼此脱节，容易错过窗口或盲目海投",
    main_offer: "求职方向诊断＋目标岗位地图＋简历/面试辅导＋秋招陪跑",
    differentiation: "先把方向、岗位和招聘节奏定清楚，再进入简历、面试与投递；不是只修改一份简历",
    trust_source: "专业老师陪跑流程、匿名交付案例、真实招聘节点复盘与可验证的方法清单",
    compliance_redline: "不保Offer、不虚构真实录取结果、不泄露学生隐私，不用焦虑或互动换资料",
    persona_profiles: {
      merchant: {
        label: "求职辅导服务商",
        account_name: "面霸君 · 留学生求职辅导",
        description: "明着经营，讲服务差异、交付过程、案例证据和选择标准。",
      },
      buyer: {
        label: "留学生家长",
        account_name: "留学生家长求职记录",
        description: "以家长第一人称记录孩子求职阶段、现场、变化和转折。",
      },
      expert: {
        label: "留学生求职老师",
        account_name: "面霸君 · 留学生求职老师",
        description: "用岗位判断、招聘节奏和辅导方法建立专业信任。",
      },
    },
  },
  "executive-career": {
    track: "executive-career",
    label: "中高管职业决策",
    short_label: "中高管转型",
    service_category: "中高管职业与事业方向决策咨询",
    target_user: "35岁上下、正在转型换挡、裸辞、离开体制或考虑创业的中高管与成熟职场人",
    core_problem: "能力和经历很多，却不知道下一步方向、个人胜算与失败风险，难以把平台价值转成个人市场价值",
    main_offer: "职业方向初步诊断报告＋深度决策报告＋咨询陪跑",
    differentiation: "把个人画像、市场机会、个人胜算、失败风险和90天验证放进同一套决策系统",
    trust_source: "252题测评、六步决策漏斗、匿名交付样例与真人把关",
    compliance_redline: "不承诺收益、不用玄学描述效果、客户信息匿名，不用泛焦虑换阅读",
    persona_profiles: {
      merchant: {
        label: "职业决策服务商",
        account_name: "面霸君 · 职业决策",
        description: "明着经营，讲产品、交付差异、案例证据和购买标准。",
      },
      buyer: {
        label: "转型中的中高管",
        account_name: "34岁前中层转型记录",
        description: "以真人处境记录裸辞、转型、副业和重新找方向的过程。",
      },
      expert: {
        label: "职业决策顾问",
        account_name: "面霸君 · 职业决策顾问",
        description: "用决策框架、市场判断和案例复盘建立专业权威。",
      },
    },
  },
};

export function resolveAccountBusinessTrack(
  account?: Partial<
    Pick<
      GrowthAccount,
      | "business_track"
      | "name"
      | "target_user"
      | "core_problem"
      | "content_directions"
      | "persona_specific"
    >
  > | null,
): GrowthBusinessTrack {
  if (account?.business_track === "international-student-career") {
    return "international-student-career";
  }
  if (account?.business_track === "executive-career") return "executive-career";

  // 兼容上一版已上线、但还没有 business_track 字段的留学生买家账号。
  const legacySignals = [
    account?.name,
    account?.target_user,
    account?.core_problem,
    ...(account?.content_directions ?? []),
    ...Object.values(account?.persona_specific ?? {}),
  ]
    .filter(Boolean)
    .join(" ");
  return /(留学生|海外秋招|回国求职|校园招聘|offer)/i.test(legacySignals)
    ? "international-student-career"
    : "executive-career";
}

export function resolveBusinessPosition(
  settings: Pick<BusinessSettings, "business_positions"> | null | undefined,
  track: GrowthBusinessTrack,
): GrowthBusinessPosition {
  const stored = settings?.business_positions?.[track];
  const fallback = DEFAULT_BUSINESS_POSITIONS[track];
  return {
    ...fallback,
    ...stored,
    track,
    persona_profiles: {
      merchant: { ...fallback.persona_profiles.merchant, ...stored?.persona_profiles?.merchant },
      buyer: { ...fallback.persona_profiles.buyer, ...stored?.persona_profiles?.buyer },
      expert: { ...fallback.persona_profiles.expert, ...stored?.persona_profiles?.expert },
    },
  };
}

export function businessPositionsFromSettings(
  settings?: Pick<BusinessSettings, "business_positions"> | null,
) {
  return {
    "international-student-career": resolveBusinessPosition(
      settings,
      "international-student-career",
    ),
    "executive-career": resolveBusinessPosition(settings, "executive-career"),
  } satisfies Record<GrowthBusinessTrack, GrowthBusinessPosition>;
}

export function isInternationalStudentTrack(
  value: GrowthBusinessTrack | Parameters<typeof resolveAccountBusinessTrack>[0],
) {
  const track = typeof value === "string" ? value : resolveAccountBusinessTrack(value);
  return track === "international-student-career";
}
