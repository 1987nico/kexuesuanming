import { llmJSON } from "@/lib/llm/router";
import {
  buildAccountPlanUserPrompt,
  buildDraftUserPrompt,
  buildReviewUserPrompt,
  buildStageReviewUserPrompt,
  buildTopicPoolUserPrompt,
  GROWTH_SYSTEM_PROMPT,
} from "./agents";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthDirection,
  GrowthLearningBrief,
  GrowthPersona,
  GrowthPlan,
  GrowthPlanWeek,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthRun,
  WeeklyReviewResult,
  TopicCandidate,
} from "./types";
import { countPublishChars, enforceDraftCompliance, normalizeTags } from "./validation";
import { PERSONA_SPECIFIC_FIELDS, DEFAULT_BUSINESS_SETTINGS } from "./types";
import type { AccountContext, ReportPrices } from "./agents";
import {
  BUYER_C_DISCLOSURE,
  buildBuyerCTopic,
  buyerCaseMaterial,
  buyerCaseMode,
  buyerCNeedsMaterial,
  prioritizeBuyerCTopics,
} from "./buyerCStrategy";
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

const DEFAULT_TENANT_ID = "mianbajun";

function accountContext(account: GrowthAccount): AccountContext {
  return {
    toneStyle: account.tone_style,
    filterWords: account.filter_words,
    avoidExpressions: account.avoid_expressions,
    contentDirections: account.content_directions,
    personaSpecific: account.persona_specific,
    notDoing: account.not_doing,
    complianceRedline: account.compliance_redline,
    privateDomain: account.private_domain,
  };
}

function formatDraftLearningBrief(brief: GrowthLearningBrief) {
  const experimentGuidance =
    brief.experiment_variable === "title_cover"
      ? "标题/封面建议已经在选题阶段执行；正文阶段必须锁定用户选中的标题。"
      : `正文复盘建议变量：${brief.experiment_variable}`;
  return [
    `周策略：${brief.weekly_strategy}`,
    `正文经验：${brief.body_guidance.join("；") || "暂无，继续积累样本"}`,
    experimentGuidance,
    `证据版本：${brief.trace.version}`,
  ].join("\n");
}

function assertBuyerCCaseMaterial(account: GrowthAccount, topic: TopicCandidate) {
  if (account.persona !== "buyer" || topic.direction !== "C") return;
  if (buyerCNeedsMaterial(account)) throw new Error("buyer_c_case_material_required");
}

function discloseFictionalCase(body: string, fictional: boolean) {
  if (!fictional) return body;
  const withoutDuplicate = body.split(BUYER_C_DISCLOSURE).join("").trimStart();
  return `${BUYER_C_DISCLOSURE}\n\n${withoutDuplicate}`;
}

// 模型有时把本应是字符串的字段返回成数组，这里统一安全转成字符串（数组用换行拼接）
function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => String(v).trim())
      .join("\n");
  }
  return "";
}

