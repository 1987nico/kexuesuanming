import { llmJSON } from "@/lib/llm/router";
import {
  buildAccountPlanUserPrompt,
  buildDraftBlueprintUserPrompt,
  buildBodyTagUserPrompt,
  buildDraftUserPrompt,
  buildReviewUserPrompt,
  buildStageReviewUserPrompt,
  buildTagMergeUserPrompt,
  buildTopicPoolUserPrompt,
  GROWTH_SYSTEM_PROMPT,
  type AccountContext,
  type DraftBlueprintContext,
  type ReportPrices,
} from "./agents";
import { methodsForPersona, TITLE_METHOD_BY_ID, type TitleMethodDefinition } from "./methods";
import {
  buildReviewBenchmarks,
  buildWeeklyReviewResult,
  computeDerivedMetrics,
  diagnoseEntry,
  evaluateReviewSample,
  formatLearningBrief,
  normalizeExperimentVariable,
  resolvePublishedAt,
} from "./reviewLearning";
import type {
  BenchmarkStructureCard,
  ContentDraft,
  DraftConversionContract,
  DraftFulfillmentContract,
  DraftIdentityContract,
  DraftRepairRecord,
  GrowthAccount,
  GrowthBusinessLine,
  GrowthBusinessPosition,
  GrowthLearningBrief,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthRun,
  GrowthTitleFingerprint,
  MethodGenerationMode,
  RawBodyTag,
  TagMergeSuggestion,
  TitleMethodId,
  TopicMethodDelivery,
  TopicCandidate,
  TopicSourceSnapshot,
  WeeklyReviewResult,
} from "./types";
import {
  DEFAULT_BUSINESS_SETTINGS,
  GROWTH_BUSINESS_LINE_VALUES,
  PERSONA_SPECIFIC_FIELDS,
} from "./types";
import {
  bodyHasConversionEvidence,
  bodyOpeningMeetsTitle,
  countPublishChars,
  enforceDraftCompliance,
  extractPromisedCount,
  normalizeTags,
  sourceIsUsable,
  validateTopicCandidate,
  withDraftValidation,
  XHS_PUBLISH_CHAR_TARGET,
} from "./validation";
import { isBusinessCompatibleText } from "./businessCompatibility";
import {
  bodyUniquenessProblem,
  type BodyUniquenessReference,
} from "./bodyUniqueness";
import {
  ensureBenchmarkStructureCards,
  SOURCE_MIGRATION_VERSION,
  sourceSnapshotFitsMethod,
  titleStructureSignals,
  validateSourceMigrations,
  type SourceMigrationCandidate,
} from "./sourceMigration";
import {
  buildTitleSemanticSignature,
  canonicalizeGrowthTitle,
  evaluateGrowthTitleQuality,
  normalizeTitleForComparison,
  titlesAreSemanticDuplicates,
} from "./titleQuality";
import {
  auditNativeTitleBatchNovelty,
  TITLE_NOVELTY_AUDIT_MAX_CANDIDATES,
  type NativeTitleNoveltyCandidate,
  type NativeTitleNoveltyDecision,
  type NativeTitleNoveltyReference,
} from "./titleNoveltyAudit";

const DEFAULT_TENANT_ID = "mianbajun";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function asText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join("\n").trim();
  return "";
}

function accountContext(account: GrowthAccount): AccountContext {
  return {
    businessLine: GROWTH_BUSINESS_LINE_VALUES[account.business_line ?? "executive"],
    oneLiner: account.one_liner,
    toneStyle: account.tone_style,
    filterWords: account.filter_words,
    avoidExpressions: account.avoid_expressions,
    personaSpecific: account.persona_specific,
    notDoing: account.not_doing,
    complianceRedline: account.compliance_redline,
    privateDomain: account.private_domain,
  };
}

function mergePersonaSpecific(persona: GrowthPersona, raw: unknown): Record<string, string> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(PERSONA_SPECIFIC_FIELDS[persona].map((field) => [field.key, asText(source[field.key])]));
}

function resultUsage(result: any) {
  return {
    provider: result.raw.provider,
    model: result.raw.model,
    input_tokens: result.raw.usage?.inputTokens,
    output_tokens: result.raw.usage?.outputTokens,
  };
}

export function enforceTitleLimit(raw: string): string {
  let title = String(raw ?? "").trim().split(/\s*[|｜]\s*|\s*[—-]{2,}\s*|\s+·\s+/)[0].trim();
  if (Array.from(title).length <= 20) return title;
  title = Array.from(title).slice(0, 20).join("");
  return title.replace(/[，。、；：,;:!！?？…\-—·（(【\[《]+$/u, "").trim();
}

const EXECUTIVE_FALLBACK_ACCOUNT: Record<GrowthPersona, { target: string; problem: string; value: string; one: string; follow: string }> = {
  buyer: { target: "正卡在职业十字路口的中高管", problem: "想换方向又不敢动，不知道经验能否迁移", value: "真实记录中高管重新判断职业路径的过程", one: "陪中高管看清下一条路", follow: "持续看见真实的职业选择与验证过程" },
  expert: { target: "需要专业判断的中高管与决策者", problem: "信息很多，但缺少能落地的取舍判断", value: "用结构化方法拆解职业选择与转型胜率", one: "把复杂职业问题拆成可行动的判断", follow: "持续获得可复用的职业决策框架" },
  merchant: { target: "正在比较职业咨询服务的中高管", problem: "不知道服务是否适配、能交付什么", value: "公开服务对象、交付边界和真实判断机制", one: "先判断适配，再决定是否购买", follow: "持续了解职业咨询如何交付与验证" },
};

const OVERSEAS_STUDENT_FALLBACK_ACCOUNT: typeof EXECUTIVE_FALLBACK_ACCOUNT = {
  buyer: { target: "正在海外读书、临近毕业且卡在求职选择中的留学生与家长", problem: "回国还是留当地、选行业还是选城市，缺少可验证的决策依据", value: "真实记录留学生从求职焦虑到获得有效反馈的验证过程", one: "陪娃闯秋招的留学生家长真实记录", follow: "持续看见留学生求职路径的验证与调整" },
  expert: { target: "需要求职定位和路径判断的留学生及毕业生", problem: "信息很多但不知道自己的背景适配哪些岗位、该先验证哪条路径", value: "用结构化方法拆解留学生求职定位、岗位匹配和行动优先级", one: "把留学生求职拆成可验证的选择", follow: "持续获得留学生求职定位与路径判断框架" },
  merchant: { target: "正在比较留学生求职规划服务的学生与家长", problem: "不知道服务是否适配、具体交付什么、能否解决当前求职卡点", value: "公开服务对象、交付边界和真实求职判断机制", one: "先判断求职服务适配，再决定是否购买", follow: "持续了解留学生求职服务如何交付和验证" },
};

function fallbackAccount(businessLine: GrowthBusinessLine, persona: GrowthPersona) {
  return businessLine === "overseas_student"
    ? OVERSEAS_STUDENT_FALLBACK_ACCOUNT[persona]
    : EXECUTIVE_FALLBACK_ACCOUNT[persona];
}

function fallbackWeeks() {
  return [
    { week: 1, theme: "方法基线", goal: "建立默认方法的有效咨询基线。", content_mix: "按当前视角默认方法生成并人工选择。", decision_rule: "不用单篇爆款下结论。" },
    { week: 2, theme: "方法二测", goal: "复测有咨询信号的方法。", content_mix: "默认方法为主，按需探索。", decision_rule: "判断效果能否复现。" },
    { week: 3, theme: "模板沉淀", goal: "沉淀标题与正文兑现模板。", content_mix: "正文只跟随标题承诺。", decision_rule: "按有效咨询解释过程指标。" },
    { week: 4, theme: "方法组合", goal: "形成下一阶段方法组合。", content_mix: "提高有证据的方法复测频率。", decision_rule: "30篇前只描述数据，探索方法只能人工晋升。" },
  ];
}

export async function generateAccountAndPlan(input: {
  tenantId?: string;
  persona?: GrowthPersona;
  businessLine?: GrowthBusinessLine;
  accountName: string;
  targetUser?: string;
  coreProblem?: string;
  trustSource?: string;
  regenerateAccountId?: string;
  createdAt?: string;
  reportPrices?: ReportPrices;
  businessPosition?: GrowthBusinessPosition;
}): Promise<{ account: GrowthAccount; plan: GrowthPlan; usage?: Record<string, unknown> }> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const persona = input.persona ?? "expert";
  const businessLine = input.businessLine ?? "executive";
  const fallback = fallbackAccount(businessLine, persona);
  const reportPrices = input.reportPrices ?? { lite: DEFAULT_BUSINESS_SETTINGS.report_lite_price, deep: DEFAULT_BUSINESS_SETTINGS.report_deep_price };
  let payload: any;
  let usage: Record<string, unknown> | undefined;
  try {
    const result = await llmJSON<any>({ system: GROWTH_SYSTEM_PROMPT, user: buildAccountPlanUserPrompt({ ...input, persona, reportPrices }), maxTokens: 3000, temperature: 0.4 });
    payload = result.data;
    usage = resultUsage(result);
  } catch (error) {
    console.warn("[growth] account fallback:", (error as Error).message);
  }
  const data = payload?.account ?? {};
  const timestamp = now();
  const accountId = input.regenerateAccountId || id();
  const account: GrowthAccount = {
    id: accountId,
    tenant_id: tenantId,
    business_line: businessLine,
    persona,
    name: input.accountName,
    target_user: data.target_user || input.targetUser || fallback.target,
    core_problem: data.core_problem || input.coreProblem || fallback.problem,
    account_value: data.account_value || fallback.value,
    trust_source: data.trust_source || input.trustSource || "来自真实客户咨询、职业决策和交付实践。",
    not_doing: data.not_doing || "不做泛职场鸡汤，不承诺结果，不用互动换资料。",
    hypotheses: Array.isArray(data.hypotheses) ? data.hypotheses.slice(0, 5) : ["具体处境比泛焦虑更能带来有效咨询。"],
    one_liner: data.one_liner || fallback.one,
    follow_reason: data.follow_reason || fallback.follow,
    tone_style: data.tone_style || "具体、克制、有判断、有下一步。",
    filter_words: Array.isArray(data.filter_words) ? data.filter_words.slice(0, 8) : [],
    avoid_expressions: Array.isArray(data.avoid_expressions) ? data.avoid_expressions.slice(0, 8) : ["逆袭", "暴富", "包成功"],
    compliance_redline: asText(data.compliance_redline) || input.businessPosition?.compliance_redline || "不夸大、不虚构、不诱导互动、不违规导流。",
    private_domain: asText(data.private_domain),
    persona_specific: mergePersonaSpecific(persona, data.persona_specific),
    created_at: input.createdAt || timestamp,
    updated_at: timestamp,
  };
  const plan: GrowthPlan = {
    id: id(), tenant_id: tenantId, account_id: accountId,
    title: payload?.plan?.title || "30天方法验证计划",
    weeks: Array.isArray(payload?.plan?.weeks) ? payload.plan.weeks.slice(0, 4) : fallbackWeeks(),
    created_at: timestamp, updated_at: timestamp,
  };
  return { account, plan, usage };
}

function freshestSources(account: GrowthAccount) {
  const result = new Map<TitleMethodId, TopicSourceSnapshot>();
  for (const source of [...(account.topic_sources ?? [])].sort((a, b) => b.collected_at.localeCompare(a.collected_at))) {
    if (
      !result.has(source.method_id)
      && sourceIsUsable(source)
      && sourceSnapshotFitsMethod(source, account.business_line ?? "executive").passed
    ) result.set(source.method_id, source);
  }
  return result;
}

const EXECUTIVE_FALLBACK_TITLES: Record<TitleMethodId, [string, string]> = {
  traffic: ["这波热搜，中高管先别跟", "判断热点对职业选择的真实影响"],
  human_pain: ["收入越高，为何更不敢离职", "解释高收入中高管不敢离职的三层代价"],
  tug_of_war: ["留在高位，还是重新定价？", "真实比较留任与转型两条路径"],
  scarce_material: ["中高管转型路线图公开", "正文直接交付可执行的转型路线图"],
  superlative: ["中高管最危险的一次跳槽", "说明高位跳槽最危险的条件与信号"],
  contrarian: ["职位越高，转型未必越容易", "解释高职位增加转型难度的条件"],
  nostalgia: ["十年前升职，如今可能是坑", "比较过去与当下升职价值的变化"],
  inventory: ["中高管离职前查这5项", "逐项交付离职前必须检查的5项内容"],
  same_product: ["中高管军师，先看适配", "迁移同类服务表达并说明适配边界"],
  same_effect: ["这2条转型路怎么选？", "提供两条转型路径的比较标准"],
  similar_audience: ["能转型的中高管都算胜率", "拆解中高管计算转型胜率的变量"],
  same_outcome: ["争高位，不如争定价权", "解释职业定价权为何更接近终局"],
  viral_framework: ["中高管缺的不是机会，是判断", "用爆款框架解释判断力的实际价值"],
};

const OVERSEAS_STUDENT_FALLBACK_TITLES: Record<TitleMethodId, [string, string]> = {
  traffic: ["这波缩招，留学生先别慌", "判断近期招聘变化对留学生求职的真实影响"],
  human_pain: ["留学投入不小，为何更不敢回国", "解释留学生在投入、身份和求职之间的真实压力"],
  tug_of_war: ["留当地，还是回国求职？", "真实比较留当地与回国求职两条路径"],
  scarce_material: ["留学生求职路线图公开", "正文直接交付可执行的留学生求职路线图"],
  superlative: ["留学生最危险的一次海投", "说明无定位海投最危险的条件与后果"],
  contrarian: ["学历越高，求职未必越容易", "解释高学历不能自动换来岗位匹配的条件"],
  nostalgia: ["海归吃香那几年，如今还要看岗位", "比较过去与当下海归求职优势的变化"],
  inventory: ["留学生投简历前查这5项", "逐项交付投递前必须检查的5项内容"],
  same_product: ["留学生求职参谋，先看适配", "迁移同类服务表达并说明适配边界"],
  same_effect: ["这2条求职路怎么选？", "提供两条求职路径的比较标准"],
  similar_audience: ["能上岸的留学生都算匹配度", "拆解留学生计算岗位匹配度的变量"],
  same_outcome: ["争名企，不如争职业起点", "解释可积累的职业起点为何更接近终局"],
  viral_framework: ["留学生缺的不是投递，是定位", "用爆款框架解释求职定位的实际价值"],
};

const EXECUTIVE_FALLBACK_TITLE_VARIANTS: Record<TitleMethodId, string[]> = {
  traffic: ["热点刷屏，高管先别急着跟", "这波热搜，高管先查合同"],
  human_pain: ["工资越高，辞职信越难写", "做到总监，反而不敢跳槽"],
  tug_of_war: ["继续升职，还是出去试价？", "守住年薪，还是重做职业？"],
  scarce_material: ["高管转型，我只看这张表", "离职前，把这份清单算完"],
  superlative: ["高管最怕的不是降薪", "35岁后最贵的一次误判"],
  contrarian: ["做到高管，经验反而会贬值", "人脉越多，离职越难转身"],
  nostalgia: ["当年抢着升职，如今先看离职成本", "以前拿工牌，现在先查新岗位"],
  inventory: ["高管转型前必算的5笔账", "离开平台前，盘点这5样"],
  same_product: ["职业参谋先帮你排除什么", "决策咨询，不是替你选答案"],
  same_effect: ["两份工作，先算哪一笔账？", "留任和创业，哪条胜率高？"],
  similar_audience: ["敢离职的高管先看现金流", "能转型的人都先试后辞"],
  same_outcome: ["拼升职，不如拼可迁移能力", "抢职位，不如让市场报价"],
  viral_framework: ["高管缺的不是人脉，是验证", "你缺的不是经验，是市场回音"],
};

const OVERSEAS_STUDENT_FALLBACK_TITLE_VARIANTS: Record<TitleMethodId, string[]> = {
  traffic: ["秋招提前，留学生先查时间", "AI筛简历，海归先改哪一处"],
  human_pain: ["学历越好，秋招时越怕没回音", "帮孩子盯秋招，不敢多问怕吵架"],
  tug_of_war: ["留英等工签，还是赶国内秋招？", "回国进大厂，还是海外留下？"],
  scarce_material: ["海归秋招时间表，我摊开了", "回国求职前先看这张表"],
  superlative: ["秋招最亏的，是太早改简历", "海归最怕的不是学历不够"],
  contrarian: ["名校毕业，海投反而更吃亏", "实习越多，岗位反而越难选"],
  nostalgia: ["当年海归吃香，现在先看简历匹配", "以前拼学校，现在练面试"],
  inventory: ["海归秋招前必查的5个日期", "回国投递前先盘点这5样"],
  same_product: ["求职陪跑，第一步不是改简历", "海归求职军师先排除什么"],
  same_effect: ["回国和留英，先算哪笔账？", "两份秋招路线，哪条回音快？"],
  similar_audience: ["拿面试的海归都先收窄岗位", "秋招有回音的人都先改定位"],
  same_outcome: ["抢大厂，不如抢成长最快岗位", "拼Offer，不如拼第一段履历"],
  viral_framework: ["海归缺的不是简历，是方向", "秋招缺的不是海投，是反馈"],
};

/**
 * 留学生买家 = 留学生家长。该空间的标题不能借由正文承诺再补身份；
 * 操作者在选题页首先看到标题，因此每个兜底候选都要在标题里写出亲子关系。
 * 这套池与普通“留学生本人”表达隔离，避免跨视角复用造成看似自然、实则错位。
 */
const OVERSEAS_STUDENT_PARENT_BUYER_TITLE_VARIANTS: Record<TitleMethodId, string[]> = {
  traffic: ["秋招提前，家长先陪孩子查时间", "AI筛简历，家长陪孩子先改哪处"],
  human_pain: [
    "孩子秋招没回音，我反而不敢问",
    "帮孩子盯秋招，最怕他突然沉默",
    "留学花了不少，孩子却不敢回国",
    "孩子投得越多，我越不敢催",
    "孩子简历改几版，家里更焦虑",
    "孩子说不急，我却盯着面试通知",
    "孩子想回国，我怕他走错第一步",
    "网申没回音，孩子开始怀疑自己",
  ],
  tug_of_war: [
    "我家孩子，先补实习还是直接投递？",
    "陪孩子留英，还是赶回国秋招？",
    "孩子先冲提前批，还是再等实习？",
    "我该催孩子海投，还是先收窄岗位？",
    "孩子留当地，还是回国找工作？",
    "孩子拿保底Offer，还是等对口岗？",
    "孩子先做项目，还是继续找实习？",
    "陪孩子等笔试，还是先投下一家？",
    "孩子该回国秋招，还是先留在英国？",
  ],
  scarce_material: [
    "给孩子备秋招，先看这张时间表",
    "孩子回国求职，先补这份地图",
    "孩子网申卡住，先用这张清单",
    "陪孩子求职，先写一页盘点",
    "孩子毕业前，先整理这份路径表",
  ],
  superlative: [
    "孩子秋招最容易错过的窗口",
    "陪孩子海投，最浪费的一次努力",
    "孩子求职最怕的一次误判",
    "孩子改简历最容易漏的一步",
    "孩子回国投递最危险的节奏错位",
  ],
  contrarian: [
    "孩子简历改得越多，未必越有回音",
    "我越催孩子投递，他越不敢点提交",
    "孩子学校越好，越要先看岗位",
    "陪孩子海投，不如先收窄方向",
    "孩子实习越多，岗位未必越好选",
    "孩子投得越勤，越要先收窄方向",
    "孩子消息越多，越不能乱投简历",
    "我替孩子找内推，不如先看岗位匹配",
    "孩子拿到面试，未必是方向对了",
    "孩子项目越亮，越要说清岗位",
  ],
  nostalgia: [
    "以前我看学校，现在陪孩子练面试",
    "当年海归吃香，现在孩子先抢秋招",
    "我翻旧简历，才懂孩子今天缺什么",
    "孩子毕业照拍完，我不再只看排名",
    "我当年只比学历，轮到孩子先看实习",
    "翻出录取信后，我陪孩子重做求职表",
    "以前替孩子比排名，现在先陪他改简历",
    "孩子收行李那天，我才不盯学校名气",
    "以前问学校，现在问孩子想做什么",
  ],
  inventory: [
    "孩子秋招前，先查这5个日期",
    "孩子投简历前，盘点这5件事",
    "孩子回国求职前，先看这5项",
    "孩子网申前，先补这5个信息",
    "孩子毕业季，先排这5个优先级",
  ],
  same_product: ["给孩子找求职陪跑，先看适配", "孩子求职军师，先帮他排除什么"],
  same_effect: ["孩子回国和留英，先算哪笔账？", "孩子两条秋招路线，哪条回音快？"],
  similar_audience: ["拿面试的孩子，都先收窄岗位", "秋招有回音的孩子，都先改定位"],
  same_outcome: ["给孩子抢大厂，不如抢成长快岗位", "孩子第一份Offer，先看什么"],
  viral_framework: ["孩子缺的不是简历，是方向", "陪孩子秋招，缺的不是海投是反馈"],
};

/**
 * 模型偶发超时或只返回了不合格候选时的安全兜底池。
 *
 * 它只服务于无外部来源依赖的原生法：来源型方法宁可透明暂停，也不能伪造
 * “刚找到的新母题”。每个方法都至少有五个不同的真实场景，避免把旧标题或
 * 只换一个词的标题重新交给操作者。
 */
const NATIVE_EMERGENCY_TITLE_VARIANTS: Record<
  GrowthBusinessLine,
  Partial<Record<TitleMethodId, string[]>>
> = {
  executive: {
    human_pain: [
      "猎头来电，我却不敢接",
      "合同续签后，反而更想走",
      "绩效很好，为什么更焦虑",
      "团队要扩张，我却想换路",
      "工资到账后，我更怕选错",
    ],
    tug_of_war: [
      "继续升职，还是出去试价？",
      "留在平台，还是换条赛道？",
      "守住年薪，还是先做验证？",
      "转管理，还是回专业线？",
      "先做副业，还是稳住主业？",
    ],
    scarce_material: [
      "离职前，我只看这张表",
      "转型时，先写这份判断单",
      "换赛道前，先做一页盘点",
      "高管求职，先补这张地图",
      "职业选择卡住时，先看清单",
    ],
    superlative: [
      "高管跳槽最容易漏的一步",
      "转型前最不该忽略的风险",
      "离开平台最贵的一次误判",
      "职业选择最怕算错的成本",
      "高位换工作最危险的信号",
    ],
    contrarian: [
      "平台越大，转型未必越稳",
      "经验越多，换赛道越要慢",
      "职位越高，越该先做验证",
      "人脉越广，离职越要算账",
      "年薪越高，越不能急着走",
    ],
    nostalgia: [
      "过去靠平台，如今先接猎头电话",
      "当年看头衔，现在先改简历",
      "从前怕跳槽，现在先看合同",
      "以前等升职，现在先补面试",
      "过去看资历，如今先做项目复盘",
    ],
    inventory: [
      "转型前，先查这5个信号",
      "离职前，盘点这5笔成本",
      "换赛道前，写下这5个问题",
      "高管求职前，先看这5项",
      "重新选方向，先算这5笔账",
    ],
  },
  overseas_student: {
    human_pain: [
      "秋招临近，孩子反而不敢投",
      "笔试结束后，我更不敢催",
      "简历改完，还是怕方向错",
      "毕业快到了，反而更焦虑",
      "网申没回音，孩子开始怀疑自己",
    ],
    tug_of_war: [
      "留英等工签，还是赶秋招？",
      "先补实习，还是直接投递？",
      "回国求职，还是留在当地？",
      "先收窄岗位，还是继续海投？",
      "冲提前批，还是先改简历？",
      "先接保底offer，还是等对口岗？",
    ],
    scarce_material: [
      "秋招前，先看这张时间表",
      "回国求职，先补这份地图",
      "网申卡住时，先用这张清单",
      "留学生求职，先写一页盘点",
      "毕业前，先整理这份路径表",
    ],
    superlative: [
      "秋招最容易错过的一个窗口",
      "海投最浪费的一次努力",
      "留学生求职最怕的误判",
      "简历修改最容易漏的一步",
      "回国投递最危险的节奏错位",
    ],
    contrarian: [
      "简历改得越多，未必越有回音",
      "学校越好，越要先看匹配",
      "实习越多，岗位未必越好选",
      "投得越勤，越要先收窄方向",
      "信息越多，越不能乱投简历",
    ],
    nostalgia: [
      // 每条都换掉“人群/场景/现在要看的变量”中的至少两项；
      // 不再把“学校/背景→项目证据”这一条怀旧母题换词重复使用。
      "以前看学校，现在看岗位要求",
      "以前看学历，现在练面试",
      "当年海归吃香，现在先抢秋招",
      "从前冲名校，现在先补实习",
      "过去靠背景，现在先改简历",
      "以前等毕业，现在先投岗位",
      "从前看排名，现在看项目细节",
      "以前听学长建议，现在先看岗位描述",
      "从前只看学校，现在先补面试准备",
    ],
    inventory: [
      "秋招前，先查这5个日期",
      "投简历前，盘点这5件事",
      "回国求职前，先看这5项",
      "网申前，先补这5个信息",
      "毕业季，先排这5个优先级",
      "面试前，整理这5段项目经历",
    ],
  },
};

function fallbackTitles(account: GrowthAccount) {
  return account.business_line === "overseas_student"
    ? OVERSEAS_STUDENT_FALLBACK_TITLES
    : EXECUTIVE_FALLBACK_TITLES;
}

const TITLE_SEMANTIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/offers?/giu, "录用"],
  [/找工作|就业/gu, "求职"],
  [/海量投递|大量投递|广撒网/gu, "海投"],
  [/秋季招聘/gu, "秋招"],
  [/老师|导师|职业顾问/gu, "顾问"],
  [/而是/gu, "是"],
];

