import type {
  ContentDraft,
  GrowthAccount,
  GrowthBusinessLine,
  GrowthPlan,
  GrowthReview,
  GrowthRun,
  TopicSourceSnapshot,
} from "./types";
import { GROWTH_BUSINESS_DEFINITIONS, GROWTH_BUSINESS_LINE_VALUES } from "./types";
import { computeDerivedMetrics, evaluateReviewSample } from "./reviewLearning";

export const GROWTH_PREVIEW_TENANT = "mianbajun";

export function growthPreviewEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.GROWTH_PREVIEW_MODE === "fixture";
}

export function assertGrowthPreviewIsSafe(env: NodeJS.ProcessEnv = process.env) {
  if (growthPreviewEnabled(env) && env.NODE_ENV === "production") {
    throw new Error("GROWTH_PREVIEW_MODE=fixture 仅允许本地开发环境使用，生产环境已拒绝启动。");
  }
}

const isoBefore = (days: number, hours = 0) =>
  new Date(Date.now() - (days * 24 + hours) * 60 * 60 * 1000).toISOString();

function source(
  id: string,
  methodId: TopicSourceSnapshot["method_id"],
  title: string,
  linkStatus: TopicSourceSnapshot["link_status"],
  daysAgo: number,
  verified = linkStatus === "accessible",
): TopicSourceSnapshot {
  const freshness = daysAgo <= 3 ? "within_72h" : daysAgo <= 7 ? "day_4_to_7" : "historical";
  return {
    id,
    method_id: methodId,
    platform: "小红书",
    author: "脱敏样本作者",
    original_title: title,
    original_url: `https://example.com/preview/${id}`,
    published_at: isoBefore(daysAgo),
    heat_snapshot: daysAgo > 7 ? "历史快照：1.2万互动" : "采集快照：2860赞 / 1190藏",
    collected_at: isoBefore(0, 2),
    migration_note: "只迁移母题结构，不复制原作者表达。",
    link_status: linkStatus,
    verified_by_operator: verified,
    freshness,
  };
}

function account(
  businessLine: GrowthBusinessLine,
  persona: GrowthAccount["persona"],
  id: string,
  name: string,
  personaSpecific: Record<string, string>,
): GrowthAccount {
  const business = GROWTH_BUSINESS_DEFINITIONS[businessLine];
  const overseas = businessLine === "overseas_student";
  return {
    id,
    tenant_id: GROWTH_PREVIEW_TENANT,
    owner_user_id: null,
    business_line: businessLine,
    persona,
    name,
    target_user: business.target,
    core_problem: overseas ? "回国还是留当地、选择什么岗位以及如何把招聘时间线排清楚" : "留在高位、转型还是重新定价，缺少低成本验证依据",
    account_value: overseas ? "把求职方向、岗位匹配和招聘节奏拆成可验证的行动" : "把复杂职业选择拆成可验证、可停止、可复盘的判断",
    trust_source: business.trust,
    not_doing: "不做泛职场鸡汤，不承诺成功，不用互动交换资料",
    hypotheses: ["具体决策冲突比泛焦虑更容易促成有效咨询", "正文直接兑现资料承诺能提升信任"],
    one_liner: overseas
      ? persona === "merchant" ? "先把求职方向定清楚，再进入辅导" : persona === "buyer" ? "陪娃闯秋招的留学生家长真实记录" : "把留学生求职拆成可验证的选择"
      : persona === "merchant" ? "先判断服务适配，再决定是否购买" : persona === "buyer" ? "记录中高管重新定价的真实过程" : "把职业选择拆成可验证的判断",
    follow_reason: overseas ? "持续获得留学生求职定位、岗位判断与招聘节奏" : "持续获得中高管职业决策框架与验证方法",
    content_directions: ["A痛点诊断", "B工具价值", "C案例过程"],
    tone_style: "克制、具体、有判断、不给成功保证",
    filter_words: overseas ? ["留学生", "岗位匹配", "秋招"] : ["中高管", "职业定价", "决策冲突"],
    avoid_expressions: ["逆袭", "包成功", "轻松年入百万"],
    compliance_redline: "不夸大、不虚构、不诱导互动、不违规导流",
    private_domain: "仅通过站内服务入口承接；不在正文引导加微",
    persona_specific: personaSpecific,
    topic_sources: [
      source(`${id}-source-accessible`, "traffic", overseas ? "AI筛选简历，留学生求职先改什么？" : "AI重构管理岗位，谁先被重新定价？", "accessible", 1),
      source(`${id}-source-restricted`, "viral_framework", overseas ? "你缺的不是投递，是求职定位" : "你缺的不是机会，是判断机会的能力", "restricted", 2, false),
      source(`${id}-source-invalid`, "same_outcome", overseas ? "争名企，不如争职业起点" : "争夺资源，不如争夺分配权", "invalid", 2, false),
      source(`${id}-source-expired`, "same_effect", overseas ? "回国和留当地，到底选哪条？" : "这两条路，到底该选哪条？", "accessible", 12),
    ],
    canonical_body_tags: [],
    tag_merge_suggestions: [],
    weekly_review_snapshots: [],
    created_at: isoBefore(60),
    updated_at: isoBefore(0),
  };
}

