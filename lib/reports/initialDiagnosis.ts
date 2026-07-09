/**
 * 初步诊断报告（放放模板）—— LLM 判断层
 *
 * 设计原则：
 * - 只让 LLM 产出「必须针对客户下判断」的短字段（约 15 个），其余全部确定性渲染。
 * - 一次 llmJSON 调用（maxTokens 2200、低温），zod 硬校验 + 字数上限 + 禁用词检查。
 * - 校验失败重试一次；再失败回退到 buildLiteReport 的确定性文案，流水线永不断。
 * - 结果缓存到 profile.initial_diagnosis，只生成一次。
 */

import { z } from "zod";
import { llmJSON } from "@/lib/llm/router";
import type { AssessmentProfile } from "./assessmentProfile";
import { buildLiteCustomerInput } from "./builders";
import { archetypeZhName, traitZhName } from "./talentNames";

// ---------- 类型与 schema ----------

const shortText = (max: number) => z.string().min(4).max(max);

export const initialDiagnosisSchema = z.object({
  // 封面
  one_line_conclusion: shortText(90),
  // 01 核心诊断结论（四卡）
  main_judgement: shortText(90),
  initial_direction: shortText(110),
  biggest_risk: shortText(90),
  next_action: shortText(90),
  // 02 当前问题识别 · 判断（3-4 条）
  consultant_reading: z.array(shortText(110)).min(3).max(4),
  // 03 价值观 · 关键解释
  value_key_note: shortText(130),
  // 04 天赋原型判断 + 关键人格信号 + 职业翻译
  archetype_judgement: shortText(130),
  key_signals: z.array(shortText(60)).min(3).max(3),
  career_translation: shortText(130),
  // 05 行为模式三卡 + 使用建议
  behavior_modes: z.object({
    thinking: z.array(shortText(50)).min(2).max(3),
    interpersonal: z.array(shortText(50)).min(2).max(3),
    self_drive: z.array(shortText(50)).min(2).max(3),
  }),
  behavior_advice: shortText(120),
  // 06 初步方向建议
  recommended_cut: shortText(130),
  suitable_forms: z.array(shortText(60)).min(3).max(4),
  not_recommended_forms: z.array(shortText(60)).min(3).max(4),
  direction_hypothesis: shortText(130),
  // 07 90 天验证框架（4 阶段 + 止损线）
  ninety_day: z.object({
    weeks_1_2: shortText(110),
    weeks_3_4: shortText(110),
    weeks_5_8: shortText(110),
    weeks_9_12: shortText(110),
    stop_loss: shortText(130),
  }),
});

export type InitialDiagnosisFields = z.infer<typeof initialDiagnosisSchema>;

export interface InitialDiagnosisGenerated extends InitialDiagnosisFields {
  generated_at: string;
  provider: string;
  model: string;
  /** true = LLM 生成；false = 确定性兜底文案 */
  llm_generated: boolean;
}

export function mergeInitialDiagnosisIntoProfile(
  baseProfile: AssessmentProfile,
  generated: InitialDiagnosisGenerated,
  updatedAt: string,
  latestProfile?: AssessmentProfile | null
): AssessmentProfile {
  return {
    ...(latestProfile ?? baseProfile),
    initial_diagnosis: generated,
    updated_at: updatedAt,
  };
}

// 内部工作术语，绝不允许出现在客户可见文案里
const BANNED_TERMS = ["科学算命", "小报告", "大报告", "lite", "deep", "VRIN", "转化桥", "upsell", "客单"];

export function findBannedTerms(fields: InitialDiagnosisFields): string[] {
  const text = JSON.stringify(fields);
  return BANNED_TERMS.filter((term) => text.toLowerCase().includes(term.toLowerCase()));
}

// ---------- Prompt ----------