/** 用于完整历史去重；不保存模型推理，也不把标点或数字微调误认为新标题。 */
export function normalizeTitleHistoryFingerprint(value: string) {
  let normalized = canonicalizeGrowthTitle(value).toLocaleLowerCase();
  for (const [pattern, replacement] of TITLE_SEMANTIC_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalizeTitleForComparison(normalized);
}

function titleFingerprint(value: string) {
  return normalizeTitleHistoryFingerprint(enforceTitleLimit(value));
}

function ngrams(value: string, width: number) {
  const chars = Array.from(value);
  const result = new Set<string>();
  for (let index = 0; index <= chars.length - width; index += 1) {
    result.add(chars.slice(index, index + width).join(""));
  }
  return result;
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

function longestCommonSubsequenceRatio(left: string, right: string) {
  const a = Array.from(left);
  const b = Array.from(right);
  const previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = a[i - 1] === b[j - 1]
        ? diagonal + 1
        : Math.max(previous[j], previous[j - 1]);
      diagonal = saved;
    }
  }
  return previous[b.length] / Math.max(1, Math.min(a.length, b.length));
}

/** 精确标题、标点微调、数字替换、近义改写与轻微语序调整均视为历史重复。 */
export function titlesAreNearDuplicate(left: string, right: string) {
  const a = normalizeTitleHistoryFingerprint(left);
  const b = normalizeTitleHistoryFingerprint(right);
  if (!a || !b) return false;
  if (a === b || titlesAreSemanticDuplicates(left, right)) return true;
  if (Math.min(Array.from(a).length, Array.from(b).length) < 6) return false;
  const bigramDice = diceCoefficient(ngrams(a, 2), ngrams(b, 2));
  const characterDice = diceCoefficient(new Set(Array.from(a)), new Set(Array.from(b)));
  const lcsRatio = longestCommonSubsequenceRatio(a, b);
  return bigramDice >= 0.76 || lcsRatio >= 0.84 || (characterDice >= 0.9 && lcsRatio >= 0.72);
}

function titlesAreSameMethodNearDuplicate(left: string, right: string) {
  const a = normalizeTitleHistoryFingerprint(left);
  const b = normalizeTitleHistoryFingerprint(right);
  if (!a || !b) return false;
  if (titlesAreNearDuplicate(left, right)) return true;
  const shorter = Array.from(a).length <= Array.from(b).length ? a : b;
  const longer = shorter === a ? b : a;
  if (Array.from(shorter).length >= 6 && longer.includes(shorter)) return true;
  const bigramDice = diceCoefficient(ngrams(a, 2), ngrams(b, 2));
  const lcsRatio = longestCommonSubsequenceRatio(a, b);
  return bigramDice >= 0.6 && lcsRatio >= 0.76;
}

export function findDuplicateTitle(title: string, history: string[]) {
  return history.find((item) => titlesHaveSameHistoryFingerprint(title, item))
    ?? history.find((item) => titlesAreNearDuplicate(title, item));
}

export function buildGrowthTitleFingerprint(input: {
  account: GrowthAccount;
  topic: TopicCandidate;
  generationMode: MethodGenerationMode;
}): GrowthTitleFingerprint {
  const normalized = normalizeTitleHistoryFingerprint(input.topic.title);
  const quality = evaluateGrowthTitleQuality(input.topic.title);
  const diversity = buildTopicDiversitySignature(
    input.topic,
    input.account.business_line ?? "executive",
  );
  return {
    title: input.topic.title,
    normalized_fingerprint: normalized,
    semantic_fingerprint: [...ngrams(normalized, 2)].sort().join("|"),
    semantic_signature: {
      audience: quality.signature.audience,
      scenario: quality.signature.scenario,
      conflict: quality.signature.conflict,
      promise: quality.signature.promise,
      frame: quality.signature.frame,
    },
    ...diversity,
    mother_topic_key: input.topic.fallback_premise_key ?? diversity.mother_topic_key,
    diversity_version: "v1",
    business_line: input.account.business_line ?? "executive",
    persona: input.account.persona,
    method_id: input.topic.method_id,
    generation_mode: input.generationMode,
    source_id: input.topic.source_snapshot?.id,
    structure_card_id: input.topic.structure_card_id,
  };
}

export interface TopicTitleHistoryEntry {
  method_id?: TitleMethodId;
  title: string;
  sentence_frame?: string;
  mother_topic_key?: string;
  material_signature?: string;
  source_id?: string;
  /** 0 为当前上一批，数字越大越早。 */
  batch_index?: number;
}

export interface NativeTitleCandidateOption {
  audit: NativeTitleNoveltyCandidate;
  topic: TopicCandidate;
}

/**
 * 原模型会为一个槽位给出 1 个首选和 4 个备选。语义审核只需要看最靠前的
 * 少量合格候选；再多会挤占响应时间，却不会提升运营可选范围。
 */
const MAX_NATIVE_MODEL_CANDIDATES_PER_METHOD = 4;
/**
 * 静态兜底池不是直接交给运营，而是用于模型审核短暂不可用时的安全恢复。
 * 多保留几条，才能避免某一条撞到历史就让整批原生法全部空掉。
 */
const MAX_NATIVE_FALLBACK_CANDIDATES_PER_METHOD = 6;
/** 二次审核每个方法最多保留两条模型替代题和一条静态候选。 */
const MAX_NATIVE_AUDIT_CANDIDATES_PER_METHOD = 3;
/**
 * 首轮终审只看“两个模型候选＋一个兜底”，避免一次审核变成性能瓶颈。
 * 但首轮未选中的安全候选不能被直接丢弃：只对失败槽位再做一次小批审核，
 * 才能在全历史去重很长时仍然交付一整批新标题。
 */
const MAX_NATIVE_RETRY_AUDIT_CANDIDATES_PER_METHOD = 3;

export interface NativeTitleAuditDiagnostic {
  status: "passed" | "fallback_recovery" | "timeout" | "incomplete" | "unavailable" | "not_needed";
  candidate_count: number;
  reference_count: number;
  elapsed_ms: number;
  missing_candidate_ids?: string[];
}

const EXECUTIVE_MOTHER_TOPICS: Array<[string, RegExp]> = [
  ["platform_pricing", /平台|光环|头衔|title|工牌|名片|定价|值多少钱|议价权/i],
  ["resignation", /裸辞|离职|辞呈|辞职|交接/],
  ["entrepreneurship", /创业|合伙|工作室|副业/],
  ["career_switch", /转型|换方向|转方向|转赛道|换挡|重新来/],
  ["job_search", /投简历|海投|求职|面试|猎头|招聘/],
  ["transferable_ability", /能力|经验|资产|迁移|胜算/],
  ["risk_validation", /验证|风险|失败成本|试错|踩坑|排除/],
  ["income_security", /薪资|年薪|收入|现金流|降薪|工资/],
  ["family_pressure", /家人|父母|孩子|伴侣|家庭/],
  ["stability_choice", /体制|稳定|大厂|国企/],
];

const OVERSEAS_MOTHER_TOPICS: Array<[string, RegExp]> = [
  ["parent_child_conflict", /家长|妈妈|爸爸|爸妈|父母|家里|孩子|娃|儿子|女儿|陪跑|帮倒忙|添乱|闹僵/],
  ["stay_or_return", /留英|留海外|留伦敦|回国|回沪|国内|工签|两个时区/],
  ["mass_application", /海投|投了|投递|没回音|零回应|回复/],
  ["recruiting_timeline", /秋招|提前批|截止|时间表|节奏|节点|窗口/],
  ["job_targeting", /选岗|投错岗(?:位)?|找不对岗(?:位)?|岗不对|岗(?:位)?没选对|选错岗|岗位地图|方向|收窄|定位|赛道/],
  ["resume", /简历|网申|项目经历/],
  ["interview", /面试|笔试|终面|自我介绍/],
  ["offer_result", /offer|录用|入职|大厂|国企/i],
  ["study_roi", /留学投入|百万留学|学费|回报|薪资|月薪/],
  ["ai_screening", /AI|算法筛|机器筛/i],
];

const MATERIAL_ROLES: Array<[string, RegExp]> = [
  ["executive", /高管|总监|中层|部门总|管理层|管过\d*人/],
  ["parent", /家长|妈妈|爸爸|父母|陪孩子|陪娃|孩子|娃|儿子|女儿/],
  ["student", /留学生|海归|留英|硕士|孩子|毕业生/],
  ["advisor", /顾问|老师|导师|机构|陪跑/],
  ["employee", /打工|员工|职场人|求职者/],
];

const MATERIAL_SCENES: Array<[string, RegExp]> = [
  ["resignation", /裸辞|离职|辞呈|辞职|交接|工牌/],
  ["application", /海投|投简历|投递|网申|招聘帖/],
  ["interview", /面试|笔试|终面|猎头电话/],
  ["workplace", /会议室|汇报|预算|团队|老板|客户|绩效/],
  ["family", /家人|父母|孩子|娃|儿子|女儿|书房|闹僵/],
  ["overseas", /留英|伦敦|海外|工签|回国|回沪/],
  ["entrepreneurship", /创业|合伙|工作室|副业/],
  ["planning", /清单|表|地图|盘点|核对|漏斗/],
];

const MATERIAL_RESULTS: Array<[string, RegExp]> = [
  ["no_response", /没人理|没回音|零回应|没人要|不敢要/],
  ["pricing_loss", /不值钱|值多少钱|定价|议价|薪资砍|降薪/],
  ["conflict", /闹僵|添乱|帮倒忙|吵架|嫌烦/],
  ["choice", /还是|怎么选|选哪个|方向|选择权/],
  ["risk_reduction", /避坑|风险|排除|验证|失败成本/],
  ["progress", /面试邀请|offer|录用|入职|拿到|进展/i],
];

function matchedKeys(value: string, patterns: Array<[string, RegExp]>, limit: number) {
  return patterns.flatMap(([key, pattern]) => pattern.test(value) ? [key] : []).slice(0, limit);
}

export function classifyTitleSentenceFrame(title: string) {
  if (/(以前|当年|曾经).*(现在|如今)/.test(title)) return "past_present";
  if (/不是.+(而是|是)|缺的不是|不如/.test(title)) return "contrast_reversal";
  if (/别以为|别靠|别等|别信|千万别/.test(title)) return "warning_contrarian";
  if (/越.+越/.test(title)) return "more_more";
  if (/还是|vs|VS|或是/.test(title)) return "direct_choice";
  if (/先.+再|前.+先|先查|先填|先算|先盘|先做/.test(title)) return "before_after_check";
  if (/不敢|怕/.test(title)) return "identity_inhibition";
  if (/最容易|最怕|最大|最亏|最危险/.test(title)) return "superlative";
  if (/[0-9一二三四五六七八九十百千万两]+(个|项|笔|类|件|步|天|家|份)/.test(title)) {
    return "numbered";
  }
  if (/[？?]$/.test(title)) return "question";
  if (/直接|拿走|公开|照着|抄作业/.test(title)) return "imperative_delivery";
  return "statement";
}

export function buildTopicDiversitySignature(
  topic: Pick<TopicCandidate, "title" | "title_promise" | "origin_force" | "conflict_judgement">,
  businessLine: GrowthBusinessLine = "executive",
) {
  const titleAndPromise = `${topic.title} ${topic.title_promise || ""}`;
  const context = `${titleAndPromise} ${topic.origin_force || ""} ${topic.conflict_judgement || ""}`;
  const motherPatterns = businessLine === "overseas_student"
    ? OVERSEAS_MOTHER_TOPICS
    : EXECUTIVE_MOTHER_TOPICS;
  const motherKeys = matchedKeys(titleAndPromise, motherPatterns, 2);
  // 优先读取标题和承诺里的真实素材；只有缺项时才用账号通用上下文兜底，
  // 避免“中高管熟悉离职场景”之类的定位说明把每个标题误判成同一素材。
  const roles = matchedKeys(titleAndPromise, MATERIAL_ROLES, 1);
  const scenes = matchedKeys(titleAndPromise, MATERIAL_SCENES, 1);
  const results = matchedKeys(titleAndPromise, MATERIAL_RESULTS, 1);
  const fallbackRoles = roles.length ? roles : matchedKeys(context, MATERIAL_ROLES, 1);
  const fallbackScenes = scenes.length ? scenes : matchedKeys(context, MATERIAL_SCENES, 1);
  const fallbackResults = results.length ? results : matchedKeys(context, MATERIAL_RESULTS, 1);
  return {
    sentence_frame: classifyTitleSentenceFrame(topic.title),
    mother_topic_key: motherKeys.length
      ? motherKeys.join("+")
      : `open:${normalizeTitleHistoryFingerprint(topic.title).slice(0, 10)}`,
    material_signature: [
      fallbackRoles[0] ?? "open_role",
      fallbackScenes[0] ?? "open_scene",
      fallbackResults[0] ?? "open_result",
    ].join(":"),
  };
}

function titlesHaveSameHistoryFingerprint(left: string, right: string) {
  const a = normalizeTitleHistoryFingerprint(left);
  const b = normalizeTitleHistoryFingerprint(right);
  return Boolean(a && b && a === b);
}

export function selectFreshTitle(
  options: string[],
  input: { currentTitles?: string[]; seenTitles?: string[]; reservedTitles?: string[] } = {},
) {
  const candidates = Array.from(new Set(options.map(enforceTitleLimit).filter(Boolean)));
  const current = new Set((input.currentTitles ?? []).map(titleFingerprint));
  const seen = new Set((input.seenTitles ?? []).map(titleFingerprint));
  const reserved = new Set((input.reservedTitles ?? []).map(titleFingerprint));
  const available = (title: string, avoidHistory: boolean) => {
    const key = titleFingerprint(title);
    return !current.has(key) && !reserved.has(key) && (!avoidHistory || !seen.has(key));
  };
  // “换一批”不能把历史标题当作兜底再交给用户。候选池耗尽时应该由上层
  // 定向重写或明确暂停，而不是把旧题伪装成新题。
  return candidates.find((title) => available(title, true));
}

/** 仅供原生法内部兜底与回归测试使用；来源型方法不会使用此池伪造母题。 */
export interface FallbackTitleCandidate {
  title: string;
  /** 每个兜底标题自己的正文承诺，不能复用该方法主标题的承诺。 */
  title_promise: string;
  /** 用于近期批次防换皮的候选母题键。 */
  premise_key: string;
}

function fallbackCandidatePromise(
  methodId: TitleMethodId,
  title: string,
  primaryTitle: string,
  primaryPromise: string,
) {
  if (title === primaryTitle) return primaryPromise;
  const cleanTitle = title.replace(/[，。！？?！]/gu, "").trim();
  if (methodId === "tug_of_war") {
    const [left, right] = cleanTitle.split("还是").map((item) => item.replace(/[，、]/gu, "").trim());
    if (left && right) return `真实比较“${left}”与“${right}”两条路径各自的条件和取舍。`;
  }
  if (methodId === "human_pain") {
    return `讲清“${cleanTitle}”背后的真实压力，以及下一步应该先确认什么。`;
  }
  if (methodId === "contrarian") {
    return `解释“${cleanTitle}”这个反转成立的条件，避免把表面优势当成结论。`;
  }
  if (methodId === "nostalgia") {
    return `通过“${cleanTitle}”里的今昔对比，讲清今天求职应优先调整什么。`;
  }
  if (methodId === "inventory" || methodId === "scarce_material") {
    return `围绕“${cleanTitle}”直接交付正文中可以照着执行的步骤或清单。`;
  }
  if (methodId === "superlative") {
    return `说明“${cleanTitle}”所指风险出现的条件，以及如何提前避免。`;
  }
  return `围绕“${cleanTitle}”兑现标题承诺，并给出具体判断或动作。`;
}