// 只保留当前视角合法的字段 key，用模型返回值填充，缺失或非法值留空
function mergePersonaSpecific(persona: GrowthPersona, raw: unknown): Record<string, string> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    PERSONA_SPECIFIC_FIELDS[persona].map((field) => {
      return [field.key, asText(source[field.key])];
    }),
  );
}

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function safeScore(value: unknown, fallback = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function fallbackWeeks(): GrowthPlanWeek[] {
  return [
    {
      week: 1,
      theme: "定位基线",
      goal: "三方向都发，先验证账号写给谁。",
      content_mix: "方向 A 2 篇，方向 B 2 篇，方向 C 1-2 篇。",
      decision_rule: "看收藏、评论质量、主页访问和关注理由，不用单篇爆款下结论。",
    },
    {
      week: 2,
      theme: "方向二测",
      goal: "保留更有反馈的方向，换标题、封面或结构二测。",
      content_mix: "表现较好的 2 个方向各 2-3 篇，剩余 1 篇机动。",
      decision_rule: "判断方向有效还是标题偶然有效。",
    },
    {
      week: 3,
      theme: "模板沉淀",
      goal: "形成系列化表达，沉淀标题、封面、正文结构。",
      content_mix: "主方向 3 篇，副方向 2 篇，故事/信任资产 1 篇。",
      decision_rule: "看读者是否理解账号会持续解决什么问题。",
    },
    {
      week: 4,
      theme: "放大决策",
      goal: "确定下一阶段主攻方向。",
      content_mix: "主方向 4 篇，副方向 1-2 篇，复盘/信任资产 1 篇。",
      decision_rule: "选出主方向、副方向、信任资产方向和暂停清单。",
    },
  ];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 小红书选题标题规则：含标点不超过 20 字。做兜底裁剪，保证入库标题一定合规。
const TITLE_MAX_CHARS = 20;

export function enforceTitleLimit(raw: string): string {
  let title = String(raw ?? "").trim();
  // 去掉用分隔符外挂的副标题（｜ | —— - · 等），只保留主标题
  title = title.split(/\s*[|｜]\s*|\s*[—-]{2,}\s*|\s+·\s+/)[0].trim();
  const chars = Array.from(title);
  if (chars.length <= TITLE_MAX_CHARS) return title;
  // 仍超长则按字符裁剪，并去掉裁剪处末尾的孤立标点
  return chars
    .slice(0, TITLE_MAX_CHARS)
    .join("")
    .replace(/[，。、；：,;:!！?？…\-—·（(【\[《]+$/u, "")
    .trim();
}

interface FallbackAccountFields {
  target_user: string;
  core_problem: string;
  account_value: string;
  one_liner: string;
  follow_reason: string;
}

const FALLBACK_ACCOUNT_VARIANTS: Record<GrowthPersona, FallbackAccountFields[]> = {
  merchant: [
    {
      target_user: "想找靠谱服务、怕被割韭菜的中小企业主",
      core_problem: "选服务商时信息不对称，不知道谁真能交付",
      account_value: "用真实交付案例和判断标准，帮客户挑对、买对",
      one_liner: "帮你把钱花在真能交付的服务上",
      follow_reason: "持续拆解怎么识别靠谱服务商与交付标准",
    },
    {
      target_user: "预算有限但想做出效果的品牌/门店负责人",
      core_problem: "投入产出算不清，怕花钱听不到响",
      account_value: "把服务拆成可验证的小步骤，先看效果再放大",
      one_liner: "先做小验证，再决定要不要加投入",
      follow_reason: "持续记录真实客户的投入产出复盘",
    },
    {
      target_user: "正在从接单转向做品牌的经营者",
      core_problem: "只会接单，做不出可复购的产品和信任",
      account_value: "把一次性服务升级成有复购的产品体系",
      one_liner: "从接单到做出会复购的产品",
      follow_reason: "持续拆解产品化和客户信任的搭建",
    },
  ],
  buyer: [
    {
      target_user: "和我一样正卡在职业十字路口的普通职场人",
      core_problem: "想换方向又不敢动，身边没人能真正聊、只能自己扛",
      account_value: "一个真人真实记录自己的困惑、求助和一点点想通的过程",
      one_liner: "34岁想换方向，边迷茫边记录",
      follow_reason: "想看一个普通人怎么从迷茫里慢慢走出来",
    },
    {
      target_user: "在纠结要不要裸辞/搞副业、又怕家里不支持的人",
      core_problem: "每天都在'再忍忍'和'干脆不干了'之间反复横跳",
      account_value: "把自己纠结、试错、踩坑的真实过程摊开来说",
      one_liner: "副业和裸辞之间反复纠结的一个普通人",
      follow_reason: "想找个同样在纠结的人一起搭伙、互相打气",
    },
    {
      target_user: "被裁或被优化后、正在重新找方向的中年职场人",
      core_problem: "离开平台才发现不知道自己还能干啥、值多少钱",
      account_value: "真实记录一个被裁的人怎么重新找回方向感",
      one_liner: "被裁之后，我在重新找方向",
      follow_reason: "想看看同样处境的人后来都怎么走出来的",
    },
  ],
  expert: [
    {
      target_user: "认可专业判断、可能来咨询的同行与客户",
      core_problem: "缺的不是信息，而是能落地的判断和方法",
      account_value: "用方法论密度和真实案例建立专业信任",
      one_liner: "把复杂问题拆成能落地的判断",
      follow_reason: "持续输出可复用的判断框架和方法",
    },
    {
      target_user: "想系统提升、不满足于碎片知识的从业者",
      core_problem: "学了很多却串不成体系，用不起来",
      account_value: "把零散经验整理成可迁移的体系和清单",
      one_liner: "帮你把碎片经验变成体系",
      follow_reason: "持续沉淀行业方法论和体系化拆解",
    },
    {
      target_user: "遇到具体难题、需要专业判断的决策者",
      core_problem: "关键决策上缺一个真正懂行的判断",
      account_value: "针对真实难题给出结构化判断和取舍",
      one_liner: "关键决策前，先听一个懂行的判断",
      follow_reason: "持续拆解真实难题的判断过程",
    },
  ],
};

export async function generateAccountAndPlan(input: {
  tenantId?: string;
  persona?: GrowthPersona;
  accountName: string;
  targetUser?: string;
  coreProblem?: string;
  trustSource?: string;
  regenerateAccountId?: string;
  createdAt?: string;
  reportPrices?: ReportPrices;
}): Promise<{ account: GrowthAccount; plan: GrowthPlan; usage?: Record<string, unknown> }> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const persona: GrowthPersona = input.persona ?? "expert";
  const reportPrices: ReportPrices = input.reportPrices ?? {
    lite: DEFAULT_BUSINESS_SETTINGS.report_lite_price,
    deep: DEFAULT_BUSINESS_SETTINGS.report_deep_price,
  };
  const fallback = pick(FALLBACK_ACCOUNT_VARIANTS[persona]);
  const timestamp = now();
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildAccountPlanUserPrompt({ ...input, persona, reportPrices }),
      maxTokens: 3000,
      temperature: 0.4,
    });
    payload = result.data;
    usage = {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    };
  } catch (error) {
    console.warn("[growth] account plan fallback:", (error as Error).message);
  }

  const accountData = payload?.account ?? {};
  const accountId = input.regenerateAccountId || id();
  const personaSpecific = mergePersonaSpecific(persona, accountData.persona_specific);
  if (persona === "buyer" && !personaSpecific.case_mode) personaSpecific.case_mode = "情景演绎";
  const defaultContentDirections =
    persona === "buyer"
      ? ["A 求助/示弱/情绪", "B 成长/顿悟/复盘", "C 留学生家长Offer现场与求职转折"]
      : ["A 目标客户痛点诊断", "B 可收藏工具/清单", "C 创始人故事/过程记录"];
  const account: GrowthAccount = {
    id: accountId,
    tenant_id: tenantId,
    persona,
    name: input.accountName,
    target_user: accountData.target_user || input.targetUser || fallback.target_user,
    core_problem: accountData.core_problem || input.coreProblem || fallback.core_problem,
    account_value: accountData.account_value || fallback.account_value,
    trust_source:
      accountData.trust_source ||
      input.trustSource ||
      "来自真实经营、客户和内容增长实践。",
    not_doing: accountData.not_doing || "不做泛职场鸡汤，不承诺收益，不追无意义爆款。",
    hypotheses:
      Array.isArray(accountData.hypotheses) && accountData.hypotheses.length
        ? accountData.hypotheses.slice(0, 5)
        : [
            "目标客户痛点诊断能吸引更准的人群。",
            "工具/清单型内容能带来收藏和主页访问。",
            "创始人过程记录能形成信任锚点。",
          ],
    one_liner: accountData.one_liner || fallback.one_liner,
    follow_reason: accountData.follow_reason || fallback.follow_reason,
    content_directions:
      Array.isArray(accountData.content_directions) && accountData.content_directions.length
        ? accountData.content_directions.slice(0, 3)
        : defaultContentDirections,
    tone_style: accountData.tone_style || "具体、克制、有判断、有下一步，不鸡汤。",
    filter_words: Array.isArray(accountData.filter_words) ? accountData.filter_words.slice(0, 8) : [],
    avoid_expressions: Array.isArray(accountData.avoid_expressions)
      ? accountData.avoid_expressions.slice(0, 8)
      : ["逆袭", "暴富", "月入X万", "包成功"],
    compliance_redline: asText(accountData.compliance_redline) || "不承诺收益、不玄学、客户匿名、不用泛焦虑换阅读。",
    private_domain: asText(accountData.private_domain),
    persona_specific: personaSpecific,
    created_at: input.createdAt || timestamp,
    updated_at: timestamp,
  };

  const plan: GrowthPlan = {
    id: id(),
    tenant_id: tenantId,
    account_id: accountId,
    title: payload?.plan?.title || "30 天起号实验计划",
    weeks: Array.isArray(payload?.plan?.weeks) ? payload.plan.weeks.slice(0, 4) : fallbackWeeks(),
    created_at: timestamp,
    updated_at: timestamp,
  };

  return { account, plan, usage };
}

