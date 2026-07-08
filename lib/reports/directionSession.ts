/**
 * 方向感性验证会话（深度诊断报告测评）—— 探探式滑卡
 *
 * 流程：
 * - 操作员在交付后台点「深度诊断报告测评入口」→ 基于初步诊断生成第一批 10 个方向卡。
 * - 用户打开链接滑卡：右滑 = 想试试（点亮），左滑 = 不感兴趣。
 * - 每批 10 个；剩余未滑卡片 ≤ 3 时，后台按用户的左右滑反馈自适应生成下一批（用户无感知）。
 * - 收集到 10 个「点亮」即完成；未满 10 个不能提前完成。
 */

import { z } from "zod";
import { llmJSON } from "@/lib/llm/router";
import type { AssessmentProfile } from "./assessmentProfile";
import { buildLiteCustomerInput } from "./builders";
import { archetypeZhName, traitZhName } from "./talentNames";

export const DIRECTION_BATCH_SIZE = 10;
export const DIRECTION_TARGET_LIKES = 10;
export const DIRECTION_MAX_ROUNDS = 12;
/** 剩余未滑卡片少于该值时预生成下一批：优先让下一批充分参考上一批反馈 */
export const DIRECTION_PREFETCH_THRESHOLD = 2;
/** 生成锁超时（毫秒）：超过视为上次生成失败，允许重试 */
const GENERATING_LOCK_TIMEOUT_MS = 90_000;

// ---------- 决策类型 → 卡片存在性规则 ----------

export type DecisionType =
  | "跳槽"
  | "转型"
  | "创业"
  | "合伙"
  | "副业"
  | "继续主业但换打法";

export type ExistenceRule = "job_posting_required" | "bridge_first" | "flexible";

interface DecisionRule {
  existence: ExistenceRule;
  card_noun: string;
  scene_constraint: string;
  title_constraint: string;
  typical_day_constraint: string;
  first_batch_hint: string;
  adaptive_hint: string;
}