function fallbackCandidatePremiseKey(account: GrowthAccount, methodId: TitleMethodId, title: string) {
  const canonical = canonicalizeGrowthTitle(title);
  if (account.business_line === "overseas_student" && methodId === "tug_of_war") {
    if (/(?:留当地|留在当地).*(?:回国|回沪)|(?:回国|回沪).*(?:留当地|留在当地)/u.test(canonical)) {
      return "overseas:stay_or_return:local";
    }
    if (/留英等工签.*秋招/u.test(canonical)) return "overseas:stay_or_return:visa_or_autumn";
  }
  if (account.business_line === "overseas_student" && methodId === "nostalgia") {
    if (/海归吃香/u.test(canonical)) return "overseas:nostalgia:returnee_halo_to_job_readiness";
    if (/(?:拼学校|看学历).*(?:练|补|准备).{0,4}面试/u.test(canonical)) {
      return "overseas:nostalgia:credential_to_interview";
    }
  }
  // 其余标题仍有稳定的候选级母题键；已知同义母题通过上面的显式归并，
  // 不用粗粒度关键词把不同的真实场景一并挡掉。
  return `fallback:${account.business_line ?? "executive"}:${account.persona}:${methodId}:${normalizeTitleHistoryFingerprint(title)}`;
}

/**
 * 原生法模型异常时使用的结构化候选。每一条都带自己的承诺和母题键，
 * 因此标题替换不会把上一条标题的正文承诺错带到新标题上。
 */
export function fallbackTitleCandidates(account: GrowthAccount, methodId: TitleMethodId): FallbackTitleCandidate[] {
  const [primary, primaryPromise] = fallbackTitles(account)[methodId];
  const isOverseasParentBuyer = account.business_line === "overseas_student" && account.persona === "buyer";
  const variants = isOverseasParentBuyer
    ? OVERSEAS_STUDENT_PARENT_BUYER_TITLE_VARIANTS[methodId]
    : account.business_line === "overseas_student"
      ? OVERSEAS_STUDENT_FALLBACK_TITLE_VARIANTS[methodId]
      : EXECUTIVE_FALLBACK_TITLE_VARIANTS[methodId];
  const emergency = NATIVE_EMERGENCY_TITLE_VARIANTS[account.business_line ?? "executive"][methodId] ?? [];
  // 亲子账号绝不能在兜底时退回泛“留学生本人”标题；否则模型波动会让
  // 选题页重新出现正确正文、错误标题的视角串线。
  const candidates = isOverseasParentBuyer ? variants : [primary, ...variants, ...emergency];
  return Array.from(new Set(candidates)).map((title) => ({
    title,
    title_promise: fallbackCandidatePromise(methodId, title, primary, primaryPromise),
    premise_key: fallbackCandidatePremiseKey(account, methodId, title),
  }));
}

export function fallbackTitleOptions(account: GrowthAccount, methodId: TitleMethodId) {
  return fallbackTitleCandidates(account, methodId).map((candidate) => candidate.title);
}

function fallbackTopic(
  account: GrowthAccount,
  method: TitleMethodDefinition,
  mode: MethodGenerationMode,
  source?: TopicSourceSnapshot,
  titleOverride?: string,
  candidate?: FallbackTitleCandidate,
): TopicCandidate {
  const [title, promise] = fallbackTitles(account)[method.id];
  const isOverseas = account.business_line === "overseas_student";
  const topic: TopicCandidate = {
    id: id(), method_group: method.group, method_id: method.id, method_label: method.label, generation_mode: mode,
    title: enforceTitleLimit(candidate?.title || titleOverride || title),
    title_promise: candidate?.title_promise || promise,
    fallback_premise_key: candidate?.premise_key,
    target_user: account.target_user, pain: account.core_problem,
    hook: candidate?.title || title, source_snapshot: source,
    internal_insight_source: method.group === "native" && !method.sourceRequired ? account.trust_source : undefined,
    origin_force: isOverseas ? "使用留学生熟悉的毕业、投递、回国或留当地求职场景。" : "使用中高管熟悉的职位、离职、跳槽或职业路径场景。",
    conflict_judgement: isOverseas ? "把留学投入与真实岗位匹配之间的落差放到标题中。" : "把平台位置与市场定价之间的落差放到标题中。",
    follow_reason: account.follow_reason || (isOverseas ? "持续获得留学生求职路径判断。" : "持续获得中高管职业决策判断。"),
    test_variable: `${method.label}标题能否带来目标人群有效咨询`,
    expected_signal: "出现具体处境、候选路径或决策冲突的站内咨询",
    repeatable_angle: `可继续复测${method.label}方法`, broad_traffic_risk: 4, priority: "A",
  };
  topic.validation_checks = validateTopicCandidate(topic, account.persona);
  return topic;
}

function normalizeTopics(
  raw: unknown,
  account: GrowthAccount,
  methods: TitleMethodDefinition[],
  mode: MethodGenerationMode,
  sources: Map<TitleMethodId, TopicSourceSnapshot>,
) {
  const rows = Array.isArray(raw) ? raw : [];
  const titles = fallbackTitles(account);
  return methods.map((method) => {
    const row = rows.find((item) => item?.method_id === method.id);
    if (!row || !asText(row.title)) throw new Error(`missing_method_title:${method.id}`);
    const title = enforceTitleLimit(asText(row.title));
    const base = fallbackTopic(account, method, mode, sources.get(method.id), title);
    const topic: TopicCandidate = {
      ...base,
      title,
      title_promise: asText(row.title_promise) || titles[method.id][1],
      target_user: asText(row.target_user) || account.target_user,
      pain: asText(row.pain) || account.core_problem,
      hook: asText(row.hook) || asText(row.title),
      origin_force: asText(row.origin_force) || base.origin_force,
      conflict_judgement: asText(row.conflict_judgement) || base.conflict_judgement,
      follow_reason: asText(row.follow_reason) || account.follow_reason || (account.business_line === "overseas_student" ? "持续获得留学生求职判断。" : "持续获得中高管职业判断。"),
      test_variable: asText(row.test_variable) || `${method.label}标题入口`,
      expected_signal: asText(row.expected_signal) || "有效咨询",
      repeatable_angle: asText(row.repeatable_angle) || `复测${method.label}`,
      broad_traffic_risk: Math.max(1, Math.min(10, Number(row.broad_traffic_risk) || 4)),
      priority: ["S", "A", "B", "C"].includes(row.priority) ? row.priority : "A",
    };
    topic.validation_checks = validateTopicCandidate(topic, account.persona);
    return topic;
  });
}

function supportedTitleFacts(account: GrowthAccount) {
  return [
    account.target_user,
    account.core_problem,
    account.trust_source,
    account.account_value,
    account.one_liner,
    account.follow_reason,
    ...Object.values(account.persona_specific ?? {}),
  ].filter((value): value is string => typeof value === "string" && value.trim().length >= 4);
}

export function titlePersonaProblems(topic: TopicCandidate, account: GrowthAccount) {
  const title = topic.title;
  const problems: string[] = [];
  if (!isBusinessCompatibleText(title, account.business_line ?? "executive")) {
    problems.push(`${topic.method_id}:标题混入了另一条业务的人群或场景`);
  }
  // 这不是要求标题必须直说“我是买家/专家/商家”，而是拦住明显串视角的表达。
  if (account.persona === "buyer" && /(?:我们团队|服务对象|客户交付|本机构|咨询产品)/u.test(title)) {
    problems.push(`${topic.method_id}:买家视角不能把服务方口吻写进标题`);
  }
  if (account.persona === "expert" && /(?:我家孩子|陪娃|我们家)/u.test(title)) {
    problems.push(`${topic.method_id}:专家视角不能写成家长亲历口吻`);
  }
  if (account.persona === "merchant" && /(?:我家孩子|陪娃秋招|作为老师)/u.test(title)) {
    problems.push(`${topic.method_id}:商家视角不能写成买家或专家第一人称口吻`);
  }
  // 产品定义已经固定：留学生业务的买家视角就是“留学生家长”。标题本身
  // 必须承担这个身份信息，不能留给正文承诺或后续正文去补。
  const parentNarrative = account.business_line === "overseas_student"
    && account.persona === "buyer";
  if (parentNarrative && !/(?:我家|孩子|娃|儿子|女儿|家长|爸妈|父母|陪孩子|陪娃)/u.test(title)) {
    problems.push(`${topic.method_id}:留学生家长标题必须显式体现亲子关系，不能只在正文承诺里补身份`);
  }
  if (parentNarrative && /室友|同学/u.test(title) && !/孩子|娃|儿子|女儿/u.test(title)) {
    problems.push(`${topic.method_id}:留学生家长人设不能写成留学生本人的同学/室友口吻`);
  }
  return problems;
}

function titleQualityProblems(topic: TopicCandidate, account: GrowthAccount) {
  const quality = evaluateGrowthTitleQuality(topic.title, {
    supportedFacts: supportedTitleFacts(account),
  });
  const problems = quality.reasons.map((reason) => {
    const labels: Record<string, string> = {
      empty: "标题为空",
      too_long: "标题超过20字",
      traditional_chinese: "标题含繁体字",
      garbled_latin_cjk: "标题含中英文乱码拼接",
      unsupported_factual_claim: `标题含无依据的具体事实${quality.unsupportedClaims.length ? `：${quality.unsupportedClaims.join("、")}` : ""}`,
      unnatural_jargon: "标题含不自然的生造黑话",
      incomplete_sentence: "标题是残缺半句话，缺少必要动作或补语",
      generic_title: "标题只有抽象对照，缺少具体人物、场景或动作",
    };
    return `${topic.method_id}:${labels[reason] || "标题质量不合格"}`;
  });
  return [...problems, ...titlePersonaProblems(topic, account)];
}

function topicCandidateDuplicateProblems(
  topic: TopicCandidate,
  historyTitles: string[],
  historyTopics: TopicTitleHistoryEntry[],
  accepted: TopicCandidate[],
  options: { preserveDirection?: boolean; businessLine?: GrowthBusinessLine } = {},
) {
  const problems: string[] = [];
  // 全历史禁止原样、标点微调、繁简体、数字替换、近义改写和轻微语序调整。
  // 不能因为换了方法就允许用户连续看到同一个母题的换皮标题。
  const sameFingerprint = historyTitles.find((item) => titlesHaveSameHistoryFingerprint(topic.title, item));
  const semanticHistory = historyTopics.find((item) =>
    titlesAreNearDuplicate(topic.title, item.title));
  const nearHistory = semanticHistory?.title ?? historyTitles.find((item) => titlesAreNearDuplicate(topic.title, item));
  if (sameFingerprint) problems.push(`${topic.method_id}:与历史标题“${sameFingerprint}”实质相同`);
  else if (nearHistory) problems.push(`${topic.method_id}:与历史标题“${nearHistory}”重复或近似`);
  const inBatch = accepted.find((item) => titlesAreNearDuplicate(topic.title, item.title));
  if (inBatch) problems.push(`${topic.method_id}:与本批次${inBatch.method_id}标题重复或近似`);
  // 同一批次不能把“投错岗/岗没选对”这一核心冲突拆成两张卡片。
  // 这是批内组合约束，不把不同句式、不同材料的历史选岗题一概判重。
  const currentSemantic = buildTitleSemanticSignature(topic.title);
  const sameBatchRoleMismatch = accepted.find((item) => {
    const priorSemantic = buildTitleSemanticSignature(item.title);
    return currentSemantic.scenario === "job_targeting"
      && currentSemantic.conflict === "role_mismatch"
      && priorSemantic.scenario === "job_targeting"
      && priorSemantic.conflict === "role_mismatch";
  });
  if (sameBatchRoleMismatch) {
    problems.push(`${topic.method_id}:与本批次${sameBatchRoleMismatch.method_id}复用了同一岗位方向错位冲突`);
  }
  if (!options.preserveDirection) {
    const diversity = buildTopicDiversitySignature(topic, options.businessLine);
    const currentPremiseKey = topic.fallback_premise_key ?? diversity.mother_topic_key;
    // “换一批标题”不能只换词继续写同一原生法母题。只对同一原生方法的
    // 最近五批启用“母题＋人物/场景/结果素材”冷却，避免把宽泛的“离职/秋招”
    // 一概误杀；跨方法仍由语义近似门禁判断。单槽换题保留方向，不走这条规则。
    if (topic.method_group === "native") {
      const repeatedRecentNativePremise = historyTopics.find((item) => {
        if (item.method_id !== topic.method_id || (item.batch_index ?? Number.MAX_SAFE_INTEGER) >= 5) {
          return false;
        }
        const historicalMethod = item.method_id ? TITLE_METHOD_BY_ID[item.method_id] : undefined;
        return historicalMethod?.group === "native"
          && Boolean(item.mother_topic_key)
          && Boolean(item.material_signature)
          && item.mother_topic_key === currentPremiseKey
          && item.material_signature === diversity.material_signature;
      });
      if (repeatedRecentNativePremise) {
        problems.push(
          `${topic.method_id}:与近5批同方法标题“${repeatedRecentNativePremise.title}”复用了同一母题和素材组合`,
        );
      }
    }
    const sameBatchMaterial = accepted.find((item) => {
      const other = buildTopicDiversitySignature(item, options.businessLine);
      const otherPremiseKey = item.fallback_premise_key ?? other.mother_topic_key;
      return otherPremiseKey === currentPremiseKey
        && other.material_signature === diversity.material_signature;
    });
    if (sameBatchMaterial) {
      problems.push(`${topic.method_id}:与本批次${sameBatchMaterial.method_id}使用同一母题和素材组合`);
    }
    // 母题、句式、角色/场景组合属于“生成提示”，不能再作为历史硬门禁。
    // 这些分类本身很粗（例如“离职”“转型”“过往-现在”），会把实质不同的
    // 原生标题判成重复，导致整批标题不断被打回。真正的历史去重由上面的
    // 完全指纹和同方法近似标题承担；同一批次仍保留素材组合拦截，避免卡片
    // 同时出现两条几乎同一个角度的标题。
  }
  return problems;
}

export function topicBatchDuplicateProblems(
  topics: TopicCandidate[],
  historyTitles: string[],
  historyTopics: TopicTitleHistoryEntry[] = [],
  businessLine: GrowthBusinessLine = "executive",
) {
  const problems: string[] = [];
  const accepted: TopicCandidate[] = [];
  for (const topic of topics) {
    problems.push(...topicCandidateDuplicateProblems(
      topic,
      historyTitles,
      historyTopics,
      accepted,
      { businessLine },
    ));
    accepted.push(topic);
  }
  return problems;
}

/**
 * 首轮语义审核只负责每个槽位的一条最优候选。原先把四个方法的多个候选和
 * 整部历史都塞进去，审核偶发漏项就会误伤整批。未选中槽位才进入二审，届时
 * 再给模型看少量替代题；两轮都使用短 id，且每一个交付标题都必须有 decision。
 */
export function compactNativeAuditOptions(input: {
  methods: TitleMethodDefinition[];
  candidatesByMethod: Map<TitleMethodId, NativeTitleCandidateOption[]>;
}) {
  const byMethod = new Map<TitleMethodId, NativeTitleCandidateOption[]>();
  let sequence = 1;
  for (const method of input.methods) {
    const options = input.candidatesByMethod.get(method.id) ?? [];
    const firstOption = options.find((option) => option.audit.kind === "model")
      ?? options.find((option) => option.audit.kind === "fallback");
    const shortlist = (firstOption ? [firstOption] : [])
      .map((option) => ({
        ...option,
        audit: { ...option.audit, id: `N${sequence++}` },
      }));
    byMethod.set(method.id, shortlist);
  }
  return byMethod;
}

/**
 * 首轮审核没有选中某个方法时，只取尚未送审的静态安全候选做小批重审。
 * 这不是放宽门禁：每一个重试候选仍先过本地质量/身份/全历史去重，再过同一
 * 语义审核。它只修复了旧实现“安全候选已准备好但从未送审”的交付断点。
 */
export function compactNativeAuditRetryOptions(input: {
  methods: TitleMethodDefinition[];
  candidatesByMethod: Map<TitleMethodId, NativeTitleCandidateOption[]>;
  auditedTitleFingerprints: Set<string>;
}) {
  const byMethod = new Map<TitleMethodId, NativeTitleCandidateOption[]>();
  let sequence = 1;
  const perMethodLimit = Math.max(1, Math.min(
    MAX_NATIVE_RETRY_AUDIT_CANDIDATES_PER_METHOD,
    Math.floor(TITLE_NOVELTY_AUDIT_MAX_CANDIDATES / Math.max(1, input.methods.length)),
  ));
  for (const method of input.methods) {
    const options = input.candidatesByMethod.get(method.id) ?? [];
    const unreviewed = options.filter((option) => !input.auditedTitleFingerprints.has(
      normalizeTitleForComparison(option.topic.title),
    ));
    // 首轮容量有限：买家视角会留下模型第 3、4 个候选，专家视角也会留下
    // 额外模型候选。旧实现只拿静态候选做二审，等于把已经生成、也通过本地
    // 门禁的模型替代题直接丢掉，导致“有新题却整批失败”。二审先看未审模型
    // 候选，再看未审静态候选；每一条仍必须经过同一语义终审，绝不直接放行。
    const modelAlternatives = unreviewed
      .filter((option) => option.audit.kind === "model")
      .slice(0, Math.max(1, perMethodLimit - 1));
    const fallbackOption = unreviewed.find((option) => option.audit.kind === "fallback");
    const shortlisted = [...modelAlternatives, ...(fallbackOption ? [fallbackOption] : [])]
      .slice(0, perMethodLimit).map((option) => ({
      ...option,
      audit: { ...option.audit, id: `R${sequence++}` },
    }));
    byMethod.set(method.id, shortlisted);
  }
  return byMethod;
}

/**
 * 将已经完整返回的语义审核结果转成真正可以交付的原生标题。这里仍会再跑一次
 * 本地的历史、批内和视角门禁：审核模型只负责语义判断，不能覆盖确定性规则。
 *
 * 这个纯函数被首轮、二次候选审核以及审核故障后的安全恢复共用，避免不同恢复
 * 分支出现“同样审核过、却采用了不同放行规则”的结构性漏洞。
 */
export function selectAuditedNativeTitleOptions(input: {
  methods: TitleMethodDefinition[];
  optionsByMethod: Map<TitleMethodId, NativeTitleCandidateOption[]>;
  decisions: NativeTitleNoveltyDecision[];
  alreadyAccepted: TopicCandidate[];
  historyTitles: string[];
  historyTopics: TopicTitleHistoryEntry[];
  businessLine: GrowthBusinessLine;
  directionLocks?: Partial<Record<TitleMethodId, TopicCandidate>>;
}) {
  const decisionByCandidate = new Map(input.decisions.map((decision) => [decision.candidateId, decision]));
  const selectedAuditIds = new Set<string>();
  const accepted = new Map<TitleMethodId, TopicCandidate>();
  const rejectedTitles: string[] = [];
  const problems: string[] = [];

  for (const method of input.methods) {
    const options = input.optionsByMethod.get(method.id) ?? [];
    let selected = false;
    for (const option of options) {
      const decision = decisionByCandidate.get(option.audit.id);
      if (!decision?.eligible) {
        rejectedTitles.push(option.topic.title);
        continue;
      }
      const conflictsWithSelected = decision.conflictingCandidateIds.some((candidateId) => selectedAuditIds.has(candidateId))
        || [...selectedAuditIds].some((candidateId) => (
          decisionByCandidate.get(candidateId)?.conflictingCandidateIds.includes(option.audit.id)
        ));
      if (conflictsWithSelected) {
        rejectedTitles.push(option.topic.title);
        continue;
      }
      const duplicateProblems = topicCandidateDuplicateProblems(
        option.topic,
        input.historyTitles,
        input.historyTopics,
        [...input.alreadyAccepted, ...accepted.values()],
        {
          preserveDirection: Boolean(input.directionLocks?.[method.id]),
          businessLine: input.businessLine,
        },
      );
      if (duplicateProblems.length) {
        rejectedTitles.push(option.topic.title);
        continue;
      }
      accepted.set(method.id, option.topic);
      selectedAuditIds.add(option.audit.id);
      selected = true;
      break;
    }
    if (!selected) {
      const firstRejected = options
        .map((option) => decisionByCandidate.get(option.audit.id))
        .find((decision) => decision && !decision.eligible);
      problems.push(
        `${method.id}:新候选未通过新颖度或中文表达审核${firstRejected?.reason ? `（${firstRejected.reason}）` : ""}`,
      );
    }
  }
  return { accepted, rejectedTitles, problems };
}

/**
 * 只把最可能撞题的历史送给模型：同方法近期标题、当前批已通过的标题，以及
 * 少量最新全局标题。全历史仍由本地确定性门禁检查，不再拖慢第二次模型调用。
 */
