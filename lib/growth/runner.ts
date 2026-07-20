import { llmJSON } from "@/lib/llm/router";
import {
  buildAccountPlanUserPrompt,
  buildBodyTagUserPrompt,
  buildDraftUserPrompt,
  buildReviewUserPrompt,
  buildStageReviewUserPrompt,
  buildTagMergeUserPrompt,
  buildTopicPoolUserPrompt,
  GROWTH_SYSTEM_PROMPT,
  type AccountContext,
  type ReportPrices,
} from "./agents";
import { methodsForPersona, type TitleMethodDefinition } from "./methods";
import {
  buildReviewBenchmarks,
  buildWeeklyReviewResult,
  computeDerivedMetrics,
  diagnoseEntry,
  evaluateReviewSample,
  normalizeExperimentVariable,
  resolvePublishedAt,
} from "./reviewLearning";
import { formatThreeDayLearningBrief } from "./threeDayLearning";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthBusinessLine,
  GrowthBusinessPosition,
  GrowthLearningBrief,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthRun,
  MethodGenerationMode,
  RawBodyTag,
  TagMergeSuggestion,
  TitleMethodId,
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
  countPublishChars,
  enforceDraftCompliance,
  extractPromisedCount,
  normalizeTags,
  sourceIsUsable,
  validateTopicCandidate,
  withDraftValidation,
} from "./validation";

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
    if (!result.has(source.method_id) && sourceIsUsable(source)) result.set(source.method_id, source);
  }
  return result;
}

const EXECUTIVE_FALLBACK_TITLES: Record<TitleMethodId, [string, string]> = {
  traffic: ["这波热搜，中高管先别跟", "判断热点对职业选择的真实影响"],
  human_pain: ["年薪百万，为何更不敢离职", "解释高收入中高管不敢离职的三层代价"],
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
  human_pain: ["留学花百万，为何更不敢回国", "解释留学生在投入、身份和求职之间的真实压力"],
  tug_of_war: ["留当地，还是回国求职？", "真实比较留当地与回国求职两条路径"],
  scarce_material: ["留学生求职路线图公开", "正文直接交付可执行的留学生求职路线图"],
  superlative: ["留学生最危险的一次海投", "说明无定位海投最危险的条件与后果"],
  contrarian: ["学历越高，求职未必越容易", "解释高学历不能自动换来岗位匹配的条件"],
  nostalgia: ["五年前海归，如今不再稀缺", "比较过去与当下海归求职优势的变化"],
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
  nostalgia: ["当年抢着升职，如今困在高位", "以前拼职位，现在拼定价权"],
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
  nostalgia: ["当年海归吃香，现在先过AI筛", "以前拼学校，现在拼岗位证据"],
  inventory: ["海归秋招前必查的5个日期", "回国投递前先盘点这5样"],
  same_product: ["求职陪跑，第一步不是改简历", "海归求职军师先排除什么"],
  same_effect: ["回国和留英，先算哪笔账？", "两份秋招路线，哪条回音快？"],
  similar_audience: ["拿面试的海归都先收窄岗位", "秋招有回音的人都先改定位"],
  same_outcome: ["抢大厂，不如抢成长最快岗位", "拼Offer，不如拼第一段履历"],
  viral_framework: ["海归缺的不是简历，是方向", "秋招缺的不是海投，是反馈"],
};

function fallbackTitles(account: GrowthAccount) {
  return account.business_line === "overseas_student"
    ? OVERSEAS_STUDENT_FALLBACK_TITLES
    : EXECUTIVE_FALLBACK_TITLES;
}

function titleFingerprint(value: string) {
  return enforceTitleLimit(value).toLocaleLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]《》<>—\-|｜]/gu, "");
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
  return candidates.find((title) => available(title, true))
    ?? candidates.find((title) => available(title, false))
    ?? candidates[0]
    ?? "待补充标题";
}

function fallbackTitleOptions(account: GrowthAccount, methodId: TitleMethodId) {
  const [primary] = fallbackTitles(account)[methodId];
  const variants = account.business_line === "overseas_student"
    ? OVERSEAS_STUDENT_FALLBACK_TITLE_VARIANTS[methodId]
    : EXECUTIVE_FALLBACK_TITLE_VARIANTS[methodId];
  return [primary, ...variants];
}