const DECISION_RULES: Record<DecisionType, DecisionRule> = {
  跳槽: {
    existence: "job_posting_required",
    card_noun: "真实招聘岗位",
    scene_constraint: "必须写真实雇主类型（如中型 SaaS 公司、连锁零售总部、Consulting firm），不能写模糊的「某创业团队」。",
    title_constraint: "title 和 role 必须是 BOSS 直聘/猎聘/LinkedIn 上能搜到的标准岗位名，禁止自创组合词或虚构岗位。",
    typical_day_constraint: "按「入职后真实工作节奏」写，不能是「如果我自己做 xxx」的假设语气。",
    first_batch_hint: `10 个方向按以下配比生成（全部必须是招聘网站真实存在的岗位）：
- 2 个贴近客户感兴趣方向的真实岗位（做窄、做具体）；
- 2 个基于天赋高分特质延伸的真实岗位；
- 2 个不同公司类型/层级的真实岗位（大厂/中型/专业事务所等）；
- 2 个规则清楚、路径稳定的真实岗位；
- 1 个客户行业邻近但可能被忽略的真实岗位；
- 1 个跨界但仍能在招聘网站搜到的桥接型真实岗位。`,
    adaptive_hint: "新方向仍必须是招聘网站真实存在的标准岗位；沿点亮特征做岗位变体，不要滑向创业或虚构角色。",
  },
  "继续主业但换打法": {
    existence: "job_posting_required",
    card_noun: "同行业/同赛道真实岗位（不同打法）",
    scene_constraint: "锚定客户现有行业或可迁移资产，scene 写该行业内真实雇主；不换大赛道。",
    title_constraint: "title 和 role 必须是该行业内招聘网站常见岗位名，禁止虚构。",
    typical_day_constraint: "按「在同行业换角色/打法后」的真实工作节奏写。",
    first_batch_hint: `锚定客户可迁移资产与感兴趣方向，只在同一赛道内换角色或层级，10 个方向按以下配比（全部必须是真实岗位）：
- 2 个同行业更高层级的真实岗位；
- 2 个同行业不同职能的真实岗位（执行→策略→管理→顾问）；
- 2 个同行业不同公司类型的真实岗位（甲方/乙方/平台等）；
- 2 个能发挥客户可迁移资产的真实岗位；
- 1 个同行业邻近职能的真实岗位；
- 1 个同行业内客户可能没想到、但招聘网站在招的真实岗位。`,
    adaptive_hint: "仍锚定客户现有行业/资产，只换角色或打法；每个新方向必须是该行业内招聘网站真实存在的岗位。",
  },
  转型: {
    existence: "bridge_first",
    card_noun: "桥接型岗位 + 探索型路径",
    scene_constraint: "桥接型/邻近型方向必须写真实雇主；探索型可写「90 天验证」类路径，但要说清验证方式。",
    title_constraint: "约 60% 的 title/role 必须是招聘网站可投的桥接型或邻近赛道标准岗位名；约 10% 可以是探索型路径名。",
    typical_day_constraint: "桥接型岗位按入职后节奏写；探索型按「验证转型可行性」的节奏写。",
    first_batch_hint: `客户处于转型中间态，10 个方向按以下配比：
- 6 个桥接型真实岗位（旧经验能迁移、新赛道能切入，招聘网站可投）；
- 3 个邻近赛道真实岗位（与旧经验有连接但形态不同）；
- 1 个探索型路径（可以不是标准岗位，如「90 天行业访谈验证转型方向」，但要说清怎么验证）。`,
    adaptive_hint: "优先沿被点亮的桥接型/邻近型岗位深化；约 1 个探索型假设可保留；划掉的方向所体现的不适合特征要坚决避开。",
  },
  创业: {
    existence: "flexible",
    card_noun: "生意/产品/服务",
    scene_constraint: "真实生意写已有市场案例；假设型写「如果从 0 启动」的具体形态。",
    title_constraint: "title 可以是生意形态名或产品名；客户是 owner，不是打工人。",
    typical_day_constraint: "按「从 0 到 1 建一个东西」的节奏写，含决策、验证、交付。",
    first_batch_hint: `10 个方向按以下配比（客户决策类型是「创业」）：
- 7 个市场上已有人在做的真实生意/产品/服务模式（做窄、做具体）；
- 2 个基于天赋与价值观推导的假设型方向；
- 1 个大胆假设（客户大概率没想过、但与其特质有隐秘连接）。`,
    adaptive_hint: "沿被点亮的生意形态深化或做变体；约 1 个大胆假设可保留；真实生意与假设型均可。",
  },
  合伙: {
    existence: "flexible",
    card_noun: "合伙项目/形态",
    scene_constraint: "必须涉及与合伙人/团队绑定；可以是加入已有项目做合伙人，或找合伙人从零开始。",
    title_constraint: "title 应体现合伙关系（如「XX 项目联合创始人」「加入 XX 团队做合伙人」）。",
    typical_day_constraint: "典型一天须含与合伙人讨论分工/股权/方向/拿结果的元素。",
    first_batch_hint: `10 个方向按以下配比（客户决策类型是「合伙」）：
- 4 个加入已有生意/项目做合伙人的真实机会形态；
- 3 个找合伙人从零启动的假设型项目；
- 2 个基于天赋延伸的合伙形态；
- 1 个大胆假设。`,
    adaptive_hint: "沿被点亮的合伙形态深化；每个方向必须保留「与他人绑定共事」的元素。",
  },
  副业: {
    existence: "flexible",
    card_noun: "兼职/小项目/小生意",
    scene_constraint: "必须明确不影响主业（下班后/周末/碎片化时间可执行）。",
    title_constraint: "title 体现低投入、可并行；风险与投入明显低于主业级创业。",
    typical_day_constraint: "典型一天须体现「主业之外」的时间安排（如晚间 2 小时、周末半天）。",
    first_batch_hint: `10 个方向按以下配比（客户决策类型是「副业」）：
- 4 个市场上已有人在做的真实副业/兼职模式；
- 2 个低成本、轻资产、可快速试水的方向；
- 2 个基于天赋与可迁移资产的副业形态；
- 1 个表达/内容/影响力型副业；
- 1 个大胆假设。`,
    adaptive_hint: "沿被点亮的副业形态深化；每个方向必须明确可并行于主业、投入可控。",
  },
};