export async function generateTopicPool(input: {
  tenantId?: string;
  account: GrowthAccount;
  planId?: string;
  week?: number;
  recentSignals?: string;
  learningBrief?: GrowthLearningBrief;
}): Promise<{ run: GrowthRun; usage?: Record<string, unknown> }> {
  const tenantId = input.tenantId ?? input.account.tenant_id;
  const week = Math.max(1, Math.min(4, input.week ?? 1));
  const timestamp = now();
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildTopicPoolUserPrompt({
        week,
        persona: input.account.persona,
        targetUser: input.account.target_user,
        coreProblem: input.account.core_problem,
        recentSignals: input.learningBrief ? formatLearningBrief(input.learningBrief) : input.recentSignals,
        context: accountContext(input.account),
      }),
      maxTokens: 5000,
      temperature: 0.55,
    });
    payload = result.data;
    usage = {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    };
  } catch (error) {
    console.warn("[growth] topic pool fallback:", (error as Error).message);
  }

  const normalizedTopics = normalizeTopics(payload?.topics);
  const baseTopics = normalizedTopics.length ? normalizedTopics : fallbackTopics(input.account);
  const topics = prioritizeBuyerCTopics({
    account: input.account,
    topics: baseTopics,
    topicId: id(),
  });
  const run: GrowthRun = {
    id: id(),
    tenant_id: tenantId,
    account_id: input.account.id,
    plan_id: input.planId,
    status: "draft",
    week,
    objective: payload?.objective || "本轮先验证目标客户是否认同账号判断。",
    experiment_hypothesis:
      payload?.experiment_hypothesis || "方向 A 的诊断型内容更容易带来精准评论和主页访问。",
    topic_pool: topics.length ? topics : fallbackTopics(input.account),
    learning_trace: input.learningBrief?.trace,
    created_at: timestamp,
    updated_at: timestamp,
  };
  return { run, usage };
}