function fallbackTopic(account: GrowthAccount, method: TitleMethodDefinition, mode: MethodGenerationMode, source?: TopicSourceSnapshot, titleOverride?: string): TopicCandidate {
  const [title, promise] = fallbackTitles(account)[method.id];
  const isOverseas = account.business_line === "overseas_student";
  const topic: TopicCandidate = {
    id: id(), method_group: method.group, method_id: method.id, method_label: method.label, generation_mode: mode,
    title: enforceTitleLimit(titleOverride || title), title_promise: promise, target_user: account.target_user, pain: account.core_problem,
    hook: title, source_snapshot: source,
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
  seenTitles: string[] = [],
  currentTitles: string[] = [],
) {
  const rows = Array.isArray(raw) ? raw : [];
  const titles = fallbackTitles(account);
  const currentKeys = new Set(currentTitles.map(titleFingerprint));
  const seenKeys = new Set(seenTitles.map(titleFingerprint));
  const reservedTitles: string[] = [];
  return methods.map((method) => {
    const row = rows.find((item) => item?.method_id === method.id);
    const proposedTitle = enforceTitleLimit(asText(row?.title) || titles[method.id][0]);
    const proposedKey = titleFingerprint(proposedTitle);
    const duplicatesCurrent = currentKeys.has(proposedKey);
    const duplicatesBatch = reservedTitles.some((item) => titleFingerprint(item) === proposedKey);
    const duplicatesHistory = seenKeys.has(proposedKey);
    const title = duplicatesCurrent || duplicatesBatch || duplicatesHistory || !row
      ? selectFreshTitle(fallbackTitleOptions(account, method.id), { currentTitles, seenTitles, reservedTitles })
      : proposedTitle;
    reservedTitles.push(title);
    if (!row) return fallbackTopic(account, method, mode, sources.get(method.id), title);
    const topic: TopicCandidate = {
      ...fallbackTopic(account, method, mode, sources.get(method.id), title),
      title,
      title_promise: asText(row.title_promise) || titles[method.id][1],
      target_user: asText(row.target_user) || account.target_user,
      pain: asText(row.pain) || account.core_problem,
      hook: asText(row.hook) || asText(row.title),
      origin_force: asText(row.origin_force), conflict_judgement: asText(row.conflict_judgement),
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

export async function generateTopicBatch(input: {
  account: GrowthAccount;
  week?: number;
  generationMode?: MethodGenerationMode;
  excludeTitles?: string[];
  currentTitles?: string[];
  recentSignals?: string;
  learningBrief?: GrowthLearningBrief;
}): Promise<{ topics: TopicCandidate[]; unavailableMethods: GrowthRun["unavailable_methods"]; usage?: Record<string, unknown> }> {
  const generationMode = input.generationMode ?? "default";
  const expected = methodsForPersona(input.account.persona, generationMode, input.account.method_overrides);
  const sources = freshestSources(input.account);
  const methods = expected.filter((method) => !method.sourceRequired || sources.has(method.id));
  const unavailableMethods = expected
    .filter((method) => method.sourceRequired && !sources.has(method.id))
    .map((method) => ({ method_id: method.id, method_label: method.label, reason: "暂无7天内母题，或热度快照/链接核验已超过24小时" }));
  if (!methods.length) return { topics: [], unavailableMethods };
  let payload: any;
  let usage: Record<string, unknown> | undefined;
  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildTopicPoolUserPrompt({
        week: Math.max(1, Math.min(4, input.week ?? 1)), persona: input.account.persona,
        targetUser: input.account.target_user, coreProblem: input.account.core_problem,
        recentSignals: input.learningBrief ? formatThreeDayLearningBrief(input.learningBrief) : input.recentSignals,
        methods, generationMode,
        sources: methods.map((method) => sources.get(method.id)).filter(Boolean) as TopicSourceSnapshot[],
        excludeTitles: input.excludeTitles, context: accountContext(input.account),
      }), maxTokens: 5000, temperature: 0.55,
    });
    payload = result.data;
    usage = resultUsage(result);
  } catch (error) {
    console.warn("[growth] topic fallback:", (error as Error).message);
  }
  return {
    topics: normalizeTopics(
      payload?.topics,
      input.account,
      methods,
      generationMode,
      sources,
      input.excludeTitles ?? [],
      input.currentTitles ?? [],
    ),
    unavailableMethods,
    usage,
  };
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
    generation_mode: input.generationMode ?? "default", topic_pool: generated.topics,
    unavailable_methods: generated.unavailableMethods, learning_trace: input.learningBrief?.trace,
    created_at: timestamp, updated_at: timestamp,
  };
  return { run, usage: generated.usage };
}

const ctaType = (persona: GrowthPersona): ContentDraft["cta_type"] =>
  persona === "buyer" ? "soft_bridge" : persona === "expert" ? "on_platform_consult" : "service_entry";

function fallbackBody(topic: TopicCandidate, long: boolean, cta: ContentDraft["cta_type"], businessLine: GrowthBusinessLine, persona: GrowthPersona) {
  const promisedCount = extractPromisedCount(topic.title);
  const count = promisedCount ? Math.max(1, Math.min(10, promisedCount)) : /清单|路线图|资料|盘点|表|步骤/.test(topic.title) ? 3 : 0;
  const items = businessLine === "overseas_student"
    ? ["把专业背景与目标岗位要求逐项对齐", "写清回国与留当地两条路径的最小验证动作", "确认签证、时间线与招聘周期", "用真实岗位反馈校准求职定位", "准备能被验证的项目与实习证据", "核对目标行业的入场门槛", "找到三位真实从业者访谈", "记录拒绝反馈而非只看成功案例", "先投递小样本验证简历版本", "到期后按证据调整路径"]
    : ["把可迁移能力与平台资源分开", "写清每条候选路径的最小验证动作", "提前设定失败成本与停止条件", "确认家庭现金流能承受的验证周期", "用真实市场反馈校准职业定价", "核对目标行业的进入门槛", "准备能被验证的成果证据", "找到第一批真实访谈对象", "记录反对证据而非只找支持", "到期后按证据作出取舍"];
  const list = count ? `\n\n${items.slice(0, count).map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "";
  const judgement = businessLine === "overseas_student"
    ? "学校、专业和留学投入，都可能让人误判自己的岗位匹配度。真正要看的，是目标岗位是否认可你的经历、技能和可验证成果。"
    : "职位、收入和平台资源，都可能让人误判自己的市场价格。真正要看的，是离开当前岗位后，哪些能力、成果和客户信任仍能被单独识别。";
  const core = `${identityOpening(persona, businessLine)}\n\n${fallbackFulfillment(topic, businessLine)}${judgement}${list}`;
  const serviceBridge = `\n\n${serviceBridgeSentence(persona, businessLine)}`;
  const detail = long ? `\n\n${fallbackVerificationDetail(businessLine)}` : "";
  const closing = cta === "soft_bridge" ? "\n\n先把这些变量写下来，再看哪条路值得迈出第一步。" : cta === "on_platform_consult" ? "\n\n如果你卡在两条具体路径之间，可在站内补充当前职位、候选方向和最担心的冲突，先做适配判断。" : "\n\n如果你的处境已经具体，可从站内服务入口提交职位、候选路径和决策冲突，先确认服务是否适配。";
  return `${core}${serviceBridge}${detail}${closing}`;
}

function fallbackFulfillment(topic: TopicCandidate, businessLine: GrowthBusinessLine) {
  if (topic.method_id === "tug_of_war") {
    return businessLine === "overseas_student"
      ? "我们后来把两条路摆在一张纸上：留当地，要看签证、岗位数量和当地经历；回国，要看招聘窗口、岗位匹配和时间成本。"
      : "我后来把两条路摆在一张纸上：留下，要看平台还有多少空间；离开，要看可迁移能力、市场报价和家庭现金流。";
  }
  const promise = topic.title_promise
    .replace(/[。！？!?]+$/u, "")
    .replace(/^(?:真实)?(?:解释|呈现|说明|展示|梳理|比较|提供|交付|盘点|列出|给出|帮助)/u, "")
    .trim();
  return `后来把信息一项项摊开，才发现真正卡住我们的，是${promise || "眼前这个选择该用什么证据判断"}。`;
}

function fallbackVerificationDetail(businessLine: GrowthBusinessLine) {
  return businessLine === "overseas_student"
    ? "后面我们也没再同时试所有方向，只挑两个最可能的岗位，各用一版简历投一小批，再根据真实回音调整。这样做慢一点，但每次没回应都能留下有用的信息。"
    : "后面我也没急着一次验证所有猜想，只选成本最低、最可能推翻自己的那一项，约定一个观察周期，再用访谈、试做或真实反馈判断。证据没出来之前，先保留选择权。";
}

function serviceBridgeSentence(persona: GrowthPersona, businessLine: GrowthBusinessLine) {
  if (businessLine === "overseas_student") {
    if (persona === "buyer") return "我们自己折腾了几轮还是没理顺，后来才找了一位求职老师一起梳理现有材料。她没有先改文案，而是先把岗位和招聘节奏对齐；至少孩子不再拿一份简历乱投，下一步该验证什么也有了顺序。";
    if (persona === "expert") return "我当时没有先改简历，而是和学生一起梳理目标岗位、项目证据和招聘节奏。直接变化不是立刻拿到 Offer，而是岗位范围收窄了，后面的投递反馈也终于能用来复盘。";
    return "我们当时先停下改简历，把岗位匹配、项目证据和招聘时间线一起梳理了一遍。第一步变化不是立刻拿到 Offer，而是目标岗位收窄了，不同简历版本也终于有了明确去向。";
  }
  if (persona === "buyer") return "我自己越想越乱，后来才请一位职业决策顾问陪我梳理能力、市场机会和失败成本。最后没有被催着辞职，反而先排除了一个看似体面的方向，也知道下一步该验证什么。";
  if (persona === "expert") return "我当时没有替来访者直接选答案，而是先把候选方向、能力证据和失败成本拆开，再安排最小验证。直接变化不是马上做决定，而是三个方向收窄到一个先验证，下一步也有了明确顺序。";
  return "我们当时没有催客户马上选方向，而是先把能力证据、市场机会和失败成本拆开，再安排最小验证。阶段结果不是一个漂亮结论，而是排除了一个高风险方向，并定下了下一步验证顺序。";
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

function removeFormulaOpening(body: string) {
  return body.replace(/^(?:作为|身为|我的判断是|我判断|先看这里|我们做.{0,16}(?:服务|咨询)时)[^。！？\n]*[。！？]\s*/u, "").trim();
}

function deterministicDraftRepair(
  draft: ContentDraft,
  persona: GrowthPersona,
  businessLine: GrowthBusinessLine,
) {
  const failed = new Set(draft.validation_checks.filter((check) => check.status !== "passed").map((check) => check.key));
  let body = draft.body.trim();
  if (failed.has("identity") || failed.has("fulfillment")) {
    body = removeFormulaOpening(body);
    const opening = identityOpening(persona, businessLine);
    if (!body.startsWith(opening)) body = `${opening}\n\n${body}`;
  }
  if (failed.has("conversion")) body = `${body}\n\n${serviceBridgeSentence(persona, businessLine)}`;
  return body;
}

async function rewriteDraftForValidation(
  draft: ContentDraft,
  account: GrowthAccount,
) {
  const persona = account.persona;
  const businessLine = account.business_line ?? "executive";
  const failedChecks = draft.validation_checks
    .filter((check) => check.status !== "passed")
    .map((check) => `${check.key}: ${check.message}`)
    .join("\n");
  const result = await llmJSON<any>({
    system: GROWTH_SYSTEM_PROMPT,
    user: `请修正下面这篇小红书正文，只输出 JSON：{"body":"修正后的完整正文"}。\n\n标题：${draft.title}\n标题承诺：${draft.title_promise}\n当前身份：${persona}\n业务：${businessLine}\n账号人设：${account.one_liner}\n账号语气：${account.tone_style}\n目标用户：${account.target_user}\n未通过项：\n${failedChecks}\n\n修正规则：\n1. 保持原账号人设和口吻，像同一个真人继续讲，不要改成标准化营销文案。\n2. 开头像真人自然开口，从动作、现场、念头或矛盾切入并回应标题。禁止以“作为××”“身为××”“我的判断是”“先看这里”“我们做××服务时”自报身份，也不要机械复述标题。\n3. 标题以“X项、X条、X步、X个方法”等作数量承诺时，正文必须用同等数量的编号内容逐项兑现；投递数、薪资、日期等背景数字不算清单承诺。\n4. 专业服务必须放在故事因果里：先有具体卡点或自己试过的动作，再写老师、机构或顾问做了什么，紧接着交代一个克制、可验证的阶段结果。不要在结尾突然加广告句。\n5. 阶段结果优先写岗位收窄、简历对齐、排除方向、明确下一步或反馈可复盘；没有真实依据不得编造 Offer、薪资、录取数量或保证成功。\n6. 保留原正文有价值的信息，不加入互动诱导或站外导流。\n\n原正文：\n${draft.body}`,
    maxTokens: draft.selected_body_version === "long" ? 3500 : 1800,
    temperature: 0.35,
  });
  return asText(result.data?.body);
}

async function passDraftValidationGate(
  initial: ContentDraft,
  input: { account: GrowthAccount; persona: GrowthPersona; businessLine: GrowthBusinessLine; topic: TopicCandidate; cta: ContentDraft["cta_type"] },
) {
  let draft = withDraftValidation(initial, input.persona, 0);
  for (let attempt = 1; attempt <= 2 && draft.validation_report?.status !== "passed"; attempt += 1) {
    let repairedBody = "";
    try {
      repairedBody = await rewriteDraftForValidation(draft, input.account);
      if (!repairedBody) throw new Error("validation_rewrite_empty");
    } catch (error) {
      console.warn("[growth] validation rewrite fallback:", (error as Error).message);
      repairedBody = deterministicDraftRepair(draft, input.persona, input.businessLine);
      if (!repairedBody) {
        repairedBody = fallbackBody(input.topic, draft.selected_body_version === "long", input.cta, input.businessLine, input.persona);
      }
    }
    const checked = enforceDraftCompliance({
      ...draft,
      body: repairedBody,
      word_count: countPublishChars(draft.title, repairedBody, draft.hashtags),
      updated_at: now(),
    }, input.topic.title);
    draft = withDraftValidation(checked, input.persona, attempt);
  }
  return draft;
}

async function generateSingleDraft(input: {
  tenantId?: string; account: GrowthAccount; run: GrowthRun; topic: TopicCandidate;
  bodyVersion: "short" | "long"; excludeBodies?: string[]; learningBrief?: GrowthLearningBrief;
}) {
  let payload: any;
  let usage: Record<string, unknown> | undefined;
  const cta = ctaType(input.account.persona);
  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildDraftUserPrompt({
        persona: input.account.persona, context: accountContext(input.account),
        targetUser: input.topic.target_user, trustSource: input.account.trust_source,
        methodId: input.topic.method_id, methodLabel: input.topic.method_label,
        generationMode: input.topic.generation_mode, title: input.topic.title,
        titlePromise: input.topic.title_promise, testVariable: input.topic.test_variable,
        expectedSignal: input.topic.expected_signal, followReason: input.topic.follow_reason,
        variantHint: input.bodyVersion === "short" ? "写150—300字短版。" : "写600—900字长版。",
        learningGuidance: input.learningBrief ? formatThreeDayLearningBrief(input.learningBrief) : undefined,
        excludeBodies: input.excludeBodies, ctaType: cta,
      }), maxTokens: input.bodyVersion === "long" ? 3500 : 1800, temperature: 0.65,
    });
    payload = result.data;
    usage = resultUsage(result);
  } catch (error) {
    console.warn("[growth] draft fallback:", (error as Error).message);
  }
  const title = enforceTitleLimit(payload?.title || input.topic.title);
  const businessLine = input.account.business_line ?? "executive";
  const body = asText(payload?.body) || fallbackBody(input.topic, input.bodyVersion === "long", cta, businessLine, input.account.persona);
  const hashtags = normalizeTags(Array.isArray(payload?.hashtags) ? payload.hashtags : businessLine === "overseas_student" ? ["#留学生求职", "#海归求职", "#职业规划"] : ["#中高管", "#职业转型", "#职业决策"]);
  const timestamp = now();
  const raw: ContentDraft = {
    id: id(), tenant_id: input.tenantId ?? input.account.tenant_id, account_id: input.account.id,
    run_id: input.run.id, status: "draft", business_line: GROWTH_BUSINESS_LINE_VALUES[businessLine], method_group: input.topic.method_group,
    method_id: input.topic.method_id, method_label: input.topic.method_label,
    generation_mode: input.topic.generation_mode, title_promise: input.topic.title_promise,
    source_snapshot: input.topic.source_snapshot, selected_body_version: input.bodyVersion,
    raw_body_tags: [], tagging_status: "pending", canonical_tag_ids: [], cta_type: cta, validation_checks: [],
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
  });
  return { draft, usage };
}

export async function generateDraftVariants(input: {
  tenantId?: string; account: GrowthAccount; run: GrowthRun; topic: TopicCandidate;
  count?: number; excludeBodies?: string[]; learningBrief?: GrowthLearningBrief;
}) {
  const short = await generateSingleDraft({ ...input, bodyVersion: "short" });
  const long = await generateSingleDraft({ ...input, bodyVersion: "long", excludeBodies: [...(input.excludeBodies ?? []), short.draft.body] });
  return { drafts: [short.draft, long.draft], usage: long.usage || short.usage };
}

export async function generateDraft(input: {
  tenantId?: string; account: GrowthAccount; run: GrowthRun;
  selectedTopicId?: string; learningBrief?: GrowthLearningBrief;
}) {
  const topic = input.run.topic_pool.find((item) => item.id === input.selectedTopicId) || input.run.topic_pool[0];
  if (!topic) throw new Error("topic_pool_empty");
  const generated = await generateSingleDraft({ ...input, topic, bodyVersion: "short" });
  const run: GrowthRun = { ...input.run, status: "ready", selected_topic: topic, draft: generated.draft, updated_at: now() };
  return { run, draft: generated.draft, usage: generated.usage };
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