function compactNativeAuditReferences(input: {
  methods: TitleMethodDefinition[];
  historyTopics: TopicTitleHistoryEntry[];
  historyTitles: string[];
  accepted: TopicCandidate[];
}) {
  const references: NativeTitleNoveltyReference[] = [];
  const seen = new Set<string>();
  const add = (title: string, kind: NativeTitleNoveltyReference["kind"]) => {
    const fingerprint = normalizeTitleForComparison(title);
    if (!fingerprint || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    references.push({ id: `H${references.length + 1}`, title, kind });
  };
  for (const method of input.methods) {
    input.historyTopics
      .filter((item) => item.method_id === method.id)
      .slice(0, 4)
      .forEach((item) => add(item.title, "history"));
  }
  input.historyTopics.slice(0, 12).forEach((item) => add(item.title, "history"));
  input.historyTitles.slice(0, 16).forEach((title) => add(title, "history"));
  input.accepted.forEach((topic) => add(topic.title, "selected"));
  return references.slice(0, 36);
}

const TITLE_METHOD_GATE_RULES: Record<TitleMethodId, string> = {
  traffic: "必须能识别所绑定热点的事件、人物或社会冲突，并转成当前人群的具体决策问题",
  human_pain: "非来源型方法",
  tug_of_war: "非来源型方法",
  scarce_material: "非来源型方法",
  superlative: "非来源型方法",
  contrarian: "非来源型方法",
  nostalgia: "非来源型方法",
  inventory: "非来源型方法",
  same_product: "必须迁移同类产品的表达、使用场景或选择逻辑",
  same_effect: "必须迁移帮助用户解决问题、比较路径或降低风险的功效表达",
  similar_audience: "必须迁移母题人群的具体处境、身份矛盾或共同压力",
  same_outcome: "必须迁移母题指向的最终利益、选择权、安全感或职业结果",
  viral_framework: "必须迁移母题的句式骨架、信息排列或冲突结构",
};

function hasBigramOverlap(left: string, right: string) {
  const a = ngrams(normalizeTitleHistoryFingerprint(left), 2);
  const b = ngrams(normalizeTitleHistoryFingerprint(right), 2);
  for (const item of a) if (b.has(item)) return true;
  return false;
}

function sourceMigrationProblems(
  topics: TopicCandidate[],
  sources: Map<TitleMethodId, TopicSourceSnapshot>,
  structureCards: Map<TitleMethodId, BenchmarkStructureCard>,
) {
  return topics.flatMap((topic): string[] => {
    const source = sources.get(topic.method_id);
    if (!source) return [];
    const card = structureCards.get(topic.method_id);
    const problems: string[] = [];
    if (!card || card.status !== "locked" || card.structure_version !== SOURCE_MIGRATION_VERSION) {
      problems.push(`${topic.method_id}:缺少已锁定的${SOURCE_MIGRATION_VERSION}母题结构卡`);
      return problems;
    }
    if (titlesAreNearDuplicate(topic.title, source.original_title)) {
      problems.push(`${topic.method_id}:标题与原题过于接近，未完成原创迁移`);
    }
    if (topic.method_id === "traffic" && !hasBigramOverlap(topic.title, source.original_title)) {
      problems.push(`${topic.method_id}:新标题无法识别绑定热点中的事件、人物或冲突`);
    }
    if (topic.method_id === "viral_framework") {
      const sourceSignals = titleStructureSignals(source.original_title);
      const titleSignals = titleStructureSignals(topic.title);
      if (sourceSignals.size > 0 && ![...sourceSignals].some((signal) => titleSignals.has(signal))) {
        problems.push(`${topic.method_id}:未继承母题可识别的句式或冲突结构`);
      }
    }
    if (!TITLE_METHOD_GATE_RULES[topic.method_id]) problems.push(`${topic.method_id}:缺少方法迁移规则`);
    return problems;
  });
}

export async function generateTopicBatch(input: {
  account: GrowthAccount;
  week?: number;
  generationMode?: MethodGenerationMode;
  excludeTitles?: string[];
  currentTitles?: string[];
  historyTitles?: string[];
  historyTopics?: TopicTitleHistoryEntry[];
  recentSignals?: string;
  learningBrief?: GrowthLearningBrief;
  allowSourcePause?: boolean;
  methodIds?: TitleMethodId[];
  directionLocks?: Partial<Record<TitleMethodId, TopicCandidate>>;
}): Promise<{
  topics: TopicCandidate[];
  unavailableMethods: GrowthRun["unavailable_methods"];
  methodDeliveries: TopicMethodDelivery[];
  generationAttempts: number;
  structureCards: BenchmarkStructureCard[];
  /** 仅用于路由保存排障快照；不会显示模型内部推理。 */
  nativeTitleAudit?: NativeTitleAuditDiagnostic;
  /** 被本地或语义门禁拒绝的候选；路由会写入下一轮排除池，避免重复失败。 */
  rejectedTitles?: string[];
  usage?: Record<string, unknown>;
}> {
  const generationMode = input.generationMode ?? "default";
  const requestedMethods = input.methodIds?.length ? new Set(input.methodIds) : null;
  const expected = methodsForPersona(
    input.account.persona,
    generationMode,
    input.account.method_overrides,
  ).filter((method) => !requestedMethods || requestedMethods.has(method.id));
  const sources = freshestSources(input.account);
  const expectedSourceMethodIds = new Set(
    expected.filter((method) => method.sourceRequired).map((method) => method.id),
  );
  let prepared: Awaited<ReturnType<typeof ensureBenchmarkStructureCards>>;
  try {
    prepared = await ensureBenchmarkStructureCards({
      account: input.account,
      sources: [...sources.values()].filter((source) =>
        expectedSourceMethodIds.has(source.method_id)
      ),
    });
  } catch (error) {
    if (input.allowSourcePause) {
      prepared = {
        cards: [],
        rejected: [...expectedSourceMethodIds].map((method_id) => ({
          method_id,
          reason: "母题结构拆解暂未完成，本轮先暂停该槽位。",
        })),
      };
    } else {
    throw new Error(`topic_batch_generation_failed:${[...expectedSourceMethodIds]
      .map((methodId) => `${methodId}:结构卡生成失败`)
      .join(" | ")}:${(error as Error).message}`);
    }
  }
  if (prepared.rejected.length && !input.allowSourcePause) {
    throw new Error(`topic_batch_generation_failed:${prepared.rejected
      .map((item) => `${item.method_id}:${item.reason}`)
      .join(" | ")}`);
  }
  const structureCards = new Map(prepared.cards.map((card) => [card.method_id, card]));
  const methods = expected.filter((method) =>
    !method.sourceRequired || (sources.has(method.id) && structureCards.has(method.id))
  );
  const unavailableMethods = expected.flatMap((method) => {
    if (!method.sourceRequired) return [];
    if (!sources.has(method.id)) {
      return [{
        method_id: method.id,
        method_label: method.label,
        reason: "暂无7天内合格母题，或热度快照/链接核验已超过24小时",
      }];
    }
    if (!structureCards.has(method.id)) {
      return [{
        method_id: method.id,
        method_label: method.label,
        reason: prepared.rejected.find((item) => item.method_id === method.id)?.reason
          || "母题未形成完整的锁定结构卡",
      }];
    }
    return [];
  });
  const initialDelivery = (method: TitleMethodDefinition): TopicMethodDelivery | null => {
    const unavailable = unavailableMethods.find((item) => item.method_id === method.id);
    if (!unavailable) return null;
    return {
      method_id: method.id,
      method_label: method.label,
      status: "paused",
      reason: unavailable.reason,
      attempts: 0,
      title_origin: "none",
    };
  };
  if (!methods.length) {
    return {
      topics: [],
      unavailableMethods,
      methodDeliveries: expected.map((method) => initialDelivery(method) ?? ({
        method_id: method.id,
        method_label: method.label,
        status: "failed" as const,
        reason: "本次没有形成可生成的标题槽位。",
        attempts: 0,
        title_origin: "none" as const,
      })),
      generationAttempts: 0,
      structureCards: prepared.cards,
    };
  }
  const historyTitles = Array.from(new Set([
    ...(input.historyTitles ?? []),
    ...(input.excludeTitles ?? []),
    ...(input.currentTitles ?? []),
  ].filter(Boolean)));
  const historyTopics = input.historyTopics ?? [];
  const rejectedTitles: string[] = [];
  let lastProblems: string[] = [];
  let usage: Record<string, unknown> | undefined;
  const accepted = new Map<TitleMethodId, TopicCandidate>();
  // 原生标题先在一批内收集，再做一次“候选 vs 全历史”的语义审核。此前在
  // 这里逐条即时接收，确定性关键词没覆盖到的同义改写会直接进入页面。
  const nativeCandidatesByMethod = new Map<TitleMethodId, NativeTitleCandidateOption[]>();
  // 常规“换一批”原本只请求主模型一次；主模型偶发中断时会直接留下空候选，
  // 后续严格门禁只能整批保留旧题。这里保留一次有明确上限的恢复机会：主路
  // 由不同供应商即时兜底，若仍未形成原生候选，再只为缺失原生槽位补一轮。
  // 对标槽位有自己的“来源暂停”语义，不在第二轮反复拉长等待。
  const maxAttempts = 2;
  let generationAttempts = 0;
  let nativeTitleAudit: NativeTitleAuditDiagnostic | undefined;

  const operatorReason = (method: TitleMethodDefinition, raw?: string) => {
    const unavailable = unavailableMethods.find((item) => item.method_id === method.id);
    if (unavailable) return unavailable.reason;
    const message = raw ?? "";
    if (/母题|来源|结构卡/u.test(message)) {
      return "没有形成可验证的新母题，本轮先保留当前标题。";
    }
    if (/迁移/u.test(message)) {
      return "新标题没有通过对标迁移审核，本轮先保留当前标题。";
    }
    if (/重复|近似|句式|素材/u.test(message)) {
      return "新候选与近期标题过于相似，本轮先保留当前标题。";
    }
    if (/模型未返回/u.test(message)) {
      return "本次没有形成新的合格标题，请稍后再试。";
    }
    return method.sourceRequired
      ? "该母题本轮未形成合格迁移标题，当前标题已保留。"
      : "本次没有形成新的合格标题，当前标题已保留。";
  };
  const buildDeliveries = (attempts: number): TopicMethodDelivery[] => expected.map((method) => {
    const topic = accepted.get(method.id);
    if (topic) {
      return {
        method_id: method.id,
        method_label: method.label,
        status: "ready",
        attempts,
        topic_id: topic.id,
        title_origin: "new",
      };
    }
    const rawProblem = lastProblems.find((problem) => problem.startsWith(`${method.id}:`));
    return {
      method_id: method.id,
      method_label: method.label,
      status: method.sourceRequired ? "paused" : "failed",
      reason: operatorReason(method, rawProblem),
      attempts,
      title_origin: "none",
    };
  });

  for (let attempt = 1; attempt <= maxAttempts && accepted.size < methods.length; attempt += 1) {
    generationAttempts = attempt;
    const pendingMethods = methods.filter((method) => {
      if (accepted.has(method.id)) return false;
      if (method.sourceRequired) return attempt === 1;
      return (nativeCandidatesByMethod.get(method.id)?.length ?? 0) < MAX_NATIVE_MODEL_CANDIDATES_PER_METHOD;
    });
    if (!pendingMethods.length) break;
    const generationAttemptStartedAt = Date.now();
    try {
      const result = await llmJSON<any>({
        system: GROWTH_SYSTEM_PROMPT,
        user: buildTopicPoolUserPrompt({
          week: Math.max(1, Math.min(4, input.week ?? 1)), persona: input.account.persona,
          targetUser: input.account.target_user, coreProblem: input.account.core_problem,
          recentSignals: input.learningBrief ? formatLearningBrief(input.learningBrief) : input.recentSignals,
          methods: pendingMethods, generationMode,
          sources: pendingMethods.map((method) => sources.get(method.id)).filter(Boolean) as TopicSourceSnapshot[],
          structureCards: pendingMethods.map((method) => structureCards.get(method.id)).filter(Boolean) as BenchmarkStructureCard[],
          excludeTitles: [...historyTitles, ...rejectedTitles, ...[...accepted.values()].map((topic) => topic.title)],
          directionLocks: pendingMethods.flatMap((method) => {
            const lock = input.directionLocks?.[method.id];
            return lock ? [{
              method_id: method.id,
              current_title: lock.title,
              title_promise: lock.title_promise,
              target_user: lock.target_user,
              pain: lock.pain,
              origin_force: lock.origin_force,
              conflict_judgement: lock.conflict_judgement,
            }] : [];
          }),
          diversityHistory: historyTopics,
          context: accountContext(input.account),
        }), maxTokens: 2200, temperature: Math.min(0.82, 0.62 + attempt * 0.07),
        // 主模型中断时，由不同供应商补同一份“整批候选”请求；两条路径都有
        // 单次上限，避免历史重复一多就把操作者困在无休止的重试里。
        timeoutMs: 18_000,
        jsonRetries: 0,
        allowFallback: true,
      });
      usage = resultUsage(result);
      const rows = Array.isArray(result.data?.topics) ? result.data.topics : [];
      const attemptProblems: string[] = [];
      const sourceCandidates: Array<{
        method: TitleMethodDefinition;
        topic: TopicCandidate;
        candidateRow: any;
        migration: SourceMigrationCandidate;
      }> = [];
      const candidateProblemsByMethod = new Map<TitleMethodId, string[]>();

      for (const method of pendingMethods) {
        const row = rows.find((item: any) => item?.method_id === method.id);
        if (!row) {
          attemptProblems.push(`${method.id}:模型未返回该方法`);
          continue;
        }
        const directionLock = input.directionLocks?.[method.id];
        const candidateTitles = Array.from(new Set([
          asText(row.title),
          ...(Array.isArray(row.alternative_titles) ? row.alternative_titles.map(asText) : []),
        ].map((value) => value.trim()).filter(Boolean))).slice(0, 5);
        let acceptedTopic: TopicCandidate | undefined;
        let capturedNativeCandidate = false;
        const candidateProblems: string[] = [];
        candidateProblemsByMethod.set(method.id, candidateProblems);

        for (const [candidateIndex, candidateTitle] of candidateTitles.entries()) {
          try {
            // 不允许先截成20字再放行：被截断的模型输出很容易把句子截残，
            // 也会掩盖“原题本来超长”的质量问题。
            const rawTitleQuality = evaluateGrowthTitleQuality(candidateTitle, {
              supportedFacts: supportedTitleFacts(input.account),
            });
            if (!rawTitleQuality.acceptable) {
              candidateProblems.push(...rawTitleQuality.reasons.map((reason) => (
                `${method.id}:模型候选${reason === "too_long" ? "超过20字" : "未通过标题质量门禁"}`
              )));
              rejectedTitles.push(candidateTitle);
              continue;
            }
            const candidateRow = { ...row, title: candidateTitle };
            const [normalizedTopic] = normalizeTopics([candidateRow], input.account, [method], generationMode, sources);
            const topic: TopicCandidate = directionLock ? {
              ...normalizedTopic,
              title: candidateTitle,
              title_promise: directionLock.title_promise,
              title_promise_status: "synced",
              title_promise_validation: undefined,
              target_user: directionLock.target_user,
              pain: directionLock.pain,
              hook: candidateTitle,
              origin_force: directionLock.origin_force,
              conflict_judgement: directionLock.conflict_judgement,
              source_snapshot: directionLock.source_snapshot ?? normalizedTopic.source_snapshot,
            } : normalizedTopic;
            topic.validation_checks = validateTopicCandidate(topic, input.account.persona);
            const previousCount = directionLock ? extractPromisedCount(directionLock.title) : undefined;
            const candidateCount = directionLock ? extractPromisedCount(candidateTitle) : undefined;
            if (
              directionLock
              && previousCount !== candidateCount
              && (previousCount !== undefined || candidateCount !== undefined)
            ) {
              candidateProblems.push(
                `${topic.method_id}:新标题改变了原方向中的数字承诺`,
              );
              rejectedTitles.push(candidateTitle);
              continue;
            }
            const qualityProblems = titleQualityProblems(topic, input.account);
            const duplicateProblems = qualityProblems.length
              ? []
              : topicCandidateDuplicateProblems(
              topic,
              historyTitles,
              historyTopics,
              [...accepted.values()],
              {
                preserveDirection: Boolean(directionLock),
                businessLine: input.account.business_line ?? "executive",
              },
            );
            const migrationProblems = qualityProblems.length || duplicateProblems.length
              ? []
              : sourceMigrationProblems([topic], sources, structureCards);
            const problems = [...qualityProblems, ...duplicateProblems, ...migrationProblems];
            if (!problems.length) {
              const source = sources.get(topic.method_id);
              if (source) {
                const structureCard = structureCards.get(topic.method_id);
                if (!structureCard) {
                  candidateProblems.push(`${topic.method_id}:缺少已锁定结构卡`);
                  rejectedTitles.push(candidateTitle);
                  continue;
                }
                sourceCandidates.push({
                  method,
                  topic,
                  candidateRow,
                  migration: {
                    candidateId: `${attempt}:${method.id}:${candidateIndex}`,
                    methodId: method.id,
                    methodLabel: method.label,
                    source,
                    structureCard,
                    title: topic.title,
                    inheritedStructure: structureCard.inheritable_element,
                    replacedContent: structureCard.replacement_requirement,
                  },
                });
              } else {
                // 原生法不能在这里即时放行。先把确定性合格的候选收进同一
                // 批次，等所有槽位都有候选后，再用一次 LLM 按“历史母题”
                // 审核，拦住“供娃留完学/秋招方向都懵”这种整句换皮。
                const nativeCandidates = nativeCandidatesByMethod.get(method.id) ?? [];
                if (nativeCandidates.length < MAX_NATIVE_MODEL_CANDIDATES_PER_METHOD) {
                  nativeCandidates.push({
                    audit: {
                      id: `model:${attempt}:${method.id}:${candidateIndex}`,
                      methodId: method.id,
                      title: topic.title,
                      kind: "model",
                    },
                    topic,
                  });
                  nativeCandidatesByMethod.set(method.id, nativeCandidates);
                  capturedNativeCandidate = true;
                }
              }
            }
            if (problems.length) {
              candidateProblems.push(...problems);
              rejectedTitles.push(candidateTitle);
            }
          } catch (error) {
            candidateProblems.push(`${method.id}:${(error as Error).message}`);
          }
        }
        if (
          !acceptedTopic
          && !capturedNativeCandidate
          && !sourceCandidates.some((candidate) => candidate.method.id === method.id)
        ) {
          attemptProblems.push(candidateProblems[0] ?? `${method.id}:未返回可用的新标题候选`);
        }
      }

      if (sourceCandidates.length) {
        let decisions: Awaited<ReturnType<typeof validateSourceMigrations>> = [];
        try {
          decisions = await validateSourceMigrations({
            businessLine: input.account.business_line ?? "executive",
            persona: input.account.persona,
            targetUser: input.account.target_user,
            coreProblem: input.account.core_problem,
            candidates: sourceCandidates.map((candidate) => candidate.migration),
          });
        } catch (error) {
          for (const candidate of sourceCandidates) {
            candidateProblemsByMethod.get(candidate.method.id)?.push(
              `${candidate.method.id}:独立迁移审核暂不可用，本轮暂停`,
            );
          }
          attemptProblems.push(...[...new Set(sourceCandidates.map((candidate) =>
            `${candidate.method.id}:独立迁移审核暂不可用，本轮暂停`
          ))]);
        }
        const decisionById = new Map(decisions.map((decision) => [decision.candidateId, decision]));

        for (const method of pendingMethods.filter((item) => sources.has(item.id))) {
          const options = sourceCandidates.filter((candidate) => candidate.method.id === method.id);
          let acceptedSourceTopic: TopicCandidate | undefined;
          for (const option of options) {
            const decision = decisionById.get(option.migration.candidateId);
            if (!decision?.passed) {
              rejectedTitles.push(option.topic.title);
              candidateProblemsByMethod.get(method.id)?.push(
                `${method.id}:${decision?.reason || "独立迁移门禁未通过"}`,
              );
              continue;
            }
            const duplicateProblems = topicCandidateDuplicateProblems(
              option.topic,
              historyTitles,
              historyTopics,
              [...accepted.values()],
              { businessLine: input.account.business_line ?? "executive" },
            );
            if (duplicateProblems.length) {
              rejectedTitles.push(option.topic.title);
              candidateProblemsByMethod.get(method.id)?.push(...duplicateProblems);
              continue;
            }
            acceptedSourceTopic = {
              ...option.topic,
              source_usage_status: "passed",
              source_usage_version: SOURCE_MIGRATION_VERSION,
              migration_validation_status: "passed",
              migration_validation_version: SOURCE_MIGRATION_VERSION,
              migration_validation_evidence: decision.evidence || decision.reason,
              structure_card_id: option.migration.structureCard.id,
              structure_version: SOURCE_MIGRATION_VERSION,
            };
            accepted.set(method.id, acceptedSourceTopic);
            break;
          }
          if (!acceptedSourceTopic) {
            const methodProblems = candidateProblemsByMethod.get(method.id) ?? [];
            attemptProblems.push(methodProblems[0] ?? `${method.id}:没有候选标题通过独立迁移门禁`);
          }
        }
      }

      // 不覆盖前一轮诊断。此前第二轮会把“模型未返回/质量失败”的真实原因
      // 覆盖掉，最后页面只能看到一条无关的旧提示，给排障造成误导。
      lastProblems = Array.from(new Set([...lastProblems, ...attemptProblems]));
      if (accepted.size === methods.length) {
        return {
          topics: methods.map((method) => accepted.get(method.id)!),
          unavailableMethods,
          methodDeliveries: buildDeliveries(attempt),
          generationAttempts: attempt,
          structureCards: prepared.cards,
          rejectedTitles: Array.from(new Set(rejectedTitles)).slice(-160),
          usage,
        };
      }
      console.warn(
        `[growth] topic batch partially accepted attempt ${attempt} (${accepted.size}/${methods.length}):`,
        lastProblems.join(" | "),
      );
    } catch (error) {
      const problem = (error as Error).message || "标题批次生成失败";
      lastProblems = Array.from(new Set([...lastProblems, problem]));
      console.warn("[growth] topic model generation attempt failed", JSON.stringify({
        attempt,
        pending_method_ids: pendingMethods.map((method) => method.id),
        elapsed_ms: Date.now() - generationAttemptStartedAt,
        error_kind: /abort|timeout|超时/iu.test(problem) ? "timeout" : "unavailable",
      }));
    }
  }

  const nativeMethods = methods.filter((method) => !method.sourceRequired && !accepted.has(method.id));
  // 把静态兜底也一并交给同一个审核器。这样模型异常时不会绕开“和历史实质
  // 换题”的要求；审核器不可用时宁可保留原批，也绝不把可能换皮的标题写进去。
  for (const method of nativeMethods) {
    if (input.directionLocks?.[method.id]) continue;
    const candidates = nativeCandidatesByMethod.get(method.id) ?? [];
    let fallbackCount = 0;
    for (const candidate of fallbackTitleCandidates(input.account, method.id)) {
      if (fallbackCount >= MAX_NATIVE_FALLBACK_CANDIDATES_PER_METHOD) break;
      const topic = fallbackTopic(input.account, method, generationMode, undefined, candidate.title, candidate);
      topic.hook = topic.title;
      const problems = [
        ...titleQualityProblems(topic, input.account),
        ...topicCandidateDuplicateProblems(
          topic,
          historyTitles,
          historyTopics,
          [...accepted.values()],
          { businessLine: input.account.business_line ?? "executive" },
        ),
      ];
      if (problems.length) continue;
      if (candidates.some((item) => normalizeTitleForComparison(item.topic.title) === normalizeTitleForComparison(topic.title))) {
        continue;
      }
      candidates.push({
        audit: {
          id: `fallback:${method.id}:${fallbackCount}`,
          methodId: method.id,
          title: topic.title,
          kind: "fallback",
        },
        topic,
      });
      fallbackCount += 1;
    }
    nativeCandidatesByMethod.set(method.id, candidates);
  }

  const auditOptionsByMethod = compactNativeAuditOptions({
    methods: nativeMethods,
    candidatesByMethod: nativeCandidatesByMethod,
  });
  const auditOptions = nativeMethods.flatMap((method) => auditOptionsByMethod.get(method.id) ?? []);
  const auditCandidates = auditOptions.map((option) => option.audit);
  if (auditCandidates.length) {
    const references = compactNativeAuditReferences({
      methods: nativeMethods,
      historyTopics,
      historyTitles,
      accepted: [...accepted.values()],
    });
    const auditStartedAt = Date.now();
    // 只有真正拿到 decision 的候选才算“已经审核”。若模型漏回一项，它仍可
    // 进入一次受限恢复，不能因为被送过一次就永久从候选池消失。
    let auditedTitleFingerprints = new Set<string>();
    try {
      // 审核只复核“已通过本地质量、身份和全历史去重”的精简候选。完整历史
      // 仍由确定性门禁覆盖，第二次模型不再是整批标题交付的性能单点。
      const audit = await auditNativeTitleBatchNovelty({
        businessLine: input.account.business_line ?? "executive",
        persona: input.account.persona,
        targetUser: input.account.target_user,
        coreProblem: input.account.core_problem,
        candidates: auditCandidates,
        references,
      });
      nativeTitleAudit = {
        status: audit.coverage.complete ? "passed" : "incomplete",
        candidate_count: auditCandidates.length,
        reference_count: references.length,
        elapsed_ms: Date.now() - auditStartedAt,
        missing_candidate_ids: audit.coverage.missingCandidateIds.length
          ? audit.coverage.missingCandidateIds
          : undefined,
      };
      auditedTitleFingerprints = new Set(auditOptions
        .filter((option) => !audit.coverage.missingCandidateIds.includes(option.audit.id))
        .map((option) => normalizeTitleForComparison(option.topic.title)));

      usage = { ...(usage ?? {}), novelty_audit: audit.usage };
      const initialSelection = selectAuditedNativeTitleOptions({
        methods: nativeMethods,
        optionsByMethod: auditOptionsByMethod,
        decisions: audit.decisions,
        alreadyAccepted: [...accepted.values()],
        historyTitles,
        historyTopics,
        businessLine: input.account.business_line ?? "executive",
        directionLocks: input.directionLocks,
      });
      for (const [methodId, topic] of initialSelection.accepted) accepted.set(methodId, topic);
      rejectedTitles.push(...initialSelection.rejectedTitles);
      lastProblems.push(...initialSelection.problems);

      // 首轮没有选中的方法继续审核还没看过的候选。此前候选池里确实有
      // 安全备选，但 compactNativeAuditOptions 只取前三个，导致一个模型题
      // 撞到旧历史就把整批原生法一并挡住。
      const retryMethods = nativeMethods.filter((method) => !accepted.has(method.id));
      if (retryMethods.length) {
        const retryOptionsByMethod = compactNativeAuditRetryOptions({
          methods: retryMethods,
          candidatesByMethod: nativeCandidatesByMethod,
          auditedTitleFingerprints,
        });
        const retryOptions = retryMethods.flatMap((method) => retryOptionsByMethod.get(method.id) ?? []);
        const retryCandidates = retryOptions.map((option) => option.audit);
        if (retryCandidates.length) {
          const retryReferences = compactNativeAuditReferences({
            methods: retryMethods,
            historyTopics,
            historyTitles,
            accepted: [...accepted.values()],
          });
          const retryAudit = await auditNativeTitleBatchNovelty({
            businessLine: input.account.business_line ?? "executive",
            persona: input.account.persona,
            targetUser: input.account.target_user,
            coreProblem: input.account.core_problem,
            candidates: retryCandidates,
            references: retryReferences,
          });
          usage = { ...(usage ?? {}), novelty_audit_retry: retryAudit.usage };
          const retrySelection = selectAuditedNativeTitleOptions({
            methods: retryMethods,
            optionsByMethod: retryOptionsByMethod,
            decisions: retryAudit.decisions,
            alreadyAccepted: [...accepted.values()],
            historyTitles,
            historyTopics,
            businessLine: input.account.business_line ?? "executive",
            directionLocks: input.directionLocks,
          });
          for (const [methodId, topic] of retrySelection.accepted) accepted.set(methodId, topic);
          rejectedTitles.push(...retrySelection.rejectedTitles);
          lastProblems.push(...retrySelection.problems);
          // 即使本轮审核漏回了未采用的备选，只要交付的每个标题都有明确通过
          // decision，仍可安全完成整批；任何漏项本身绝不被 select 放行。
          nativeTitleAudit = {
            status: nativeMethods.every((method) => accepted.has(method.id))
              ? "passed"
              : retryAudit.coverage.complete && audit.coverage.complete
                ? "passed"
                : "incomplete",
            candidate_count: auditCandidates.length + retryCandidates.length,
            reference_count: Math.max(references.length, retryReferences.length),
            elapsed_ms: Date.now() - auditStartedAt,
            missing_candidate_ids: retryAudit.coverage.missingCandidateIds.length
              ? retryAudit.coverage.missingCandidateIds
              : audit.coverage.missingCandidateIds.length
                ? audit.coverage.missingCandidateIds
                : undefined,
          };
        } else {
          for (const method of retryMethods) {
            lastProblems.push(`${method.id}:没有剩余的本地合格候选可进入二次审核`);
          }
        }
      }
      if (nativeMethods.every((method) => accepted.has(method.id))) {
        nativeTitleAudit = {
          ...(nativeTitleAudit ?? {
            status: "passed" as const,
            candidate_count: auditCandidates.length,
            reference_count: references.length,
            elapsed_ms: Date.now() - auditStartedAt,
          }),
          status: "passed",
          missing_candidate_ids: undefined,
        };
      }
    } catch (error) {
      const message = (error as Error).message || "native_title_audit_unavailable";
      const auditStatus = nativeTitleAudit?.status === "incomplete"
        ? "incomplete"
        : /abort|timeout|超时/iu.test(message)
          ? "timeout"
          : "unavailable";
      const remainingMethods = nativeMethods.filter((method) => !accepted.has(method.id));
      // 首轮审核不可用时，只再试一次“尚未拿到 decision 的候选”。这些候选可能
      // 是模型替代题，也可能是静态候选；任何一个仍必须拿到语义审核结果后才能
      // 进入页面，绝不允许本地兜底绕过审核。
      // 如果已经执行过二审仍然报错，则直接保留旧批，防止一次点击进入重试循环。
      const canRunAuditedFallbackRecovery = remainingMethods.length > 0
        && !/native_title_audit_retry/iu.test(message);
      if (canRunAuditedFallbackRecovery) {
        try {
          const recoveryOptionsByMethod = compactNativeAuditRetryOptions({
            methods: remainingMethods,
            candidatesByMethod: nativeCandidatesByMethod,
            auditedTitleFingerprints,
          });
          const recoveryOptions = remainingMethods.flatMap((method) => (
            recoveryOptionsByMethod.get(method.id) ?? []
          ));
          const recoveryCandidates = recoveryOptions.map((option) => option.audit);
          if (!recoveryCandidates.length) throw new Error("native_title_audit_recovery_no_candidates");
          const recoveryReferences = compactNativeAuditReferences({
            methods: remainingMethods,
            historyTopics,
            historyTitles,
            accepted: [...accepted.values()],
          });
          const recoveryAudit = await auditNativeTitleBatchNovelty({
            businessLine: input.account.business_line ?? "executive",
            persona: input.account.persona,
            targetUser: input.account.target_user,
            coreProblem: input.account.core_problem,
            candidates: recoveryCandidates,
            references: recoveryReferences,
          });
          const recoverySelection = selectAuditedNativeTitleOptions({
            methods: remainingMethods,
            optionsByMethod: recoveryOptionsByMethod,
            decisions: recoveryAudit.decisions,
            alreadyAccepted: [...accepted.values()],
            historyTitles,
            historyTopics,
            businessLine: input.account.business_line ?? "executive",
            directionLocks: input.directionLocks,
          });
          for (const [methodId, topic] of recoverySelection.accepted) accepted.set(methodId, topic);
          rejectedTitles.push(...recoverySelection.rejectedTitles);
          lastProblems.push(...recoverySelection.problems);
          usage = { ...(usage ?? {}), novelty_audit_recovery: recoveryAudit.usage };
          nativeTitleAudit = {
            status: nativeMethods.every((method) => accepted.has(method.id))
              ? "passed"
              : recoveryAudit.coverage.complete
                ? "passed"
                : "incomplete",
            candidate_count: auditCandidates.length + recoveryCandidates.length,
            reference_count: Math.max(references.length, recoveryReferences.length),
            elapsed_ms: Date.now() - auditStartedAt,
            missing_candidate_ids: recoveryAudit.coverage.missingCandidateIds.length
              ? recoveryAudit.coverage.missingCandidateIds
              : undefined,
          };
          if (recoverySelection.accepted.size === remainingMethods.length) {
            console.warn(
              `[growth] native title novelty audit ${auditStatus}; recovered with fully audited fallback candidates`,
            );
          }
        } catch (recoveryError) {
          const recoveryMessage = (recoveryError as Error).message || "native_title_audit_recovery_failed";
          const recoveryStatus = nativeTitleAudit?.status === "incomplete"
            ? "incomplete"
            : /abort|timeout|超时/iu.test(recoveryMessage)
              ? "timeout"
              : "unavailable";
          nativeTitleAudit = {
            status: recoveryStatus,
            candidate_count: auditCandidates.length,
            reference_count: references.length,
            elapsed_ms: Date.now() - auditStartedAt,
            missing_candidate_ids: nativeTitleAudit?.missing_candidate_ids,
          };
          console.warn("[growth] native title audited fallback recovery unavailable:", recoveryMessage);
          for (const method of remainingMethods) {
            lastProblems.push(`${method.id}:语义新颖度审核暂不可用，未交付未经审核的标题`);
          }
        }
      } else {
        nativeTitleAudit = {
          status: auditStatus,
          candidate_count: auditCandidates.length,
          reference_count: references.length,
          elapsed_ms: Date.now() - auditStartedAt,
          missing_candidate_ids: nativeTitleAudit?.missing_candidate_ids,
        };
        console.warn("[growth] native title novelty audit unavailable:", message);
        for (const method of remainingMethods) {
          lastProblems.push(`${method.id}:语义新颖度审核未完成，未交付未经审核的标题`);
        }
      }
    }
  } else if (nativeMethods.length) {
    nativeTitleAudit = {
      status: "not_needed",
      candidate_count: 0,
      reference_count: 0,
      elapsed_ms: 0,
    };
  }

  for (const method of nativeMethods) {
    if (!accepted.has(method.id) && !lastProblems.some((problem) => problem.startsWith(`${method.id}:`))) {
      lastProblems.push(`${method.id}:没有形成可通过语义新颖度审核的新标题`);
    }
  }

  const missingMethods = methods.filter((method) => !accepted.has(method.id));
  if (!missingMethods.length) {
    return {
      topics: methods.map((method) => accepted.get(method.id)!),
      unavailableMethods,
      methodDeliveries: buildDeliveries(generationAttempts),
      generationAttempts,
      structureCards: prepared.cards,
      nativeTitleAudit,
      rejectedTitles: Array.from(new Set(rejectedTitles)).slice(-160),
      usage,
    };
  }
  console.warn("[growth] native title final diagnostic", JSON.stringify({
    business_line: input.account.business_line ?? "executive",
    persona: input.account.persona,
    native_title_audit: nativeTitleAudit,
    missing_native_method_ids: missingMethods.filter((method) => !method.sourceRequired).map((method) => method.id),
    native_candidate_counts: nativeMethods.map((method) => {
      const candidates = nativeCandidatesByMethod.get(method.id) ?? [];
      return {
        method_id: method.id,
        total: candidates.length,
        model: candidates.filter((candidate) => candidate.audit.kind === "model").length,
        fallback: candidates.filter((candidate) => candidate.audit.kind === "fallback").length,
        accepted: accepted.has(method.id),
      };
    }),
  }));
  if (input.allowSourcePause) {
    return {
      topics: methods.flatMap((method) => {
        const topic = accepted.get(method.id);
        return topic ? [topic] : [];
      }),
      unavailableMethods: [
        ...(unavailableMethods ?? []),
        ...missingMethods.filter((method) => !unavailableMethods.some((item) => item.method_id === method.id)).map((method) => ({
          method_id: method.id,
          method_label: method.label,
          reason: operatorReason(
            method,
            lastProblems.find((problem) => problem.startsWith(`${method.id}:`)),
          ),
        })),
      ],
      methodDeliveries: buildDeliveries(generationAttempts),
      generationAttempts,
      structureCards: prepared.cards,
      nativeTitleAudit,
      rejectedTitles: Array.from(new Set(rejectedTitles)).slice(-160),
      usage,
    };
  }

  throw new Error(`topic_batch_generation_failed:${lastProblems.join(" | ")}`);
}

export async function generateTopicPool(input: {
  tenantId?: string; account: GrowthAccount; planId?: string; week?: number;
  recentSignals?: string; learningBrief?: GrowthLearningBrief; generationMode?: MethodGenerationMode;
}) {
  const generated = await generateTopicBatch(input);
  const timestamp = now();
  const run: GrowthRun = {
    id: id(), tenant_id: input.tenantId ?? input.account.tenant_id, account_id: input.account.id,
    plan_id: input.planId, status: "draft", week: input.week ?? 1,
    objective: "用标题方法验证能否促成目标人群的有效咨询。",
    experiment_hypothesis: "不同标题方法带来的有效咨询率存在差异。",
    generation_mode: input.generationMode ?? "default",
    generation_status: "completed", uniqueness_status: "passed",
    generation_attempts: generated.generationAttempts,
    structure_version: SOURCE_MIGRATION_VERSION,
    migration_status: "passed",
    topic_pool: generated.topics,
    title_fingerprints: generated.topics.map((topic) =>
      buildGrowthTitleFingerprint({
        account: input.account,
        topic,
        generationMode: input.generationMode ?? "default",
      })
    ),
    unavailable_methods: generated.unavailableMethods,
    method_deliveries: generated.methodDeliveries,
    generation_diagnostics: generated.nativeTitleAudit
      ? {
        total_ms: generated.nativeTitleAudit.elapsed_ms,
        native_title_audit: generated.nativeTitleAudit,
      }
      : undefined,
    learning_trace: input.learningBrief?.trace,
    created_at: timestamp, updated_at: timestamp,
  };
  return { run, usage: generated.usage };
}

const ctaType = (persona: GrowthPersona): ContentDraft["cta_type"] =>
  persona === "buyer" ? "soft_bridge" : persona === "expert" ? "on_platform_consult" : "service_entry";

export interface PromiseDeliverySpec {
  format: DraftBlueprintContext["delivery_format"];
  minimumSections: number;
  exactSections?: number;
  rule: string;
}

function promiseTypeForTopic(
  topic: TopicCandidate,
  spec: PromiseDeliverySpec,
): NonNullable<DraftBlueprintContext["promise_type"]> {
  if (topic.method_id === "tug_of_war") return "comparison";
  if (spec.exactSections !== undefined) return "counted";
  if (spec.format === "numbered") return "material";
  return "ordinary";
}

function promiseDeliverySpec(topic: TopicCandidate): PromiseDeliverySpec {
  const count = extractPromisedCount(topic.title);
  if (count) {
    return {
      format: "numbered",
      minimumSections: count,
      exactSections: count,
      rule: `标题承诺${count}项，delivery_sections必须正好${count}段，每段兑现一项，不能多也不能少。`,
    };
  }
  if (/时间表|节奏表|路线图|资料|清单|盘点|步骤|表格|这张表|这份表/.test(`${topic.title}${topic.title_promise}`)) {
    return {
      format: "numbered",
      minimumSections: 3,
      rule: "标题承诺表格、清单、资料或路线图，delivery_sections至少3段，每段必须包含可直接执行的时间、动作、判断标准或注意事项，不能只描述整理过程。",
    };
  }
  if (topic.method_id === "tug_of_war") {
    return {
      format: "numbered",
      minimumSections: 2,
      exactSections: 2,
      rule: "拔河式标题必须正好比较两条路径，各写一段适用条件、代价和验证动作。",
    };
  }
  return {
    format: "paragraphs",
    minimumSections: 2,
    rule: "至少用2个具体段落完成标题承诺：先给核心判断，再给事实、场景或可执行动作，不能只复述标题。",
  };
}

function fallbackDeliverySections(
  topic: TopicCandidate,
  businessLine: GrowthBusinessLine,
  spec: PromiseDeliverySpec,
) {
  const overseas = businessLine === "overseas_student";
  if (/时间表|节奏表/.test(`${topic.title}${topic.title_promise}`)) {
    return overseas
      ? [
        "7—8月：先定国内外各自的目标岗位和简历版本，国内提前批开始后用小样本投递看回音，不要等开学再准备。",
        "9—10月：国内秋招进入高峰，海外岗位陆续开放；每周分开记录投递、笔试和面试节点，避免两边截止时间撞在一起。",
        "11—12月：国内进入补录和终面，海外继续网申与测评；根据真实反馈收窄岗位，不再拿同一份简历投所有方向。",
        "1月以后：没拿到满意结果就复盘拒绝原因，同时准备春招；只保留有反馈证据的方向，不因为焦虑继续扩大海投。",
      ]
      : [
        "第1周：列出留任、跳槽和转型候选项，把收入、平台资源和个人能力分开记录。",
        "第2周：访谈目标方向的真实从业者，核对岗位门槛、市场报价和最常见失败原因。",
        "第3—4周：做一次低成本试做或小样本验证，用真实反馈决定继续、调整还是停止。",
      ];
  }
  const items = overseas
    ? [
      "把专业背景与目标岗位要求逐项对齐，先删掉只靠学校光环的方向。",
      "把回国与留当地两条路径分别写出招聘周期、身份限制和最小验证动作。",
      "为不同岗位准备对应的项目证据和简历版本，用真实回音校准定位。",
      "记录笔试、面试和拒绝反馈，不再只看成功案例判断岗位。",
      "到约定日期后按证据收窄方向，避免因为焦虑继续扩大海投。",
      "核对目标行业的真实入场门槛，不把学校排名直接等同于岗位匹配。",
      "找三位真实从业者核对日常工作，先排除想象中很美的方向。",
      "每周只复盘一个关键变量，分清是方向、材料还是表达出了问题。",
      "先投递一小批验证简历版本，收到反馈后再扩大样本。",
      "提前写下停止条件，到期后按反馈调整，不无限延长海投。",
    ]
    : [
      "把可迁移能力与当前平台资源分开，确认离开职位后还能被识别的成果。",
      "给每条候选路径写出最小验证动作、失败成本和停止条件。",
      "用真实访谈、试做或市场报价校准职业定价，不只听熟人评价。",
      "确认家庭现金流能承受的验证周期，再决定留任、跳槽或转型。",
      "记录反对证据，到约定日期后按事实作出取舍。",
      "核对目标行业的进入门槛，不把过去的职位头衔直接当作新岗位筹码。",
      "准备能被外部验证的成果证据，分清个人能力和公司品牌贡献。",
      "找到第一批真实访谈对象，确认目标客户、雇主或合作方是否愿意付费。",
      "每周记录一次反对证据，避免只收集支持自己转型的声音。",
      "提前写下停止条件，到期后按真实反馈继续、调整或放弃。",
    ];
  if (topic.method_id === "tug_of_war") return items.slice(0, 2);
  const needed = spec.exactSections ?? spec.minimumSections;
  if (spec.format === "numbered") return items.slice(0, Math.max(needed, 3));
  const promise = topic.title_promise
    .replace(/[。！？!?]+$/u, "")
    .replace(/^(?:讲清|解释|呈现|说明|展示|分享|梳理|比较|提供|交付|盘点|列出|给出)/u, "")
    .trim();
  return [
    `${promise || "眼前这个选择"}，真正需要的不是再搜更多信息，而是先确定哪些变量能用现实反馈验证。`,
    overseas
      ? "学校、专业和留学投入都可能制造错觉，最后仍要回到岗位要求、项目证据和招聘节奏。"
      : "职位、收入和平台资源都可能制造错觉，最后仍要回到可迁移能力、市场报价和失败成本。",
  ];
}

function fallbackClosing(cta: ContentDraft["cta_type"], businessLine: GrowthBusinessLine) {
  if (cta === "soft_bridge") return businessLine === "overseas_student"
    ? "先把自己的毕业时间、两边目标岗位和最近一次真实反馈写在同一页，再决定下一步补哪一块。"
    : "先把当前职位、两条候选路径和最担心的代价写在同一页，再决定先验证哪一项。";
  if (cta === "on_platform_consult") return "如果你的处境已经具体，可以从站内补充当前背景、候选路径和最担心的冲突，先做适配判断。";
  return "如果已经有明确处境和候选路径，可以从站内服务入口提交信息，先确认服务是否适配。";
}

function fallbackStageResult(persona: GrowthPersona, businessLine: GrowthBusinessLine) {
  if (businessLine === "overseas_student") {
    if (persona === "buyer") return "孩子不再拿一份简历乱投，也明确了下一步先验证哪类岗位。";
    if (persona === "expert") return "岗位范围收窄了，后面的投递反馈也终于能用来复盘。";
    return "目标岗位收窄了，不同简历版本也终于有了明确去向。";
  }
  if (persona === "buyer") return "我先排除了一个看似体面的方向，也明确了下一步要验证什么。";
  if (persona === "expert") return "三个方向收窄到一个先验证，下一步也有了明确顺序。";
  return "客户排除了一个高风险方向，并明确了下一步验证顺序。";
}

function fallbackIdentityEvidence(persona: GrowthPersona, businessLine: GrowthBusinessLine) {
  if (businessLine === "overseas_student") {
    if (persona === "buyer") return "这段时间我把孩子的毕业时间、目标岗位和每次投递反馈都记在一起，才看清我们真正卡住的地方。";
    if (persona === "expert") return "做留学生求职判断时，我会先核对岗位要求、项目证据和招聘节奏，再决定应该改方向还是改材料。";
    return "这类求职辅导交付里，团队先核对学生的岗位目标、项目证据和招聘节点，再决定后续辅导顺序。";
  }
  if (persona === "buyer") return "这段时间我把自己的职业经历、现实约束和几个候选方向放在一起，才看清过去哪些判断只是想当然。";
  if (persona === "expert") return "做职业决策判断时，我会把候选方向、能力证据和失败成本拆开，而不是替来访者直接选答案。";
  return "这类职业决策交付里，团队先拆开候选路径、能力证据和失败成本，再安排能够拿到现实反馈的验证动作。";
}

function fallbackIdentityContract(
  account: GrowthAccount,
  businessLine: GrowthBusinessLine,
): DraftIdentityContract {
  const required: Record<GrowthPersona, string[]> = {
    buyer: ["本人或家庭的具体处境", "亲历选择、行动或变化"],
    expert: ["具体问题判断", "方法或咨询观察"],
    merchant: ["服务对象", "交付动作与阶段变化"],
  };
  const goal: Record<GrowthPersona, string> = {
    buyer: "用第一人称经历自然体现目标人群身份",
    expert: "用具体判断或方法应用体现专家身份",
    merchant: "用真实交付动作体现经营者身份，不自夸",
  };
  return {
    persona: account.persona,
    expression_goal: goal[account.persona],
    required_elements: required[account.persona],
    evidence_basis: account.persona_specific?.identity || account.one_liner || account.trust_source || "当前业务与人设事实",
    target_section: "identity_evidence",
    evidence: fallbackIdentityEvidence(account.persona, businessLine),
  };
}

function fallbackFulfillmentContract(
  topic: TopicCandidate,
  spec: PromiseDeliverySpec,
): DraftFulfillmentContract {
  const promiseType = promiseTypeForTopic(topic, spec);
  const requiredCount = spec.exactSections ?? spec.minimumSections;
  return {
    promise_type: promiseType,
    promised_count: spec.exactSections,
    required_sections: Array.from({ length: requiredCount }, (_, index) => ({
      id: `section_${index + 1}`,
      requirement: promiseType === "ordinary"
        ? index === 0 ? "给出标题承诺对应的核心判断" : "用具体事实、场景或行动完成承诺"
        : `交付标题承诺的第${index + 1}部分`,
      minimum_content: promiseType === "comparison"
        ? ["适用条件", "代价或风险", "验证动作"]
        : ["具体判断", "解释或证据", "可执行动作"],
    })),
  };
}

function fallbackConversionContract(
  account: GrowthAccount,
  businessLine: GrowthBusinessLine,
): DraftConversionContract {
  const overseas = businessLine === "overseas_student";
  const role = overseas ? "求职老师或辅导团队" : "职业决策顾问或咨询团队";
  const attempted = overseas ? "当事人已经反复改材料或扩大投递" : "当事人已经反复搜索信息或推演方向";
  const intervention = overseas
    ? "把目标岗位、项目证据和招聘节奏放在一起梳理"
    : "把候选方向、能力证据和失败成本拆开并安排最小验证";
  return {
    problem_context: overseas ? "岗位、材料和招聘节奏没有对齐" : "候选方向很多，但缺少现实证据和停止条件",
    attempted_action: attempted,
    professional_role: role,
    intervention_action: intervention,
    stage_result: fallbackStageResult(account.persona, businessLine),
    evidence_basis: account.trust_source || "当前业务方法与交付流程",
    bridge_paragraph: serviceBridgeSentence(account.persona, businessLine),
  };
}

function fallbackDraftBlueprint(
  account: GrowthAccount,
  topic: TopicCandidate,
  cta: ContentDraft["cta_type"],
  spec: PromiseDeliverySpec,
): DraftBlueprintContext {
  const businessLine = account.business_line ?? "executive";
  const identityContract = fallbackIdentityContract(account, businessLine);
  const fulfillmentContract = fallbackFulfillmentContract(topic, spec);
  const conversionContract = fallbackConversionContract(account, businessLine);
  return {
    contract_version: "v3_4",
    promise_type: promiseTypeForTopic(topic, spec),
    opening_intent: topic.title_promise,
    identity_contract: identityContract,
    fulfillment_contract: fulfillmentContract,
    conversion_contract: conversionContract,
    opening: identityOpening(account.persona, businessLine),
    core_judgement: businessLine === "overseas_student"
      ? "秋招真正难的不是同时准备两边，而是没有把岗位、材料和截止时间放进同一套节奏里。"
      : "职业选择真正难的不是缺少选项，而是没有把能力证据、市场机会和失败成本放在一起判断。",
    delivery_format: spec.format,
    delivery_sections: fallbackDeliverySections(topic, businessLine, spec),
    service_bridge: conversionContract.bridge_paragraph,
    stage_result: conversionContract.stage_result,
    closing: fallbackClosing(cta, businessLine),
  };
}

function normalizeBlueprintSections(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      return asText(row.paragraph) || asText(row.content) || asText(row.text);
    }
    return "";
  }).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedIdentityContract(raw: unknown, fallback: DraftIdentityContract): DraftIdentityContract {
  const value = asRecord(raw);
  const evidenceCandidate = asText(value.evidence);
  return {
    persona: fallback.persona,
    expression_goal: asText(value.expression_goal) || fallback.expression_goal,
    required_elements: Array.isArray(value.required_elements)
      ? value.required_elements.map(asText).filter(Boolean).slice(0, 4)
      : fallback.required_elements,
    evidence_basis: asText(value.evidence_basis) || fallback.evidence_basis,
    target_section: "identity_evidence",
    evidence: Array.from(evidenceCandidate).length >= 18 ? evidenceCandidate : fallback.evidence,
  };
}