function draftBase(account: GrowthAccount, id: string, status: ContentDraft["status"]): ContentDraft {
  const created = isoBefore(status === "ready" ? 1 : 4);
  const overseas = account.business_line === "overseas_student";
  const identityOpening = overseas
    ? account.persona === "buyer"
      ? "前阵子陪孩子忙秋招，我们在回国还是留当地这件事上，来回改了好几次主意。"
      : account.persona === "expert"
        ? "前两天帮一个留学生梳理秋招计划，聊到第三个目标岗位时，我先让他停了下来。"
        : "最近我们给一位留学生梳理秋招方案，第一步不是改简历，而是先停下来看岗位和招聘节奏。"
    : account.persona === "buyer"
      ? "前阵子我又把辞职这件事按了回去，不是突然不想走，而是越算越发现有几笔账没弄明白。"
      : account.persona === "expert"
        ? "前两天和一位中高管聊转型，他列了三个方向，却说不清哪一个值得先试。"
        : "最近我们给一位中高管梳理转型方向，没有先劝他辞职，而是先把三条候选路径摆在一起。";
  const serviceBridge = overseas
    ? account.persona === "buyer"
      ? "我们自己折腾了几轮还是没理顺，后来才找了一位求职老师一起梳理现有材料。她没有先改文案，而是先把岗位和招聘节奏对齐；至少孩子不再拿一份简历乱投，下一步该验证什么也有了顺序。"
      : account.persona === "expert"
        ? "有次求职咨询里，我没有先改简历，而是先和学生梳理目标岗位、项目证据和招聘节奏。直接变化不是立刻拿到 Offer，而是岗位范围收窄了，后面的投递反馈也终于能用来复盘。"
        : "那次服务里，我们先停下改简历，把岗位匹配、项目证据和招聘时间线一起梳理了一遍。交付后的第一步变化不是立刻拿到 Offer，而是目标岗位收窄了，不同简历版本也终于有了明确去向。"
    : account.persona === "buyer"
      ? "我自己越想越乱，后来才请一位职业决策顾问陪我梳理能力、市场机会和失败成本。最后没有被催着辞职，反而先排除了一个看似体面的方向，也知道下一步该验证什么。"
      : account.persona === "expert"
        ? "有次职业咨询里，我没有替来访者直接选答案，而是先把候选方向、能力证据和失败成本拆开，再安排最小验证。直接变化不是马上做决定，而是三个方向收窄到一个先验证，下一步也有了明确顺序。"
        : "那次服务里，我们没有催客户马上选方向，而是先把能力证据、市场机会和失败成本拆开，再安排最小验证。阶段结果不是一个漂亮结论，而是排除了一个高风险方向，并定下了下一步验证顺序。";
  const coreBody = overseas
    ? "正卡在回国与留当地求职之间的留学生，先别继续海投，真正的问题往往是三项岗位匹配没有算清。\n\n1. 专业和项目经历是否对应岗位要求。\n2. 简历证据能否通过AI筛选和人工追问。\n3. 招聘时间线是否给小样本验证留出调整空间。\n\n如果你已经有两个具体目标岗位，可在站内补充专业、毕业时间和投递反馈，先判断哪一项值得调整。"
    : "正卡在离职与留任之间的中高管，真正困住你的往往不是勇气，而是三笔没有算清的账。\n\n1. 当前收入里有多少来自平台，而非可迁移能力。\n2. 家庭现金流能承受多久验证期。\n3. 下一条路是否得到过真实市场反馈。\n\n如果你已经有两条具体候选路径，可以在站内补充当前职位、候选方向和最担心的冲突，先判断哪一项值得验证。";
  return {
    id,
    tenant_id: GROWTH_PREVIEW_TENANT,
    owner_user_id: null,
    account_id: account.id,
    run_id: `${id}-run`,
    status,
    business_line: GROWTH_BUSINESS_LINE_VALUES[account.business_line ?? "executive"],
    method_group: "native",
    method_id: "human_pain",
    method_label: "行业人性痛点",
    generation_mode: "default",
    title_promise: overseas ? "解释留学生海投没有回音背后的岗位错配" : "解释中高管不敢离职背后的真实代价",
    selected_body_version: "short",
    raw_body_tags: [],
    tagging_status: "pending",
    canonical_tag_ids: [],
    cta_type: "on_platform_consult",
    validation_checks: [],
    test_variable: "标题入口",
    expected_signal: "用户说出具体处境、候选路径或决策冲突",
    title: overseas ? "投了15家，为何只有3个AI面" : "年薪百万，为何更不敢离职",
    alternative_titles: [],
    target_user: account.target_user,
    cover_text: overseas ? "海投越多，回音越少？" : "职位越高，越不敢动？",
    body: `${identityOpening}\n\n${coreBody}\n\n${serviceBridge}`,
    hashtags: overseas ? ["#留学生求职", "#秋招", "#海归求职"] : ["#中高管", "#职业转型", "#职业决策"],
    comment_prompt: overseas ? "你更卡在求职方向，还是简历投递？" : "你更担心能力不能迁移，还是资源不能迁移？",
    word_count: { title: 14, body_and_tags: 186, total: 200, within_limit: true },
    follow_reason: "持续获得可复用的职业决策框架",
    trust_anchor: "脱敏咨询与职业决策复盘",
    review_points: ["有效咨询", "主页访问", "收藏", "分享"],
    cover_suggestion: "浅色办公桌面，左侧人物停顿思考，右侧保留大字区",
    created_at: created,
    updated_at: created,
  };
}