export async function generateDraft(input: {
  tenantId?: string;
  account: GrowthAccount;
  run: GrowthRun;
  selectedTopicId?: string;
  learningBrief?: GrowthLearningBrief;
}): Promise<{ run: GrowthRun; draft: ContentDraft; usage?: Record<string, unknown> }> {
  const topic =
    input.run.topic_pool.find((candidate) => candidate.id === input.selectedTopicId) ||
    input.run.topic_pool.find((candidate) => candidate.priority === "S") ||
    input.run.topic_pool[0];
  if (!topic) throw new Error("topic_pool_empty");
  assertBuyerCCaseMaterial(input.account, topic);

  const timestamp = now();
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildDraftUserPrompt({
        persona: input.account.persona,
        context: accountContext(input.account),
        targetUser: topic.target_user,
        trustSource: input.account.trust_source,
        direction: topic.direction,
        contentType: topic.content_type,
        title: topic.title,
        testVariable: topic.test_variable,
        expectedSignal: topic.expected_signal,
        followReason: topic.follow_reason,
        learningGuidance: input.learningBrief ? formatLearningBrief(input.learningBrief) : undefined,
      }),
      maxTokens: 3500,
      temperature: 0.65,
    });
    payload = result.data;
    usage = {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    };
  } catch (error) {
    console.warn("[growth] draft fallback:", (error as Error).message);
  }

  const isBuyerC = input.account.persona === "buyer" && topic.direction === "C";
  const caseMode = buyerCaseMode(input.account);
  const isFictionalCase = isBuyerC && caseMode === "情景演绎";
  const caseMaterial =
    buyerCaseMaterial(input.account) ||
    "一家虚构能源公司的数据分析岗；老大已拿到Offer；老二第一次参加留学生秋招；家长在校园招聘入口等候。";
  const hashtags = normalizeTags(
    payload?.hashtags ||
      (isBuyerC
        ? ["#留学生求职", "#留学生家长", "#秋招", "#校招"]
        : ["#中高层转型", "#第二曲线", "#小红书运营"]),
  );
  const title = enforceTitleLimit(payload?.title || topic.title);
  const body = discloseFictionalCase(
    payload?.body ||
      (isBuyerC
        ? `一转眼，轮到老二参加秋招了。\n\n那天我站在招聘入口，看着他拿着材料往里走，一下想起老大当年的那一轮。\n\n这次故事里的素材是：${caseMaterial}\n\n结果现在说起来只有一句话，但我们家知道，真正难的从来不是投出一份简历，而是孩子第一次面对招聘节奏时，能不能把方向、岗位和准备顺序理清。\n\n老二这次刚开始，我没有再让他靠自己四处试。后来找专业的人带，先把适合的岗位、时间线和每一轮要准备的东西拆开。\n\n他走出会场后低头把下一场宣讲记进手机。我没催，只觉得这一回，我们终于没有在起点上慌。`
        : `如果你已经在公司里做出成绩，但离开这个位置后，客户、预算和信任还会不会跟着你走？\n\n先别急着做个人 IP，也别急着追爆款。先判断三件事：\n\n1. 你现在的价值，是岗位给的，还是市场愿意单独为你付费？\n2. 你手里有没有能被目标客户理解的具体成果？\n3. 你发出的内容，是在吸引目标客户，还是只吸引泛职场围观？\n\n这篇先验证一个变量：${topic.test_variable}。\n\n我会继续记录，一个成熟职场人怎么把经验变成市场上的资产。`),
    isFictionalCase,
  );

  const rawDraft: ContentDraft = {
    id: id(),
    tenant_id: input.tenantId ?? input.account.tenant_id,
    account_id: input.account.id,
    run_id: input.run.id,
    status: "ready",
    direction: topic.direction,
    content_type: topic.content_type,
    case_mode: isBuyerC ? caseMode : undefined,
    test_variable: topic.test_variable,
    expected_signal: topic.expected_signal,
    title,
    alternative_titles: (Array.isArray(payload?.alternative_titles)
      ? payload.alternative_titles.slice(0, 3)
      : [`${topic.title}，先看这张表`, "别急着发内容，先判断目标客户", "公司外议价权，先看 5 个信号"]
    ).map((t: string) => enforceTitleLimit(t)),
    target_user: payload?.target_user || topic.target_user,
    cover_text: payload?.cover_text || topic.hook,
    body,
    hashtags,
    comment_prompt: isBuyerC
      ? ""
      : payload?.comment_prompt || "你现在更像公司里的能人，还是市场上的资产？",
    word_count: countPublishChars(title, body, hashtags),
    follow_reason: payload?.follow_reason || topic.follow_reason,
    trust_anchor: payload?.trust_anchor || input.account.trust_source,
    review_points: Array.isArray(payload?.review_points)
      ? payload.review_points.slice(0, 5)
      : ["收藏", "评论", "主页访问", "新增关注", "评论里是否出现目标用户信号"],
    cover_suggestion:
      (isFictionalCase
        ? `${payload?.cover_suggestion || "留学生家长视角的虚构招聘入口、成年孩子背影和现场人群"}；封面标注“情景演绎 / 示意图”，不用真实企业Logo，不仿制Offer文件。`
        : payload?.cover_suggestion ||
          (isBuyerC
            ? `使用案例素材中的公开招聘现场，家长视角拍成年孩子背影；不要补造素材中没有的企业或Offer细节。`
            : "真实办公桌面，手写目标客户判断表，画面克制，有真实过程感。")),
    story_mode: asText(payload?.story_mode) || undefined,
    pictorial_rate: asText(payload?.pictorial_rate) || undefined,
    learning_trace: input.learningBrief?.trace,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const draft = enforceDraftCompliance(rawDraft, enforceTitleLimit(topic.title));

  const run: GrowthRun = {
    ...input.run,
    status: "ready",
    selected_topic: topic,
    draft,
    learning_trace: input.learningBrief?.trace,
    updated_at: timestamp,
  };

  return { run, draft, usage };
}

/**
 * 每点一次生成 N 个新选题（默认 2），排除已有标题，保证不重复。
 */