function normalizedConversionContract(raw: unknown, fallback: DraftConversionContract): DraftConversionContract {
  const value = asRecord(raw);
  const normalized: DraftConversionContract = {
    problem_context: asText(value.problem_context) || fallback.problem_context,
    attempted_action: asText(value.attempted_action) || fallback.attempted_action,
    professional_role: asText(value.professional_role) || fallback.professional_role,
    intervention_action: asText(value.intervention_action) || fallback.intervention_action,
    stage_result: asText(value.stage_result) || fallback.stage_result,
    evidence_basis: asText(value.evidence_basis) || fallback.evidence_basis,
    bridge_paragraph: asText(value.bridge_paragraph) || fallback.bridge_paragraph,
  };
  const complete = [
    normalized.problem_context,
    normalized.attempted_action,
    normalized.professional_role,
    normalized.intervention_action,
    normalized.stage_result,
  ].every((item) => Array.from(item).length >= 4)
    && Array.from(normalized.bridge_paragraph).length >= 36;
  return complete ? normalized : fallback;
}

function normalizeDraftBlueprint(
  raw: unknown,
  fallback: DraftBlueprintContext,
  spec: PromiseDeliverySpec,
  title: string,
): DraftBlueprintContext {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const openingCandidate = asText(value.opening);
  const opening = openingCandidate && bodyOpeningMeetsTitle(title, openingCandidate)
    ? openingCandidate
    : fallback.opening;
  let sections = normalizeBlueprintSections(value.delivery_sections);
  if (spec.exactSections && sections.length !== spec.exactSections) sections = fallback.delivery_sections.slice(0, spec.exactSections);
  if (sections.length < spec.minimumSections) {
    sections = [...sections, ...fallback.delivery_sections].slice(0, spec.minimumSections);
  }
  const identityContract = normalizedIdentityContract(value.identity_contract, fallback.identity_contract);
  const conversionContract = normalizedConversionContract(value.conversion_contract, fallback.conversion_contract);
  return {
    contract_version: "v3_4",
    promise_type: fallback.promise_type,
    opening_intent: asText(value.opening_intent) || fallback.opening_intent,
    identity_contract: identityContract,
    fulfillment_contract: fallback.fulfillment_contract,
    conversion_contract: conversionContract,
    opening,
    core_judgement: asText(value.core_judgement) || fallback.core_judgement,
    delivery_format: spec.format,
    delivery_sections: sections,
    service_bridge: conversionContract.bridge_paragraph,
    stage_result: conversionContract.stage_result,
    closing: asText(value.closing) || fallback.closing,
  };
}