function legacyDraft(account: GrowthAccount, index: number, status: ContentDraft["status"]): ContentDraft {
  const item = draftBase(account, `${account.id}-legacy-${index}`, status);
  const overseas = account.business_line === "overseas_student";
  const legacy = {
    ...item,
    title: (overseas
      ? ["改了5版简历，还是没收到面试", "一转眼，轮到老二秋招了", "回国求职前，我先删掉了海投表", "留学生求职最难的不是英语", "投了15家，只拿到3个AI面邀请", "学校越好，为什么反而越焦虑", "投递前，我做了三次小验证", "秋招别先从改简历开始"]
      : ["35岁以后，别急着证明自己", "从大厂出来后，我先删掉了简历", "做到总监，我才看懂平台红利", "中层转型最难的不是学新东西", "这次裁员，让我重新算了一笔账", "升职之后，我为什么更焦虑", "离职前，我做了三次小验证", "高管副业，先别从开公司开始"])[index % 8],
    schema_version: "legacy_v1" as const,
    method_attribution_status: "missing" as const,
    legacy_direction: (index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C") as "A" | "B" | "C",
    legacy_content_type: (index % 3 === 0 ? "diagnostic" : index % 3 === 1 ? "tool" : "story") as "diagnostic" | "tool" | "story",
    eligible_for_method_learning: false,
    direction: (index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C") as "A" | "B" | "C",
    content_type: (index % 3 === 0 ? "diagnostic" : index % 3 === 1 ? "tool" : "story") as "diagnostic" | "tool" | "story",
    published_at: status === "published" || status === "reviewed" ? isoBefore(4 + index) : undefined,
    tagging_status: "unclassified" as const,
  };
  // 兼容视图不伪造13种方法字段：从运行时对象中移除，原始历史字段仍保留。
  delete (legacy as Partial<ContentDraft>).method_group;
  delete (legacy as Partial<ContentDraft>).method_id;
  delete (legacy as Partial<ContentDraft>).method_label;
  delete (legacy as Partial<ContentDraft>).generation_mode;
  delete (legacy as Partial<ContentDraft>).title_promise;
  delete (legacy as Partial<ContentDraft>).source_snapshot;
  return legacy as ContentDraft;
}

function methodDraft(account: GrowthAccount): ContentDraft {
  const item = draftBase(account, `${account.id}-method-v32`, "ready");
  return {
    ...item,
    schema_version: "method_v3_2",
    method_attribution_status: "confirmed",
    eligible_for_method_learning: true,
    raw_body_tags: [
      { id: `${item.id}-tag`, text: "决策自查", reason: "正文提供三项决策自查", generated_at: item.created_at, body_version: "short", active: true },
    ],
    tagging_status: "tagged",
    validation_checks: [
      { key: "identity", status: "passed", message: "符合当前视角" },
      { key: "fulfillment", status: "passed", message: "正文兑现三项检查" },
      { key: "conversion", status: "passed", message: "自然说明专业服务如何介入" },
    ],
  };
}

function reviewFor(draft: ContentDraft, index: number): GrowthReview {
  const metrics = {
    published_at: draft.published_at,
    snapshot_at: isoBefore(0),
    note_url: `https://www.xiaohongshu.com/explore/preview-${index}`,
    note_status: "normal" as const,
    promoted: false,
    input_source: "manual" as const,
    impressions: 1600 + index * 220,
    reads: 240 + index * 35,
    average_view_seconds: 38 + index,
    likes: 32 + index,
    saves: 26 + index * 2,
    comments: 8 + index,
    shares: 5 + index,
    profile_visits: 19 + index,
    follows: 6 + index,
    private_messages: 4 + index,
    qualified_inquiries: 2 + (index % 3),
    diagnosis_199_entries: 1,
    diagnosis_199_sales: index % 2,
    deep_6999_qualified: index % 2,
    deep_6999_sales: 0,
  };
  return {
    id: `${draft.id}-review`,
    tenant_id: GROWTH_PREVIEW_TENANT,
    owner_user_id: null,
    draft_id: draft.id,
    metrics,
    derived_metrics: computeDerivedMetrics(metrics),
    sample: evaluateReviewSample(metrics, draft.published_at),
    classification: "retest",
    entry_judgement: "具体身份与决策冲突带来有效点击",
    body_judgement: "正文能兑现核心判断",
    conversion_judgement: "有效咨询优先于联系方式数量",
    compliance_judgement: "未发现互动诱导",
    value_judgement: "收藏来自可执行判断",
    follow_judgement: "咨询包含具体处境",
    audience_judgement: "人群与中高管定位一致",
    next_variable: "下一篇只改变标题框架",
    manager_instruction: "历史样本只用于兼容观察",
    topic_instruction: "不自动归入13种方法",
    writer_instruction: "保持一个承接动作",
    created_at: isoBefore(1),
    updated_at: isoBefore(0),
  };
}

export interface GrowthPreviewFixture {
  accounts: GrowthAccount[];
  plans: GrowthPlan[];
  runs: GrowthRun[];
  drafts: ContentDraft[];
  reviews: GrowthReview[];
}

export function createGrowthPreviewFixture(): GrowthPreviewFixture {
  const executiveMerchant = account("executive", "merchant", "preview-executive-merchant", "面霸君·中高管·商家视角", {
    what_you_are: "面向中高管的职业决策顾问",
    how_different: "先用低成本验证判断适配，再进入深度服务",
    why_believe: "脱敏交付样例、真实咨询过程、明确服务边界",
    main_offer: "199初步诊断 / 6999深度参谋",
    price_band: "199—6999元",
    conversion_goal: "促成站内有效咨询",
  });
  const executiveBuyer = account("executive", "buyer", "preview-executive-buyer", "面霸君·中高管·买家视角", {
    identity: "37岁，消费行业区域负责人，正在重新判断职业路径",
    struggle: "留在高位、加入创业公司，还是先验证个人顾问服务",
    growth_arc: "从焦虑求答案，到用小实验建立自己的证据",
    bridge: "公开验证过程，在出现具体冲突时承接站内适配判断",
    case_mode: "匿名第一人称节点复盘",
    case_material: "从平台能力拆分、访谈到第一次真实付费验证",
  });
  const executiveExpert = account("executive", "expert", "preview-executive-expert", "面霸君·中高管·专家视角", {
    expertise: "中高管职业决策、组织人才判断",
    methodology: "职业定价权 × 低成本验证 × 停止条件",
    monetization: "199初步诊断 / 6999深度参谋",
  });
  const overseasMerchant = account("overseas_student", "merchant", "preview-overseas-merchant", "面霸君·留学生·商家视角", {
    what_you_are: "留学生回国求职方向规划与秋招陪跑",
    how_different: "先把方向、岗位和招聘节奏定清楚，再进入简历、面试与投递",
    why_believe: "专业老师陪跑流程、匿名交付案例和真实招聘节点复盘",
    main_offer: "求职方向诊断 / 目标岗位地图 / 秋招陪跑",
    price_band: "按服务方案确认",
    conversion_goal: "促成学生或家长的站内有效咨询",
  });
  const overseasBuyer = account("overseas_student", "buyer", "preview-overseas-buyer", "面霸君·留学生·买家视角", {
    identity: "陪孩子准备回国秋招的留学生家长",
    struggle: "回国还是留当地、先定岗位还是先改简历",
    growth_arc: "从催孩子海投，到按岗位和招聘节奏逐步验证",
    bridge: "记录真实求职阶段，在具体卡点出现时承接站内适配判断",
    case_mode: "家长第一人称节点复盘",
    case_material: "专业选择、目标岗位、投递反馈和面试复盘的脱敏记录",
  });
  const overseasExpert = account("overseas_student", "expert", "preview-overseas-expert", "面霸君·留学生·专家视角", {
    expertise: "留学生回国求职定位、岗位地图与秋招节奏",
    methodology: "背景盘点 × 岗位匹配 × 小样本投递 × 面试复盘",
    monetization: "方向诊断 / 求职辅导 / 秋招陪跑",
  });
  const accounts = [
    overseasMerchant,
    overseasBuyer,
    overseasExpert,
    executiveMerchant,
    executiveBuyer,
    executiveExpert,
  ];
  const plans = accounts.map((item) => ({
    id: `${item.id}-plan`, tenant_id: GROWTH_PREVIEW_TENANT, account_id: item.id,
    title: "v3.2 30天方法验证计划", weeks: [], created_at: isoBefore(30), updated_at: isoBefore(0),
  }));
  const drafts: ContentDraft[] = [];
  const reviews: GrowthReview[] = [];
  for (const item of accounts) {
    drafts.push(legacyDraft(item, 6, "ready"), legacyDraft(item, 7, "published"), methodDraft(item));
  }
  for (let index = 0; index < 6; index += 1) {
    const item = legacyDraft(executiveExpert, index, "reviewed");
    drafts.push(item);
    reviews.push(reviewFor(item, index));
  }
  const runs: GrowthRun[] = drafts.filter((item) => item.schema_version === "method_v3_2").map((item) => ({
    id: item.run_id, tenant_id: item.tenant_id, account_id: item.account_id, status: item.status, week: 1,
    objective: "促成有效咨询", experiment_hypothesis: "标题方法会影响有效咨询", topic_pool: [],
    generation_mode: "default", draft: item, created_at: item.created_at, updated_at: item.updated_at,
  }));
  return { accounts, plans, runs, drafts, reviews };
}