export async function generateTopicBatch(input: {
  account: GrowthAccount;
  week?: number;
  count?: number;
  excludeTitles?: string[];
  recentSignals?: string;
  learningBrief?: GrowthLearningBrief;
}): Promise<{ topics: TopicCandidate[]; usage?: Record<string, unknown> }> {
  const week = Math.max(1, Math.min(4, input.week ?? 1));
  const count = input.count ?? 2;
  const excludeTitles = input.excludeTitles ?? [];
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildTopicPoolUserPrompt({
        week,
        persona: input.account.persona,
        targetUser: input.account.target_user,
        coreProblem: input.account.core_problem,
        recentSignals: input.learningBrief ? formatLearningBrief(input.learningBrief) : input.recentSignals,
        count,
        excludeTitles,
        context: accountContext(input.account),
      }),
      maxTokens: 2000,
      temperature: 0.75,
    });
    payload = result.data;
    usage = {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    };
  } catch (error) {
    console.warn("[growth] topic batch fallback:", (error as Error).message);
  }

  const excludeSet = new Set(excludeTitles.map((title) => title.trim()));
  let topics = normalizeTopics(payload?.topics).filter((topic) => !excludeSet.has(topic.title.trim()));

  if (topics.length < count) {
    const backup = fallbackTopics(input.account).filter(
      (topic) => !excludeSet.has(topic.title.trim()) && !topics.some((t) => t.title === topic.title)
    );
    topics = [...topics, ...backup];
  }

  if (input.learningBrief) {
    topics = topics.map((topic) => ({
      ...topic,
      weekly_action: input.learningBrief?.trace.direction_action,
      evidence: [topic.evidence, input.learningBrief?.trace.basis.join("；")].filter(Boolean).join("；"),
      learning_trace: input.learningBrief?.trace,
    }));
  }

  topics = prioritizeBuyerCTopics({
    account: input.account,
    topics,
    topicId: id(),
    limit: count,
  });

  return { topics: topics.slice(0, count), usage };
}

/**
 * 先选题后生成正文：为指定选题生成 N 篇（默认 2）不重复正文，供 N 选 1。
 */
export async function generateDraftVariants(input: {
  tenantId?: string;
  account: GrowthAccount;
  run: GrowthRun;
  topic: TopicCandidate;
  count?: number;
  excludeBodies?: string[];
  learningBrief?: GrowthLearningBrief;
}): Promise<{ drafts: ContentDraft[]; usage?: Record<string, unknown> }> {
  assertBuyerCCaseMaterial(input.account, input.topic);
  const count = input.count ?? 2;
  // 用户已在选题阶段选定标题。正文阶段恢复为两个编辑候选稿，
  // 不再把同一篇正文复制后重新做标题二选一。
  const variantSpecs = [
    {
      hint: "精简版：开头用一句反常识判断或一个快速场景切入，正文聚焦 3 个最关键的信号，克制精炼。",
      lengthHint: "正文控制在 150-300 字，只保留最锋利的判断和 3 个信号，适合快速阅读。",
      lengthKind: "short" as const,
    },
    {
      hint: "深度版：开头用真实场景或过程切入，正文展开步骤、案例和判断依据，把选题讲透。",
      lengthHint: "正文写到 600-900 字（发布端合计仍需不超过 1000 字），给出可执行细节。",
      lengthKind: "long" as const,
    },
  ];
  const drafts: ContentDraft[] = [];
  const usedBodies = [...(input.excludeBodies ?? [])];
  let usage: Record<string, unknown> | undefined;
  const lockedTitle = enforceTitleLimit(input.topic.title);

  for (let i = 0; i < count; i++) {
    const spec = variantSpecs[i % variantSpecs.length];
    const single = await generateSingleDraft({
      tenantId: input.tenantId,
      account: input.account,
      run: input.run,
      topic: input.topic,
      variantHint: `${spec.hint} 标题已经由用户选定，禁止改写或替换标题。`,
      lengthHint: spec.lengthHint,
      lengthKind: spec.lengthKind,
      excludeBodies: usedBodies,
      learningBrief: input.learningBrief,
    });
    const draft = {
      ...single.draft,
      title: lockedTitle,
      alternative_titles: [lockedTitle],
      word_count: countPublishChars(lockedTitle, single.draft.body, single.draft.hashtags),
      learning_trace: input.learningBrief?.trace,
    };
    drafts.push(draft);
    usedBodies.push(draft.body);
    if (single.usage) usage = single.usage;
  }

  return { drafts, usage };
}