const DECISION_TYPE_ALIASES: Record<string, DecisionType> = {
  跳槽: "跳槽",
  转型: "转型",
  创业: "创业",
  合伙: "合伙",
  副业: "副业",
  "继续主业但换打法": "继续主业但换打法",
};

export function resolveDecisionType(profile: AssessmentProfile): DecisionType | null {
  const raw = buildLiteCustomerInput(profile).current_decision.trim();
  return DECISION_TYPE_ALIASES[raw] ?? null;
}

function getDecisionRule(profile: AssessmentProfile): DecisionRule {
  const type = resolveDecisionType(profile);
  if (type) return DECISION_RULES[type];
  return {
    existence: "flexible",
    card_noun: "职业/事业方向",
    scene_constraint: "写具体可代入的场景。",
    title_constraint: "具体到角色 + 场景，不能是笼统行业名。",
    typical_day_constraint: "具体到早中晚做什么，让人能代入画面。",
    first_batch_hint: `10 个方向按以下配比生成：
- 2 个贴近客户感兴趣方向；
- 2 个基于天赋延伸；
- 2 个低成本试水；
- 2 个路径稳定；
- 1 个表达/内容型；
- 1 个大胆假设。`,
    adaptive_hint: "沿点亮特征深化，避开划掉方向的共同特征。",
  };
}

function buildDecisionConstraintBlock(profile: AssessmentProfile): string {
  const type = resolveDecisionType(profile);
  const rule = getDecisionRule(profile);
  const label = type ?? "未指定";
  const existenceLabel =
    rule.existence === "job_posting_required"
      ? "必须全部是招聘网站真实存在的标准岗位（existence: job_posting_required）"
      : rule.existence === "bridge_first"
        ? "以桥接型真实岗位为主，少量探索型路径（existence: bridge_first）"
        : "真实生意/模式与假设型均可（existence: flexible）";

  return `
【决策类型约束 · ${label}】
卡片对象：${rule.card_noun}
存在性规则：${existenceLabel}
title/role 约束：${rule.title_constraint}
场景约束：${rule.scene_constraint}
典型一天约束：${rule.typical_day_constraint}`.trim();
}

const verifyBatchSchema = z.object({
  invalid_titles: z.array(z.string()).max(DIRECTION_BATCH_SIZE),
});

// ---------- 类型 ----------

export interface DirectionCard {
  id: string;
  round: number;
  title: string;
  one_liner: string;
  typical_day: string;
  work_content: string;
  scene: string;
  role: string;
}

export interface DirectionSwipe {
  card_id: string;
  liked: boolean;
  swiped_at: string;
}

