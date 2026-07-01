import { llmJSON } from "@/lib/llm/router";
import {
  buildAccountPlanUserPrompt,
  buildDraftUserPrompt,
  buildReviewUserPrompt,
  buildTopicPoolUserPrompt,
  GROWTH_SYSTEM_PROMPT,
} from "./agents";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthPersona,
  GrowthPlan,
  GrowthPlanWeek,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthRun,
  TopicCandidate,
} from "./types";
import { countPublishChars, normalizeTags } from "./validation";
import { PERSONA_SPECIFIC_FIELDS } from "./types";
import type { AccountContext } from "./agents";

const DEFAULT_TENANT_ID = "mianbajun";

function accountContext(account: GrowthAccount): AccountContext {
  return {
    toneStyle: account.tone_style,
    filterWords: account.filter_words,
    avoidExpressions: account.avoid_expressions,
    contentDirections: account.content_directions,
    personaSpecific: account.persona_specific,
  };
}

function emptyPersonaSpecific(persona: GrowthPersona): Record<string, string> {
  return Object.fromEntries(PERSONA_SPECIFIC_FIELDS[persona].map((field) => [field.key, ""]));
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
      target_user: "在纠结怎么选、怕踩坑的消费者",
      core_problem: "同类产品太多，测评太水，不知道信谁",
      account_value: "第三方实测 + 可对比清单，帮你避坑选对",
      one_liner: "帮你把选择做对，少交智商税",
      follow_reason: "持续做客观实测和平价替代对比",
    },
    {
      target_user: "想买但预算敏感、追求性价比的人",
      core_problem: "既怕买贵又怕买错，决策成本高",
      account_value: "按场景给出高性价比选择和排雷清单",
      one_liner: "同价位里帮你挑出最值的那个",
      follow_reason: "持续更新性价比榜单和避坑点",
    },
    {
      target_user: "第一次买某品类、完全没经验的新手",
      core_problem: "不懂参数和套路，容易被导购带偏",
      account_value: "用小白能懂的话讲清怎么挑、怎么砍价",
      one_liner: "新手也能一次买对",
      follow_reason: "持续做新手向的选购指南",
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
}): Promise<{ account: GrowthAccount; plan: GrowthPlan; usage?: Record<string, unknown> }> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const persona: GrowthPersona = input.persona ?? "expert";
  const fallback = pick(FALLBACK_ACCOUNT_VARIANTS[persona]);
  const timestamp = now();
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildAccountPlanUserPrompt({ ...input, persona }),
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
        : ["A 目标客户痛点诊断", "B 可收藏工具/清单", "C 创始人故事/过程记录"],
    tone_style: accountData.tone_style || "具体、克制、有判断、有下一步，不鸡汤。",
    filter_words: Array.isArray(accountData.filter_words) ? accountData.filter_words.slice(0, 8) : [],
    avoid_expressions: Array.isArray(accountData.avoid_expressions)
      ? accountData.avoid_expressions.slice(0, 8)
      : ["逆袭", "暴富", "月入X万", "包成功"],
    compliance_redline: accountData.compliance_redline || "不承诺收益、不玄学、客户匿名、不用泛焦虑换阅读。",
    private_domain: accountData.private_domain || "",
    persona_specific: emptyPersonaSpecific(persona),
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
        recentSignals: input.recentSignals,
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

  const topics = normalizeTopics(payload?.topics);
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
}): Promise<{ run: GrowthRun; draft: ContentDraft; usage?: Record<string, unknown> }> {
  const topic =
    input.run.topic_pool.find((candidate) => candidate.id === input.selectedTopicId) ||
    input.run.topic_pool.find((candidate) => candidate.priority === "S") ||
    input.run.topic_pool[0];
  if (!topic) throw new Error("topic_pool_empty");

  const timestamp = now();
  let payload: any = null;
  let usage: Record<string, unknown> | undefined;

  try {
    const result = await llmJSON<any>({
      system: GROWTH_SYSTEM_PROMPT,
      user: buildDraftUserPrompt({
        targetUser: topic.target_user,
        trustSource: input.account.trust_source,
        direction: topic.direction,
        contentType: topic.content_type,
        title: topic.title,
        testVariable: topic.test_variable,
        expectedSignal: topic.expected_signal,
        followReason: topic.follow_reason,
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

  const hashtags = normalizeTags(payload?.hashtags || ["#中高层转型", "#第二曲线", "#小红书运营"]);
  const title = payload?.title || topic.title;
  const body =
    payload?.body ||
    `如果你已经在公司里做出成绩，但离开这个位置后，客户、预算和信任还会不会跟着你走？\n\n先别急着做个人 IP，也别急着追爆款。先判断三件事：\n\n1. 你现在的价值，是岗位给的，还是市场愿意单独为你付费？\n2. 你手里有没有能被目标客户理解的具体成果？\n3. 你发出的内容，是在吸引目标客户，还是只吸引泛职场围观？\n\n这篇先验证一个变量：${topic.test_variable}。\n\n我会继续记录，一个成熟职场人怎么把经验变成市场上的资产。`;

  const draft: ContentDraft = {
    id: id(),
    tenant_id: input.tenantId ?? input.account.tenant_id,
    account_id: input.account.id,
    run_id: input.run.id,
    status: "ready",
    direction: topic.direction,
    content_type: topic.content_type,
    test_variable: topic.test_variable,
    expected_signal: topic.expected_signal,
    title,
    alternative_titles: Array.isArray(payload?.alternative_titles)
      ? payload.alternative_titles.slice(0, 3)
      : [`${topic.title}，先看这张表`, "别急着发内容，先判断目标客户", "公司外议价权，先看 5 个信号"],
    target_user: payload?.target_user || topic.target_user,
    cover_text: payload?.cover_text || topic.hook,
    body,
    hashtags,
    comment_prompt:
      payload?.comment_prompt || "你现在更像公司里的能人，还是市场上的资产？",
    word_count: countPublishChars(title, body, hashtags),
    follow_reason: payload?.follow_reason || topic.follow_reason,
    trust_anchor: payload?.trust_anchor || input.account.trust_source,
    review_points: Array.isArray(payload?.review_points)
      ? payload.review_points.slice(0, 5)
      : ["收藏", "评论", "主页访问", "新增关注", "评论里是否出现目标用户信号"],
    cover_suggestion:
      payload?.cover_suggestion ||
      "真实办公桌面，手写目标客户判断表，画面克制，有真实过程感。",
    created_at: timestamp,
    updated_at: timestamp,
  };

  const run: GrowthRun = {
    ...input.run,
    status: "ready",
    selected_topic: topic,
    draft,
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
        recentSignals: input.recentSignals,
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
}): Promise<{ drafts: ContentDraft[]; usage?: Record<string, unknown> }> {
  const count = input.count ?? 2;
  // 一短一长：方案 1 精简版，方案 2 深度长文。
  const variantSpecs = [
    {
      hint: "开头用一句反常识判断切入，正文用 3 个诊断信号，克制精炼。",
      lengthHint: "精简版：正文控制在 150-300 字，只保留最锋利的判断和 3 个信号，适合快速阅读。",
    },
    {
      hint: "开头用真实场景/过程切入，正文展开清单或步骤 + 案例 + 关注理由。",
      lengthHint: "深度长文：正文写到 600-900 字（发布端合计仍需 ≤1000 字），把判断讲透、给可执行细节。",
    },
    {
      hint: "开头用第一人称复盘切入，中等篇幅，故事服务判断。",
      lengthHint: "中等篇幅：正文 400-600 字。",
    },
  ];
  const drafts: ContentDraft[] = [];
  const usedBodies = [...(input.excludeBodies ?? [])];
  let usage: Record<string, unknown> | undefined;

  for (let i = 0; i < count; i++) {
    const spec = variantSpecs[i % variantSpecs.length];
    const single = await generateSingleDraft({
      tenantId: input.tenantId,
      account: input.account,
      run: input.run,
      topic: input.topic,
      variantHint: spec.hint,
      lengthHint: spec.lengthHint,
      lengthKind: i === 0 ? "short" : "long",
      excludeBodies: usedBodies,
    });
    drafts.push(single.draft);
    usedBodies.push(single.draft.body);
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
        testVariable: topic.test_variable,
        expectedSignal: topic.expected_signal,
        followReason: topic.follow_reason,
        variantHint: [input.variantHint, input.lengthHint].filter(Boolean).join(" "),
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

  const hashtags = normalizeTags(payload?.hashtags || ["#中高层转型", "#第二曲线", "#小红书运营"]);
  const title = payload?.title || topic.title;
  const shortFallback = `围绕「${topic.title}」，先验证一个变量：${topic.test_variable}。\n\n最锋利的判断：别急着做，先看你现在的价值是岗位给的，还是市场愿意单独为你付费。\n\n3 个信号：\n1. 有没有能被目标客户理解的具体成果？\n2. 你的内容在吸引目标客户，还是只吸引泛围观？\n3. 离开这个位置，客户还会不会找你？`;
  const longFallback = `围绕「${topic.title}」，本篇先验证一个变量：${topic.test_variable}。\n\n先说一个反常识判断：很多人以为自己缺的是流量，其实缺的是“市场愿意单独为你付费的理由”。\n\n一、先自查三件事\n1. 你现在的价值，是岗位给的，还是市场愿意单独为你付费？\n2. 你手里有没有能被目标客户理解的具体成果（案例、数字、可复用方法）？\n3. 你发出的内容，是在吸引目标客户，还是只吸引泛围观？\n\n二、怎么把经验变成可被购买的表达\n把你做过的判断拆成“别人可以照着用”的清单和标准，而不是只讲故事。每一篇只讲清楚一个判断，并给出下一步动作。\n\n三、下一步\n先用一篇内容测试：目标客户看完，会不会主动来问。如果会，说明方向成立；如果只有点赞没有咨询，就换角度。\n\n我会继续记录，一个成熟职场人怎么把经验变成市场上可被信任、可被定价的资产。`;
  const body = payload?.body || (input.lengthKind === "long" ? longFallback : shortFallback);

  const draft: ContentDraft = {
    id: id(),
    tenant_id: input.tenantId ?? input.account.tenant_id,
    account_id: input.account.id,
    run_id: input.run.id,
    status: "draft",
    direction: topic.direction,
    content_type: topic.content_type,
    test_variable: topic.test_variable,
    expected_signal: topic.expected_signal,
    title,
    alternative_titles: Array.isArray(payload?.alternative_titles)
      ? payload.alternative_titles.slice(0, 3)
      : [`${topic.title}，先看这张表`, "别急着发内容，先判断目标客户"],
    target_user: payload?.target_user || topic.target_user,
    cover_text: payload?.cover_text || topic.hook,
    body,
    hashtags,
    comment_prompt: payload?.comment_prompt || "你现在更像公司里的能人，还是市场上的资产？",
    word_count: countPublishChars(title, body, hashtags),
    follow_reason: payload?.follow_reason || topic.follow_reason,
    trust_anchor: payload?.trust_anchor || input.account.trust_source,
    review_points: Array.isArray(payload?.review_points)
      ? payload.review_points.slice(0, 5)
      : ["收藏", "评论", "主页访问", "新增关注", "评论里是否出现目标用户信号"],
    cover_suggestion: payload?.cover_suggestion || "真实办公桌面，手写目标客户判断表，画面克制。",
    created_at: timestamp,
    updated_at: timestamp,
  };

  return { draft, usage };
}

export async function reviewDraft(input: {
  tenantId?: string;
  draft: ContentDraft;
  metrics: GrowthReviewMetrics;
}): Promise<{ review: GrowthReview; usage?: Record<string, unknown> }> {
  const timestamp = now();
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
        metrics: input.metrics as Record<string, unknown>,
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

  const reads = input.metrics.reads || 0;
  const saves = input.metrics.saves || 0;
  const comments = input.metrics.comments || 0;
  const follows = input.metrics.follows || 0;
  const classification =
    payload?.classification ||
    (reads > 0 && (saves + comments + follows) / reads > 0.05 ? "retest" : "weak_entry");

  const review: GrowthReview = {
    id: id(),
    tenant_id: input.tenantId ?? input.draft.tenant_id,
    draft_id: input.draft.id,
    metrics: input.metrics,
    classification,
    entry_judgement: payload?.entry_judgement || "数据不足，先标记为入口待观察。",
    value_judgement: payload?.value_judgement || "看收藏、评论和分享是否出现有用信号。",
    follow_judgement: payload?.follow_judgement || "看主页访问和新增关注是否可见。",
    audience_judgement: payload?.audience_judgement || "需要继续观察评论里是否出现目标用户信号。",
    next_variable: payload?.next_variable || "下一篇优先只改标题/封面入口。",
    manager_instruction: payload?.manager_instruction || "保留二测，不要直接放大。",
    topic_instruction: payload?.topic_instruction || "继续围绕同一目标用户补 2 个不同入口。",
    writer_instruction: payload?.writer_instruction || "强化开头筛选词和结尾关注理由。",
    created_at: timestamp,
  };

  return { review, usage };
}

function normalizeTopics(topics: any): TopicCandidate[] {
  if (!Array.isArray(topics)) return [];
  return topics.slice(0, 18).map((topic, index) => ({
    id: id(),
    direction: topic.direction === "B" || topic.direction === "C" ? topic.direction : "A",
    title: String(topic.title || `候选题 ${index + 1}`),
    target_user: String(topic.target_user || "成熟职场人"),
    pain: String(topic.pain || "不知道如何把经验转成市场资产"),
    content_type:
      topic.content_type === "tool" || topic.content_type === "story"
        ? topic.content_type
        : "diagnostic",
    hook: String(topic.hook || topic.title || "先判断你的公司外议价权"),
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
    ["A", "判断你有没有公司外议价权，看这 5 个信号", "diagnostic"],
    ["A", "年薪高的人，最怕发现自己没有市场价格", "diagnostic"],
    ["B", "中高层做内容，先写目标客户判断表", "tool"],
    ["B", "离开公司前，先盘一张个人资产负债表", "tool"],
    ["C", "做过合伙人后，我才知道什么人真正能上桌", "story"],
    ["C", "我从公司位置走向市场位置，最先改掉的是这件事", "story"],
  ] as const;

  return base.map(([direction, title, contentType], index) => ({
    id: id(),
    direction,
    title,
    target_user: account.target_user,
    pain: account.core_problem,
    content_type: contentType,
    hook: title,
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
}