async function generateSingleDraft(input: {
  tenantId?: string;
  account: GrowthAccount;
  run: GrowthRun;
  topic: TopicCandidate;
  variantHint?: string;
  lengthHint?: string;
  lengthKind?: "short" | "long";
  excludeBodies?: string[];
  learningBrief?: GrowthLearningBrief;
}): Promise<{ draft: ContentDraft; usage?: Record<string, unknown> }> {
  const topic = input.topic;
  const timestamp = now();
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildDraftUserPrompt({
        persona: input.account.persona,
        targetUser: topic.target_user,
        trustSource: input.account.trust_source,
        direction: topic.direction,
        contentType: topic.content_type,
        title: topic.title,
        // 两篇是供人工选稿的正文候选，不是在正文阶段重新测试标题。
        // 对外入库时仍保留 topic.test_variable，供发布后的复盘使用。
        testVariable: "正文呈现方式（标题已锁定）",
        expectedSignal: topic.expected_signal,
        followReason: topic.follow_reason,
        variantHint: [input.variantHint, input.lengthHint].filter(Boolean).join(" "),
        learningGuidance: input.learningBrief ? formatDraftLearningBrief(input.learningBrief) : undefined,
        excludeBodies: input.excludeBodies,
        context: accountContext(input.account),
      }),
      maxTokens: input.lengthKind === "long" ? 3500 : 1800,
      temperature: 0.7,
    });
    payload = result.data;
    usage = {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    };
  } catch (error) {
    console.warn("[growth] draft variant fallback:", (error as Error).message);
  }

  const isBuyerC = input.account.persona === "buyer" && topic.direction === "C";
  const caseMode = buyerCaseMode(input.account);
  const isFictionalCase = isBuyerC && caseMode === "情景演绎";
  const hashtags = normalizeTags(
    payload?.hashtags ||
      (isBuyerC
        ? ["#留学生家长", "#留学生求职", "#留学生回国求职", "#秋招", "#求职规划"]
        : ["#中高层转型", "#第二曲线", "#小红书运营"]),
  );
  const title = enforceTitleLimit(payload?.title || topic.title);
  const shortFallback = `围绕「${topic.title}」，先验证一个变量：${topic.test_variable}。\n\n最锋利的判断：别急着做，先看你现在的价值是岗位给的，还是市场愿意单独为你付费。\n\n3 个信号：\n1. 有没有能被目标客户理解的具体成果？\n2. 你的内容在吸引目标客户，还是只吸引泛围观？\n3. 离开这个位置，客户还会不会找你？`;
  const longFallback = `围绕「${topic.title}」，本篇先验证一个变量：${topic.test_variable}。\n\n先说一个反常识判断：很多人以为自己缺的是流量，其实缺的是“市场愿意单独为你付费的理由”。\n\n一、先自查三件事\n1. 你现在的价值，是岗位给的，还是市场愿意单独为你付费？\n2. 你手里有没有能被目标客户理解的具体成果（案例、数字、可复用方法）？\n3. 你发出的内容，是在吸引目标客户，还是只吸引泛围观？\n\n二、怎么把经验变成可被购买的表达\n把你做过的判断拆成“别人可以照着用”的清单和标准，而不是只讲故事。每一篇只讲清楚一个判断，并给出下一步动作。\n\n三、下一步\n先用一篇内容测试：目标客户看完，会不会主动来问。如果会，说明方向成立；如果只有点赞没有咨询，就换角度。\n\n我会继续记录，一个成熟职场人怎么把经验变成市场上可被信任、可被定价的资产。`;
  const caseMaterial =
    buyerCaseMaterial(input.account) ||
    "一家虚构能源公司的数据分析岗；老大已拿到Offer；老二第一次参加留学生秋招；家长在校园招聘入口等候。";
  const buyerCFallback = `今天陪老二去参加校园招聘活动。看着他拿着材料走进会场，我坐在外面，忽然想起老大当年求职的样子。\n\n这次故事里的素材是：${caseMaterial}\n\n老大刚开始求职时，也以为海外学历加一份英文简历就够了。后来才发现，岗位、毕业时间、招聘单位和材料要求只要有一项没核对清楚，就可能进不了下一轮。后来找专业的人带，他才开始按岗位重新整理经历，知道每次被拒以后应该调整什么。\n\n现在轮到老二，我们没有直接照搬老大的路线。两个孩子的专业、性格和目标岗位不同，老大的经验只能参考，不能原样复制。\n\n老二走出会场时说，原来光是把单位和岗位研究清楚，就要花不少时间。我说没事，第一次本来就是来摸清规则的，回去把今天记下的问题一项项整理出来。`;
  const body = discloseFictionalCase(
    payload?.body ||
      (isBuyerC
        ? buyerCFallback
        : input.lengthKind === "long"
          ? longFallback
          : shortFallback),
    isFictionalCase,
  );

  const rawDraft: ContentDraft = {
    id: id(),
    tenant_id: input.tenantId ?? input.account.tenant_id,
    account_id: input.account.id,
    run_id: input.run.id,
    status: "draft",
    direction: topic.direction,
    content_type: topic.content_type,
    case_mode: isBuyerC ? caseMode : undefined,
    test_variable: topic.test_variable,
    expected_signal: topic.expected_signal,
    title,
    alternative_titles: (Array.isArray(payload?.alternative_titles)
      ? payload.alternative_titles.slice(0, 3)
      : [`${topic.title}，先看这张表`, "别急着发内容，先判断目标客户"]
    ).map((t: string) => enforceTitleLimit(t)),
    target_user: payload?.target_user || topic.target_user,
    cover_text: payload?.cover_text || topic.hook,
    body,
    hashtags,
    comment_prompt: isBuyerC
      ? ""
      : payload?.comment_prompt || "你现在更像公司里的能人，还是市场上的资产？",
    word_count: countPublishChars(title, body, hashtags),
    follow_reason: payload?.follow_reason || topic.follow_reason,
    trust_anchor: payload?.trust_anchor || input.account.trust_source,
    review_points: Array.isArray(payload?.review_points)
      ? payload.review_points.slice(0, 5)
      : ["收藏", "评论", "主页访问", "新增关注", "评论里是否出现目标用户信号"],
    cover_suggestion:
      (isFictionalCase
        ? `${payload?.cover_suggestion || "家长视角拍成年孩子走进虚构招聘现场"}；封面标注“情景演绎 / 示意图”，不用真实企业Logo，不仿制Offer、邮件、印章或编号。`
        : payload?.cover_suggestion ||
          (isBuyerC
            ? "使用案例素材中的公开招聘现场，家长视角拍成年孩子背影；不要补造素材中没有的企业或Offer细节。"
            : "真实办公桌面，手写目标客户判断表，画面克制。")),
    story_mode: asText(payload?.story_mode) || undefined,
    pictorial_rate: asText(payload?.pictorial_rate) || undefined,
    learning_trace: input.learningBrief?.trace,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const draft = enforceDraftCompliance(rawDraft, enforceTitleLimit(topic.title));
  return { draft, usage };
}