export interface DirectionSession {
  status: "active" | "completed";
  target_likes: number;
  cards: DirectionCard[];
  swipes: DirectionSwipe[];
  rounds_generated: number;
  generating: boolean;
  generating_started_at?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

// ---------- LLM schema ----------

const cardSchema = z.object({
  title: z.string().min(2).max(24),
  one_liner: z.string().min(6).max(60),
  typical_day: z.string().min(10).max(110),
  work_content: z.string().min(4).max(60),
  scene: z.string().min(2).max(46),
  role: z.string().min(2).max(36),
});

const batchSchema = z.object({
  directions: z.array(cardSchema).min(DIRECTION_BATCH_SIZE).max(DIRECTION_BATCH_SIZE + 2),
});

// ---------- 会话状态辅助 ----------

export function sessionLikes(session: DirectionSession): number {
  return session.swipes.filter((swipe) => swipe.liked).length;
}

export function sessionUnswipedCards(session: DirectionSession): DirectionCard[] {
  const swiped = new Set(session.swipes.map((swipe) => swipe.card_id));
  return session.cards.filter((card) => !swiped.has(card.id));
}

export function sessionLikedCards(session: DirectionSession): DirectionCard[] {
  const liked = new Set(session.swipes.filter((swipe) => swipe.liked).map((swipe) => swipe.card_id));
  return session.cards.filter((card) => liked.has(card.id));
}

export function sessionDislikedCards(session: DirectionSession): DirectionCard[] {
  const disliked = new Set(session.swipes.filter((swipe) => !swipe.liked).map((swipe) => swipe.card_id));
  return session.cards.filter((card) => disliked.has(card.id));
}

function newerTimestamp(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function earliestTimestamp(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function pushUniqueCard(cards: DirectionCard[], card: DirectionCard) {
  if (cards.some((item) => item.id === card.id || item.title === card.title)) return;
  cards.push(card);
}

function pushUniqueSwipe(swipes: DirectionSwipe[], swipe: DirectionSwipe) {
  if (swipes.some((item) => item.card_id === swipe.card_id)) return;
  swipes.push(swipe);
}

export function mergeDirectionSessions(
  latest: DirectionSession | undefined,
  incoming: DirectionSession | undefined,
  options: { preferIncomingGenerationState?: boolean } = {}
): DirectionSession | undefined {
  if (!latest && !incoming) return undefined;
  if (!latest) return incoming ? { ...incoming, cards: [...incoming.cards], swipes: [...incoming.swipes] } : undefined;
  if (!incoming) return { ...latest, cards: [...latest.cards], swipes: [...latest.swipes] };

  const cards: DirectionCard[] = [];
  for (const card of latest.cards) pushUniqueCard(cards, card);
  for (const card of incoming.cards) pushUniqueCard(cards, card);

  const swipes: DirectionSwipe[] = [];
  for (const swipe of latest.swipes) pushUniqueSwipe(swipes, swipe);
  for (const swipe of incoming.swipes) pushUniqueSwipe(swipes, swipe);
  swipes.sort((a, b) => a.swiped_at.localeCompare(b.swiped_at));

  const now = new Date().toISOString();
  const targetLikes = latest.target_likes || incoming.target_likes || DIRECTION_TARGET_LIKES;
  const likedCount = swipes.filter((swipe) => swipe.liked).length;
  const roundsGenerated = Math.max(latest.rounds_generated, incoming.rounds_generated);
  const completed = likedCount >= targetLikes;
  const latestLocked = isGenerationLocked(latest);
  const incomingLocked = isGenerationLocked(incoming);
  const latestStartedAt = latest.generating_started_at ? Date.parse(latest.generating_started_at) : 0;
  const incomingStartedAt = incoming.generating_started_at ? Date.parse(incoming.generating_started_at) : 0;
  const latestGenerationIsNewer = latestStartedAt > incomingStartedAt;
  const generating = options.preferIncomingGenerationState
    ? latestGenerationIsNewer
      ? latestLocked
      : incomingLocked
    : latestLocked || incomingLocked;

  return {
    ...latest,
    ...incoming,
    status: completed ? "completed" : "active",
    target_likes: targetLikes,
    cards,
    swipes,
    rounds_generated: roundsGenerated,
    generating: completed ? false : generating,
    generating_started_at: completed
      ? undefined
      : generating
        ? newerTimestamp(latest.generating_started_at, incoming.generating_started_at)
        : undefined,
    created_at: earliestTimestamp(latest.created_at, incoming.created_at) ?? now,
    updated_at: newerTimestamp(latest.updated_at, incoming.updated_at) ?? now,
    completed_at: completed ? latest.completed_at ?? incoming.completed_at ?? now : undefined,
  };
}

export function createDirectionSession(): DirectionSession {
  const now = new Date().toISOString();
  return {
    status: "active",
    target_likes: DIRECTION_TARGET_LIKES,
    cards: [],
    swipes: [],
    rounds_generated: 0,
    generating: false,
    created_at: now,
    updated_at: now,
  };
}

// ---------- Prompt ----------

const SYSTEM_PROMPT = `你是「职场参谋」的职业/事业方向发散顾问。你要基于客户的测评画像和「决策类型约束」，生成具体、可代入的方向卡片，供客户凭直觉判断「我每天真的过这种日子，我有多想做」。

硬性要求：
- 全程中文、大白话。每个方向必须具体到「角色 + 场景」，不能是笼统的行业名（「做餐饮」不行，「夜市小吃摊主理人」可以）。
- 严格遵守【决策类型约束】中的存在性规则——这是最高优先级，高于多样性要求。
- 方向必须落在客户价值观喜欢区内，避开排除带、客户明确不碰的方向和想避开的状态。
- 方向要与客户天赋高分特质匹配，避开重度依赖低分特质的形态。
- 尊重客户的现实约束（可迁移资产、时间窗口）。
- 10 个方向要多样化：覆盖不同风险等级和工作形态，不要 10 个都是同一类（在决策类型约束允许范围内）。
- 「典型一天」要具体到早中晚做什么，让人能代入画面。
- 严格遵守每个字段的字数上限。`;

function profileBrief(profile: AssessmentProfile): string {
  const input = buildLiteCustomerInput(profile);
  const vp = profile.value_profile;
  const tp = profile.talent_profile;
  const topArchetypes = tp.top_archetypes
    .slice(0, 4)
    .map((a) => archetypeZhName(a.key, a.name))
    .join("、");
  const highTraits = tp.high_traits.slice(0, 6).map((t) => traitZhName(t.key, t.name)).join("、");
  const lowTraits = tp.low_traits.slice(0, 6).map((t) => traitZhName(t.key, t.name)).join("、");
  const d = profile.initial_diagnosis;
  const diagnosisBlock = d
    ? `
【初步诊断结论】
一句话结论：${d.one_line_conclusion}
推荐主切口：${d.recommended_cut}
适合的形态：${d.suitable_forms.join("；")}
不建议的形态：${d.not_recommended_forms.join("；")}
最大风险：${d.biggest_risk}`
    : "";

  return `
客户：${profile.customer_name}

【客户方向输入】
当前决策：${input.current_decision}
时间窗口：${input.time_window}
最大卡点：${input.stuck_point}
能量来源：${input.energy_source}
想避开的状态：${input.avoid_state}
可迁移资产：${input.transferable_assets}
感兴趣的方向：${input.desired_direction}
明确不碰的方向：${input.avoid_direction}

【价值观双三圈】
喜欢区：${vp.liked_values.join("、")}
排除带：${vp.excluded_values.join("、")}
筛选句：${vp.filter_sentence}

【天赋测评】
主原型：${topArchetypes || "无"}
高分特质：${highTraits || "无"}
低分特质（避免重度依赖）：${lowTraits || "无"}${diagnosisBlock}`.trim();
}

function buildBatchPrompt(profile: AssessmentProfile, session: DirectionSession): string {
  const liked = sessionLikedCards(session);
  const disliked = sessionDislikedCards(session);
  const allTitles = session.cards.map((card) => card.title);
  const rule = getDecisionRule(profile);
  const decisionBlock = buildDecisionConstraintBlock(profile);

  const feedbackBlock =
    session.rounds_generated === 0
      ? `这是第一批方向。策略：多样性优先，先铺开可能性，让后续批次有信号可学。
${rule.first_batch_hint}`
      : `客户已经滑过 ${session.swipes.length} 个方向，反馈如下（这是最重要的信号，必须据此调整）：

【点亮的方向（右滑，想试试）】
${liked.map((card) => `- ${card.title}：${card.one_liner}`).join("\n") || "（暂无）"}

【划掉的方向（左滑，不感兴趣）】
${disliked.map((card) => `- ${card.title}：${card.one_liner}`).join("\n") || "（暂无）"}

生成策略：
1. 分析被点亮方向的共同特征（工作方式、场景、能量来源、风险偏好），约 6 个新方向沿这些特征深化或做变体；
2. 约 3 个探索还没测试过的邻近领域（与点亮特征相关但形态不同）；
3. 1 个大胆一点的假设方向（仍需符合价值观、约束与决策类型存在性规则）。
${rule.adaptive_hint}
划掉方向所体现的共同特征要坚决避开。

【已出现过的方向（绝不允许重复或换皮重复）】
${allTitles.join("、")}`;

  return `${profileBrief(profile)}

${decisionBlock}

${feedbackBlock}

请输出如下 JSON，共 ${DIRECTION_BATCH_SIZE} 个方向（字数上限单位为中文字符，务必遵守）：
{
  "directions": [
    {
      "title": "方向名，角色+场景，≤24字",
      "one_liner": "一句话定义这个方向做什么（≤60字）",
      "typical_day": "典型一天：早中晚各做什么，具体可代入（≤110字）",
      "work_content": "典型工作内容，用/分隔 4-6 项（≤60字）",
      "scene": "典型公司/场景（≤46字）",
      "role": "典型岗位名（≤36字）"
    }
  ]
}`.trim();
}

// ---------- 批次生成 ----------

type ParsedDirection = z.infer<typeof cardSchema>;

async function filterVerifiedJobPostings(
  directions: ParsedDirection[],
  decisionType: DecisionType
): Promise<ParsedDirection[]> {
  const listing = directions
    .map((card, index) => `${index + 1}. title: ${card.title} | role: ${card.role}`)
    .join("\n");

  const result = await llmJSON<unknown>({
    system: `你是招聘市场岗位校验员。判断每个方向的 title/role 是否为中国招聘网站（BOSS 直聘、猎聘、智联）上常见、可搜到的标准岗位名。
决策类型「${decisionType}」要求全部必须是真实招聘岗位。
只输出无法在招聘网站找到同类在招岗位的 title（完全虚构、自创组合词、或明显是创业/副业形态而非雇佣岗位的）。`,
    user: `请校验以下方向，输出 JSON：{ "invalid_titles": ["..."] }
若全部合规，返回空数组。

${listing}`,
    maxTokens: 800,
    temperature: 0.1,
  });

  const { invalid_titles: invalidTitles } = verifyBatchSchema.parse(result.data);
  if (invalidTitles.length === 0) return directions;

  const invalid = new Set(invalidTitles.map((title) => title.trim()));
  const filtered = directions.filter((card) => !invalid.has(card.title));
  if (filtered.length < directions.length) {
    console.warn(
      `[directionSession] 岗位校验剔除 ${directions.length - filtered.length} 个不合规方向：`,
      invalidTitles.join("、")
    );
  }
  return filtered;
}

async function generateBatchOnce(profile: AssessmentProfile, session: DirectionSession): Promise<DirectionCard[]> {
  const rule = getDecisionRule(profile);
  const result = await llmJSON<unknown>({
    system: SYSTEM_PROMPT,
    user: buildBatchPrompt(profile, session),
    maxTokens: 3600,
    temperature: 0.7,
  });
  const parsed = batchSchema.parse(result.data);
  let directions = parsed.directions;

  if (rule.existence === "job_posting_required") {
    const decisionType = resolveDecisionType(profile);
    if (decisionType) {
      directions = await filterVerifiedJobPostings(directions, decisionType);
    }
  }

  const existingTitles = new Set(session.cards.map((card) => card.title));
  const round = session.rounds_generated + 1;
  const fresh = directions.filter((card) => !existingTitles.has(card.title));
  if (fresh.length < DIRECTION_BATCH_SIZE - 2) {
    throw new Error(`生成的方向重复或不合规过多（仅 ${fresh.length} 个可用方向）`);
  }
  return fresh.slice(0, DIRECTION_BATCH_SIZE).map((card, index) => ({
    id: `r${round}-${index + 1}-${crypto.randomUUID().slice(0, 8)}`,
    round,
    ...card,
  }));
}

function isGenerationLocked(session: DirectionSession): boolean {
  if (!session.generating) return false;
  const startedAt = session.generating_started_at ? Date.parse(session.generating_started_at) : 0;
  return Date.now() - startedAt < GENERATING_LOCK_TIMEOUT_MS;
}

/**
 * 需要时生成下一批（带锁防并发；失败重试一次）。
 * 返回 true 表示实际生成了新批次。
 */
export async function generateNextBatchIfNeeded(
  profile: AssessmentProfile,
  save: (profile: AssessmentProfile) => Promise<void>,
  loadLatest?: (id: string) => Promise<AssessmentProfile | null>
): Promise<boolean> {
  let workingProfile = profile;
  if (loadLatest) {
    const latest = await loadLatest(profile.id);
    if (latest?.direction_session) {
      const mergedSession = mergeDirectionSessions(latest.direction_session, profile.direction_session);
      workingProfile = { ...latest, direction_session: mergedSession, updated_at: mergedSession?.updated_at ?? latest.updated_at };
      profile.direction_session = mergedSession;
      profile.updated_at = workingProfile.updated_at;
    }
  }

  const session = workingProfile.direction_session;
  if (!session || session.status !== "active") return false;
  if (sessionLikes(session) >= session.target_likes) return false;
  if (session.rounds_generated >= DIRECTION_MAX_ROUNDS) return false;
  if (sessionUnswipedCards(session).length > DIRECTION_PREFETCH_THRESHOLD) return false;
  if (isGenerationLocked(session)) return false;

  session.generating = true;
  session.generating_started_at = new Date().toISOString();
  session.updated_at = session.generating_started_at;
  workingProfile.updated_at = session.updated_at;
  await save(workingProfile);

  try {
    let cards: DirectionCard[] | null = null;
    for (let attempt = 0; attempt < 2 && !cards; attempt++) {
      try {
        cards = await generateBatchOnce(workingProfile, session);
      } catch (error) {
        console.warn(`[directionSession] 第 ${attempt + 1} 次批次生成失败：`, (error as Error)?.message);
      }
    }
    if (!cards) return false;
    session.cards.push(...cards);
    session.rounds_generated += 1;
    return true;
  } finally {
    session.generating = false;
    session.updated_at = new Date().toISOString();
    workingProfile.updated_at = session.updated_at;
    if (loadLatest) {
      const latest = await loadLatest(profile.id);
      const mergedSession = mergeDirectionSessions(latest?.direction_session, session, {
        preferIncomingGenerationState: true,
      });
      const nextProfile = latest ?? workingProfile;
      nextProfile.direction_session = mergedSession;
      nextProfile.updated_at = mergedSession?.updated_at ?? session.updated_at;
      await save(nextProfile);
      profile.direction_session = mergedSession;
      profile.updated_at = nextProfile.updated_at;
    } else {
      await save(workingProfile);
      profile.direction_session = session;
      profile.updated_at = workingProfile.updated_at;
    }
  }
}

/**
 * 记录一次滑动并推进会话状态（够 10 个喜欢即完成）。
 */
export function recordSwipe(session: DirectionSession, cardId: string, liked: boolean): { duplicate: boolean } {
  if (session.swipes.some((swipe) => swipe.card_id === cardId)) return { duplicate: true };
  if (!session.cards.some((card) => card.id === cardId)) throw new Error("未知卡片");

  session.swipes.push({ card_id: cardId, liked, swiped_at: new Date().toISOString() });

  if (sessionLikes(session) >= session.target_likes) {
    session.status = "completed";
    session.completed_at = new Date().toISOString();
  }
  session.updated_at = new Date().toISOString();
  return { duplicate: false };
}

/** 客户端视图（不泄露全部卡片与内部字段） */
export function sessionClientView(session: DirectionSession) {
  const cards = sessionUnswipedCards(session);
  return {
    status: session.status,
    likes: sessionLikes(session),
    target_likes: session.target_likes,
    swiped_count: session.swipes.length,
    cards,
    generating: cards.length === 0 && session.generating && isGenerationLocked(session),
  };
}