async function generateDraftBlueprint(input: {
  account: GrowthAccount;
  topic: TopicCandidate;
  cta: ContentDraft["cta_type"];
}) {
  const spec = promiseDeliverySpec(input.topic);
  const fallback = fallbackDraftBlueprint(input.account, input.topic, input.cta, spec);
  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildDraftBlueprintUserPrompt({
        persona: input.account.persona,
        context: accountContext(input.account),
        targetUser: input.topic.target_user,
        trustSource: input.account.trust_source,
        methodId: input.topic.method_id,
        methodLabel: input.topic.method_label,
        title: input.topic.title,
        titlePromise: input.topic.title_promise,
        deliveryRule: spec.rule,
        ctaType: input.cta,
      }),
      maxTokens: 1800,
      temperature: 0.45,
    });
    return {
      blueprint: normalizeDraftBlueprint(result.data?.blueprint ?? result.data, fallback, spec, input.topic.title),
      fallback,
      spec,
      usage: resultUsage(result),
    };
  } catch (error) {
    console.warn("[growth] draft blueprint fallback:", (error as Error).message);
    return { blueprint: fallback, fallback, spec, usage: undefined };
  }
}

function cleanDeliverySection(value: string) {
  return value.replace(/^\s*(?:\d{1,2}[.、)]|[一二三四五六七八九十]+[、.])\s*/u, "").trim();
}

function firstSentence(value: string) {
  const match = value.trim().match(/^.*?[。！？!?]/u);
  return (match?.[0] || value).trim();
}

function longVersionContext(businessLine: GrowthBusinessLine) {
  return businessLine === "overseas_student"
    ? "真正执行时，岗位、材料和截止时间要放在同一张表里看。只看投了多少份没有意义，还要记下用了哪个版本、卡在哪一轮，以及下一次只改哪个变量。"
    : "真正验证时，职位头衔、平台资源和个人能力要拆开记录。不能只问这条路听起来好不好，还要写清进入门槛、失败成本，以及下一步能拿到什么现实反馈。";
}

function longVersionDetail(index: number, businessLine: GrowthBusinessLine) {
  const overseas = [
    "执行时把目标岗位、截止日期和对应简历版本写在同一行，下一轮才能分清是方向还是材料出了问题。",
    "每周只根据真实投递、笔试和面试反馈调整一个变量，别因为焦虑同时推翻全部计划。",
    "遇到两边时间冲突时，先看不可逆的截止节点，再安排可以补做的材料和练习。",
    "到了复盘日期就按证据收窄岗位，不用成功案例替代自己已经拿到的真实反馈。",
  ];
  const executive = [
    "执行时要把进入门槛、可验证证据和停止条件写清楚，避免只凭职位想象判断机会。",
    "先用访谈、试做或小样本报价拿到反馈，再决定是否投入更多时间和现金流。",
    "复盘时把个人能力和原平台资源分开，确认离开现职位后哪些成果仍能被外部识别。",
    "到了约定日期就看反对证据，不因为已经投入了时间而无限延长一条低胜率路径。",
  ];
  const details = businessLine === "overseas_student" ? overseas : executive;
  return details[index % details.length];
}

export function composeBlueprintBody(
  blueprint: DraftBlueprintContext,
  spec: PromiseDeliverySpec,
  rawStructure?: unknown,
  options?: {
    bodyVersion?: "short" | "long";
    businessLine?: GrowthBusinessLine;
    compact?: boolean;
    aggressive?: boolean;
  },
) {
  const structure = rawStructure && typeof rawStructure === "object"
    ? rawStructure as Record<string, unknown>
    : {};
  const bodyVersion = options?.bodyVersion ?? "short";
  const businessLine = options?.businessLine ?? "executive";
  const opening = asText(structure.opening) || blueprint.opening;
  // 身份是交付合同的硬字段，由系统直接装配；不允许正文模型省略后再靠关键词猜测。
  const identityEvidence = blueprint.identity_contract.evidence;
  const coreJudgement = asText(structure.core_judgement) || blueprint.core_judgement;
  let sections = normalizeBlueprintSections(structure.delivery_sections);
  if (spec.exactSections && sections.length !== spec.exactSections) sections = blueprint.delivery_sections.slice(0, spec.exactSections);
  if (!spec.exactSections && sections.length > 5) sections = sections.slice(0, 5);
  if (sections.length < spec.minimumSections) {
    const fallbackCount = spec.exactSections ?? Math.max(spec.minimumSections, Math.min(5, blueprint.delivery_sections.length));
    sections = blueprint.delivery_sections.slice(0, fallbackCount);
  }
  const compactSection = (section: string) => {
    const value = firstSentence(section);
    const maximum = options?.aggressive ? 34 : 52;
    if (Array.from(value).length <= maximum) return value;
    const chars = Array.from(value);
    const window = chars.slice(20, maximum).join("");
    const boundary = Math.max(window.lastIndexOf("，"), window.lastIndexOf("；"), window.lastIndexOf("、"), window.lastIndexOf("。"));
    const end = boundary >= 0 ? 20 + boundary + 1 : maximum - 1;
    return `${chars.slice(0, end).join("").replace(/[，；、]$/u, "")}。`;
  };
  sections = bodyVersion === "short"
    ? sections.map((section) => options?.compact ? compactSection(section) : firstSentence(section))
    : sections.map((section, index) => {
      if (options?.compact) {
        const compact = compactSection(section);
        if (options.aggressive || index > 1) return compact;
        return `${compact} ${longVersionDetail(index, businessLine)}`;
      }
      const detail = longVersionDetail(index, businessLine);
      return section.includes(detail) ? section : `${section.trim()} ${detail}`;
    });
  const renderedSections = spec.format === "numbered"
    ? sections.map((section, index) => `${index + 1}. ${cleanDeliverySection(section)}`).join("\n\n")
    : sections.join("\n\n");
  // 转化桥同样来自已标准化的合同，确保卡点、介入动作和阶段结果一次写全。
  const serviceBridge = blueprint.conversion_contract.bridge_paragraph;
  const closing = asText(structure.closing) || blueprint.closing;
  const versionContext = bodyVersion === "long"
    ? options?.aggressive
      ? ""
      : options?.compact
        ? businessLine === "overseas_student"
          ? "使用这份安排时，把岗位、材料版本和截止时间放在一起记录，每轮只根据真实反馈调整一个变量。"
          : "使用这套判断时，把进入门槛、能力证据和停止条件放在一起记录，再根据现实反馈调整。"
        : longVersionContext(businessLine)
    : "";
  return [opening, identityEvidence, coreJudgement, versionContext, serviceBridge, renderedSections, closing]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n");
}

export interface DraftStructureNormalization {
  blueprint: DraftBlueprintContext;
  initialMissingFields: string[];
  normalizationActions: string[];
}

function mergeSectionsToExactCount(sections: string[], exactCount: number) {
  if (sections.length <= exactCount) return sections;
  const buckets = Array.from({ length: exactCount }, () => [] as string[]);
  sections.forEach((section, index) => {
    const bucketIndex = Math.min(exactCount - 1, Math.floor(index * exactCount / sections.length));
    buckets[bucketIndex].push(section);
  });
  return buckets.map((bucket) => bucket.join(" ").trim()).filter(Boolean);
}

function appendUniqueSections(sections: string[], fallbacks: string[], targetCount: number) {
  const result = [...sections];
  for (const fallback of fallbacks) {
    if (result.length >= targetCount) break;
    const normalized = cleanDeliverySection(fallback).replace(/\s+/g, "");
    if (!result.some((section) => cleanDeliverySection(section).replace(/\s+/g, "") === normalized)) {
      result.push(fallback);
    }
  }
  return result.slice(0, targetCount);
}

/**
 * v3.5：模型结构先按当前标题合同逐字段标准化，再进入校验。
 * 模型漏字段属于可修复输入，不应在最终交付门禁之前整篇拒绝。
 */