export async function reviewDraft(input: {
  tenantId?: string;
  draft: ContentDraft;
  metrics: GrowthReviewMetrics;
  existingReview?: GrowthReview | null;
  notes?: ContentDraft[];
  reviews?: GrowthReview[];
}): Promise<{ review: GrowthReview; usage?: Record<string, unknown> }> {
  const timestamp = now();
  const publishedAt = resolvePublishedAt(input.draft, input.metrics);
  const metrics: GrowthReviewMetrics = {
    ...input.metrics,
    published_at: publishedAt,
    snapshot_at: input.metrics.snapshot_at || timestamp,
  };
  const derived = computeDerivedMetrics(metrics);
  metrics.ctr = derived.ctr;
  const sample = evaluateReviewSample(metrics, publishedAt, new Date(timestamp));
  const benchmarks = buildReviewBenchmarks(input.draft, input.notes || [input.draft], input.reviews || []);
  const preliminaryEntry = diagnoseEntry(metrics, benchmarks);
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildReviewUserPrompt({
        title: input.draft.title,
        direction: input.draft.direction,
        contentType: input.draft.content_type,
        testVariable: input.draft.test_variable,
        metrics: { metrics, derived, sample, benchmarks, preliminary_entry: preliminaryEntry },
      }),
      maxTokens: 2000,
      temperature: 0.35,
    });
    payload = result.data;
    usage = {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    };
  } catch (error) {
    console.warn("[growth] review fallback:", (error as Error).message);
  }

  const allowedClassifications = new Set([
    "scale",
    "retest",
    "weak_entry",
    "weak_conversion",
    "wrong_audience",
    "pause",
  ]);
  const fallbackClassification =
    preliminaryEntry.performance === "strong_aligned"
      ? "scale"
      : preliminaryEntry.performance === "strong_entry_weak_delivery"
        ? "weak_conversion"
        : preliminaryEntry.performance === "weak_entry_strong_content"
          ? "weak_entry"
          : "retest";
  const classification = allowedClassifications.has(payload?.classification)
    ? payload.classification
    : fallbackClassification;
  const entryDiagnosis = diagnoseEntry(
    metrics,
    benchmarks,
    asText(payload?.title_pattern) || "待继续验证的标题结构",
    asText(payload?.primary_audience) || input.draft.target_user,
    asText(payload?.primary_keyword) || "无",
  );
  const nextVariable = asText(payload?.next_variable) || "下一篇优先只改标题/封面入口。";

  const review: GrowthReview = {
    id: input.existingReview?.id || input.draft.id,
    tenant_id: input.tenantId ?? input.draft.tenant_id,
    draft_id: input.draft.id,
    metrics,
    derived_metrics: derived,
    sample,
    entry_diagnosis: entryDiagnosis,
    classification,
    entry_judgement:
      asText(payload?.entry_judgement) ||
      (entryDiagnosis.performance === "insufficient"
        ? "可比较样本不足，先记录标题结构，不急着下结论。"
        : "已按点击率与内容兑现情况完成入口判断。"),
    body_judgement: asText(payload?.body_judgement) || "继续结合观看时长、收藏和分享判断正文是否接住标题。",
    conversion_judgement: asText(payload?.conversion_judgement) || "继续观察新增关注和有效咨询。",
    compliance_judgement: asText(payload?.compliance_judgement) || "未发现新增合规结论，仍以发布前扫描结果为准。",
    value_judgement:
      asText(payload?.value_judgement) || asText(payload?.body_judgement) || "看收藏和分享是否出现价值信号。",
    follow_judgement:
      asText(payload?.follow_judgement) || asText(payload?.conversion_judgement) || "看新增关注和有效咨询是否出现。",
    audience_judgement: payload?.audience_judgement || "需要继续观察评论里是否出现目标用户信号。",
    next_variable: nextVariable,
    manager_instruction: payload?.manager_instruction || "保留二测，不要直接放大。",
    topic_instruction: payload?.topic_instruction || "继续围绕同一目标用户补 2 个不同入口。",
    writer_instruction: payload?.writer_instruction || "强化开头筛选词和结尾关注理由。",
    experiment_variable: normalizeExperimentVariable(asText(payload?.experiment_variable) || nextVariable),
    learning_version: `single-${timestamp}`,
    created_at: input.existingReview?.created_at || timestamp,
    updated_at: timestamp,
  };

  return { review, usage };
}

/**
 * 周复盘：单篇复盘是证据层，本函数只在方向层做策略判断。
 */
