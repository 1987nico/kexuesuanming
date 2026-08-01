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
  GrowthProfileIdentity,
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
  defaultProfileIdentity,
  isProfileIdentityCompatibleText,
  profileIdentityContract,
  resolveProfileIdentity,
} from "./accountIdentity";
import { contentUsePolicyFor, perspectivePromptContract } from "./perspectiveStrategy";
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
  nativeTitleSemanticTopicKeys,
  normalizeTitleForComparison,
  titleForMethodSemanticComparison,
  titlesAreMethodAwareSemanticDuplicates,
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

/**
 * 模型生成一个方法的多个标题时，每条标题必须携带自己的正文承诺。
 * 新协议使用 title_candidates；旧协议只用于兼容历史测试和灰度期间尚未
 * 切换的模型响应。不能把首选标题的承诺静默复用到新协议的其他候选上。
 */
function modelTitleCandidateRows(row: any) {
  const structured = Array.isArray(row?.title_candidates)
    ? row.title_candidates
      .map((candidate: any) => ({
        ...row,
        ...candidate,
        title: asText(candidate?.title),
        title_promise: asText(candidate?.title_promise),
      }))
      .filter((candidate: any) => candidate.title && candidate.title_promise)
    : [];
  const legacy = [
    asText(row?.title),
    ...(Array.isArray(row?.alternative_titles) ? row.alternative_titles.map(asText) : []),
  ]
    .map((title) => ({
      ...row,
      title: title.trim(),
      title_promise: asText(row?.title_promise),
    }))
    .filter((candidate) => candidate.title);
  const candidates = structured.length ? structured : legacy;
  const seen = new Set<string>();
  return candidates.filter((candidate: any) => {
    const fingerprint = normalizeTitleForComparison(candidate.title);
    if (!fingerprint || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  }).slice(0, 5);
}

function accountContext(account: GrowthAccount): AccountContext {
  const identityContract = profileIdentityContract(account);
  return {
    businessLine: GROWTH_BUSINESS_LINE_VALUES[account.business_line ?? "executive"],
    profileName: account.profile_name,
    profileIdentity: identityContract.identity,
    requiredVoice: identityContract.requiredVoice,
    forbiddenVoice: identityContract.forbiddenVoice,
    oneLiner: account.one_liner,
    toneStyle: account.tone_style,
    filterWords: account.filter_words,
    avoidExpressions: account.avoid_expressions,
    personaSpecific: account.persona_specific,
    notDoing: account.not_doing,
    complianceRedline: account.compliance_redline,
    privateDomain: account.private_domain,
    perspectiveContract: perspectivePromptContract(account),
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

function mergeGenerationUsage(
  ...records: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  const usable = records.filter(Boolean) as Array<Record<string, unknown>>;
  if (!usable.length) return undefined;
  const providers = [...new Set(usable.map((item) => String(item.provider ?? "")).filter(Boolean))];
  const models = [...new Set(usable.map((item) => String(item.model ?? "")).filter(Boolean))];
  const sum = (key: "input_tokens" | "output_tokens") => usable.reduce(
    (total, item) => total + (typeof item[key] === "number" ? item[key] as number : 0),
    0,
  );
  return {
    provider: providers.length === 1 ? providers[0] : providers.join("+") || undefined,
    model: models.length === 1 ? models[0] : models.join("+") || undefined,
    input_tokens: sum("input_tokens") || undefined,
    output_tokens: sum("output_tokens") || undefined,
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

function fallbackAccountForInput(input: {
  businessLine: GrowthBusinessLine;
  persona: GrowthPersona;
  accountName: string;
  targetUser?: string;
  coreProblem?: string;
  profileIdentity?: GrowthProfileIdentity;
}) {
  const base = fallbackAccount(input.businessLine, input.persona);
  const identityClues = `${input.accountName} ${input.targetUser || ""}`;
  if (
    input.businessLine === "overseas_student"
    && input.persona === "buyer"
    && (
      input.profileIdentity === "overseas_student_self"
      || /(留学生本人|学生本人|毕业生本人|我的秋招|本人求职|求职踩坑|边找方向)/u.test(identityClues)
    )
  ) {
    return {
      target: input.targetUser || "正在准备海外秋招或回国求职的留学生本人",
      problem: input.coreProblem || "回国还是留当地、先定岗位还是先改简历，缺少可验证的选择依据",
      value: "以留学生本人视角记录岗位选择、投递反馈和面试复盘",
      one: "一个留学生亲自跑秋招的真实记录",
      follow: "持续看见留学生本人如何验证方向、调整投递和复盘结果",
    };
  }
  return base;
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
  profileIdentity?: GrowthProfileIdentity;
}): Promise<{ account: GrowthAccount; plan: GrowthPlan; usage?: Record<string, unknown> }> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const persona = input.persona ?? "expert";
  const businessLine = input.businessLine ?? "executive";
  const fallback = fallbackAccountForInput({
    businessLine,
    persona,
    accountName: input.accountName,
    targetUser: input.targetUser,
    coreProblem: input.coreProblem,
    profileIdentity: input.profileIdentity,
  });
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
  const profileIdentity = input.profileIdentity ?? defaultProfileIdentity(businessLine, persona);
  const personaSpecific = mergePersonaSpecific(persona, data.persona_specific);
  if (persona === "buyer") {
    if (!isProfileIdentityCompatibleText(personaSpecific.identity, profileIdentity)) {
      personaSpecific.identity = "";
    }
    personaSpecific.identity ||= profileIdentity === "overseas_student_self"
      ? "正在准备海外秋招或回国求职的留学生本人"
      : profileIdentity === "overseas_student_parent"
        ? "正在陪孩子准备海外秋招或回国求职的留学生家长"
        : input.targetUser || fallback.target;
    personaSpecific.struggle ||= input.coreProblem || fallback.problem;
  }
  const account: GrowthAccount = {
    id: accountId,
    tenant_id: tenantId,
    business_line: businessLine,
    persona,
    profile_identity: profileIdentity,
    name: input.accountName,
    target_user: data.target_user || input.targetUser || fallback.target,
    core_problem: data.core_problem || input.coreProblem || fallback.problem,
    account_value: data.account_value || fallback.value,
    trust_source: data.trust_source || input.trustSource || "来自真实客户咨询、职业决策和交付实践。",
    not_doing: data.not_doing || "不做泛职场鸡汤，不承诺结果，不用互动换资料。",
    hypotheses: Array.isArray(data.hypotheses) ? data.hypotheses.slice(0, 5) : ["具体处境比泛焦虑更能带来有效咨询。"],
    one_liner: isProfileIdentityCompatibleText(asText(data.one_liner), profileIdentity)
      ? asText(data.one_liner) || fallback.one
      : fallback.one,
    follow_reason: data.follow_reason || fallback.follow,
    tone_style: data.tone_style || "具体、克制、有判断、有下一步。",
    filter_words: Array.isArray(data.filter_words) ? data.filter_words.slice(0, 8) : [],
    avoid_expressions: Array.isArray(data.avoid_expressions) ? data.avoid_expressions.slice(0, 8) : ["逆袭", "暴富", "包成功"],
    compliance_redline: asText(data.compliance_redline) || input.businessPosition?.compliance_redline || "不夸大、不虚构、不诱导互动、不违规导流。",
    private_domain: asText(data.private_domain),
    persona_specific: personaSpecific,
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
 * 留学生家长账号经历多轮真实使用后，主兜底池可能已全部进入历史。
 * 这组候选只服务于默认原生法的内部恢复，继续显式写出亲子关系，并且仍要
 * 经过本地质量、全历史去重和模型语义终审，不能因为是应急候选就直接放行。
 */
const OVERSEAS_STUDENT_PARENT_BUYER_EMERGENCY_TITLE_VARIANTS: Partial<
  Record<TitleMethodId, string[]>
> = {
  human_pain: [
    "孩子秋招没消息，我不敢再问",
    "孩子说先等等，我却一夜没睡",
    "孩子投完简历，家里没人敢催",
    "孩子面试沉默，我怕问多了添乱",
    "孩子毕业临近，我更怕他没方向",
    "孩子海投没回音，我不知该不该管",
    "孩子说想留英，我怕劝错方向",
    "孩子想回国，我却怕他没准备好",
    "孩子收到拒信，我装作没看见",
    "孩子简历改完，我还是不敢放心",
    "孩子笔试结束，我不敢追问结果",
    "孩子不再聊秋招，我才真的着急",
    "孩子申请页卡住，我不敢再催",
    "孩子拒信到了，我先不敢点开",
    "室友聊Offer，孩子回家沉默",
    "毕业典礼快到，孩子还没去向",
    "孩子租约快到，却不知搬哪座城",
    "导师问毕业计划，孩子含糊回答",
    "校友答应内推，孩子却没等到下文",
    "孩子面试撞答辩，两边都不敢放",
    "孩子签证倒计时，岗位还没排好",
    "职业展拿满资料，孩子仍不知投谁",
    "孩子薪资栏改半天，不敢提交",
    "孩子被追问项目数字，当场卡住",
    "孩子背调缺联系人，翻遍通讯录",
    "家庭群问秋招，孩子总躲着不回",
    "孩子航班撞面试，不敢选一边",
    "孩子学位证没出，公司却催材料",
    "孩子两版简历对不上，我干着急",
    "孩子投了多座城，没有真想留的",
    "孩子收到笔试，才发现岗位不对口",
    "家里托了关系，孩子反而难拒绝",
    "孩子作品集改到深夜，不知给谁看",
    "孩子面试复盘写满，不敢看下一场",
    "同学都入职了，孩子还在选方向",
    "孩子论文截止撞秋招，两头赶",
    "孩子被问为何回国，答不出真理由",
    "孩子拿保底Offer，不敢告诉家里",
    "孩子准备很多答案，仍怕现场追问",
    "孩子每天刷岗位，却越来越不敢投",
    "招聘官已读不回，孩子反复看消息",
    "孩子测评今晚到期，还没敢开始",
    "终面没结果，孩子保底Offer催回复",
    "孩子凌晨面试，第二天还要交论文",
    "招聘官问入职日，孩子还没答辩",
    "网申填本地地址，孩子还没定城市",
    "孩子学校邮箱快停，申请还没结束",
    "孩子推荐人休假，背调截止在催",
    "孩子群面明天开始，却找不到搭档",
    "孩子异地终面，临时机票太贵",
    "招聘会加了人，孩子却不知怎么跟",
    "孩子转正口头答应，一直没书面信",
    "孩子国内号码收不到网申验证码",
  ],
  tug_of_war: [
    "孩子先回国，还是等海外岗位？",
    "孩子先保底，还是继续冲对口岗？",
    "孩子先改简历，还是先定岗位？",
    "孩子先练面试，还是继续补经历？",
    "孩子先投大厂，还是先看成长性？",
    "孩子先选城市，还是先看岗位？",
    "孩子先接Offer，还是再等一轮？",
    "孩子先回家，还是留校找工作？",
    "我该帮孩子筛岗，还是让他自己选？",
    "我该提醒孩子截止，还是让他负责？",
    "陪孩子冲秋招，还是先补一段实习？",
    "孩子先求稳，还是再试一次喜欢的？",
    "娃选雇主担保，还是选成长空间？",
    "娃先接早Offer，还是等目标岗？",
    "娃留实习转正，还是重投校招？",
    "娃选客户前台，还是后台研究？",
    "娃去咨询公司，还是企业内部岗？",
    "娃选跨城轮换，还是固定一地？",
    "娃选高固定薪，还是奖金上限？",
    "娃选明确职责，还是宽口径培养？",
    "娃投毕业生岗，还是经验岗？",
    "娃等成绩单，还是先办入职？",
    "娃选频繁出差，还是固定办公？",
    "娃看公司使命，还是直属经理？",
    "娃选现金薪酬，还是长期股权？",
    "娃先回家休整，还是直接入职？",
    "娃留本专业，还是转产品岗位？",
    "娃去公共部门，还是初创公司？",
    "娃选海外本地企，还是国内外企？",
    "娃拿搬迁补贴，还是留熟悉城市？",
    "娃先签限时岗，还是等奖学金项目？",
    "娃走技术线，还是客户解决方案？",
    "娃独立做项目，还是进成熟团队？",
    "娃先攒本地经验，还是回国校招？",
    "娃先接实习转正，还是重投全职岗？",
    "娃选签证稳定，还是能力成长快？",
    "娃先上岗，还是等评估中心？",
    "娃选混合办公，还是每周到岗？",
    "娃看到手薪资，还是养老福利？",
    "娃选职位级别，还是实际职责？",
    "娃进全球团队，还是本地协作？",
    "娃先工作，还是走毕业旅行？",
    "娃看住房补贴，还是现金薪酬？",
    "娃选代理合同，还是公司直签？",
    "娃看晋升承诺，还是首年任务？",
    "娃选熟人团队，还是更强上级？",
    "娃去监管行业，还是快节奏科技？",
    "娃选职责更宽，还是指标更清？",
    "娃看工时稳定，还是学习机会？",
    "娃选名牌客户，还是项目所有权？",
    "娃选到手收入，还是签证确定性？",
    "娃留喜欢城市，还是去机会密集地？",
    "娃做数据分析，还是产品运营？",
    "娃做内部研究，还是面向客户？",
    "娃走海归项目，还是普通部门岗？",
    "娃进校友创业，还是独立找机会？",
    "娃选员工宿舍，还是更高现金？",
    "娃留固定部门，还是项目制派遣？",
    "娃追AI热岗，还是积累长期能力？",
    "娃看直属经理，还是正式培训？",
    "娃选本币薪资，还是跨境收入？",
    "娃选成熟业务，还是从零新项目？",
    "娃选本地客户，还是国际业务？",
    "娃选固定地点，还是多城市项目？",
    "娃选总部策略，还是一线运营？",
    "娃上白天班，还是跨时区轮值？",
    "娃先拿职业认证，还是先入职培训？",
    "娃做个人贡献者，还是带小团队？",
    "娃做售前方案，还是交付实施？",
    "娃做内部风控，还是外部审计？",
    "娃进消费品牌，还是做B端服务？",
    "娃要业务主导权，还是资源平台？",
    "娃看薪资透明，还是晋升路径？",
    "娃降一级入职，还是等同级岗位？",
    "一年合约还是无固定期，娃怎么选？",
    "娃做研究分析，还是交易支持？",
    "娃做总部规划，还是门店运营？",
    "娃选固定客户，还是不断拓新客？",
    "品牌方和供应商，娃该先去哪边？",
    "娃做商业分析，还是财务规划？",
    "娃选高自主度，还是清晰流程？",
    "娃看首年轮岗，还是长期归属？",
    "娃做技术产品，还是消费产品？",
    "增长岗位和客户成功，娃选哪个？",
    "娃选单一大客户，还是多客户组合？",
    "娃做流程优化，还是新品探索？",
    "娃进家族企业，还是经理人团队？",
    "娃选季度奖金，还是长期留任奖？",
    "先签排他还是保留面试，娃卡住了",
    "娃选面试快的，还是信息透明的？",
    "娃要岗位确定，还是跨职能机会？",
    "娃选自己会的，还是最想学的？",
    "政策研究和商业落地，娃选哪边？",
    "娃选结构化培养，还是直接担责？",
    "娃先异地培训，还是等本地岗位？",
    "娃选弹性工时，还是固定上下班？",
    "新客拓展还是老客经营，娃怎么选？",
    "娃选高曝光项目，还是基础工作？",
    "娃先拿安全许可，还是换个行业？",
    "快速晋升还是专业积累，娃纠结了",
    "娃选项目奖金，还是稳定年终奖？",
    "娃要产品决策权，还是客户影响力？",
    "娃做数据治理，还是业务洞察？",
    "娃选核心系统，还是创新试验？",
    "先做区域市场还是全国项目，娃犹豫",
    "娃选联合培养，还是直接定岗？",
    "娃做采购管理，还是供应商开发？",
    "娃选内部咨询，还是业务执行？",
    "先去甲方还是专业服务，娃拿不准",
    "娃做定价策略，还是渠道运营？",
    "娃选固定产品，还是定制方案？",
    "娃做组织发展，还是招聘运营？",
  ],
  contrarian: [
    "我越替孩子着急，他越不想投",
    "孩子简历越漂亮，越要先看岗位",
    "孩子海投越多，越容易错过方向",
    "我替孩子找机会，不如先听他想法",
    "孩子拿到笔试，不等于方向选对",
    "孩子学校不错，更要早点试岗位",
    "我越帮孩子改简历，他越说不清自己",
    "孩子实习多，不代表岗位就好选",
    "孩子回国越急，越要先排求职顺序",
    "我替孩子问人脉，不如先看岗位匹配",
    "孩子机会越多，越要先做减法",
    "孩子准备越久，越不能只改简历",
    "孩子证书越多，越要补工作证据",
    "孩子英语流利，未必会讲业务",
    "孩子成绩越高，越要练协作故事",
    "孩子项目越多，越要讲清个人贡献",
    "孩子社团头衔高，未必证明胜任",
    "孩子投得越早，越要先核招聘批次",
    "孩子认识校友多，未必懂岗位日常",
    "孩子面试练得多，未必答得更自然",
    "孩子Offer越多，越要看直属经理",
    "孩子起薪越高，未必成长更快",
    "孩子进大公司，未必做核心工作",
    "孩子岗位名好听，未必工作对口",
    "孩子会的工具多，未必有结果证据",
    "孩子课程选得广，未必说得清专长",
    "孩子专业热门，未必岗位更好投",
    "孩子内推越多，越要看岗位匹配",
    "孩子简历写得满，更要扛住细节追问",
    "孩子案例背得熟，未必扛得住追问",
    "孩子留英越久，越要早看回国窗口",
    "孩子回国越早，未必赶上正确批次",
    "孩子可选城市多，投递反而更分散",
    "孩子关注行业多，准备反而没重点",
    "孩子方向越多，越要先验证一条",
    "孩子名企实习，未必做过关键任务",
    "孩子比赛获奖，未必讲得出业务结果",
    "孩子技术很强，未必讲得清客户价值",
    "孩子人脉越广，越要记录有效反馈",
    "孩子口语越好，越要练中文汇报",
    "孩子笔试过得快，未必岗位就匹配",
    "孩子进到终面，也不该停止其他投递",
    "孩子愿意降薪，未必更容易跨行业",
    "孩子选远程岗，未必更容易融入",
    "孩子管培轮岗多，方向未必更清楚",
    "孩子跨专业，优势仍要靠项目证明",
    "孩子作品集漂亮，未必对准岗位任务",
    "孩子导师推荐强，替代不了工作证据",
    "孩子工签没问题，岗位未必就合适",
    "孩子签约越快，越要先看试用期",
    "孩子福利看着多，总回报未必更高",
    "孩子双语简历齐，最怕两版口径不一",
    "孩子海外经历多，未必熟悉本地业务",
    "孩子量化课扎实，未必会讲商业影响",
  ],
  nostalgia: [
    "当年我催选学校，如今陪孩子看岗位",
    "以前我替孩子选校，现在让他先试岗位",
    "翻出旧录取信，我先陪孩子查招聘",
    "我当年只问名校，孩子如今先看项目",
    "以前陪孩子申请，现在陪他练面试",
    "孩子毕业那天，我想起当年的申请季",
    "从前我替孩子做主，如今先听他选岗位",
    "以前盯孩子成绩，现在先听他讲项目",
    "当年只看排名，如今陪孩子看岗位",
    "以前问学校名气，现在问孩子想做啥",
    "孩子收起录取信，我开始和他看岗位",
    "陪孩子走到秋招，我才放下名校执念",
    "陪娃排课程表，如今改排网申日",
    "以前陪娃盯成绩，现在陪他讲项目",
    "陪娃看校园地图，如今先算通勤",
    "以前陪娃签宿舍，现在读劳动合同",
    "学费收据还在，陪娃开始比薪资",
    "陪娃办学生签，如今核对工签",
    "陪娃做答辩，如今准备案例面",
    "陪娃赶小组作业，如今讲项目贡献",
    "陪娃约教授，如今约招聘经理",
    "陪娃逛招聘会，如今写跟进信",
    "陪娃刷学生邮箱，如今等招聘官",
    "陪娃比课程排名，如今核岗位职责",
    "陪娃写社团经历，如今证明工作结果",
    "陪娃记实习，如今整理项目追问",
    "陪娃看校园开放日，如今看公司",
    "陪娃挑毕业服，如今准备面试",
    "陪娃拖行李留学，如今订面试机票",
    "陪娃列宿舍清单，如今看搬迁条件",
    "陪娃看毕业日程，如今确认入职日",
    "陪娃加校友群，如今约从业者",
    "陪娃改论文脚注，如今改简历要点",
    "陪娃整实验数据，如今做作品集",
    "陪娃申奖学金，如今准备谈薪",
    "陪娃开实习证明，如今准备背调",
    "陪娃纠结选课，如今比较岗位",
    "陪娃看模块分，如今看能力匹配",
    "陪娃请导师推荐，如今请前主管证明",
    "陪娃怕签证到期，如今看试用期",
    "陪娃核入学材料，如今核Offer",
    "陪娃选学校城市，如今选工作城市",
    "陪娃看课程师资，如今看直属经理",
    "陪娃参加毕业舞会，如今去评估中心",
    "陪娃查图书馆时间，如今查笔试",
    "陪娃印学生证，如今备入职证件",
    "陪娃开学生账户，如今核薪资账户",
    "陪娃办交通卡，如今算通勤月成本",
    "陪娃选手机套餐，如今等招聘电话",
    "陪娃看迎新手册，如今读员工手册",
    "陪娃领校园门禁，如今申请办公权限",
    "陪娃抢图书馆座，如今订面试房间",
    "陪娃参加社团招新，如今去人才日",
    "陪娃约写作中心，如今改求职邮件",
    "陪娃看考试周，如今排面试周",
    "陪娃借毕业袍，如今备面试职业装",
    "陪娃办医疗注册，如今比员工医保",
    "陪娃找合租室友，如今核搬迁城市",
    "陪娃交宿舍押金，如今核签字费",
    "陪娃看公交站点，如今算办公通勤",
    "陪娃传课程作业，如今传岗位作品集",
    "陪娃等论文反馈，如今等面试反馈",
    "陪娃听职业讲座，如今参加公司面谈",
    "陪娃做课堂展示，如今练业务汇报",
    "陪娃写学习日志，如今写求职复盘",
    "陪娃排假期旅行，如今排入职窗口",
    "陪娃领毕业证明，如今备学历认证",
    "陪娃办兼职许可，如今核工作许可",
    "陪娃找学术导师，如今看直属经理",
    "陪娃选交换项目，如今看轮岗安排",
    "陪娃申请宿舍，如今比较租房补贴",
    "陪娃办校园保险，如今读员工福利",
    "陪娃参加校友晚宴，如今约岗位访谈",
    "陪娃存课程作业，如今整理能力样本",
    "陪娃等成绩公布，如今等背调结果",
    "陪娃练学术引用，如今练数据表达",
    "陪娃申请作业延期，如今谈入职延期",
    "陪娃换专业方向，如今算转岗成本",
    "陪娃选论文题，如今选第一份岗位",
    "陪娃搬进宿舍，如今准备跨城入职",
    "陪娃约语言伙伴，如今练中文面试",
    "陪娃申请会议差旅，如今核出差强度",
    "陪娃看学校日历，如今看招聘批次",
    "陪娃进学习小组，如今找面试搭档",
    "陪娃交图书馆罚金，如今核违约金",
  ],
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
      "猎头来电时，我正在主持团队会",
      "工资刚到账，我更不敢算离职成本",
      "续签合同在桌上，我迟迟没签",
      "绩效优秀，我却不敢打开招聘网站",
      "董事会刚肯定，我反而想换方向",
      "预算被冻结，我还要安慰团队",
      "核心下属递辞呈，我开始怀疑自己",
      "客户流失后，我才看清资源属于平台",
      "孩子学费一到，我又推迟转型",
      "伴侣问下一站，我给不出答案",
      "体检报告出来，我重新计算时间",
      "连续差旅后，我不敢承认扛不住",
      "旧名片还体面，市场却没有新报价",
      "简历投出去，第一次很久没回应",
      "个人方案发出去，没人愿意付费",
      "同事晋升了，我反而不敢辞职",
      "继任名单写完，没有我的下一步",
      "组织调整邮件里，我的职责变窄",
      "汇报线一变，我的决策权没了",
      "大客户只认公司，不认我",
      "递延奖金没到账，我不敢离开",
      "竞业条款没看懂，机会却来了",
      "老板挽留时，我说不出条件",
      "团队扩张获批，我却想离场",
      "副业咨询不少，没有稳定客户",
      "创业方案写很久，仍没验证付费",
      "猎头给了职位，却说不清权限",
      "家庭现金流一算，窗口只剩几月",
      "旧团队离不开我，市场却没回音",
      "年终奖一确定，转型又推迟一年",
      "背调打到公司，Offer还没谈妥",
      "新公司催入职，交接名单没写完",
      "老板临时加薪，职责边界没变",
      "大会遇到前同事，我说不清在做啥",
      "孩子要升学，新机会却不能远程",
      "父母体检撞上关键面试",
      "老客户问新服务，我不敢单独报价",
      "合伙协议发来，退出条款还没谈",
      "长期激励要签，归属条件看不懂",
      "Offer只留三天，家人意见相反",
      "个人品牌有流量，咨询却没人付费",
      "新老板上任，我被移出核心会议",
    ],
    tug_of_war: [
      "继续升职，还是出去试价？",
      "留在平台，还是换条赛道？",
      "守住年薪，还是先做验证？",
      "转管理，还是回专业线？",
      "先做副业，还是稳住主业？",
      "等股权归属，还是抓外部窗口？",
      "等奖金到账，还是立即换赛道？",
      "签长期激励，还是保留流动性？",
      "接空降一号位，还是先做顾问？",
      "进董事会，还是继续一线经营？",
      "接亏损翻盘，还是做新增长？",
      "守核心城市，还是去下沉市场？",
      "进国企稳任期，还是去民企拼结果？",
      "继续全职高管，还是做组合顾问？",
      "服务一个雇主，还是做多客户组合？",
      "要高头衔，还是要完整利润责任？",
      "接全球职能，还是管国内全盘？",
      "自己创业，还是加入成熟创业团队？",
      "先找投资人，还是先跑现金流？",
      "接客户定制，还是做标准产品？",
      "靠个人品牌，还是建渠道合作？",
      "先招核心团队，还是先跑订单？",
      "熬完通知期，还是买断尽快走？",
      "接受异地任职，还是做远程顾问？",
      "继续管团队，还是做个人贡献者？",
      "去老行业新公司，还是进新行业？",
      "选上市前股权，还是上市公司现金？",
      "接短期扭亏，还是做长期增长？",
      "向董事会汇报，还是向创始人汇报？",
      "接区域负责人，还是留总部职能？",
      "保递延奖金，还是抓市场窗口？",
      "等竞业补偿，还是放弃补偿入职？",
      "做合伙人，还是保持职业雇员？",
      "接家族企业改造，还是去经理人公司？",
      "做大客户项目，还是规模化用户业务？",
      "先补财务能力，还是先补产品能力？",
      "继续企业服务，还是转消费业务？",
      "接完整利润责任，还是做专项变革？",
    ],
    scarce_material: [
      "离职前，我只看这张表",
      "转型时，先写这份判断单",
      "换赛道前，先做一页盘点",
      "高管求职，先补这张地图",
      "职业选择卡住时，先看清单",
      "离职通知期表，安排交接窗口",
      "竞业补偿卡，判断可去范围",
      "递延奖金时间轴，算离开代价",
      "股权归属清单，核清回购条款",
      "家庭现金跑道表，定试错月份",
      "客户集中看板，估独立收入风险",
      "利益相关方地图，确认真实支持",
      "经营结果账本，剥离平台贡献",
      "危机案例拆解卡，证明个人判断",
      "组织变革成果表，明确个人作用",
      "团队继任清单，评估离岗影响",
      "董事会授权图，核验职位实权",
      "新岗位汇报线卡，看清真实老板",
      "预算权限表，识别虚高头衔",
      "差旅负荷表，算时间身体成本",
      "异地任职家庭单，确认承受边界",
      "行业周期图，判断转型窗口",
      "监管风险题库，核验新赛道",
      "个人品牌资产表，分清可带走项",
      "背调证明人清单，提前确认口径",
      "新公司任务书，问清首年结果",
      "试用期指标卡，提前对齐目标",
      "薪酬结构表，统一固定浮动口径",
      "顾问责任边界单，防交付失控",
      "首批客户线索表，验证获客来源",
      "创业现金跑道表，设停止条件",
      "合伙退出机制卡，提前谈分手",
      "能力缺口周期表，估补课时间",
      "低成本实验单，先测方向再离职",
      "伴侣转型共识页，对齐家庭底线",
    ],
    superlative: [
      "高管跳槽最容易漏的一步",
      "转型前最不该忽略的风险",
      "离开平台最贵的一次误判",
      "职业选择最怕算错的成本",
      "高位换工作最危险的信号",
      "离职最容易算错的通知期",
      "竞业最危险的是范围误读",
      "高管离开最易漏递延奖金",
      "股权退出最易漏回购条款",
      "转型最易高估家庭现金跑道",
      "独立咨询最怕客户过度集中",
      "离开平台最易失去关键支持",
      "高管简历最易说空经营结果",
      "面试最难证明的是危机判断",
      "组织变革最易抢错个人功劳",
      "离岗最易低估团队继任风险",
      "头衔最易虚高的是授权范围",
      "新岗位最危险的是汇报线",
      "职位最易包装的是预算权限",
      "高位工作最易忽略身体成本",
      "异地任职最易牺牲家庭安排",
      "换行业最易看错周期位置",
      "新赛道最隐蔽的是监管风险",
      "个人品牌最易认错可带走资产",
      "高管背调最易失效的是证明人",
      "新公司最易含糊首年任务书",
      "试用期最危险的是经营指标",
      "薪酬包最容易混淆的浮动口径",
      "顾问合同最易失控责任边界",
      "创业最易高估首批客户来源",
      "创业现金最易漏算停止条件",
      "合伙最难开口的是退出机制",
      "转型学习最易低估补课周期",
      "方向验证最易做假的是信号",
      "家庭转型最易忽略一条底线",
    ],
    contrarian: [
      "平台越大，转型未必越稳",
      "经验越多，换赛道越要慢",
      "职位越高，越该先做验证",
      "人脉越广，离职越要算账",
      "年薪越高，越不能急着走",
      "利润责任越大，客户选择权未必更多",
      "全球头衔越高，本地影响力未必更强",
      "股权数量越多，兑现价值越要核",
      "进了董事会，未必有招聘预算权",
      "扭亏经验越强，越要补从零增长",
      "并购项目越多，越要证明整合落地",
      "跨国经历越多，越要重学本地监管",
      "资历越深，一线工具越要重新练",
      "危机处理越强，越要证明日常经营",
      "演讲越受欢迎，越要验证付费需求",
      "粉丝越多，咨询信任未必更强",
      "营收规模越大，现金转化未必更高",
      "过去越成功，新周期越要重新验证",
      "老板关系越好，职业路径未必更清",
      "内部晋升越快，外部级别未必同步",
      "任职越久，忠诚越不能替代能力",
      "奖金比例越高，总收入未必更稳",
      "客户联系人越多，合同未必属于个人",
      "团队越忠诚，越要验证新组织适配",
      "方法论越成熟，越要验证标准产品",
      "会议话语权越高，市场影响未必更强",
      "商业感觉越好，个人报价越要验证",
      "认识投资人越多，融资承诺越要核",
      "媒体曝光越多，客户转化未必发生",
      "英语越流利，全球业务越要看结果",
      "数字化头衔越新，技术理解越要核",
      "做过AI项目，不等于掌握AI能力",
      "管理课学得越多，越要看行为改变",
      "平台流量越大，个人线索未必留下",
      "大公司履历越全，创业适配越要试",
      "行业奖项越多，越要验证真实需求",
      "海外任职越久，越要证明跨文化结果",
    ],
    nostalgia: [
      "过去靠平台，如今先接猎头电话",
      "当年看头衔，现在先改简历",
      "从前怕跳槽，现在先看合同",
      "以前等升职，现在先补面试",
      "过去看资历，如今先做项目复盘",
      "以前递名片，如今问市场报价",
      "以前拿办公室钥匙，如今盘客户关系",
      "以前看团队花名册，如今写能力证据",
      "以前等年终奖，如今算家庭现金流",
      "以前拿绩效A，如今准备面试案例",
      "以前写董事会纪要，如今记市场反馈",
      "以前领行业奖杯，如今看客户续约",
      "以前看组织架构，如今核真实职责",
      "以前做扩编计划，如今准备接班交接",
      "以前写季度报告，如今写能力账本",
      "以前排出差行程，如今算新岗通勤",
      "以前看股权授予，如今核归属条件",
      "以前站年会舞台，如今试个人品牌",
      "以前让助理排日程，如今自己约客户",
      "以前做继任计划，如今安排下一站",
      "以前看行业排名，如今看能力迁移",
      "以前做并购方案，如今比较职业路",
      "以前发部门周报，如今发个人方案",
      "以前参加老板会，如今约潜在客户",
      "以前看下属绩效，如今看市场反馈",
      "以前签供应商合同，如今签顾问协议",
      "以前给团队调薪，如今比市场报价",
      "以前做人才盘点，如今盘能力资产",
      "以前审批差旅，如今算面试路程",
      "以前主持晨会，如今准备自我介绍",
      "以前给新人定目标，如今写90天计划",
      "以前看客户满意度，如今看个人复购",
      "以前核费用报销，如今算创业现金流",
      "以前定年度战略，如今验证一周假设",
      "以前参加行业峰会，如今约从业者访谈",
      "以前分团队奖金，如今拆个人收入",
      "以前做风控报告，如今设转型停止条件",
      "以前签保密协议，如今划表达边界",
      "以前给团队招人，如今找背调证明人",
      "以前选办公地点，如今选工作城市",
      "以前批采购清单，如今列能力补课单",
      "以前看市场份额，如今看个人获客率",
      "以前开经营复盘，如今复盘外部面试",
      "以前做客户分层，如今筛咨询客户",
      "以前定销售目标，如今验第一笔成交",
      "以前管供应链，如今算独立交付周期",
      "以前评合作伙伴，如今评新公司老板",
      "以前做年度述职，如今讲平台外的自己",
      "以前招管培生，如今参加反向面试",
      "以前签授权书，如今问决策边界",
      "以前批招聘名额，如今看新岗团队配置",
      "以前定部门OKR，如今写个人目标",
      "以前看员工敬业度，如今看家人支持",
      "以前谈总部资源，如今盘可带走资产",
      "以前做危机预案，如今设转型止损线",
      "以前主持客户提案，如今讲个人案例",
      "以前庆祝团队达标，如今验证个人报价",
    ],
    inventory: [
      "转型前，先查这5个信号",
      "离职前，盘点这5笔成本",
      "换赛道前，写下这5个问题",
      "高管求职前，先看这5项",
      "重新选方向，先算这5笔账",
      "先盘通知期与交接边界",
      "竞业范围和补偿，逐项核对",
      "递延奖金什么时候兑现",
      "股权归属与回购，先盘清",
      "家庭现金流能撑几个月",
      "先盘客户集中度风险",
      "关键支持者还剩哪些",
      "哪些经营结果可以带走",
      "危机处理证据，逐项盘点",
      "组织变革成果怎么证明",
      "离岗前先盘团队继任风险",
      "董事会到底授权了什么",
      "新岗位汇报线，逐层核对",
      "预算权限有多大，先盘清",
      "差旅强度与时间成本清单",
      "异地任职前先盘家庭安排",
      "身体负荷要留多少恢复期",
      "行业周期位置，先核三层",
      "监管变化会卡住哪一步",
      "公开表达前先盘保密边界",
      "个人品牌能带走哪些资产",
      "背调证明人是否还能联系",
      "新公司任务书，先核五项",
      "试用期经营指标逐项确认",
      "固定与浮动薪酬，分别算",
      "顾问合同责任边界清单",
      "首批客户线索从哪里来",
      "创业现金跑道能撑多久",
      "合伙人退出机制先写清",
      "客户关系到底归谁",
      "知识产权归属逐项核对",
    ],
  },
  overseas_student: {
    human_pain: [
      "秋招临近，孩子反而不敢投",
      "笔试结束后，我更不敢催",
      "简历改完，还是怕方向错",
      "毕业快到了，反而更焦虑",
      "网申没回音，孩子开始怀疑自己",
      "申请状态卡一周，我不敢再刷新",
      "拒信到了邮箱，我却不敢点开",
      "室友聊Offer时，我只想沉默",
      "毕业典礼临近，我还说不清去向",
      "租约快到，我却不知搬哪座城",
      "父母问回程票，我不敢定日期",
      "导师问毕业计划，我只会含糊回答",
      "校友答应内推，后来没了下文",
      "面试撞答辩，我不敢放掉任何一边",
      "签证倒计时，岗位顺序还没排",
      "职业展拿满资料，我仍不知投谁",
      "薪资期望栏改半天，我不敢提交",
      "项目数字被追问，我当场卡住",
      "背调要联系人，我翻遍通讯录",
      "家庭群问秋招，我一直不敢回",
      "航班撞面试，我不敢选一边",
      "学位证还没出，公司已催材料",
      "两版简历对不上，我越改越心虚",
      "投了很多城市，没有一座真想去",
      "收到笔试，才发现岗位不对口",
      "家里托了关系，我反而难拒绝",
      "作品集改到深夜，不知给谁看",
      "面试复盘写满，我不敢看下一场",
      "同学开始入职，我还在选方向",
      "论文截止撞秋招，我两头赶",
      "面试问为何回国，我答不出真理由",
      "保底Offer催回复，我不敢告诉家里",
      "准备很多答案，我仍怕真实追问",
      "每天刷岗位，我却越来越不敢投",
      "招聘官已读不回，我反复看消息",
      "测评今晚到期，我还没敢开始",
      "终面没结果，保底Offer却催回复",
      "凌晨面试结束，第二天还要交论文",
      "招聘官问入职日，我还没答辩",
      "网申要本地地址，我还没定城市",
      "学校邮箱快停，申请还没结束",
      "推荐人休假，背调截止却在催",
      "群面明天开始，我却找不到搭档",
      "异地终面邀请，临时机票太贵",
      "招聘会加了人，我却不知怎么跟",
      "转正口头答应，一直没书面信",
      "国内号码收不到网申验证码",
    ],
    tug_of_war: [
      "留英等工签，还是赶秋招？",
      "先补实习，还是直接投递？",
      "回国求职，还是留在当地？",
      "先收窄岗位，还是继续海投？",
      "冲提前批，还是先改简历？",
      "先接保底offer，还是等对口岗？",
      "选雇主担保，还是选成长空间？",
      "先接早Offer，还是等目标岗？",
      "留实习转正，还是重投校招？",
      "选客户前台，还是后台研究？",
      "去咨询公司，还是企业内部岗？",
      "选跨城轮换，还是固定一地？",
      "选高固定薪，还是奖金上限？",
      "选明确职责，还是宽口径培养？",
      "投毕业生岗，还是经验岗？",
      "等成绩单，还是先办入职？",
      "选频繁出差，还是固定办公？",
      "看公司使命，还是直属经理？",
      "选现金薪酬，还是长期股权？",
      "先回家休整，还是直接入职？",
      "留本专业，还是转产品岗位？",
      "去公共部门，还是初创公司？",
      "选海外本地企，还是国内外企？",
      "拿搬迁补贴，还是留熟悉城市？",
      "先签限时岗，还是等奖学金项目？",
      "走技术线，还是客户解决方案？",
      "独立做项目，还是进成熟团队？",
      "先攒本地经验，还是回国校招？",
      "先接实习转正，还是重投全职岗？",
      "选签证稳定，还是能力成长快？",
      "先上岗，还是等评估中心？",
      "选混合办公，还是每周到岗？",
      "看到手薪资，还是养老福利？",
      "选职位级别，还是实际职责？",
      "进全球团队，还是本地协作？",
      "先工作，还是走毕业旅行？",
      "看住房补贴，还是现金薪酬？",
      "选代理合同，还是公司直签？",
      "看晋升承诺，还是首年任务？",
      "选熟人团队，还是更强上级？",
      "去监管行业，还是快节奏科技？",
      "选职责更宽，还是指标更清？",
      "看工时稳定，还是学习机会？",
      "选名牌客户，还是项目所有权？",
      "选到手收入，还是签证确定性？",
      "留喜欢城市，还是去机会密集地？",
      "做数据分析，还是产品运营？",
      "做内部研究，还是面向客户？",
      "走海归项目，还是普通部门岗？",
      "进校友创业，还是独立找机会？",
      "选员工宿舍，还是更高现金？",
      "留固定部门，还是项目制派遣？",
      "追AI热岗，还是积累长期能力？",
      "看直属经理，还是正式培训？",
      "选本币薪资，还是跨境收入？",
      "选成熟业务，还是从零新项目？",
      "选本地客户，还是国际业务？",
      "选固定地点，还是多城市项目？",
    ],
    scarce_material: [
      "秋招前，先看这张时间表",
      "回国求职，先补这份地图",
      "网申卡住时，先用这张清单",
      "留学生求职，先写一页盘点",
      "毕业前，先整理这份路径表",
      "跨时区面试表，避免排期撞车",
      "签证工签矩阵，先筛可投岗位",
      "背调联系人表，提前补齐证明",
      "异地入职成本页，比较工作城市",
      "学历认证材料包，核对入职文件",
      "评估中心角色卡，准备小组任务",
      "案例面试账本，记录数据来源",
      "岗位语言样本库，验证工作语境",
      "学位证明节点表，协调答辩入职",
      "跨境税务问题单，比较两地选择",
      "试用期目标卡，入职前对齐考核",
      "福利隐性成本表，核算真实回报",
      "雇主担保证明单，筛掉无效岗位",
      "申请账号台账，避免资料串版",
      "招聘官触点页，安排跟进节奏",
      "跨境联系方式卡，保证能被联系",
      "课程能力映射表，把模块变证据",
      "研究方法迁移页，把论文变样本",
      "中英文样本库，准备双语汇报",
      "协作故事拆解卡，补人物与结果",
      "拒信原因日志，判断改岗还是表达",
      "面试反问题库，核验岗位与经理",
      "通勤租房成本表，比较工作城市",
      "薪酬条款比较尺，统一奖金口径",
      "面试撞期表，排清取舍顺序",
      "校友访谈题单，验证岗位日常",
      "行业证书门槛图，判断补证顺序",
      "岗位释放日历，跟踪企业窗口",
      "部门职责对照表，别只看公司名",
      "Offer试用期卡，提前问清目标",
      "岗位描述差异页，识别职责变化",
      "申请优先看板，先投高匹配岗",
      "面试证据索引，快速找到案例",
      "雇主担保核验页，确认公司资格",
      "岗位级别解码卡，对齐真实职责",
      "在线测评设备单，先查软硬件",
      "时区换算表，锁定面试时刻",
      "税后收入计算器，比较两地薪资",
      "Offer到期日历，安排回复追问",
      "试用期反问单，核清前三月任务",
      "搬迁住房地图，估通勤和房租",
      "通勤模拟路线，验证到岗成本",
      "姓名发音卡，避免跨语种叫错",
      "自我介绍录音库，对比岗位版本",
      "招聘官问答记录，复盘关注点",
      "拒信模式热图，看卡在哪一轮",
      "面试题覆盖矩阵，找到准备空白",
      "面试案例证据板，留数字和角色",
      "企业文化日志，不再只看口号",
      "直属经理访谈单，判断带人方式",
      "团队流动问题单，核验稳定性",
      "产品体验拆解页，准备业务面试",
      "行业术语词典，补中文业务表达",
      "业务指标速查页，讲清商业影响",
      "信息披露边界卡，防止案例泄密",
      "作品集版本树，防止材料串版",
      "简历关键词热图，核对岗位覆盖",
      "测评异常恢复卡，记录重进步骤",
      "签证材料效期盘，提前补临期文件",
      "推荐人授权话术，确认背调边界",
      "双语切换脚本，练面试转场",
      "薪资谈判证据页，支撑期望数字",
      "通知期邮件包，统一离职入职日",
      "入职文件目录，核齐跨境材料",
      "入职关系地图，安排首周沟通",
      "工作许可决策树，判断申请路径",
      "岗位真实性核验单，排查挂名招聘",
      "招聘中介授权页，确认代表公司",
    ],
    superlative: [
      "秋招最容易错过的一个窗口",
      "海投最浪费的一次努力",
      "留学生求职最怕的误判",
      "简历修改最容易漏的一步",
      "回国投递最危险的节奏错位",
      "跨时区面试最易漏掉确认",
      "工签资格最易读错证明条件",
      "背调联系人最容易失效",
      "异地入职最易低估搬迁成本",
      "认证材料最容易拖慢入职",
      "评估中心最容易抢错角色",
      "案例面试最危险的是数据空白",
      "双语岗位最易忽略表达差异",
      "答辩和入职最容易撞期",
      "跨境选择最易漏掉税务影响",
      "Offer最易忽略试用期目标",
      "福利清单最贵的是隐性成本",
      "雇主担保最易误判证明条件",
      "多系统申请最容易串错资料",
      "招聘跟进最容易失礼的间隔",
      "跨境求职最容易断联的方式",
      "课程经历最难迁移成工作证据",
      "论文项目最易说空工作价值",
      "中文汇报最易暴露业务短板",
      "协作故事最易漏利益相关方",
      "拒信复盘最容易下错结论",
      "面试反问最容易问废的一题",
      "选工作城市最易漏总成本",
      "比薪酬最容易混淆的奖金口径",
      "多场面试最易撞掉优先级",
      "校友访谈最易浪费一个问题",
      "行业准入最易漏证书门槛",
      "目标企业最易错过岗位释放日",
      "大公司求职最易看错部门职责",
      "签约前最危险的是试用期误判",
      "背调最易卡住授权确认",
      "跨国推荐最易漏掉时区",
      "在线测评最易漏浏览器要求",
      "视频面试最易翻车收音设置",
      "作品集最危险的是保密违规",
      "签证最易看错准确到期日",
      "岗位最易误读真实工作地点",
      "试用期最易漏薪资变化",
      "搬迁补贴最易漏返还条件",
      "签字费最易忽略追回条款",
      "医疗保险最易漏等待期",
      "年假最易算错重置日期",
      "加班制度最易看漏补偿方式",
      "劳动合同最危险的是签约主体",
      "跨境薪资最容易混淆的结算币种",
      "两地工作最易漏税务居民身份",
      "入职最易卡住银行账户期限",
      "海外入职最易漏无犯罪证明",
      "材料翻译最容易漏的认证日期",
      "学历核验最容易混淆的学位等级",
      "入职日期最易撞课程结束日",
      "实习转正最易误判学生身份",
      "毕业项目最危险的是保密边界",
      "跨时区网申最易算错截止时刻",
      "远程岗位最易漏工作国家限制",
      "离开实习最易漏设备归还",
      "中介岗位最危险的是授权核验",
      "岗位编码最易藏住真实级别",
      "薪资数字最易看错年月口径",
      "奖金最容易混淆的保底与目标口径",
      "管培项目最易错过统一入职窗",
      "工签办理最易误判担保时点",
      "背调最易卡住法定姓名差异",
      "成绩单最易漏姓名不一致",
    ],
    contrarian: [
      "简历改得越多，未必越有回音",
      "学校越好，越要先看匹配",
      "实习越多，岗位未必越好选",
      "投得越勤，越要先收窄方向",
      "信息越多，越不能乱投简历",
      "证书越多，越要补工作证据",
      "英语越流利，越要证明业务理解",
      "成绩越高，越要练协作故事",
      "项目越多，越要讲清个人贡献",
      "社团头衔越高，越要证明胜任",
      "认识校友越多，越要问岗位日常",
      "面试练得越多，越怕回答像背稿",
      "Offer越多，越要看直属经理",
      "起薪越高，成长未必越快",
      "公司越大，未必能做核心工作",
      "岗位名越好听，越要核实际内容",
      "会的工具越多，越要补结果证据",
      "课程选得越广，越要说清专长",
      "专业越热门，岗位未必更好投",
      "内推越多，越要核岗位匹配",
      "简历写得越满，越怕细节追问",
      "案例背得越熟，越怕现场追问",
      "留英越久，越要早看回国窗口",
      "回国越早，未必赶上正确批次",
      "可选城市越多，投递反而更分散",
      "关注行业越多，准备反而没重点",
      "方向越多，越要先验证一条",
      "名企实习，不等于做过关键任务",
      "比赛获奖，不等于讲得出业务结果",
      "技术越强，越要讲清客户价值",
      "人脉越广，越要记录有效反馈",
      "口语越好，越要练中文汇报",
      "笔试过得快，岗位未必真匹配",
      "进到终面，也不能停止其他投递",
      "愿意降薪，未必更容易跨行业",
      "选远程岗，未必更容易融入",
      "管培轮岗越多，方向未必更清",
      "跨专业优势，仍要靠项目证明",
      "作品集越漂亮，越要对准岗位任务",
      "导师推荐再强，也替代不了证据",
      "工签没问题，岗位未必就合适",
      "签约越快，越要先看试用期",
      "福利看着越多，总回报未必更高",
      "双语简历齐，最怕两版口径不一",
      "海外经历越多，越要懂本地业务",
      "量化课越扎实，越要讲商业影响",
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
      "跨时区面试，先盘冲突时段",
      "工签衔接节点，逐项核对",
      "背调联系人还能联系谁",
      "异地入职，要提前多久搬",
      "入职证件与学历材料清单",
      "评估中心先盘小组角色",
      "案例面试先盘数据证据",
      "岗位工作语言，先分场景",
      "学位证明何时出，先查清",
      "跨境税务会影响哪项选择",
      "试用期目标逐项确认",
      "福利条款与隐性成本清单",
      "雇主担保要哪些证明",
      "招聘官沟通触点逐个盘",
      "跨境电话与收件地址清单",
      "课程模块如何对应岗位",
      "论文方法能证明什么能力",
      "中英文表达样本逐项盘",
      "协作故事要补哪些角色",
      "拒信原因要记录哪些字段",
      "面试反问问题先分三类",
      "通勤与租房总成本清单",
      "底薪奖金签字费分别算",
      "年假与最早入职日核对",
      "知识产权与保密逐项查",
      "校友访谈先问哪些问题",
      "行业准入证书逐项核对",
      "目标企业何时释放岗位",
      "同公司各部门职责对照",
      "岗位级别与汇报对象清单",
      "中英文岗位名称对照表",
      "网申关键词缺口逐项查",
      "投递后多久跟进一次",
      "多场面试撞期怎么排序",
      "答辩与入职撞期先盘清",
      "家庭求职预算边界清单",
      "过渡住宿要提前多久订",
      "医疗保险如何衔接",
      "远程办公条件逐项确认",
      "作品放简历前先查保密",
      "实习转正标准逐项核对",
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

function titlesAreMethodAwareNearDuplicate(
  methodId: TitleMethodId,
  left: string,
  right: string,
) {
  if (titlesAreMethodAwareSemanticDuplicates(methodId, left, right)) return true;
  if (methodId !== "inventory" && methodId !== "scarce_material" && methodId !== "nostalgia") {
    return titlesAreNearDuplicate(left, right);
  }
  return titlesAreNearDuplicate(
    titleForMethodSemanticComparison(methodId, left),
    titleForMethodSemanticComparison(methodId, right),
  );
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
const MAX_NATIVE_MODEL_CANDIDATES_PER_METHOD = 5;
/**
 * 静态兜底池不是直接交给运营，而是用于模型审核短暂不可用时的安全恢复。
 * 多保留几条，才能避免某一条撞到历史就让整批原生法全部空掉。
 */
const MAX_NATIVE_FALLBACK_CANDIDATES_PER_METHOD = 6;
/**
 * 语义终审在12条总预算内，尽量让每个方法看三条候选。
 *
 * 只看一条时，模型其实已经生成了多个本地合格备选，却可能因首选碰到历史
 * 同题而让整个方法失败。候选仍受全批12条硬上限约束，并且逐条经过同一
 * 语义审核；方法较多时会自动降为每法两条。这是增加审核覆盖，不是放宽门禁。
 */
const MAX_NATIVE_AUDIT_CANDIDATES_PER_METHOD = 3;
/**
 * 常规审核只做首审与一次剩余候选审；仍未交付时转向不同角度的定向补题。
 * 这样避免把同一批旧候选反复送审，拖慢一次“换一批标题”。
 */
const MAX_NATIVE_AUDIT_WAVES = 2;
/**
 * 所有已有候选都被安全拒绝后，只为缺失槽位再向标题模型索取一小组新角度。
 * 这是“换一批”的内部补题，不会让已完成的槽位重写，更不会把旧题当兜底。
 */
const MAX_NATIVE_TARGETED_RECOVERY_CANDIDATES_PER_METHOD = 5;
/** 定向补题同样可以轮换尚未审核的候选，但严格限制为两轮，避免补题链拉长。 */
const MAX_NATIVE_TARGETED_RECOVERY_AUDIT_WAVES = 2;
/**
 * 一次模型请求最多处理三个标题方法。
 *
 * 默认批次最多同时包含 7 个方法，每个方法又要求 3 组“标题＋正文承诺”。
 * 把整批塞进一次请求会让主、备模型都在 18 秒内来不及返回，最终表现为
 * candidate_count=0，且任意一个超时会连带丢掉整批。小批并行后，每个
 * 响应都足够短；其中一个小批失败也不会抹掉其他小批已经生成的候选。
 */
const MAX_TITLE_METHODS_PER_MODEL_CALL = 3;

function chunkTitleMethods(
  methods: TitleMethodDefinition[],
  size = MAX_TITLE_METHODS_PER_MODEL_CALL,
): TitleMethodDefinition[][] {
  const chunks: TitleMethodDefinition[][] = [];
  for (let index = 0; index < methods.length; index += size) {
    chunks.push(methods.slice(index, index + size));
  }
  return chunks;
}

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
  // “送稀缺资料/盘点”扩展池的前五条是早期兼容模板，主要用于承接旧数据。
  // 新批次应先消费后续带明确资料对象和判断变量的候选，避免连续出现
  // “这张表/这份地图/这5项”的同壳标题。
  const prioritizedEmergency = methodId === "scarce_material"
    ? [...emergency.slice(5), ...emergency.slice(0, 5)]
    : methodId === "inventory"
      // 盘点与资料池前半段按同一业务对象成对编写；再错开五个具体对象，
      // 避免同一批出现“竞业补偿卡”+“逐项核对竞业补偿”这种跨方法换皮。
      ? [...emergency.slice(10), ...emergency.slice(0, 10)]
      : emergency;
  const parentEmergency = OVERSEAS_STUDENT_PARENT_BUYER_EMERGENCY_TITLE_VARIANTS[methodId] ?? [];
  // 亲子账号绝不能在兜底时退回泛“留学生本人”标题；否则模型波动会让
  // 选题页重新出现正确正文、错误标题的视角串线。
  const candidates = isOverseasParentBuyer
    ? [...variants, ...parentEmergency]
    // 其他空间优先使用带具体处境、判断对象或交付物的扩展候选。过去把
    // “路线图/时间表/查5项”等通用主模板放在最前，模型短时不可用时，
    // 用户连续换批就会先看到几批高度相似的标题，明明更具体的候选仍在
    // 后面却没有机会出场。
    : [...prioritizedEmergency, primary, ...variants];
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
  const profileIdentity = resolveProfileIdentity(account);
  const parentNarrative = profileIdentity === "overseas_student_parent";
  if (parentNarrative && !/(?:我家|孩子|娃|儿子|女儿|家长|爸妈|父母|陪孩子|陪娃)/u.test(title)) {
    problems.push(`${topic.method_id}:留学生家长标题必须显式体现亲子关系，不能只在正文承诺里补身份`);
  }
  if (parentNarrative && /室友|同学/u.test(title) && !/孩子|娃|儿子|女儿/u.test(title)) {
    problems.push(`${topic.method_id}:留学生家长人设不能写成留学生本人的同学/室友口吻`);
  }
  if (
    profileIdentity === "overseas_student_self"
    && /(?:我家孩子|孩子|娃|陪孩子|家长|儿子|女儿)/u.test(title)
  ) {
    problems.push(`${topic.method_id}:留学生本人账号不能写成家长或陪娃口吻`);
  }
  return problems;
}

export function bodyProfileIdentityProblem(body: string, account: GrowthAccount) {
  const identity = resolveProfileIdentity(account);
  const accountFacts = [
    account.one_liner,
    account.core_problem,
    account.persona_specific?.identity,
    account.persona_specific?.growth_arc,
  ].filter(Boolean).join(" ");
  if (!isBusinessCompatibleText(body, account.business_line ?? "executive")) {
    return "正文混入了另一条业务的人群、产品或场景";
  }
  if (
    identity === "overseas_student_self"
    && /我家孩子|陪娃|陪孩子|我儿子|我女儿|孩子的秋招/u.test(body)
  ) {
    return "留学生本人正文写成了家长口吻";
  }
  if (
    identity === "overseas_student_parent"
    && /我(?:投了|投递|面试|改简历|参加秋招|找工作|拿到面试)/u.test(body)
  ) {
    return "留学生家长正文写成了本人求职口吻";
  }
  if (
    identity === "executive_self"
    && /留学生|海外秋招|回国求职|我家孩子|陪娃|求职辅导老师/u.test(body)
  ) {
    return "中高管正文混入了留学生或家长叙事";
  }
  if (
    identity === "executive_self"
    && /裸辞|已离职|离职后|被裁|待业|离开公司/u.test(accountFacts)
    && (
      /(?:今早|今天|刚刚|刚到).{0,18}(?:到公司|在公司|上班|打开(?:工作群|公司电脑)|参加(?:周会|例会))/u.test(body)
      || /(?:今早|今天|刚刚).{0,18}(?:被移出|被踢出|没出现在).{0,12}(?:核心会议|管理层例会|工作群|项目群)/u.test(body)
    )
    && !/(?:裸辞前|离职前|被裁前|还在职时|以前在公司|当时还在公司).{0,80}(?:到公司|在公司|上班|打开(?:工作群|公司电脑)|参加(?:周会|例会)|被移出|被踢出)/u.test(body)
  ) {
    return "当前人设已经离职、裸辞或待业，正文却使用了今天仍在原公司上班的场景";
  }
  return undefined;
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
    (item.method_id === topic.method_id
      ? titlesAreMethodAwareNearDuplicate(topic.method_id, topic.title, item.title)
      : titlesAreNearDuplicate(topic.title, item.title)));
  const nearHistory = semanticHistory?.title ?? historyTitles.find((item) =>
    titlesAreMethodAwareNearDuplicate(topic.method_id, topic.title, item));
  const strongTopicKeys = nativeTitleSemanticTopicKeys(topic.method_id, topic.title);
  const semanticTopicHistory = strongTopicKeys.length
    ? historyTopics.find((item) => {
      const historicalKeys = new Set(nativeTitleSemanticTopicKeys(
        item.method_id ?? topic.method_id,
        item.title,
      ));
      return strongTopicKeys.some((key) => historicalKeys.has(key));
    })
    : undefined;
  if (sameFingerprint) problems.push(`${topic.method_id}:与历史标题“${sameFingerprint}”实质相同`);
  else if (semanticTopicHistory) {
    problems.push(`${topic.method_id}:与历史标题“${semanticTopicHistory.title}”讲的是同一具体母题`);
  } else if (nearHistory) problems.push(`${topic.method_id}:与历史标题“${nearHistory}”重复或近似`);
  const inBatch = accepted.find((item) => (
    item.method_id === topic.method_id
      ? titlesAreMethodAwareNearDuplicate(topic.method_id, topic.title, item.title)
      : titlesAreNearDuplicate(topic.title, item.title)
  ));
  const semanticTopicInBatch = strongTopicKeys.length
    ? accepted.find((item) => {
      const acceptedKeys = new Set(nativeTitleSemanticTopicKeys(item.method_id, item.title));
      return strongTopicKeys.some((key) => acceptedKeys.has(key));
    })
    : undefined;
  if (semanticTopicInBatch) {
    problems.push(`${topic.method_id}:与本批次${semanticTopicInBatch.method_id}讲的是同一具体母题`);
  } else if (inBatch) problems.push(`${topic.method_id}:与本批次${inBatch.method_id}标题重复或近似`);
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

/**
 * 失败草稿不参与语义去重，但也不能被模型原样再次交付。
 *
 * `attemptedTitles` 同时包含正式历史和失败候选；这里只检查标题指纹是否相同，
 * 不做近义或母题判断。语义历史仍由 topicCandidateDuplicateProblems 单独处理。
 */
export function attemptedTitleExactProblems(
  topic: Pick<TopicCandidate, "method_id" | "title">,
  attemptedTitles: string[],
) {
  const duplicate = attemptedTitles.find((item) =>
    titlesHaveSameHistoryFingerprint(topic.title, item)
  );
  return duplicate
    ? [`${topic.method_id}:与此前尝试标题“${duplicate}”实质相同`]
    : [];
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
  /** 已拿到完整审核协议的标题不再重复送审；协议漏字段的候选会留在下一波。 */
  auditedTitleFingerprints?: Set<string>;
  /** 仅用于让多波次返回的短 candidate id 不互相混淆。 */
  idPrefix?: string;
  /** 二审优先看已通过本地硬门禁的安全候选，避免连续只审模型近似题。 */
  preferFallback?: boolean;
}) {
  const byMethod = new Map<TitleMethodId, NativeTitleCandidateOption[]>();
  let sequence = 1;
  const audited = input.auditedTitleFingerprints ?? new Set<string>();
  const perMethodLimit = Math.max(1, Math.min(
    MAX_NATIVE_AUDIT_CANDIDATES_PER_METHOD,
    Math.floor(TITLE_NOVELTY_AUDIT_MAX_CANDIDATES / Math.max(1, input.methods.length)),
  ));
  for (const method of input.methods) {
    const options = (input.candidatesByMethod.get(method.id) ?? []).filter((option) => !audited.has(
      normalizeTitleForComparison(option.topic.title),
    ));
    // 第一波同时给模型候选和安全候选机会；此前只审首个模型题，首题被判近似后
    // 安全候选要到很晚才被看见，导致整批原子失败。
    const models = options.filter((option) => option.audit.kind === "model");
    const fallbacks = options.filter((option) => option.audit.kind === "fallback");
    // 静态兜底存在时，才为它预留一个审核名额。定向补题只含模型候选，
    // 旧写法仍硬留 fallback 位，导致专家视角每个槽位只审到第一个候选。
    const preferred = input.preferFallback ? fallbacks : models;
    const secondary = input.preferFallback ? models : fallbacks;
    const preferredLimit = Math.min(preferred.length, perMethodLimit);
    const shortlist = [
      ...preferred.slice(0, preferredLimit),
      ...secondary.slice(0, perMethodLimit - preferredLimit),
    ].map((option) => ({
        ...option,
        audit: { ...option.audit, id: `${input.idPrefix ?? "N"}${sequence++}` },
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
  return compactNativeAuditOptions({
    methods: input.methods,
    candidatesByMethod: input.candidatesByMethod,
    auditedTitleFingerprints: input.auditedTitleFingerprints,
    idPrefix: "R",
    preferFallback: true,
  });
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
 * 语义审核属于质量增强层，不能成为整批标题交付的远程单点故障。
 *
 * 只有在审核请求本身超时或不可用、没有产生任何“明确拒绝”结论时才使用
 * 这条恢复路径。候选仍必须重新通过标题质量、业务/视角、全历史近似、近
 * 五批母题素材与批内冲突等全部确定性门禁；模型明确判重的标题不会走这里。
 * 优先选择本轮模型动态生成的候选，静态安全候选只作为最后补位。
 */
export function selectLocallyVerifiedNativeTitleOptions(input: {
  methods: TitleMethodDefinition[];
  candidatesByMethod: Map<TitleMethodId, NativeTitleCandidateOption[]>;
  alreadyAccepted: TopicCandidate[];
  historyTitles: string[];
  historyTopics: TopicTitleHistoryEntry[];
  account: GrowthAccount;
  businessLine: GrowthBusinessLine;
  directionLocks?: Partial<Record<TitleMethodId, TopicCandidate>>;
}) {
  const accepted = new Map<TitleMethodId, TopicCandidate>();
  const rejectedTitles: string[] = [];
  const problems: string[] = [];
  let fallbackCount = 0;

  for (const method of input.methods) {
    const options = [...(input.candidatesByMethod.get(method.id) ?? [])].sort((left, right) => {
      if (left.audit.kind === right.audit.kind) return 0;
      return left.audit.kind === "model" ? -1 : 1;
    });
    let selected = false;
    for (const option of options) {
      const optionProblems = [
        ...titleQualityProblems(option.topic, input.account),
        ...topicCandidateDuplicateProblems(
          option.topic,
          input.historyTitles,
          input.historyTopics,
          [...input.alreadyAccepted, ...accepted.values()],
          {
            preserveDirection: Boolean(input.directionLocks?.[method.id]),
            businessLine: input.businessLine,
          },
        ),
      ];
      if (optionProblems.length) {
        rejectedTitles.push(option.topic.title);
        continue;
      }
      accepted.set(method.id, option.topic);
      if (option.audit.kind === "fallback") fallbackCount += 1;
      selected = true;
      break;
    }
    if (!selected) {
      problems.push(`${method.id}:语义审核不可用，且没有候选通过本地严格恢复门禁`);
    }
  }

  return { accepted, rejectedTitles, problems, fallbackCount };
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
  /** 当前批刚被拒绝的标题优先进入补题审核，避免“同题换词”漏过引用压缩。 */
  priorityTitles?: string[];
}) {
  const references: NativeTitleNoveltyReference[] = [];
  const seen = new Set<string>();
  const add = (title: string, kind: NativeTitleNoveltyReference["kind"]) => {
    const fingerprint = normalizeTitleForComparison(title);
    if (!fingerprint || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    references.push({ id: `H${references.length + 1}`, title, kind });
  };
  input.priorityTitles?.slice(-12).reverse().forEach((title) => add(title, "history"));
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
    ...(input.currentTitles ?? []),
  ].filter(Boolean)));
  const attemptedTitles = Array.from(new Set([
    ...(input.excludeTitles ?? []),
    ...historyTitles,
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
  let localNativeAuditRecoveryUsed = false;

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
      const attemptProblems: string[] = [];
      const rows: any[] = [];
      const methodChunks = chunkTitleMethods(pendingMethods);
      const chunkResults = await Promise.allSettled(methodChunks.map(async (chunk) => ({
        methods: chunk,
        result: await llmJSON<any>({
          system: GROWTH_SYSTEM_PROMPT,
          user: buildTopicPoolUserPrompt({
            week: Math.max(1, Math.min(4, input.week ?? 1)), persona: input.account.persona,
            targetUser: input.account.target_user, coreProblem: input.account.core_problem,
            recentSignals: input.learningBrief ? formatLearningBrief(input.learningBrief) : input.recentSignals,
            methods: chunk, generationMode,
            sources: chunk.map((method) => sources.get(method.id)).filter(Boolean) as TopicSourceSnapshot[],
            structureCards: chunk.map((method) => structureCards.get(method.id)).filter(Boolean) as BenchmarkStructureCard[],
            excludeTitles: attemptedTitles,
            priorityExcludeTitles: [
              ...[...accepted.values()].map((topic) => topic.title),
              ...rejectedTitles.slice().reverse(),
            ],
            directionLocks: chunk.flatMap((method) => {
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
          }),
          // 每个小批最多三个方法、九组“标题＋承诺”，避免长响应把 JSON
          // 截断；小批并行不会把页面等待时间按方法数线性放大。
          maxTokens: Math.min(2_700, 900 + chunk.length * 600),
          temperature: Math.min(0.82, 0.62 + attempt * 0.07),
          timeoutMs: 28_000,
          jsonRetries: 0,
          allowFallback: true,
        }),
      })));
      for (const [chunkIndex, chunkResult] of chunkResults.entries()) {
        const chunk = methodChunks[chunkIndex] ?? [];
        if (chunkResult.status === "rejected") {
          const problem = (chunkResult.reason as Error)?.message || "模型小批生成失败";
          const problemKind = /abort|timeout|超时/iu.test(problem) ? "超时" : "暂不可用";
          for (const method of chunk) {
            attemptProblems.push(`${method.id}:模型小批${problemKind}`);
          }
          console.warn("[growth] topic model chunk failed", JSON.stringify({
            attempt,
            chunk_index: chunkIndex,
            method_ids: chunk.map((method) => method.id),
            elapsed_ms: Date.now() - generationAttemptStartedAt,
            error_kind: problemKind === "超时" ? "timeout" : "unavailable",
          }));
          continue;
        }
        const result = chunkResult.value.result;
        usage = {
          ...(usage ?? {}),
          [`generation_${attempt}_${chunkIndex}`]: resultUsage(result),
        };
        if (Array.isArray(result.data?.topics)) {
          rows.push(...result.data.topics);
        }
      }
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
        const candidateRows = modelTitleCandidateRows(row);
        let acceptedTopic: TopicCandidate | undefined;
        let capturedNativeCandidate = false;
        const candidateProblems: string[] = [];
        candidateProblemsByMethod.set(method.id, candidateProblems);

        for (const [candidateIndex, candidateRow] of candidateRows.entries()) {
          const candidateTitle = asText(candidateRow.title);
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
              : [
                ...attemptedTitleExactProblems(topic, attemptedTitles),
                ...topicCandidateDuplicateProblems(
                  topic,
                  historyTitles,
                  historyTopics,
                  [...accepted.values()],
                  {
                    preserveDirection: Boolean(directionLock),
                    businessLine: input.account.business_line ?? "executive",
                  },
                ),
              ];
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
                      titlePromise: topic.title_promise,
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
        ...attemptedTitleExactProblems(topic, attemptedTitles),
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
          titlePromise: topic.title_promise,
          kind: "fallback",
        },
        topic,
      });
      fallbackCount += 1;
    }
    nativeCandidatesByMethod.set(method.id, candidates);
  }

  /**
   * 常规候选已经穷尽或语义审核短暂不可用时，系统只为尚未交付的原生槽位
   * 补一次“不同人物／场景／冲突”的候选池。它始终在生成主流程之外运行，
   * 因而不会被首轮审核异常或“零本地候选”分支跳过。
   */
  let targetedRecoveryAttempted = false;
  const runTargetedNativeRecovery = async () => {
    const targetedRecoveryMethods = nativeMethods.filter((method) => !accepted.has(method.id));
    if (!targetedRecoveryMethods.length || targetedRecoveryAttempted) return;
    targetedRecoveryAttempted = true;
    const recoveryStartedAt = Date.now();
    try {
      generationAttempts += 1;
      const hasDirectionLock = targetedRecoveryMethods.some((method) => Boolean(input.directionLocks?.[method.id]));
      const recoveryResult = await llmJSON<any>({
        system: GROWTH_SYSTEM_PROMPT,
        user: buildTopicPoolUserPrompt({
          week: Math.max(1, Math.min(4, input.week ?? 1)),
          persona: input.account.persona,
          targetUser: input.account.target_user,
          coreProblem: input.account.core_problem,
          recentSignals: `${input.learningBrief ? formatLearningBrief(input.learningBrief) : input.recentSignals || ""}\n${hasDirectionLock
            ? "本轮有单槽方向锁：锁定槽位必须保留原人物、承诺和数字，只换自然表达；其他槽位才换全新场景和冲突。"
            : "本轮是定向补题：只为下列槽位寻找此前从未出现过的具体人物、场景和冲突；不要复用已拒绝标题的母题或句式。"}`,
          methods: targetedRecoveryMethods,
          generationMode,
          sources: [],
          structureCards: [],
          excludeTitles: attemptedTitles,
          priorityExcludeTitles: [
            ...[...accepted.values()].map((topic) => topic.title),
            ...rejectedTitles.slice().reverse(),
          ],
          directionLocks: targetedRecoveryMethods.flatMap((method) => {
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
          diversityHistoryBatchLimit: 50,
          candidateCount: 5,
          context: accountContext(input.account),
        }),
        maxTokens: Math.min(3_600, 900 + targetedRecoveryMethods.length * 450),
        temperature: 0.86,
        timeoutMs: 18_000,
        jsonRetries: 0,
        allowFallback: true,
      });
      usage = { ...(usage ?? {}), native_targeted_recovery: resultUsage(recoveryResult) };
      const recoveryRows = Array.isArray(recoveryResult.data?.topics) ? recoveryResult.data.topics : [];
      const recoveryCandidatesByMethod = new Map<TitleMethodId, NativeTitleCandidateOption[]>();
      for (const method of targetedRecoveryMethods) {
        const row = recoveryRows.find((item: any) => item?.method_id === method.id);
        if (!row) {
          lastProblems.push(`${method.id}:定向补题没有返回该方法`);
          continue;
        }
        const candidateRows = modelTitleCandidateRows(row);
        const options: NativeTitleCandidateOption[] = [];
        for (const candidateRow of candidateRows) {
          const candidateTitle = asText(candidateRow.title);
          if (options.length >= MAX_NATIVE_TARGETED_RECOVERY_CANDIDATES_PER_METHOD) break;
          const rawQuality = evaluateGrowthTitleQuality(candidateTitle, {
            supportedFacts: supportedTitleFacts(input.account),
          });
          if (!rawQuality.acceptable) {
            rejectedTitles.push(candidateTitle);
            continue;
          }
          const [normalizedTopic] = normalizeTopics([candidateRow], input.account, [method], generationMode, sources);
          const directionLock = input.directionLocks?.[method.id];
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
            rejectedTitles.push(candidateTitle);
            continue;
          }
          const problems = [
            ...titleQualityProblems(topic, input.account),
            ...attemptedTitleExactProblems(topic, attemptedTitles),
            ...(rejectedTitles.some((rejectedTitle) => (
              normalizeTitleForComparison(rejectedTitle) === normalizeTitleForComparison(topic.title)
            )) ? [`${method.id}:定向补题原样重复本轮失败候选`] : []),
            ...topicCandidateDuplicateProblems(
              topic,
              // 本轮失败候选用于提示模型换表达，但不等同于正式历史。否则
              // “缺家长身份的初稿”会把随后补齐身份的正确版本也按同题挡掉。
              historyTitles,
              historyTopics,
              [...accepted.values(), ...options.map((option) => option.topic)],
              {
                preserveDirection: Boolean(directionLock),
                businessLine: input.account.business_line ?? "executive",
              },
            ),
          ];
          if (problems.length) {
            rejectedTitles.push(candidateTitle);
            continue;
          }
          options.push({
            audit: {
              id: `recovery:${method.id}:${options.length}`,
              methodId: method.id,
              title: topic.title,
              titlePromise: topic.title_promise,
              kind: "model",
            },
            topic,
          });
        }
        if (options.length) recoveryCandidatesByMethod.set(method.id, options);
        else lastProblems.push(`${method.id}:定向补题未形成新的本地合格候选`);
      }

      const recoveryAuditedTitleFingerprints = new Set<string>();
      for (let wave = 1; wave <= MAX_NATIVE_TARGETED_RECOVERY_AUDIT_WAVES; wave += 1) {
        const remainingMethods = targetedRecoveryMethods.filter((method) => (
          !accepted.has(method.id) && recoveryCandidatesByMethod.has(method.id)
        ));
        if (!remainingMethods.length) break;
        const recoveryOptionsByMethod = compactNativeAuditOptions({
          methods: remainingMethods,
          candidatesByMethod: recoveryCandidatesByMethod,
          auditedTitleFingerprints: recoveryAuditedTitleFingerprints,
          idPrefix: `G${wave}`,
        });
        const recoveryOptions = remainingMethods.flatMap((method) => recoveryOptionsByMethod.get(method.id) ?? []);
        const recoveryAuditCandidates = recoveryOptions.map((option) => option.audit);
        if (!recoveryAuditCandidates.length) break;
        const recoveryReferences = compactNativeAuditReferences({
          methods: remainingMethods,
          historyTopics,
          historyTitles,
          accepted: [...accepted.values()],
        });
        let recoveryAudit: Awaited<ReturnType<typeof auditNativeTitleBatchNovelty>>;
        try {
          recoveryAudit = await auditNativeTitleBatchNovelty({
            businessLine: input.account.business_line ?? "executive",
            persona: input.account.persona,
            targetUser: input.account.target_user,
            coreProblem: input.account.core_problem,
            candidates: recoveryAuditCandidates,
            references: recoveryReferences,
          });
        } catch (recoveryAuditError) {
          const detail = (recoveryAuditError as Error).message || "unknown";
          const localRecovery = recoverMissingNativeAuditDecisions({
            methods: remainingMethods,
            optionsByMethod: recoveryOptionsByMethod,
            missingCandidateIds: recoveryAuditCandidates.map((candidate) => candidate.id),
          });
          if (localRecovery.acceptedCount) {
            nativeTitleAudit = {
              status: nativeMethods.every((method) => accepted.has(method.id))
                ? "fallback_recovery"
                : /abort|timeout|超时/iu.test(detail) ? "timeout" : "unavailable",
              candidate_count: (nativeTitleAudit?.candidate_count ?? 0) + recoveryAuditCandidates.length,
              reference_count: Math.max(nativeTitleAudit?.reference_count ?? 0, recoveryReferences.length),
              elapsed_ms: (nativeTitleAudit?.elapsed_ms ?? 0) + (Date.now() - recoveryStartedAt),
            };
          }
          for (const method of remainingMethods) {
            if (!accepted.has(method.id)) {
              lastProblems.push(`${method.id}:定向补题审核暂不可用（${detail.slice(0, 80)}）`);
            }
          }
          break;
        }
        usage = { ...(usage ?? {}), [`native_targeted_recovery_audit_${wave}`]: recoveryAudit.usage };
        for (const option of recoveryOptions) {
          if (!recoveryAudit.coverage.missingCandidateIds.includes(option.audit.id)) {
            recoveryAuditedTitleFingerprints.add(normalizeTitleForComparison(option.topic.title));
          }
        }
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
        const recoveryMissingIds = recoveryAudit.coverage.missingCandidateIds;
        if (recoveryMissingIds.length) {
          // runTargetedNativeRecovery 在本函数初始化完成后才执行，因此可以
          // 复用统一的“只恢复漏回 decision”规则。
          recoverMissingNativeAuditDecisions({
            methods: remainingMethods,
            optionsByMethod: recoveryOptionsByMethod,
            missingCandidateIds: recoveryMissingIds,
          });
        }
        nativeTitleAudit = {
          status: nativeMethods.every((method) => accepted.has(method.id))
            ? recoveryMissingIds.length ? "fallback_recovery" : "passed"
            : "incomplete",
          candidate_count: (nativeTitleAudit?.candidate_count ?? 0) + recoveryAuditCandidates.length,
          reference_count: Math.max(nativeTitleAudit?.reference_count ?? 0, recoveryReferences.length),
          elapsed_ms: (nativeTitleAudit?.elapsed_ms ?? 0) + (Date.now() - recoveryStartedAt),
          missing_candidate_ids: recoveryAudit.coverage.missingCandidateIds.length
            ? recoveryAudit.coverage.missingCandidateIds
            : undefined,
        };
        if (nativeMethods.every((method) => accepted.has(method.id))) break;
      }
    } catch (recoveryError) {
      const detail = (recoveryError as Error).message || "unknown";
      for (const method of targetedRecoveryMethods) {
        if (!accepted.has(method.id)) {
          lastProblems.push(`${method.id}:定向补题暂不可用（${detail.slice(0, 80)}）`);
        }
      }
    }
  };

  /**
   * 审核模型有时会返回部分 decision、漏掉其余候选。这是协议/传输不完整，
   * 不是模型明确判重。只对“漏回的候选”启用本地严格恢复；已经拿到
   * novel=false 或 natural=false 的候选仍按明确拒绝处理。
   */
  const recoverMissingNativeAuditDecisions = (inputOptions: {
    methods: TitleMethodDefinition[];
    optionsByMethod: Map<TitleMethodId, NativeTitleCandidateOption[]>;
    missingCandidateIds: string[];
  }) => {
    if (!inputOptions.missingCandidateIds.length) {
      return { acceptedCount: 0, fallbackCount: 0 };
    }
    const missingIds = new Set(inputOptions.missingCandidateIds);
    const candidatesByMethod = new Map<TitleMethodId, NativeTitleCandidateOption[]>();
    for (const method of inputOptions.methods) {
      const options = (inputOptions.optionsByMethod.get(method.id) ?? [])
        .filter((option) => missingIds.has(option.audit.id));
      if (options.length) candidatesByMethod.set(method.id, options);
    }
    const methods = inputOptions.methods.filter((method) => (
      !accepted.has(method.id) && candidatesByMethod.has(method.id)
    ));
    if (!methods.length) return { acceptedCount: 0, fallbackCount: 0 };
    const recovery = selectLocallyVerifiedNativeTitleOptions({
      methods,
      candidatesByMethod,
      alreadyAccepted: [...accepted.values()],
      historyTitles,
      historyTopics,
      account: input.account,
      businessLine: input.account.business_line ?? "executive",
      directionLocks: input.directionLocks,
    });
    for (const [methodId, topic] of recovery.accepted) accepted.set(methodId, topic);
    rejectedTitles.push(...recovery.rejectedTitles);
    lastProblems.push(...recovery.problems);
    if (recovery.accepted.size) {
      localNativeAuditRecoveryUsed = true;
      usage = {
        ...(usage ?? {}),
        novelty_audit_missing_decision_recovery: {
          accepted_count: recovery.accepted.size,
          fallback_count: recovery.fallbackCount,
        },
      };
      console.warn("[growth] recovered missing native audit decisions with deterministic gates", {
        accepted_method_ids: [...recovery.accepted.keys()],
        fallback_count: recovery.fallbackCount,
      });
    }
    return {
      acceptedCount: recovery.accepted.size,
      fallbackCount: recovery.fallbackCount,
    };
  };

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
    const auditedTitleFingerprints = new Set<string>();
    const rememberAuditedOptions = (
      options: NativeTitleCandidateOption[],
      missingCandidateIds: string[],
    ) => {
      for (const option of options) {
        if (!missingCandidateIds.includes(option.audit.id)) {
          auditedTitleFingerprints.add(normalizeTitleForComparison(option.topic.title));
        }
      }
    };
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
      rememberAuditedOptions(auditOptions, audit.coverage.missingCandidateIds);

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
      const initialMissingRecovery = recoverMissingNativeAuditDecisions({
        methods: nativeMethods,
        optionsByMethod: auditOptionsByMethod,
        missingCandidateIds: audit.coverage.missingCandidateIds,
      });
      if (nativeMethods.every((method) => accepted.has(method.id)) && initialMissingRecovery.acceptedCount) {
        nativeTitleAudit = {
          ...nativeTitleAudit,
          status: "fallback_recovery",
          missing_candidate_ids: undefined,
        };
      }

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
          rememberAuditedOptions(retryOptions, retryAudit.coverage.missingCandidateIds);
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
          const retryMissingRecovery = recoverMissingNativeAuditDecisions({
            methods: retryMethods,
            optionsByMethod: retryOptionsByMethod,
            missingCandidateIds: retryAudit.coverage.missingCandidateIds,
          });
          // 即使本轮审核漏回了未采用的备选，只要交付的每个标题都有明确通过
          // decision，仍可安全完成整批；任何漏项本身绝不被 select 放行。
          nativeTitleAudit = {
            status: nativeMethods.every((method) => accepted.has(method.id))
              ? retryMissingRecovery.acceptedCount || nativeTitleAudit?.status === "fallback_recovery"
                ? "fallback_recovery"
                : "passed"
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
      // 首审和二审都无法挑出标题时，继续只审核尚未拿到完整结论的候选。
      // 这样“某一条像历史题”不会把整个槽位提前耗尽；但每波总量仍不超过
      // 12 条、总波次不超过 4，避免把操作者困在无休止的等待里。
      for (let wave = 3; wave <= MAX_NATIVE_AUDIT_WAVES; wave += 1) {
        const remainingMethods = nativeMethods.filter((method) => !accepted.has(method.id));
        if (!remainingMethods.length) break;
        const waveOptionsByMethod = compactNativeAuditRetryOptions({
          methods: remainingMethods,
          candidatesByMethod: nativeCandidatesByMethod,
          auditedTitleFingerprints,
        });
        const waveOptions = remainingMethods.flatMap((method) => waveOptionsByMethod.get(method.id) ?? []);
        const waveCandidates = waveOptions.map((option) => option.audit);
        if (!waveCandidates.length) {
          for (const method of remainingMethods) {
            lastProblems.push(`${method.id}:所有本地合格候选均已审核，但没有形成新的可交付标题`);
          }
          break;
        }
        const waveReferences = compactNativeAuditReferences({
          methods: remainingMethods,
          historyTopics,
          historyTitles,
          accepted: [...accepted.values()],
        });
        const waveAudit = await auditNativeTitleBatchNovelty({
          businessLine: input.account.business_line ?? "executive",
          persona: input.account.persona,
          targetUser: input.account.target_user,
          coreProblem: input.account.core_problem,
          candidates: waveCandidates,
          references: waveReferences,
        });
        usage = { ...(usage ?? {}), [`novelty_audit_wave_${wave}`]: waveAudit.usage };
        rememberAuditedOptions(waveOptions, waveAudit.coverage.missingCandidateIds);
        const waveSelection = selectAuditedNativeTitleOptions({
          methods: remainingMethods,
          optionsByMethod: waveOptionsByMethod,
          decisions: waveAudit.decisions,
          alreadyAccepted: [...accepted.values()],
          historyTitles,
          historyTopics,
          businessLine: input.account.business_line ?? "executive",
          directionLocks: input.directionLocks,
        });
        for (const [methodId, topic] of waveSelection.accepted) accepted.set(methodId, topic);
        rejectedTitles.push(...waveSelection.rejectedTitles);
        lastProblems.push(...waveSelection.problems);
        const waveMissingRecovery = recoverMissingNativeAuditDecisions({
          methods: remainingMethods,
          optionsByMethod: waveOptionsByMethod,
          missingCandidateIds: waveAudit.coverage.missingCandidateIds,
        });
        nativeTitleAudit = {
          status: nativeMethods.every((method) => accepted.has(method.id))
            ? waveMissingRecovery.acceptedCount || nativeTitleAudit?.status === "fallback_recovery"
              ? "fallback_recovery"
              : "passed"
            : waveAudit.coverage.complete
              ? "passed"
              : "incomplete",
          candidate_count: (nativeTitleAudit?.candidate_count ?? auditCandidates.length) + waveCandidates.length,
          reference_count: Math.max(nativeTitleAudit?.reference_count ?? references.length, waveReferences.length),
          elapsed_ms: Date.now() - auditStartedAt,
          missing_candidate_ids: waveAudit.coverage.missingCandidateIds.length
            ? waveAudit.coverage.missingCandidateIds
          : undefined,
        };
      }
      // 已有模型候选和安全候选都被明确拒绝时，不应该把“再点一次”留给
      // 操作者。系统只为仍缺失的原生槽位定向补一组不同角度的标题，并且
      // 仍走同一套本地质量、全历史去重与语义终审；补题失败才保留旧批次。
      const targetedRecoveryMethods = nativeMethods.filter((method) => !accepted.has(method.id));
      if (targetedRecoveryAttempted && targetedRecoveryMethods.length) {
        try {
          generationAttempts += 1;
          const recoveryResult = await llmJSON<any>({
            system: GROWTH_SYSTEM_PROMPT,
            user: buildTopicPoolUserPrompt({
              week: Math.max(1, Math.min(4, input.week ?? 1)),
              persona: input.account.persona,
              targetUser: input.account.target_user,
              coreProblem: input.account.core_problem,
              recentSignals: `${input.learningBrief ? formatLearningBrief(input.learningBrief) : input.recentSignals || ""}\n本轮是定向补题：只为下列槽位寻找此前从未出现过的具体人物、场景和冲突；不要复用已拒绝标题的母题或句式。`,
              methods: targetedRecoveryMethods,
              generationMode,
              sources: [],
              structureCards: [],
              excludeTitles: attemptedTitles,
              priorityExcludeTitles: [
                ...[...accepted.values()].map((topic) => topic.title),
                ...rejectedTitles.slice().reverse(),
              ],
              directionLocks: targetedRecoveryMethods.flatMap((method) => {
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
              diversityHistoryBatchLimit: 50,
              context: accountContext(input.account),
            }),
            maxTokens: Math.min(3_600, 900 + targetedRecoveryMethods.length * 450),
            temperature: 0.86,
            timeoutMs: 18_000,
            jsonRetries: 0,
            allowFallback: true,
          });
          usage = { ...(usage ?? {}), native_targeted_recovery: resultUsage(recoveryResult) };
          const recoveryRows = Array.isArray(recoveryResult.data?.topics) ? recoveryResult.data.topics : [];
          const recoveryCandidatesByMethod = new Map<TitleMethodId, NativeTitleCandidateOption[]>();
          for (const method of targetedRecoveryMethods) {
            const row = recoveryRows.find((item: any) => item?.method_id === method.id);
            if (!row) {
              lastProblems.push(`${method.id}:定向补题没有返回该方法`);
              continue;
            }
            const candidateRows = modelTitleCandidateRows(row);
            const options: NativeTitleCandidateOption[] = [];
            for (const candidateRow of candidateRows) {
              const candidateTitle = asText(candidateRow.title);
              if (options.length >= MAX_NATIVE_TARGETED_RECOVERY_CANDIDATES_PER_METHOD) break;
              const rawQuality = evaluateGrowthTitleQuality(candidateTitle, {
                supportedFacts: supportedTitleFacts(input.account),
              });
              if (!rawQuality.acceptable) {
                rejectedTitles.push(candidateTitle);
                continue;
              }
              const [normalizedTopic] = normalizeTopics([candidateRow], input.account, [method], generationMode, sources);
              const directionLock = input.directionLocks?.[method.id];
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
              const problems = [
                ...titleQualityProblems(topic, input.account),
                ...attemptedTitleExactProblems(topic, attemptedTitles),
                ...(rejectedTitles.some((rejectedTitle) => (
                  normalizeTitleForComparison(rejectedTitle) === normalizeTitleForComparison(topic.title)
                )) ? [`${method.id}:定向补题原样重复本轮失败候选`] : []),
                ...topicCandidateDuplicateProblems(
                  topic,
                  historyTitles,
                  historyTopics,
                  [...accepted.values(), ...options.map((option) => option.topic)],
                  {
                    preserveDirection: Boolean(directionLock),
                    businessLine: input.account.business_line ?? "executive",
                  },
                ),
              ];
              if (problems.length) {
                rejectedTitles.push(candidateTitle);
                continue;
              }
              options.push({
                audit: {
                  id: `recovery:${method.id}:${options.length}`,
                  methodId: method.id,
                  title: topic.title,
                  titlePromise: topic.title_promise,
                  kind: "model",
                },
                topic,
              });
            }
            if (options.length) recoveryCandidatesByMethod.set(method.id, options);
            else lastProblems.push(`${method.id}:定向补题未形成新的本地合格候选`);
          }
          const recoveryMethods = targetedRecoveryMethods.filter((method) => recoveryCandidatesByMethod.has(method.id));
          const recoveryOptionsByMethod = compactNativeAuditOptions({
            methods: recoveryMethods,
            candidatesByMethod: recoveryCandidatesByMethod,
            idPrefix: "G",
          });
          const recoveryOptions = recoveryMethods.flatMap((method) => recoveryOptionsByMethod.get(method.id) ?? []);
          const recoveryAuditCandidates = recoveryOptions.map((option) => option.audit);
          if (recoveryAuditCandidates.length) {
            const recoveryReferences = compactNativeAuditReferences({
              methods: recoveryMethods,
              historyTopics,
              historyTitles,
              accepted: [...accepted.values()],
            });
            const recoveryAudit = await auditNativeTitleBatchNovelty({
              businessLine: input.account.business_line ?? "executive",
              persona: input.account.persona,
              targetUser: input.account.target_user,
              coreProblem: input.account.core_problem,
              candidates: recoveryAuditCandidates,
              references: recoveryReferences,
            });
            usage = { ...(usage ?? {}), native_targeted_recovery_audit: recoveryAudit.usage };
            const recoverySelection = selectAuditedNativeTitleOptions({
              methods: recoveryMethods,
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
            nativeTitleAudit = {
              status: nativeMethods.every((method) => accepted.has(method.id))
                ? "passed"
                : recoveryAudit.coverage.complete
                  ? "passed"
                  : "incomplete",
              candidate_count: (nativeTitleAudit?.candidate_count ?? auditCandidates.length) + recoveryAuditCandidates.length,
              reference_count: Math.max(nativeTitleAudit?.reference_count ?? references.length, recoveryReferences.length),
              elapsed_ms: Date.now() - auditStartedAt,
              missing_candidate_ids: recoveryAudit.coverage.missingCandidateIds.length
                ? recoveryAudit.coverage.missingCandidateIds
                : undefined,
            };
          }
        } catch (recoveryError) {
          const detail = (recoveryError as Error).message || "unknown";
          for (const method of targetedRecoveryMethods) {
            if (!accepted.has(method.id)) {
              lastProblems.push(`${method.id}:定向补题或审核暂不可用（${detail.slice(0, 80)}）`);
            }
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
          status: localNativeAuditRecoveryUsed || nativeTitleAudit?.status === "fallback_recovery"
            ? "fallback_recovery"
            : "passed",
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
      let remainingMethods = nativeMethods.filter((method) => !accepted.has(method.id));
      // 审核请求本身没有返回任何结论时，不把已经通过全部确定性门禁的动态
      // 标题整批丢弃。这里不是放宽重复标准：候选会再次通过质量、身份、
      // 全历史近似、近五批母题素材和批内冲突检查；模型明确拒绝的候选不会
      // 进入本 catch，也就不会被这条恢复路径覆盖。
      const localRecovery = selectLocallyVerifiedNativeTitleOptions({
        methods: remainingMethods,
        candidatesByMethod: nativeCandidatesByMethod,
        alreadyAccepted: [...accepted.values()],
        historyTitles,
        historyTopics,
        account: input.account,
        businessLine: input.account.business_line ?? "executive",
        directionLocks: input.directionLocks,
      });
      for (const [methodId, topic] of localRecovery.accepted) accepted.set(methodId, topic);
      rejectedTitles.push(...localRecovery.rejectedTitles);
      lastProblems.push(...localRecovery.problems);
      remainingMethods = nativeMethods.filter((method) => !accepted.has(method.id));
      if (localRecovery.accepted.size) {
        localNativeAuditRecoveryUsed = true;
        usage = {
          ...(usage ?? {}),
          novelty_audit_local_recovery: {
            reason: auditStatus,
            accepted_count: localRecovery.accepted.size,
            fallback_count: localRecovery.fallbackCount,
          },
        };
        nativeTitleAudit = {
          status: remainingMethods.length ? auditStatus : "fallback_recovery",
          candidate_count: auditCandidates.length,
          reference_count: references.length,
          elapsed_ms: Date.now() - auditStartedAt,
        };
        console.warn("[growth] native title novelty audit unavailable; recovered with deterministic gates", {
          audit_status: auditStatus,
          accepted_method_ids: [...localRecovery.accepted.keys()],
          fallback_count: localRecovery.fallbackCount,
          remaining_method_ids: remainingMethods.map((method) => method.id),
        });
      }
      // 首轮审核不可用时，只再试一次“尚未拿到 decision 的候选”。这些候选可能
      // 是模型替代题，也可能是静态候选；任何一个仍必须拿到语义审核结果后才能
      // 进入页面，绝不允许本地兜底绕过审核。
      // 如果已经执行过二审仍然报错，则直接保留旧批，防止一次点击进入重试循环。
      const canRunAuditedFallbackRecovery = remainingMethods.length > 0
        && !/native_title_audit_retry/iu.test(message);
      if (!remainingMethods.length) {
        // 本地严格恢复已经完整交付，保留 fallback_recovery 诊断，不再把
        // 成功恢复覆盖回 timeout/unavailable。
      } else if (canRunAuditedFallbackRecovery) {
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

  // 无论首轮候选是否为空、首轮审核是否异常，只要仍有原生槽位未交付，
  // 都给系统一次受限的定向补题机会；操作者不需要再为内部恢复重复点击。
  await runTargetedNativeRecovery();

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
    native_method_problems: nativeMethods.map((method) => ({
      method_id: method.id,
      problems: lastProblems.filter((problem) => problem.startsWith(`${method.id}:`)).slice(-4),
    })),
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
    evidence_basis: account.persona_specific?.identity
      || account.persona_specific?.main_offer
      || account.persona_specific?.methodology
      || account.one_liner
      || account.trust_source
      || "当前业务与人设事实",
    target_section: "identity_evidence",
    evidence: fallbackIdentityEvidence(account.persona, businessLine),
  };
}

function fallbackFulfillmentContract(
  account: GrowthAccount,
  topic: TopicCandidate,
  spec: PromiseDeliverySpec,
): DraftFulfillmentContract {
  const promiseType = promiseTypeForTopic(topic, spec);
  const requiredCount = spec.exactSections ?? spec.minimumSections;
  const personaMinimumContent: Record<GrowthPersona, string[]> = {
    merchant: ["具体SKU或服务对象", "交付动作与依据", "适用边界和唯一转化动作"],
    expert: ["统一比较标准", "各方案适用条件", "依据、风险和选择建议"],
    buyer: ["具体现场或动作", "原有尝试与专业介入", "克制、可验证的阶段变化"],
  };
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
        : personaMinimumContent[account.persona],
    })),
  };
}

function fallbackConversionContract(
  account: GrowthAccount,
  businessLine: GrowthBusinessLine,
): DraftConversionContract {
  const overseas = businessLine === "overseas_student";
  const specific = account.persona_specific ?? {};
  const defaultRole = overseas ? "求职老师或辅导团队" : "职业决策顾问或咨询团队";
  const role = account.persona === "merchant"
    ? specific.main_offer || defaultRole
    : account.persona === "expert"
      ? specific.expertise || defaultRole
      : defaultRole;
  const attempted = specific.original_attempt
    || (overseas ? "当事人已经反复改材料或扩大投递" : "当事人已经反复搜索信息或推演方向");
  const intervention = specific.intervention_action
    || specific.sku_delivery
    || specific.comparison_criteria
    || (overseas
      ? "把目标岗位、项目证据和招聘节奏放在一起梳理"
      : "把候选方向、能力证据和失败成本拆开并安排最小验证");
  const stageResult = specific.stage_result || fallbackStageResult(account.persona, businessLine);
  return {
    problem_context: specific.struggle
      || specific.sku_problem
      || (overseas ? "岗位、材料和招聘节奏没有对齐" : "候选方向很多，但缺少现实证据和停止条件"),
    attempted_action: attempted,
    professional_role: role,
    intervention_action: intervention,
    stage_result: stageResult,
    evidence_basis: specific.sku_evidence
      || specific.comparison_sources
      || account.trust_source
      || "当前业务方法与交付流程",
    bridge_paragraph: serviceBridgeSentence(account, businessLine, {
      role,
      attempted,
      intervention,
      stageResult,
    }),
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
  const fulfillmentContract = fallbackFulfillmentContract(account, topic, spec);
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

function serviceBridgeSentence(
  account: GrowthAccount,
  businessLine: GrowthBusinessLine,
  configured?: {
    role: string;
    attempted: string;
    intervention: string;
    stageResult: string;
  },
) {
  const persona = account.persona;
  if (configured) {
    if (persona === "buyer") {
      return `我原来${configured.attempted.replace(/^当事人/u, "").replace(/^已经/u, "")}，但问题没有真正理顺。后来${configured.role}没有直接替我选答案，而是${configured.intervention}。阶段变化不是一个确定结果，而是${configured.stageResult.replace(/[。！？!?]+$/u, "")}。`;
    }
    if (persona === "expert") {
      return `面对这个问题，我先按同一组标准拆开比较，而不是直接给排名。具体会${configured.intervention}；这样读者能看清每种方案的适用条件，阶段结果是${configured.stageResult.replace(/[。！？!?]+$/u, "")}。`;
    }
    const sku = account.persona_specific?.main_offer || configured.role;
    const price = account.persona_specific?.price_band;
    const payment = account.persona_specific?.payment_method;
    const commercialTerms = [price ? `价格是${price}` : "", payment ? `付款方式是${payment}` : ""]
      .filter(Boolean)
      .join("，");
    return `这项服务对应的是${sku}。实际交付先${configured.intervention}，不是先给一个漂亮结论；阶段结果是${configured.stageResult.replace(/[。！？!?]+$/u, "")}${commercialTerms ? `，${commercialTerms}` : ""}。`;
  }
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
  candidateIndex?: number;
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

  // 短版的共享蓝图已经包含身份、标题兑现、转化因果和完整交付段落。
  // 正常路径直接用这份已校准蓝图组装并进入同一套认证门禁，省掉一次
  // 只为改写结构而发起的模型调用；只有身份或历史去重未通过时，才回退
  // 到下方模型生成与定点修复，不以提速为由降低质量标准。
  if (input.bodyVersion === "short") {
    const blueprintBody = composeBlueprintBody(input.blueprint, input.spec, undefined, {
      bodyVersion: input.bodyVersion,
      businessLine,
    });
    const identityProblem = bodyProfileIdentityProblem(blueprintBody, input.account);
    const duplicate = bodyUniquenessProblem(blueprintBody, input.historicalBodies ?? []);
    if (!identityProblem && !duplicate) {
      body = blueprintBody;
      selectedBlueprint = input.blueprint;
      selectedNormalizationActions = ["compose_short_from_certified_blueprint"];
      payload = {};
    } else {
      lastProblem = identityProblem || duplicate?.reason || lastProblem;
      lastFailureCode = identityProblem ? "identity_repair_failed" : "history_duplicate";
      attemptedBodies.unshift({ body: blueprintBody, topic_id: input.topic.id });
    }
  }

  for (let attempt = 1; !body && attempt <= 3; attempt += 1) {
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
            ? `当前只写短版：150—300字，用更少的段落直接交付结论和必要动作，不展开背景解释。这是第${attempt}次内部尝试、并行候选${input.candidateIndex ?? 1}；${input.candidateIndex === 2 ? "优先从反常结果切入，再快速交付判断。" : "优先从具体动作或冲突切入，再交付必要动作。"}必须更换开头场景、叙事顺序和表达。`
            : `当前只写长版：600—900字。在同一核心判断下补充现场、判断依据、执行细节和避坑说明；不得复用短版原句或只做同义改写。这是第${attempt}次内部尝试、并行候选${input.candidateIndex ?? 1}；${input.candidateIndex === 2 ? "优先按问题—判断—验证—避坑展开。" : "优先按现场—转折—依据—行动展开。"}必须使用不同的现场和论证顺序。`,
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
      const identityProblem = bodyProfileIdentityProblem(candidateBody, input.account);
      if (identityProblem) {
        lastProblem = identityProblem;
        lastFailureCode = "identity_repair_failed";
        attemptedBodies.unshift({ body: candidateBody, topic_id: input.topic.id });
        continue;
      }
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
  const contentUsePolicy = contentUsePolicyFor(input.account);
  if (contentUsePolicy.requiredMarker && !body.startsWith(contentUsePolicy.requiredMarker)) {
    body = `${contentUsePolicy.requiredMarker}\n\n${body}`;
  }
  const raw: ContentDraft = {
    id: id(), tenant_id: input.tenantId ?? input.account.tenant_id, account_id: input.account.id,
    run_id: input.run.id, status: "draft", business_line: GROWTH_BUSINESS_LINE_VALUES[businessLine], method_group: input.topic.method_group,
    method_id: input.topic.method_id, method_label: input.topic.method_label,
    generation_mode: input.topic.generation_mode, title_promise: input.topic.title_promise,
    source_snapshot: input.topic.source_snapshot, selected_body_version: input.bodyVersion,
    raw_body_tags: [], tagging_status: "pending", canonical_tag_ids: [], cta_type: cta, validation_checks: [],
    delivery_contract: deliveryContractFromBlueprint(selectedBlueprint), certification_status: "generating",
    generation_core_judgement: selectedBlueprint.core_judgement,
    repair_history: [], fallback_used: false,
    generation_pipeline_version: "v3_5",
    generation_diagnostics: {
      initial_missing_fields: selectedMissingFields,
      normalization_actions: selectedNormalizationActions,
      final_status: "failed",
      total_duration_ms: Date.now() - generationStartedAt,
    },
    schema_version: "method_v3_2", method_attribution_status: "confirmed",
    eligible_for_method_learning: contentUsePolicy.publishEligible,
    content_use_mode: contentUsePolicy.mode,
    publish_eligible: contentUsePolicy.publishEligible,
    publish_block_reason: contentUsePolicy.blockReason,
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
  const identityProblem = bodyProfileIdentityProblem(draft.body, input.account);
  if (identityProblem) {
    throw pipelineFailure("identity_repair_failed", identityProblem);
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
  /** 长版后台补齐时复用已认证短版的核心判断与三项合同。 */
  referenceDraft?: ContentDraft;
}) {
  const cta = ctaType(input.account.persona);
  const planned = await generateDraftBlueprint({ account: input.account, topic: input.topic, cta });
  const referenceContract = input.referenceDraft?.delivery_contract;
  const sharedBlueprint = input.referenceDraft ? {
    ...planned.blueprint,
    core_judgement: input.referenceDraft.generation_core_judgement
      || planned.blueprint.core_judgement,
    identity_contract: referenceContract?.identity_contract
      || planned.blueprint.identity_contract,
    fulfillment_contract: referenceContract?.fulfillment_contract
      || planned.blueprint.fulfillment_contract,
    conversion_contract: referenceContract?.conversion_contract
      || planned.blueprint.conversion_contract,
  } : planned.blueprint;
  const shared = {
    ...input,
    blueprint: sharedBlueprint,
    // 通用业务模板只用于生成蓝图时的字段校准，不得再作为整篇正文交付。
    fallbackBlueprint: sharedBlueprint,
    spec: planned.spec,
  };
  if (input.bodyVersion) {
    const generated = await generateSingleDraft({
      ...shared,
      bodyVersion: input.bodyVersion,
      excludeBodies: [
        ...(input.excludeBodies ?? []),
        ...(input.referenceDraft ? [input.referenceDraft.body] : []),
      ],
      currentPairBodies: input.referenceDraft ? [input.referenceDraft.body] : undefined,
    });
    return { drafts: [generated.draft], usage: generated.usage || planned.usage };
  }

  const parallelRaceEnabled = process.env.GROWTH_PARALLEL_DRAFT_RACE !== "false";
  let shortCandidates: Awaited<ReturnType<typeof generateSingleDraft>>[] = [];
  let longCandidates: Awaited<ReturnType<typeof generateSingleDraft>>[] = [];

  if (parallelRaceEnabled) {
    const hedgeDelayMs = Math.min(
      Math.max(Number(process.env.GROWTH_DRAFT_HEDGE_DELAY_MS ?? 18_000), 5_000),
      45_000,
    );
    const hedgedGenerate = async (bodyVersion: "short" | "long") => {
      const primary = generateSingleDraft({
        ...shared,
        bodyVersion,
        historicalBodies: input.historicalBodies,
        candidateIndex: 1,
      });
      // 主请求在正常速度下只消耗一次模型调用；只有超过阈值才启动备用请求。
      // Promise.any 在首个“通过完整质量门禁”的版本返回后立即继续，不再等待
      // 较慢候选拖住整页。这既保留了质量门禁，也消除了原先4请求全部等待的尾部延迟。
      let hedgeStarted = false;
      let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
      const hedged = new Promise<void>((resolve) => {
        hedgeTimer = setTimeout(() => {
          hedgeStarted = true;
          resolve();
        }, hedgeDelayMs);
      }).then(() => generateSingleDraft({
        ...shared,
        bodyVersion,
        historicalBodies: input.historicalBodies,
        candidateIndex: 2,
      }));
      try {
        return await Promise.any([primary, hedged]);
      } finally {
        // 主请求已经按时通过时，取消尚未启动的备用调用，避免为了提速而白白
        // 消耗模型额度；只有真正慢于阈值时才烧额外token换速度。
        if (!hedgeStarted && hedgeTimer) clearTimeout(hedgeTimer);
      }
    };
    const attempts = await Promise.allSettled([
      hedgedGenerate("short"),
      hedgedGenerate("long"),
    ]);
    shortCandidates = attempts[0].status === "fulfilled" ? [attempts[0].value] : [];
    longCandidates = attempts[1].status === "fulfilled" ? [attempts[1].value] : [];

    // 某一侧竞速全部失败时只补这一侧，不让已经通过认证的版本重新生成。
    if (!shortCandidates.length) {
      shortCandidates = [await generateSingleDraft({
        ...shared,
        bodyVersion: "short",
        historicalBodies: input.historicalBodies,
        candidateIndex: 3,
      })];
    }
    if (!longCandidates.length) {
      longCandidates = [await generateSingleDraft({
        ...shared,
        bodyVersion: "long",
        historicalBodies: input.historicalBodies,
        currentPairBodies: shortCandidates.map((candidate) => candidate.draft.body),
        excludeBodies: [
          ...(input.excludeBodies ?? []),
          ...shortCandidates.map((candidate) => candidate.draft.body),
        ],
        candidateIndex: 3,
      })];
    }
  } else {
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
    shortCandidates = [short];
    longCandidates = [long];
  }

  const rankedPairs = shortCandidates.flatMap((short) =>
    longCandidates.map((long) => ({
      short,
      long,
      score:
        (short.draft.validation_report?.attempts ?? 0)
        + (long.draft.validation_report?.attempts ?? 0)
        + Math.abs(Array.from(short.draft.body).length - 240) / 1000
        + Math.abs(Array.from(long.draft.body).length - 750) / 1000,
    })))
    .sort((a, b) => a.score - b.score);
  const selectedPair = rankedPairs.find(({ short, long }) =>
    draftVariantOrderIsValid(short.draft, long.draft)
    && !draftBodiesAreTooSimilar(short.draft.body, long.draft.body))
    ?? rankedPairs[0];
  if (!selectedPair) throw pipelineFailure("model_unavailable", "并行候选没有返回可用正文");

  const short = selectedPair.short;
  const long = selectedPair.long;
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
  return {
    drafts: [shortDraft, longDraft],
    usage: mergeGenerationUsage(
      planned.usage,
      ...shortCandidates.map((candidate) => candidate.usage),
      ...longCandidates.map((candidate) => candidate.usage),
    ),
  };
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
  tenantId?: string; account: GrowthAccount; draft: ContentDraft; metrics: GrowthReviewMetrics;
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
        generationMode: input.draft.generation_mode || "default", persona: input.account.persona,
        perspectiveContract: perspectivePromptContract(input.account),
        rawTags: (input.draft.raw_body_tags || []).filter((tag) => tag.active !== false),
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
      user: buildStageReviewUserPrompt({
        targetUser: input.account.target_user,
        persona: input.account.persona,
        perspectiveContract: perspectivePromptContract(input.account),
        methodAggregate: deterministic.by_method,
        tagAggregate: deterministic.by_tag,
        eligibleTotal: deterministic.eligible_total || 0,
      }),
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