export function normalizeDraftSpecificBlueprint(
  raw: unknown,
  base: DraftBlueprintContext,
  spec: PromiseDeliverySpec,
  businessLine: GrowthBusinessLine,
): DraftStructureNormalization {
  const structure = asRecord(raw);
  const initialMissingFields: string[] = [];
  const normalizationActions: string[] = [];

  const chooseField = (
    field: string,
    candidate: string,
    fallback: string,
    valid: (value: string) => boolean,
  ) => {
    if (candidate && valid(candidate) && isBusinessCompatibleText(candidate, businessLine)) return candidate;
    initialMissingFields.push(field);
    normalizationActions.push(`${field}:fallback`);
    return fallback;
  };

  const opening = chooseField(
    "opening",
    asText(structure.opening),
    base.opening,
    (value) => bodyOpeningMeetsTitle(base.opening_intent || base.core_judgement, value),
  );
  const identityEvidence = chooseField(
    "identity_evidence",
    asText(structure.identity_evidence),
    base.identity_contract.evidence,
    (value) => Array.from(value).length >= 18,
  );
  const coreJudgement = chooseField(
    "core_judgement",
    asText(structure.core_judgement),
    base.core_judgement,
    (value) => Array.from(value).length >= 12,
  );
  let deliverySections = normalizeBlueprintSections(structure.delivery_sections)
    .filter((section) => isBusinessCompatibleText(section, businessLine));
  const expectedSections = spec.exactSections ?? spec.minimumSections;
  if (spec.exactSections && deliverySections.length > spec.exactSections) {
    deliverySections = mergeSectionsToExactCount(deliverySections, spec.exactSections);
    normalizationActions.push("delivery_sections:merged");
  }
  if (deliverySections.length < expectedSections) {
    initialMissingFields.push("delivery_sections");
    deliverySections = appendUniqueSections(deliverySections, base.delivery_sections, expectedSections);
    normalizationActions.push("delivery_sections:filled");
  }
  if (!spec.exactSections && deliverySections.length > 5) {
    deliverySections = deliverySections.slice(0, 5);
    normalizationActions.push("delivery_sections:trimmed");
  }
  const serviceBridge = chooseField(
    "service_bridge",
    asText(structure.service_bridge),
    base.conversion_contract.bridge_paragraph,
    bodyHasConversionEvidence,
  );
  const closing = chooseField(
    "closing",
    asText(structure.closing),
    base.closing,
    (value) => Array.from(value).length >= 10,
  );

  const conversionContract = {
    ...base.conversion_contract,
    bridge_paragraph: serviceBridge,
  };
  return {
    blueprint: {
      ...base,
      opening,
      identity_contract: {
        ...base.identity_contract,
        evidence: identityEvidence,
      },
      core_judgement: coreJudgement,
      delivery_sections: deliverySections,
      conversion_contract: conversionContract,
      service_bridge: serviceBridge,
      stage_result: conversionContract.stage_result,
      closing,
    },
    initialMissingFields: [...new Set(initialMissingFields)],
    normalizationActions,
  };
}

function serviceBridgeSentence(persona: GrowthPersona, businessLine: GrowthBusinessLine) {
  if (businessLine === "overseas_student") {
    if (persona === "buyer") return "我们自己折腾了几轮还是没理顺，后来才找了一位求职老师一起梳理现有材料。她没有先改文案，而是先把岗位和招聘节奏对齐；至少孩子不再拿一份简历乱投，下一步该验证什么也有了顺序。";
    if (persona === "expert") return "那次求职咨询里，我没有先改简历，而是和学生一起梳理目标岗位、项目证据和招聘节奏。直接变化不是立刻拿到 Offer，而是岗位范围收窄了，后面的投递反馈也终于能用来复盘。";
    return "那次求职辅导服务里，我们先停下改简历，把岗位匹配、项目证据和招聘时间线一起梳理了一遍。第一步变化不是立刻拿到 Offer，而是目标岗位收窄了，不同简历版本也终于有了明确去向。";
  }
  if (persona === "buyer") return "我自己越想越乱，后来才请一位职业决策顾问陪我梳理能力、市场机会和失败成本。最后没有被催着辞职，反而先排除了一个看似体面的方向，也知道下一步该验证什么。";
  if (persona === "expert") return "那次职业咨询里，我没有替来访者直接选答案，而是先把候选方向、能力证据和失败成本拆开，再安排最小验证。直接变化不是马上做决定，而是三个方向收窄到一个先验证，下一步也有了明确顺序。";
  return "那次职业决策服务里，我们没有催客户马上选方向，而是先把能力证据、市场机会和失败成本拆开，再安排最小验证。阶段结果不是一个漂亮结论，而是排除了一个高风险方向，并定下了下一步验证顺序。";
}

function identityOpening(persona: GrowthPersona, businessLine: GrowthBusinessLine) {
  if (businessLine === "overseas_student") {
    if (persona === "buyer") return "前阵子陪孩子忙秋招，我们在回国还是留当地这件事上，来回改了好几次主意。";
    if (persona === "expert") return "前两天帮一个留学生梳理秋招计划，聊到第三个目标岗位时，我先让他停了下来。";
    return "最近我们给一位留学生梳理秋招方案，第一步不是改简历，而是先停下来看岗位和招聘节奏。";
  }
  if (persona === "buyer") return "前阵子我又把辞职这件事按了回去，不是突然不想走，而是越算越发现有几笔账没弄明白。";
  if (persona === "expert") return "前两天和一位中高管聊转型，他列了三个方向，却说不清哪一个值得先试。";
  return "最近我们给一位中高管梳理转型方向，没有先劝他辞职，而是先把三条候选路径摆在一起。";
}

function deliveryContractFromBlueprint(blueprint: DraftBlueprintContext) {
  return {
    contract_version: "v3_4" as const,
    identity_contract: blueprint.identity_contract,
    fulfillment_contract: blueprint.fulfillment_contract,
    conversion_contract: blueprint.conversion_contract,
  };
}

function attachBlueprintContract(draft: ContentDraft, blueprint: DraftBlueprintContext): ContentDraft {
  return { ...draft, delivery_contract: deliveryContractFromBlueprint(blueprint) };
}

function failedContractKeys(draft: ContentDraft) {
  return new Set(draft.validation_checks
    .filter((check) => check.status !== "passed")
    .map((check) => check.key));
}

function targetedRepairBlueprint(
  blueprint: DraftBlueprintContext,
  fallback: DraftBlueprintContext,
  draft: ContentDraft,
): DraftBlueprintContext {
  const failed = failedContractKeys(draft);
  const fulfillmentFailed = failed.has("fulfillment");
  const repairedConversion = failed.has("conversion") ? fallback.conversion_contract : blueprint.conversion_contract;
  return {
    ...blueprint,
    opening: fulfillmentFailed ? fallback.opening : blueprint.opening,
    identity_contract: failed.has("identity") ? fallback.identity_contract : blueprint.identity_contract,
    fulfillment_contract: fulfillmentFailed ? fallback.fulfillment_contract : blueprint.fulfillment_contract,
    delivery_sections: fulfillmentFailed ? fallback.delivery_sections : blueprint.delivery_sections,
    conversion_contract: repairedConversion,
    service_bridge: repairedConversion.bridge_paragraph,
    stage_result: repairedConversion.stage_result,
  };
}

function rebuildDraftFromBlueprint(
  draft: ContentDraft,
  blueprint: DraftBlueprintContext,
  spec: PromiseDeliverySpec,
  businessLine: GrowthBusinessLine,
  topicTitle: string,
  repair: DraftRepairRecord,
) {
  const body = composeBlueprintBody(blueprint, spec, undefined, {
    bodyVersion: draft.selected_body_version === "long" ? "long" : "short",
    businessLine,
  });
  return attachBlueprintContract(enforceDraftCompliance({
    ...draft,
    body,
    certification_status: "repairing",
    repair_history: [...(draft.repair_history ?? []), repair],
    word_count: countPublishChars(draft.title, body, draft.hashtags),
    updated_at: now(),
  }, topicTitle), blueprint);
}

export function certifyDraftForOperator(draft: ContentDraft): ContentDraft {
  const certified = draft.validation_report?.status === "passed"
    && draft.validation_checks.every((check) => check.status === "passed")
    && draft.word_count.total <= XHS_PUBLISH_CHAR_TARGET
    && draft.compliance?.status !== "blocked";
  if (!certified) {
    throw new Error("draft_certification_failed");
  }
  return {
    ...draft,
    certification_status: "certified",
    certified_at: now(),
    incident_id: undefined,
  };
}

async function passDraftValidationGate(
  initial: ContentDraft,
  input: {
    account: GrowthAccount;
    persona: GrowthPersona;
    businessLine: GrowthBusinessLine;
    topic: TopicCandidate;
    cta: ContentDraft["cta_type"];
    blueprint: DraftBlueprintContext;
    fallbackBlueprint: DraftBlueprintContext;
    spec: PromiseDeliverySpec;
  },
) {
  let draft = withDraftValidation(initial, input.persona, 0);
  let currentBlueprint = input.blueprint;
  for (let repairAttempt = 1; repairAttempt <= 3 && draft.validation_report?.status !== "passed"; repairAttempt += 1) {
    const failed = [...failedContractKeys(draft)].join(",") || "unknown";
    const useFullFallback = repairAttempt === 3;
    currentBlueprint = useFullFallback
      ? input.fallbackBlueprint
      : targetedRepairBlueprint(currentBlueprint, input.fallbackBlueprint, draft);
    const checked = rebuildDraftFromBlueprint(draft, currentBlueprint, input.spec, input.businessLine, input.topic.title, {
      field: "fallback",
      reason_code: useFullFallback ? "deterministic_contract_fallback" : `targeted_${failed}`,
      action: useFullFallback
        ? "使用当前标题的确定性合同完成最终兜底"
        : "只替换失败的合同字段并重新组装正文",
      repaired_at: now(),
    });
    draft = withDraftValidation({
      ...checked,
      fallback_used: draft.fallback_used || useFullFallback,
    }, input.persona, repairAttempt);
  }
  return draft;
}

async function rewriteDraftWithinPublishTarget(
  draft: ContentDraft,
  account: GrowthAccount,
) {
  const hashtagChars = draft.hashtags.join(" ").length;
  const bodyBudget = Math.max(240, XHS_PUBLISH_CHAR_TARGET - draft.title.length - hashtagChars - 1);
  const result = await llmJSON<any>({
    system: GROWTH_SYSTEM_PROMPT,
    user: `请把下面这篇小红书正文自然压缩到${bodyBudget}字以内，只输出 JSON：{"body":"压缩后的完整正文"}。

标题：${draft.title}
标题承诺：${draft.title_promise}
当前身份：${account.persona}
人设：${account.one_liner}

硬规则：
1. 不是从尾部截断，而是删掉重复解释、合并同义句、缩短背景铺垫。
2. 保留自然开头、唯一核心判断、标题承诺的全部编号项、专业服务的动作与阶段结果、唯一收束动作。
3. 标题承诺数字时，编号数量不得改变；不得删除资料、清单或路线图中的核心交付。
4. 保持真人口吻，不新增广告、互动诱导、站外导流或未经证实的结果。
5. 正文自身必须不超过${bodyBudget}字，为标题和话题预留空间。

原正文：
${draft.body}`,
    maxTokens: 2400,
    temperature: 0.25,
  });
  return asText(result.data?.body);
}

export function draftMeetsPublishTarget(draft: Pick<ContentDraft, "word_count" | "validation_report">) {
  return draft.word_count.total <= XHS_PUBLISH_CHAR_TARGET
    && draft.validation_report?.status === "passed";
}

async function fitDraftWithinPublishTarget(
  draft: ContentDraft,
  input: {
    account: GrowthAccount;
    persona: GrowthPersona;
    businessLine: GrowthBusinessLine;
    topic: TopicCandidate;
    blueprint: DraftBlueprintContext;
    fallbackBlueprint: DraftBlueprintContext;
    spec: PromiseDeliverySpec;
  },
) {
  if (draft.word_count.total <= XHS_PUBLISH_CHAR_TARGET) return draft;
  try {
    const compressedBody = await rewriteDraftWithinPublishTarget(draft, input.account);
    if (compressedBody) {
      const compressed = withDraftValidation(enforceDraftCompliance({
        ...draft,
        body: compressedBody,
        word_count: countPublishChars(draft.title, compressedBody, draft.hashtags),
        updated_at: now(),
      }, input.topic.title), input.persona, (draft.validation_report?.attempts ?? 0) + 1);
      if (draftMeetsPublishTarget(compressed)) {
        return compressed;
      }
    }
  } catch (error) {
    console.warn("[growth] publish length rewrite fallback:", (error as Error).message);
  }

  // 长度兜底始终使用确定性合同，避免上一轮定向修复后的合同与原始模型骨架错位。
  let fallbackBody = composeBlueprintBody(input.fallbackBlueprint, input.spec, undefined, {
    bodyVersion: draft.selected_body_version === "long" ? "long" : "short",
    businessLine: input.businessLine,
    compact: true,
  });
  let fallback = withDraftValidation(attachBlueprintContract(enforceDraftCompliance({
    ...draft,
    body: fallbackBody,
    fallback_used: true,
    repair_history: [...(draft.repair_history ?? []), {
      field: "length",
      reason_code: "publish_length_compaction",
      action: "使用确定性合同压缩正文并保留全部交付字段",
      repaired_at: now(),
    }],
    word_count: countPublishChars(draft.title, fallbackBody, draft.hashtags),
    updated_at: now(),
  }, input.topic.title), input.fallbackBlueprint), input.persona, (draft.validation_report?.attempts ?? 0) + 1);
  if (draftMeetsPublishTarget(fallback)) return fallback;

  fallbackBody = composeBlueprintBody(input.fallbackBlueprint, input.spec, undefined, {
    bodyVersion: draft.selected_body_version === "long" ? "long" : "short",
    businessLine: input.businessLine,
    compact: true,
    aggressive: true,
  });
  fallback = withDraftValidation(attachBlueprintContract(enforceDraftCompliance({
    ...draft,
    body: fallbackBody,
    fallback_used: true,
    repair_history: [...(fallback.repair_history ?? []), {
      field: "length",
      reason_code: "publish_length_aggressive_compaction",
      action: "进一步压缩非必要解释并保留全部合同字段",
      repaired_at: now(),
    }],
    word_count: countPublishChars(draft.title, fallbackBody, draft.hashtags),
    updated_at: now(),
  }, input.topic.title), input.fallbackBlueprint), input.persona, (draft.validation_report?.attempts ?? 0) + 1);
  // 字数和三项合同必须同时通过；仍异常时由最终认证抛出事件，绝不返回操作者。
  return fallback;
}

export type DraftPipelineFailureCode =
  | "structure_repair_failed"
  | "identity_repair_failed"
  | "fulfillment_repair_failed"
  | "conversion_repair_failed"
  | "history_duplicate"
  | "variant_too_similar"
  | "business_mismatch"
  | "model_unavailable"
  | "provider_timeout";

function pipelineFailure(code: DraftPipelineFailureCode, detail?: string) {
  return new Error(`${code}:${detail || code}`);
}

function providerFailureCode(reason: string): DraftPipelineFailureCode {
  return /timeout|timed out|abort|504|gateway time/i.test(reason)
    ? "provider_timeout"
    : "model_unavailable";
}

function validationFailureCode(draft: ContentDraft): DraftPipelineFailureCode {
  const failed = failedContractKeys(draft);
  if (failed.has("identity")) return "identity_repair_failed";
  if (failed.has("fulfillment")) return "fulfillment_repair_failed";
  if (failed.has("conversion")) return "conversion_repair_failed";
  return "structure_repair_failed";
}

async function generateSingleDraft(input: {
  tenantId?: string; account: GrowthAccount; run: GrowthRun; topic: TopicCandidate;
  bodyVersion: "short" | "long"; excludeBodies?: string[]; learningBrief?: GrowthLearningBrief;
  blueprint: DraftBlueprintContext; fallbackBlueprint: DraftBlueprintContext; spec: PromiseDeliverySpec;
  historicalBodies?: BodyUniquenessReference[];
  currentPairBodies?: string[];
}) {
  const generationStartedAt = Date.now();
  let payload: any;
  let usage: Record<string, unknown> | undefined;
  const cta = ctaType(input.account.persona);
  const businessLine = input.account.business_line ?? "executive";
  const attemptedBodies: BodyUniquenessReference[] = [];
  let body = "";
  let selectedBlueprint: DraftBlueprintContext | null = null;
  let selectedMissingFields: string[] = [];
  let selectedNormalizationActions: string[] = [];
  let lastProblem = "模型未返回完整正文结构";
  let lastFailureCode: DraftPipelineFailureCode = "model_unavailable";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const promptExclusions = [
        ...(input.excludeBodies ?? []),
        ...(input.historicalBodies ?? []).slice(0, 8).map((reference) => reference.body),
        ...(input.currentPairBodies ?? []),
        ...attemptedBodies.map((reference) => reference.body),
      ].filter(Boolean).slice(-10);
      const result = await llmJSON<any>({
        system: GROWTH_SYSTEM_PROMPT,
        user: buildDraftUserPrompt({
          persona: input.account.persona, context: accountContext(input.account),
          targetUser: input.topic.target_user, trustSource: input.account.trust_source,
          methodId: input.topic.method_id, methodLabel: input.topic.method_label,
          generationMode: input.topic.generation_mode, title: input.topic.title,
          titlePromise: input.topic.title_promise, testVariable: input.topic.test_variable,
          expectedSignal: input.topic.expected_signal, followReason: input.topic.follow_reason,
          variantHint: input.bodyVersion === "short"
            ? `当前只写短版：150—300字，用更少的段落直接交付结论和必要动作，不展开背景解释。这是第${attempt}次内部尝试，必须更换开头场景、叙事顺序和表达。`
            : `当前只写长版：600—900字。在同一核心判断下补充现场、判断依据、执行细节和避坑说明；不得复用短版原句或只做同义改写。这是第${attempt}次内部尝试，必须使用不同的现场和论证顺序。`,
          learningGuidance: input.learningBrief ? formatLearningBrief(input.learningBrief) : undefined,
          excludeBodies: promptExclusions, blueprint: input.blueprint,
          deliveryRule: input.spec.rule, ctaType: cta,
        }), maxTokens: input.bodyVersion === "long" ? 3500 : 1800, temperature: Math.min(0.82, 0.62 + attempt * 0.06),
      });
      payload = result.data;
      usage = resultUsage(result);
      const normalized = normalizeDraftSpecificBlueprint(
        payload?.body_structure,
        input.blueprint,
        input.spec,
        businessLine,
      );
      const candidateBlueprint = normalized.blueprint;
      const candidateBody = composeBlueprintBody(candidateBlueprint, input.spec, undefined, {
        bodyVersion: input.bodyVersion,
        businessLine,
      });
      const duplicate = bodyUniquenessProblem(candidateBody, [
        ...(input.historicalBodies ?? []),
        ...attemptedBodies,
      ]);
      if (duplicate) {
        lastProblem = duplicate.reason;
        lastFailureCode = "history_duplicate";
        attemptedBodies.unshift({ body: candidateBody, topic_id: input.topic.id });
        continue;
      }
      body = candidateBody;
      selectedBlueprint = candidateBlueprint;
      selectedMissingFields = normalized.initialMissingFields;
      selectedNormalizationActions = normalized.normalizationActions;
      break;
    } catch (error) {
      lastProblem = (error as Error).message;
      lastFailureCode = providerFailureCode(lastProblem);
      console.warn(`[growth] draft generation attempt ${attempt} failed:`, lastProblem);
    }
  }

  if (!body || !selectedBlueprint) {
    throw pipelineFailure(lastFailureCode, lastProblem);
  }

  // 标题已在选题阶段由运营确认；正文模型不得暗中改题。
  const title = enforceTitleLimit(input.topic.title);
  const hashtags = normalizeTags(Array.isArray(payload?.hashtags) ? payload.hashtags : businessLine === "overseas_student" ? ["#留学生求职", "#海归求职", "#职业规划"] : ["#中高管", "#职业转型", "#职业决策"]);
  const timestamp = now();
  const raw: ContentDraft = {
    id: id(), tenant_id: input.tenantId ?? input.account.tenant_id, account_id: input.account.id,
    run_id: input.run.id, status: "draft", business_line: GROWTH_BUSINESS_LINE_VALUES[businessLine], method_group: input.topic.method_group,
    method_id: input.topic.method_id, method_label: input.topic.method_label,
    generation_mode: input.topic.generation_mode, title_promise: input.topic.title_promise,
    source_snapshot: input.topic.source_snapshot, selected_body_version: input.bodyVersion,
    raw_body_tags: [], tagging_status: "pending", canonical_tag_ids: [], cta_type: cta, validation_checks: [],
    delivery_contract: deliveryContractFromBlueprint(selectedBlueprint), certification_status: "generating",
    repair_history: [], fallback_used: false,
    generation_pipeline_version: "v3_5",
    generation_diagnostics: {
      initial_missing_fields: selectedMissingFields,
      normalization_actions: selectedNormalizationActions,
      final_status: "failed",
      total_duration_ms: Date.now() - generationStartedAt,
    },
    schema_version: "method_v3_2", method_attribution_status: "confirmed", eligible_for_method_learning: true,
    test_variable: input.topic.test_variable, expected_signal: input.topic.expected_signal, title,
    alternative_titles: (Array.isArray(payload?.alternative_titles) ? payload.alternative_titles : [input.topic.title]).slice(0, 3).map(enforceTitleLimit),
    target_user: asText(payload?.target_user) || input.topic.target_user,
    cover_text: asText(payload?.cover_text) || input.topic.hook, body, hashtags,
    comment_prompt: asText(payload?.comment_prompt) || "你现在卡在哪两条具体路径之间？",
    word_count: countPublishChars(title, body, hashtags),
    follow_reason: asText(payload?.follow_reason) || input.topic.follow_reason,
    trust_anchor: asText(payload?.trust_anchor) || input.account.trust_source,
    review_points: Array.isArray(payload?.review_points) ? payload.review_points.slice(0, 5) : ["有效咨询", "主页访问", "收藏", "分享"],
    cover_suggestion: asText(payload?.cover_suggestion) || "用真实职业场景和标题核心冲突做封面。",
    learning_trace: input.learningBrief?.trace, created_at: timestamp, updated_at: timestamp,
  };
  let draft = enforceDraftCompliance(raw, input.topic.title);
  draft = await passDraftValidationGate(draft, {
    account: input.account,
    persona: input.account.persona,
    businessLine,
    topic: input.topic,
    cta,
    blueprint: selectedBlueprint,
    fallbackBlueprint: input.fallbackBlueprint,
    spec: input.spec,
  });
  draft = await fitDraftWithinPublishTarget(draft, {
    account: input.account,
    persona: input.account.persona,
    businessLine,
    topic: input.topic,
    blueprint: selectedBlueprint,
    fallbackBlueprint: input.fallbackBlueprint,
    spec: input.spec,
  });
  if (draft.validation_report?.status !== "passed") {
    throw pipelineFailure(validationFailureCode(draft), "三轮字段级修复后仍未通过正文合同");
  }
  if (draft.word_count.total > XHS_PUBLISH_CHAR_TARGET || draft.compliance?.status === "blocked") {
    throw pipelineFailure("structure_repair_failed", "正文长度或合规结构在自动修复后仍未达标");
  }
  draft = certifyDraftForOperator(draft);
  const finalDuplicate = bodyUniquenessProblem(draft.body, input.historicalBodies ?? []);
  if (finalDuplicate) {
    throw pipelineFailure("history_duplicate", finalDuplicate.reason);
  }
  draft = {
    ...draft,
    generation_diagnostics: {
      initial_missing_fields: selectedMissingFields,
      normalization_actions: selectedNormalizationActions,
      final_status: "certified",
      total_duration_ms: Date.now() - generationStartedAt,
    },
  };
  return { draft, usage, blueprint: selectedBlueprint };
}