export async function stageReview(input: {
  account: GrowthAccount;
  notes: ContentDraft[];
  reviews: GrowthReview[];
}): Promise<{ result: WeeklyReviewResult; usage?: Record<string, unknown> }> {
  const deterministic = buildWeeklyReviewResult(input);
  let decision: Record<string, unknown> | null = null;
  let usage: Record<string, unknown> | undefined;
  try {
    const result = await llmJSON<Record<string, unknown>>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildStageReviewUserPrompt({
        targetUser: input.account.target_user,
        directions: input.account.content_directions,
        aggregate: deterministic.by_direction,
      }),
      maxTokens: 1200,
      temperature: 0.4,
    });
    decision = result.data;
    usage = {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    };
  } catch (error) {
    console.warn("[growth] stage review fallback:", (error as Error).message);
  }

  const result: WeeklyReviewResult = {
    ...deterministic,
    decision: {
      ...deterministic.decision,
      // 方向动作由服务器证据门槛决定，模型只负责解释和提炼表达模式。
      scale_direction: deterministic.decision.scale_direction,
      pause_direction: deterministic.decision.pause_direction,
      next_focus: deterministic.decision.next_focus,
      reusable_pattern: asText(decision?.reusable_pattern) || deterministic.decision.reusable_pattern,
      summary: asText(decision?.summary) || deterministic.decision.summary,
      strategic_hypothesis:
        asText(decision?.strategic_hypothesis) || deterministic.decision.strategic_hypothesis,
      title_patterns_to_repeat:
        Array.isArray(decision?.title_patterns_to_repeat) && decision.title_patterns_to_repeat.length
          ? decision.title_patterns_to_repeat.map(String).slice(0, 6)
          : deterministic.decision.title_patterns_to_repeat,
      title_patterns_to_avoid:
        Array.isArray(decision?.title_patterns_to_avoid) && decision.title_patterns_to_avoid.length
          ? decision.title_patterns_to_avoid.map(String).slice(0, 6)
          : deterministic.decision.title_patterns_to_avoid,
      body_patterns_to_repeat:
        Array.isArray(decision?.body_patterns_to_repeat) && decision.body_patterns_to_repeat.length
          ? decision.body_patterns_to_repeat.map(String).slice(0, 6)
          : deterministic.decision.body_patterns_to_repeat,
    },
  };
  return { result, usage };
}

function normalizeTopics(topics: any): TopicCandidate[] {
  if (!Array.isArray(topics)) return [];
  return topics.slice(0, 18).map((topic, index) => ({
    id: id(),
    direction: topic.direction === "B" || topic.direction === "C" ? topic.direction : "A",
    title: enforceTitleLimit(topic.title || `候选题 ${index + 1}`),
    target_user: String(topic.target_user || "成熟职场人"),
    pain: String(topic.pain || "不知道如何把经验转成市场资产"),
    content_type:
      topic.content_type === "tool" || topic.content_type === "story"
        ? topic.content_type
        : "diagnostic",
    hook: String(topic.hook || topic.title || "先判断你的公司外议价权"),
    origin_force: String(
      topic.origin_force ||
        `标题入口「${topic.title || `候选题 ${index + 1}`}」需要靠具体物件、角色、场景或动作承接原力；若这句仍偏抽象，请重新生成。`,
    ),
    conflict_judgement: String(
      topic.conflict_judgement ||
        "本批选题未返回冲突判断，请重新生成一批；新规则要求每题必须写清反常识、反预期或强落差。",
    ),
    follow_reason: String(topic.follow_reason || "账号会持续拆解成熟职场人的第二曲线判断。"),
    test_variable: String(topic.test_variable || "标题入口是否能吸引目标用户"),
    expected_signal: String(topic.expected_signal || "出现收藏、评论或主页访问"),
    repeatable_angle: String(topic.repeatable_angle || "可延展成系列自查题"),
    broad_traffic_risk: safeScore(topic.broad_traffic_risk, 4),
    priority: ["S", "A", "B", "C"].includes(topic.priority) ? topic.priority : index < 3 ? "S" : "A",
    scores: {
      positioning: safeScore(topic.scores?.positioning),
      pain_clarity: safeScore(topic.scores?.pain_clarity),
      entry_strength: safeScore(topic.scores?.entry_strength),
      follow_reason: safeScore(topic.scores?.follow_reason),
      experiment_value: safeScore(topic.scores?.experiment_value),
      repeatability: safeScore(topic.scores?.repeatability),
    },
  }));
}

function fallbackTopics(account: GrowthAccount): TopicCandidate[] {
  const base = [
    ["A", "公司外你还有议价权吗？看5个信号", "diagnostic"],
    ["A", "年薪高的人，最怕没有市场价格", "diagnostic"],
    ["B", "中高层做内容，先写目标客户判断表", "tool"],
    ["B", "离开公司前，先盘个人资产负债表", "tool"],
    ["C", "做过合伙人，才知道谁能真正上桌", "story"],
    ["C", "从公司位置到市场位置，我先改了这件事", "story"],
  ] as const;

  const topics: TopicCandidate[] = base.map(([direction, title, contentType], index) => ({
    id: id(),
    direction,
    title: enforceTitleLimit(title),
    target_user: account.target_user,
    pain: account.core_problem,
    content_type: contentType,
    hook: title,
    origin_force: "标题包含目标受众熟悉的具体角色、场景或资产词，不只用抽象概念做入口。",
    conflict_judgement: "围绕公司内位置与市场外定价之间的落差，形成反预期冲突。",
    follow_reason: "看完知道这个账号会持续拆解成熟职场人的市场化路径。",
    test_variable: index < 2 ? "目标客户表达" : index < 4 ? "工具收藏价值" : "信任锚点",
    expected_signal: "收藏、评论、主页访问或新增关注中至少出现一个正向信号。",
    repeatable_angle: "可延展为同方向系列内容。",
    broad_traffic_risk: 4,
    priority: index < 3 ? "S" : "A",
    scores: {
      positioning: 8,
      pain_clarity: 8,
      entry_strength: 8,
      follow_reason: 8,
      experiment_value: 8,
      repeatability: 8,
    },
  }));
  if (account.persona !== "buyer") return topics;
  const buyerC = buildBuyerCTopic(account, id());
  return [
    ...topics.filter((topic) => topic.direction !== "C"),
    buyerC,
    {
      ...buyerC,
      id: id(),
      title: "老大拿Offer后，我没让老二照搬",
      hook: "同一个家\n两条不同的求职路",
      test_variable: "两个孩子路线差异是否提升目标家长共鸣",
    },
  ];
}