const SYSTEM_PROMPT = `你是「职场参谋」初步诊断报告的首席顾问。你要基于客户的方向输入、价值观双三圈和天赋测评结果，产出报告中需要顾问判断的短文案字段。

硬性要求：
- 全程中文、大白话，但要有咨询顾问的判断密度，不说空话套话。
- 每个判断必须回扣客户的价值观（喜欢区/排除带）和天赋特质，不得与之矛盾。
- 语气克制：这是「初步诊断」，只做方向初筛，不承诺收益、不打包票、不下最终结论。
- 建议方向要落在客户自己写的「感兴趣方向」附近做收敛，不要凭空发明方向；同时明确避开客户写的「不碰的方向」和排除带。
- 不出现以下词汇：${BANNED_TERMS.join("、")}。
- 严格遵守每个字段的字数上限，超出会被系统拒绝。`;

function buildUserPrompt(profile: AssessmentProfile) {
  const vp = profile.value_profile;
  const tp = profile.talent_profile;
  const input = buildLiteCustomerInput(profile);
  const topArchetypes = tp.top_archetypes
    .slice(0, 6)
    .map((a) => {
      const name = archetypeZhName(a.key, a.name);
      return typeof a.percentile === "number" ? `${name}(${a.percentile})` : name;
    })
    .join("、");
  const traitLabel = (t: { key: string; name: string; percentile?: number }) => {
    const name = traitZhName(t.key, t.name);
    return typeof t.percentile === "number" ? `${name}(${t.percentile})` : name;
  };
  const highTraits = tp.high_traits.slice(0, 8).map(traitLabel).join("、");
  const lowTraits = tp.low_traits.slice(0, 8).map(traitLabel).join("、");

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

【天赋测评（252题）】
主原型（按相似度）：${topArchetypes || "无"}
高分特质：${highTraits || "无"}
低分特质（长期依赖会耗能）：${lowTraits || "无"}

请输出如下 JSON（每个字段都有字数上限，单位为中文字符，务必遵守）：
{
  "one_line_conclusion": "一句话结论，说清客户更适合靠什么形成个人价值、当前不建议做什么（≤90字）",
  "main_judgement": "主判断：把客户的决策问题重新定义成可验证的问题（≤90字）",
  "initial_direction": "初步方向：哪些方向可进入候选池、核心卖点是什么（≤110字）",
  "biggest_risk": "最大风险：基于低分特质说清最容易翻车的地方（≤90字）",
  "next_action": "下一步动作：90天小样本验证怎么做、不要用什么来证明需求（≤90字）",
  "consultant_reading": ["判断3-4条：把客户输入组合起来读出底层诉求，每条≤110字"],
  "value_key_note": "关键解释：针对排除带里最容易被误读的一个价值观做解释（≤130字）",
  "archetype_judgement": "天赋原型判断：主原型是什么、组合说明客户的优势形态（≤130字）",
  "key_signals": ["三个关键人格信号，每条格式『信号名：适合什么场景』≤60字"],
  "career_translation": "职业翻译：这组信号支持什么类型的工作、不支持什么（≤130字）",
  "behavior_modes": {
    "thinking": ["思考方式2-3条，基于高分/低分特质给判断，每条≤50字"],
    "interpersonal": ["人际方式2-3条，每条≤50字"],
    "self_drive": ["自我驱动2-3条，每条≤50字"]
  },
  "behavior_advice": "使用建议：客户适合放在什么位置、执行部分怎么办（≤120字）",
  "recommended_cut": "推荐主切口：具体方向+卖什么不卖什么（≤130字）",
  "suitable_forms": ["适合进入验证的形态3-4条，每条格式『形态名：一句说明』≤60字"],
  "not_recommended_forms": ["暂不建议进入的形态3-4条，每条格式『形态名：一句原因』≤60字"],
  "direction_hypothesis": "方向假设：第一个可卖的小产品长什么样、先验证什么（≤130字）",
  "ninety_day": {
    "weeks_1_2": "第1-2周：锁定窄人群怎么做（≤110字）",
    "weeks_3_4": "第3-4周：最小可卖交付怎么做（≤110字）",
    "weeks_5_8": "第5-8周：付费试点怎么做（≤110字）",
    "weeks_9_12": "第9-12周：标准化与提价怎么做（≤110字）",
    "stop_loss": "止损线：90天没跑通时该怎么办、不该怎么办（≤130字）"
  }
}`.trim();
}

// ---------- 确定性兜底 ----------

export function buildFallbackDiagnosis(profile: AssessmentProfile): InitialDiagnosisFields {
  const input = buildLiteCustomerInput(profile);
  const vp = profile.value_profile;
  const tp = profile.talent_profile;
  const zhTrait = (t: { key: string; name: string } | undefined) => (t ? traitZhName(t.key, t.name) : undefined);
  const topArchetype = tp.top_archetypes[0] ? archetypeZhName(tp.top_archetypes[0].key, tp.top_archetypes[0].name) : "待确认";
  const highTraits = tp.high_traits.slice(0, 3).map((t) => traitZhName(t.key, t.name)).join("、") || "待补充";
  const lowTraits = tp.low_traits.slice(0, 3).map((t) => traitZhName(t.key, t.name)).join("、") || "待补充";
  const desired = input.desired_direction !== "未填写" ? input.desired_direction : "已填写的候选方向";
  const avoid = input.avoid_direction !== "未填写" ? input.avoid_direction : vp.exclude_summary;

  return {
    one_line_conclusion: `${profile.customer_name} 更适合把 ${highTraits} 组合成高辨识度的产品或服务，当前不建议进入 ${avoid}。`,
    main_judgement: `这不是单纯“${input.current_decision}”的问题，而是要把方向拆成可验证的小切口，先看真实成交和复利可能。`,
    initial_direction: `「${desired}」可进入候选池。核心卖点应是判断、定位和方法，而不是纯执行。`,
    biggest_risk: `${lowTraits} 偏低，长期依赖会明显耗能。没有流程约束，容易从验证变成发散。`,
    next_action: "用 90 天做小样本验证：访谈、试点、付费转化、复盘。不要用低价执行来证明市场需求。",
    consultant_reading: [
      `${profile.customer_name} 表面上在问「${input.current_decision}」，底层是在问：我适合靠什么形成可持续个人价值。`,
      `「${input.stuck_point}」和「${input.energy_source}」放在一起看，说明需要一个能承载个人判断的产品形态。`,
      `「${desired}」可以进入验证，但必须避开「${avoid}」，否则容易滑向长期消耗。`,
      "这次诊断的重点不是鼓励马上投入，而是先把最值得验证的方向和必须避开的风险说清楚。",
    ],
    value_key_note: `排除带（${vp.excluded_values.join("、")}）不代表这些完全不重要，而是提醒：方向不要建立在它们之上。真正的主线是${vp.like_summary}`,
    archetype_judgement: `主原型更接近「${topArchetype}」。结合其余高分原型看，优势不是单一执行，而是组合式的判断与表达。`,
    key_signals: tp.high_traits.slice(0, 3).map((t) => `${traitZhName(t.key, t.name)}：是强信号，适合在合适场景中主动使用。`),
    career_translation: `这组信号支持以 ${highTraits} 为核心的工作形态，不支持长期依赖 ${lowTraits} 的岗位设定。`,
    behavior_modes: {
      thinking: [
        `${zhTrait(tp.high_traits[0]) || "核心优势"}较强，适合做方向、框架和机会判断。`,
        `${zhTrait(tp.low_traits[0]) || "低分特质"}偏低，需外接风控和流程。`,
      ],
      interpersonal: [
        `${zhTrait(tp.high_traits[1]) || "人际信号"}明显，适合表达、转化和咨询场景。`,
        "要先给安全感，再给直接判断。",
      ],
      self_drive: [
        `${zhTrait(tp.high_traits[2]) || "驱动信号"}较强，适合有反馈、有变化的节奏。`,
        "稳定收尾要靠模板、复盘和外部节奏。",
      ],
    },
    behavior_advice: "更适合在前端承担判断、表达、定位和转化，执行部分要尽早流程化、模板化。",
    recommended_cut: `先围绕「${desired}」做最小验证：卖判断和方案，不卖无限执行。`,
    suitable_forms: [
      "高价值诊断：先卖判断，不卖无限执行。",
      "小样本试点：用真实客户反馈验证付费意愿。",
      "方法论产品：把判断框架沉淀成模板和清单。",
      "90天验证服务：只承诺验证路径和复盘。",
    ],
    not_recommended_forms: [
      `${input.avoid_direction !== "未填写" ? input.avoid_direction : "低价纯执行"}：与排除带冲突，复利低。`,
      "无边界陪跑：交付过重，容易失控。",
      "只靠测评结论做重大决策：证据不足。",
      "过早扩团队或重投入：当前更需要验证形态。",
    ],
    direction_hypothesis: `先做一个围绕「${desired}」的窄版诊断或试点小产品，验证是否有人愿意为判断和方案付费，再考虑扩服务。`,
    ninety_day: {
      weeks_1_2: "只选一个窄人群起点，访谈 10 人，记录真实付费问题。",
      weeks_3_4: "做 3 个诊断样本，产出前后对比，重点验证客户是否愿意为判断付费。",
      weeks_5_8: "转成 3-5 个付费试点，只交付明确边界内的判断和方案。",
      weeks_9_12: "把重复问题整理成模板，形成固定报价和边界，再考虑扩展服务线。",
      stop_loss: "如果 90 天内没有出现愿意付费的真实客户，不要转去低价执行补收入，应回到人群、问题和报价重新定位。",
    },
  };
}

// ---------- 生成入口 ----------

async function generateOnce(profile: AssessmentProfile): Promise<InitialDiagnosisFields> {
  const result = await llmJSON<unknown>({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(profile),
    maxTokens: 2200,
    temperature: 0.4,
  });
  const parsed = initialDiagnosisSchema.parse(result.data);
  const banned = findBannedTerms(parsed);
  if (banned.length) throw new Error(`文案包含内部术语：${banned.join("、")}`);
  return Object.assign(parsed, {
    __provider: result.raw.provider,
    __model: result.raw.model,
  }) as InitialDiagnosisFields;
}

export async function generateInitialDiagnosis(profile: AssessmentProfile): Promise<InitialDiagnosisGenerated> {
  let fields: InitialDiagnosisFields | null = null;
  let provider = "fallback";
  let model = "deterministic";
  let llmGenerated = false;

  for (let attempt = 0; attempt < 2 && !fields; attempt++) {
    try {
      const generated = (await generateOnce(profile)) as InitialDiagnosisFields & {
        __provider?: string;
        __model?: string;
      };
      provider = generated.__provider || "unknown";
      model = generated.__model || "unknown";
      delete generated.__provider;
      delete generated.__model;
      fields = generated;
      llmGenerated = true;
    } catch (error) {
      console.warn(`[initialDiagnosis] 第 ${attempt + 1} 次生成失败：`, (error as Error)?.message);
    }
  }

  if (!fields) {
    console.warn("[initialDiagnosis] LLM 生成失败，使用确定性兜底文案。");
    fields = buildFallbackDiagnosis(profile);
  }

  return {
    ...fields,
    generated_at: new Date().toISOString(),
    provider,
    model,
    llm_generated: llmGenerated,
  };
}

/**
 * 取缓存或生成并回存。提交测评后异步调用一次；报告页兜底调用。
 */
export async function ensureInitialDiagnosis(
  profile: AssessmentProfile,
  save: (profile: AssessmentProfile) => Promise<void>,
  loadLatest?: (id: string) => Promise<AssessmentProfile | null>
): Promise<InitialDiagnosisGenerated> {
  if (profile.initial_diagnosis?.llm_generated) return profile.initial_diagnosis;
  const generated = await generateInitialDiagnosis(profile);
  const updatedAt = new Date().toISOString();
  const latest = loadLatest ? await loadLatest(profile.id) : null;
  const nextProfile = mergeInitialDiagnosisIntoProfile(profile, generated, updatedAt, latest);
  await save(nextProfile);
  profile.initial_diagnosis = generated;
  profile.updated_at = updatedAt;
  return generated;
}