export async function generateDraftVariants(input: {
  tenantId?: string; account: GrowthAccount; run: GrowthRun; topic: TopicCandidate;
  count?: number; excludeBodies?: string[]; learningBrief?: GrowthLearningBrief;
  bodyVersion?: "short" | "long";
  historicalBodies?: BodyUniquenessReference[];
}) {
  const cta = ctaType(input.account.persona);
  const planned = await generateDraftBlueprint({ account: input.account, topic: input.topic, cta });
  const shared = {
    ...input,
    blueprint: planned.blueprint,
    // 通用业务模板只用于生成蓝图时的字段校准，不得再作为整篇正文交付。
    fallbackBlueprint: planned.blueprint,
    spec: planned.spec,
  };
  if (input.bodyVersion) {
    const generated = await generateSingleDraft({
      ...shared,
      bodyVersion: input.bodyVersion,
      excludeBodies: input.excludeBodies,
    });
    return { drafts: [generated.draft], usage: generated.usage || planned.usage };
  }
  const short = await generateSingleDraft({
    ...shared,
    bodyVersion: "short",
    historicalBodies: input.historicalBodies,
  });
  const long = await generateSingleDraft({
    ...shared,
    bodyVersion: "long",
    historicalBodies: input.historicalBodies,
    currentPairBodies: [short.draft.body],
    excludeBodies: [...(input.excludeBodies ?? []), short.draft.body],
  });
  let shortDraft = short.draft;
  let longDraft = long.draft;
  // 共享身份、核心判断和转化合同是正确行为；先自动拉开篇幅与展开层次，再做最终差异判断。
  if (
    draftBodiesAreTooSimilar(shortDraft.body, longDraft.body)
    || !draftVariantOrderIsValid(shortDraft, longDraft)
  ) {
    const businessLine = input.account.business_line ?? "executive";
    shortDraft = await rebuildVariantForLengthOrder({
      draft: shortDraft,
      account: input.account,
      topic: input.topic,
      blueprint: short.blueprint,
      spec: planned.spec,
      businessLine,
      compact: true,
      aggressive: true,
    });
    longDraft = await rebuildVariantForLengthOrder({
      draft: longDraft,
      account: input.account,
      topic: input.topic,
      blueprint: long.blueprint,
      spec: planned.spec,
      businessLine,
      compact: false,
      aggressive: false,
    });
  }
  if (!draftVariantOrderIsValid(shortDraft, longDraft)) {
    throw pipelineFailure("structure_repair_failed", "短版和长版长度关系不符合要求");
  }
  if (draftBodiesAreTooSimilar(shortDraft.body, longDraft.body)) {
    throw pipelineFailure("variant_too_similar", "长度修复后短版和长版仍过于相似");
  }
  for (const draft of [shortDraft, longDraft]) {
    const duplicate = bodyUniquenessProblem(draft.body, input.historicalBodies ?? []);
    if (duplicate) throw pipelineFailure("history_duplicate", duplicate.reason);
  }
  return { drafts: [shortDraft, longDraft], usage: long.usage || short.usage || planned.usage };
}

async function rebuildVariantForLengthOrder(input: {
  draft: ContentDraft;
  account: GrowthAccount;
  topic: TopicCandidate;
  blueprint: DraftBlueprintContext;
  spec: PromiseDeliverySpec;
  businessLine: GrowthBusinessLine;
  compact: boolean;
  aggressive: boolean;
}) {
  const body = composeBlueprintBody(input.blueprint, input.spec, undefined, {
    bodyVersion: input.draft.selected_body_version === "long" ? "long" : "short",
    businessLine: input.businessLine,
    compact: input.compact,
    aggressive: input.aggressive,
  });
  let draft = withDraftValidation(attachBlueprintContract(enforceDraftCompliance({
    ...input.draft,
    body,
    certification_status: "repairing",
    fallback_used: true,
    repair_history: [...(input.draft.repair_history ?? []), {
      field: "length",
      reason_code: "variant_length_order",
      action: input.draft.selected_body_version === "long"
        ? "按同一蓝图补足长版的判断依据与执行细节"
        : "按同一蓝图压缩短版的背景与重复解释",
      repaired_at: now(),
    }],
    word_count: countPublishChars(input.draft.title, body, input.draft.hashtags),
    updated_at: now(),
  }, input.topic.title), input.blueprint), input.account.persona, (input.draft.validation_report?.attempts ?? 0) + 1);
  draft = await passDraftValidationGate(draft, {
    account: input.account,
    persona: input.account.persona,
    businessLine: input.businessLine,
    topic: input.topic,
    cta: ctaType(input.account.persona),
    blueprint: input.blueprint,
    fallbackBlueprint: input.blueprint,
    spec: input.spec,
  });
  draft = await fitDraftWithinPublishTarget(draft, {
    account: input.account,
    persona: input.account.persona,
    businessLine: input.businessLine,
    topic: input.topic,
    blueprint: input.blueprint,
    fallbackBlueprint: input.blueprint,
    spec: input.spec,
  });
  return certifyDraftForOperator(draft);
}

export function draftVariantOrderIsValid(shortDraft: ContentDraft, longDraft: ContentDraft) {
  if (shortDraft.selected_body_version === "long" || longDraft.selected_body_version !== "long") return false;
  const shortLength = Array.from(shortDraft.body.replace(/\s+/gu, "")).length;
  const longLength = Array.from(longDraft.body.replace(/\s+/gu, "")).length;
  const minimumDelta = Math.max(80, Math.ceil(shortLength * 0.12));
  return longLength >= shortLength + minimumDelta
    && shortDraft.word_count.total < longDraft.word_count.total;
}

function comparisonBigrams(value: string) {
  const normalized = value.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
  const chars = Array.from(normalized);
  return new Set(chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`));
}

export function draftBodiesAreTooSimilar(shortBody: string, longBody: string) {
  const shortNormalized = shortBody.replace(/\s+/g, "").trim();
  const longNormalized = longBody.replace(/\s+/g, "").trim();
  if (!shortNormalized || !longNormalized) return false;
  if (shortNormalized === longNormalized) return true;
  const shortPairs = comparisonBigrams(shortBody);
  const longPairs = comparisonBigrams(longBody);
  if (!shortPairs.size || !longPairs.size) return false;
  let overlap = 0;
  for (const pair of shortPairs) if (longPairs.has(pair)) overlap += 1;
  const shorterLength = Math.min(shortNormalized.length, longNormalized.length);
  const lengthDelta = Math.abs(shortNormalized.length - longNormalized.length);
  // 长版只要新增了足够的现场、依据或执行细节，就不应因共享合同段而被误判为同一篇。
  const meaningfulExpansion = lengthDelta >= Math.max(80, Math.ceil(shorterLength * 0.18));
  if (meaningfulExpansion) return false;
  return overlap / Math.min(shortPairs.size, longPairs.size) >= 0.92;
}

export type DraftRepairType = "opening" | "fulfillment" | "identity" | "conversion" | "outcome";

export async function repairDraftPart(input: {
  draft: ContentDraft;
  account: GrowthAccount;
  topic: TopicCandidate;
  repairType: DraftRepairType;
}) {
  const instruction: Record<DraftRepairType, string> = {
    opening: "只修正开头段：从动作、现场、念头或冲突自然切入，并在前30字回应标题人物与冲突；不要自报身份或机械复述标题。其余段落尽量保持原样。",
    fulfillment: "补齐标题承诺：标题中的数字逐项一致；资料、清单或路线图必须把实际内容完整交付。不要删掉原文已有价值。",
    identity: "只把当前商家/买家/专家身份自然写清楚，使用经历、动作和语气体现身份，不要用“作为××”硬贴标签。",
    conversion: "重写专业服务出现的因果转折：先写具体卡点或自己试过什么，再自然带出老师、机构或顾问具体做了什么，避免广告口吻。",
    outcome: "紧接专业服务动作补充一个克制、可验证的阶段变化，例如岗位收窄、简历对齐、排除方向、明确下一步或反馈可复盘；不得虚构Offer、薪资或保证成功。",
  };
  const result = await llmJSON<any>({
    system: GROWTH_SYSTEM_PROMPT,
    user: `请局部修正下面的小红书正文，只输出 JSON：{"body":"修正后的完整正文"}。\n\n标题：${input.draft.title}\n标题承诺：${input.draft.title_promise}\n当前身份：${input.account.persona}\n人设：${input.account.one_liner}\n\n本次唯一修复任务：${instruction[input.repairType]}\n\n共同约束：口吻像同一个真人；保持事实边界；只保留一个主要承接动作；不要互动诱导或站外导流。\n\n原正文：\n${input.draft.body}`,
    maxTokens: input.draft.selected_body_version === "long" ? 3500 : 1800,
    temperature: 0.3,
  });
  const body = asText(result.data?.body);
  if (!body) throw new Error("draft_repair_empty");
  let repaired = withDraftValidation(enforceDraftCompliance({
    ...input.draft,
    body,
    word_count: countPublishChars(input.draft.title, body, input.draft.hashtags),
    updated_at: now(),
  }, input.topic.title), input.account.persona, (input.draft.validation_report?.attempts ?? 0) + 1);
  if (repaired.word_count.total > XHS_PUBLISH_CHAR_TARGET) {
    try {
      const compressedBody = await rewriteDraftWithinPublishTarget(repaired, input.account);
      if (compressedBody) repaired = withDraftValidation(enforceDraftCompliance({
        ...repaired,
        body: compressedBody,
        word_count: countPublishChars(repaired.title, compressedBody, repaired.hashtags),
        updated_at: now(),
      }, input.topic.title), input.account.persona, (repaired.validation_report?.attempts ?? 0) + 1);
    } catch (error) {
      console.warn("[growth] repaired draft length rewrite skipped:", (error as Error).message);
    }
  }
  return { draft: repaired, usage: resultUsage(result) };
}

export async function generateDraft(input: {
  tenantId?: string; account: GrowthAccount; run: GrowthRun;
  selectedTopicId?: string; learningBrief?: GrowthLearningBrief;
}) {
  const topic = input.run.topic_pool.find((item) => item.id === input.selectedTopicId) || input.run.topic_pool[0];
  if (!topic) throw new Error("topic_pool_empty");
  const cta = ctaType(input.account.persona);
  const planned = await generateDraftBlueprint({ account: input.account, topic, cta });
  const generated = await generateSingleDraft({
    ...input,
    topic,
    bodyVersion: "short",
    blueprint: planned.blueprint,
    fallbackBlueprint: planned.fallback,
    spec: planned.spec,
  });
  const run: GrowthRun = { ...input.run, status: "ready", selected_topic: topic, draft: generated.draft, updated_at: now() };
  return { run, draft: generated.draft, usage: generated.usage || planned.usage };
}

export async function generateOpenBodyTags(draft: ContentDraft): Promise<{
  tags: RawBodyTag[]; status: ContentDraft["tagging_status"]; usage?: Record<string, unknown>;
}> {
  try {
    const bodyVersion = draft.selected_body_version || "selected";
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildBodyTagUserPrompt({ title: draft.title, body: draft.body, bodyVersion }),
      maxTokens: 500, temperature: 0.25,
    });
    const rows = Array.isArray(result.data?.tags) ? result.data.tags : [];
    const tags = rows.slice(0, 2).map((row: any) => ({
      id: id(), text: asText(row.text).slice(0, 8), reason: asText(row.reason),
      generated_at: now(), body_version: bodyVersion, active: true,
    })).filter((tag: RawBodyTag) => tag.text.length >= 2 && tag.reason && !/(六步|VRIN|PrinciplesYou|面霸君|199|6999|诊断报告)/i.test(tag.text));
    return { tags, status: tags.length ? "tagged" : "unclassified", usage: resultUsage(result) };
  } catch (error) {
    console.warn("[growth] body tagging skipped:", (error as Error).message);
    return { tags: [], status: "unclassified" };
  }
}

export async function generateTagMergeSuggestions(rawTags: Array<{ text: string; draftId: string; title: string }>) {
  if (new Set(rawTags.map((item) => item.text)).size < 2) return { suggestions: [] as TagMergeSuggestion[] };
  try {
    const result = await llmJSON<any>({ system: GROWTH_SYSTEM_PROMPT, user: buildTagMergeUserPrompt({ rawTags }), maxTokens: 1800, temperature: 0.25 });
    const suggestions: TagMergeSuggestion[] = (Array.isArray(result.data?.suggestions) ? result.data.suggestions : [])
      .filter((row: any) => Array.isArray(row.member_tags) && new Set(row.member_tags).size >= 2)
      .map((row: any) => ({
        id: id(), proposed_name: asText(row.proposed_name).slice(0, 12), definition: asText(row.definition),
        member_tags: [...new Set<string>(row.member_tags.map(String))],
        representative_draft_ids: Array.isArray(row.representative_draft_ids) ? row.representative_draft_ids.map(String) : [],
        status: "pending", created_at: now(),
      }));
    return { suggestions, usage: resultUsage(result) };
  } catch (error) {
    console.warn("[growth] tag merge skipped:", (error as Error).message);
    return { suggestions: [] as TagMergeSuggestion[] };
  }
}

export async function reviewDraft(input: {
  tenantId?: string; draft: ContentDraft; metrics: GrowthReviewMetrics;
  existingReview?: GrowthReview | null; notes?: ContentDraft[]; reviews?: GrowthReview[];
}): Promise<{ review: GrowthReview; usage?: Record<string, unknown> }> {
  const timestamp = now();
  const metrics: GrowthReviewMetrics = { ...input.metrics, published_at: resolvePublishedAt(input.draft, input.metrics), snapshot_at: input.metrics.snapshot_at || timestamp };
  const derived = computeDerivedMetrics(metrics);
  metrics.ctr = derived.ctr;
  const sample = evaluateReviewSample(metrics, metrics.published_at, new Date(timestamp));
  const benchmarks = buildReviewBenchmarks(input.draft, input.notes || [input.draft], input.reviews || []);
  const preliminary = diagnoseEntry(metrics, benchmarks);
  let payload: any;
  let usage: Record<string, unknown> | undefined;
  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildReviewUserPrompt({ title: input.draft.title, methodLabel: input.draft.method_label || "历史未分类",
        generationMode: input.draft.generation_mode || "default", rawTags: (input.draft.raw_body_tags || []).filter((tag) => tag.active !== false),
        testVariable: input.draft.test_variable, metrics: { metrics, derived, sample, benchmarks, preliminary } }),
      maxTokens: 2000, temperature: 0.35,
    });
    payload = result.data;
    usage = resultUsage(result);
  } catch (error) {
    console.warn("[growth] review fallback:", (error as Error).message);
  }
  const allowed = new Set(["scale", "retest", "weak_entry", "weak_conversion", "wrong_audience", "pause"]);
  const classification = allowed.has(payload?.classification) ? payload.classification : "retest";
  const entry = diagnoseEntry(metrics, benchmarks, asText(payload?.title_pattern) || input.draft.method_label, asText(payload?.primary_audience) || input.draft.target_user, asText(payload?.primary_keyword) || "无");
  const nextVariable = asText(payload?.next_variable) || "下一篇只改变一个变量。";
  const review: GrowthReview = {
    id: input.existingReview?.id || input.draft.id, tenant_id: input.tenantId ?? input.draft.tenant_id,
    draft_id: input.draft.id, metrics, derived_metrics: derived, sample, entry_diagnosis: entry,
    classification, entry_judgement: asText(payload?.entry_judgement) || "继续以真实数据判断标题入口。",
    body_judgement: asText(payload?.body_judgement) || "检查正文是否兑现标题承诺。",
    conversion_judgement: asText(payload?.conversion_judgement) || "以有效咨询作为北极星。",
    compliance_judgement: asText(payload?.compliance_judgement) || "以发布前硬校验为准。",
    value_judgement: asText(payload?.value_judgement) || "观察收藏与分享。",
    follow_judgement: asText(payload?.follow_judgement) || "观察有效咨询。",
    audience_judgement: asText(payload?.audience_judgement) || "观察是否出现目标用户。",
    next_variable: nextVariable, manager_instruction: asText(payload?.manager_instruction) || "单篇只作为证据。",
    topic_instruction: asText(payload?.topic_instruction) || "围绕同一目标用户继续验证。",
    writer_instruction: asText(payload?.writer_instruction) || "正文严格兑现标题承诺。",
    experiment_variable: normalizeExperimentVariable(asText(payload?.experiment_variable) || nextVariable),
    learning_version: `single-${timestamp}`, created_at: input.existingReview?.created_at || timestamp, updated_at: timestamp,
  };
  return { review, usage };
}

export async function stageReview(input: {
  account: GrowthAccount; notes: ContentDraft[]; reviews: GrowthReview[]; previous?: WeeklyReviewResult;
}): Promise<{ result: WeeklyReviewResult; usage?: Record<string, unknown> }> {
  const deterministic = buildWeeklyReviewResult(input);
  let decision: Record<string, unknown> | undefined;
  let usage: Record<string, unknown> | undefined;
  try {
    const result = await llmJSON<Record<string, unknown>>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildStageReviewUserPrompt({ targetUser: input.account.target_user, methodAggregate: deterministic.by_method, tagAggregate: deterministic.by_tag, eligibleTotal: deterministic.eligible_total || 0 }),
      maxTokens: 1200, temperature: 0.35,
    });
    decision = result.data;
    usage = resultUsage(result);
  } catch (error) {
    console.warn("[growth] stage review fallback:", (error as Error).message);
  }
  const text = (key: string, fallback: string) => asText(decision?.[key]) || fallback;
  const result: WeeklyReviewResult = {
    ...deterministic,
    decision: {
      ...deterministic.decision,
      reusable_pattern: text("reusable_pattern", deterministic.decision.reusable_pattern),
      summary: text("summary", deterministic.decision.summary),
      strategic_hypothesis: text("strategic_hypothesis", deterministic.decision.strategic_hypothesis || ""),
      title_patterns_to_repeat: Array.isArray(decision?.title_patterns_to_repeat) ? decision.title_patterns_to_repeat.map(String).slice(0, 6) : deterministic.decision.title_patterns_to_repeat,
      title_patterns_to_avoid: Array.isArray(decision?.title_patterns_to_avoid) ? decision.title_patterns_to_avoid.map(String).slice(0, 6) : deterministic.decision.title_patterns_to_avoid,
      body_patterns_to_repeat: Array.isArray(decision?.body_patterns_to_repeat) ? decision.body_patterns_to_repeat.map(String).slice(0, 6) : deterministic.decision.body_patterns_to_repeat,
    },
  };
  return { result, usage };
}
