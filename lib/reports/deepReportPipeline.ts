/**
 * 深度诊断报告分步流水线 —— 把面霸君后台接回老 /run 六步产线
 *
 * 与一次性生成（deepReportAgent）的区别：
 * - Step3 = 真人方向滑卡「点亮」的 10 个方向（不再 AI 预判、不再一口气编）
 * - Step4 = Tavily 联网检索 + PEST/波特五力（复用 lib/llm/prompts/step4，并扩展逐五力明细）
 * - Step5 = VRIN 收敛 Top3（复用 lib/llm/prompts/step5）
 * - Step6 = 失败验尸（复用 lib/llm/prompts/step6）
 * - 最后一次 LLM 调用只写叙事（结论先行、各步输入/推理/输出、90天计划文案），
 *   所有表格数值直接由各步结构化输出换算，保证数字前后一致。
 *
 * 产出 DeepReportGenerated，字段口径对齐「年雪」金样本：
 * 五力威胁分 0-100（= 1-5 分 × 20 的平均），Δ=未来-现状；综合分 =（Step4机会/20）×（VRIN/20）。
 */

import { llmJSON } from "@/lib/llm/router";
import type { Step2Opportunity } from "@/lib/llm/prompts/step2";
import { step4Prompt, type Step4Output, type Step4OpportunityAnalysis } from "@/lib/llm/prompts/step4";
import { step5Prompt, type Step5Output, type Step5VRINItem } from "@/lib/llm/prompts/step5";
import { step6Prompt, type Step6Output } from "@/lib/llm/prompts/step6";
import { tavilyMulti } from "@/lib/search/tavily";
import type { SurveyData } from "@/lib/survey/schema";
import type { AssessmentProfile } from "./assessmentProfile";
import { buildLiteCustomerInput } from "./builders";
import type { DeepReportGenerated, MarketOverviewRow } from "./deepReport";
import { scrubBrandTerms, type DeepPromptInput } from "./deepReportAgent";
import { sessionLikedCards, type DirectionCard } from "./directionSession";
import { archetypeZhName, traitZhName } from "./talentNames";

const MARKET_DISCLAIMER =
  "本节市场分析由 AI 基于联网检索片段与公开常识推理生成，其中涉及的行业规模、竞争格局、政策与数据均需人工核实真实来源后再交付，不可直接作为投资依据。";

const FORCE_NAMES = ["行业竞争", "潜在进入者", "替代者", "供应商", "购买者"] as const;

// ---------- 输入适配 ----------

function talentSummary(profile: AssessmentProfile): string {
  const tp = profile.talent_profile;
  return [
    `主原型：${tp.top_archetypes.slice(0, 6).map((a) => archetypeZhName(a.key, a.name)).join("、") || "无"}`,
    `高分特质：${tp.high_traits.slice(0, 8).map((t) => traitZhName(t.key, t.name)).join("、") || "无"}`,
    `低分（需补偿）特质：${tp.low_traits.slice(0, 8).map((t) => traitZhName(t.key, t.name)).join("、") || "无"}`,
  ].join("\n");
}

/** 老流水线 prompt 需要 SurveyData；这里用面霸君底稿字段做最小映射（只覆盖 step5/step6 实际用到的字段）。 */
function profileToSurveyLike(profile: AssessmentProfile): SurveyData {
  const input = buildLiteCustomerInput(profile);
  const skills = input.transferable_assets
    .split(/[、,，;；/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  const partial = {
    keyAchievements: input.transferable_assets !== "未填写" ? `可迁移资产：${input.transferable_assets}` : "（问卷未提供具体战绩）",
    achievementMainSource: "个人能力",
    achievementSources: ["个人能力"],
    transferableSkills: skills.length ? skills : ["（待补充）"],
    recentExperience: `当前决策：${input.current_decision}；最大卡点：${input.stuck_point}`,
    principlesYouSummary: talentSummary(profile),
    biggestConstraint: input.avoid_state !== "未填写" ? `想避开的状态：${input.avoid_state}` : "（问卷未提供）",
    familyStatus: "（问卷未提供）",
    incomeResponsibility: "（问卷未提供）",
    familySupport: "（问卷未提供）",
    minNextIncome: "（问卷未提供）",
    incomeDownTolerance: "（问卷未提供）",
    bottomValues: profile.value_profile.excluded_values.slice(0, 3),
  };
  return partial as unknown as SurveyData;
}

/** 点亮卡片 → 老流水线的机会对象（Step3 达标列表） */
function likedCardsToOpportunities(cards: DirectionCard[]): Step2Opportunity[] {
  return cards.map((card, i) => ({
    idx: i + 1,
    category: card.role || "方向",
    title: card.title,
    oneLiner: card.one_liner,
    dayInLife: card.typical_day,
    workContent: card.work_content,
    workMethods: "",
    imagePrompt: "",
    evidence: [],
  }));
}

// ---------- 数值换算 ----------

interface ForceValues {
  competitorIntensity: number;
  newEntrantThreat: number;
  substituteThreat: number;
  supplierPower: number;
  buyerPower: number;
}

function forcesList(f: ForceValues): number[] {
  return [f.competitorIntensity, f.newEntrantThreat, f.substituteThreat, f.supplierPower, f.buyerPower];
}

/** 五力威胁分换算到 0-100（越高越不利），对齐年雪表格口径（平均值） */
function forcesTo100(f: ForceValues): number {
  return Number(((forcesList(f).reduce((a, b) => a + b, 0) / 25) * 100).toFixed(1));
}

function round1(n: number) {
  return Number(n.toFixed(1));
}

/** Δ 显示带符号（+16.0 / -4.0 / +0.0），对齐年雪表格 */
function signed(n: number): string {
  const v = round1(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}

/** LLM 扩展输出：每个方向的逐五力明细（0-100 口径，现状 + P + E + S + T = 未来） */
interface ForcesDetailRow {
  力: string;
  现状: number;
  P: number;
  E: number;
  S: number;
  T: number;
  未来: number;
  判断逻辑: string;
}

type Step4AnalysisEx = Step4OpportunityAnalysis & { forcesDetail?: ForcesDetailRow[] };
type Step4OutputEx = Omit<Step4Output, "analyses"> & { analyses: Step4AnalysisEx[] };

const STEP4_DETAIL_ADDON = `

【补充输出要求】在 analyses 每一项中额外输出 "forcesDetail" 字段（逐五力明细，对齐咨询报告排版）：
"forcesDetail": [
  { "力": "行业竞争", "现状": 60, "P": -5, "E": 5, "S": 8, "T": 10, "未来": 78, "判断逻辑": "一句话" },
  { "力": "潜在进入者", ... }, { "力": "替代者", ... }, { "力": "供应商", ... }, { "力": "购买者", ... }
]
要求：
- 五行固定顺序：行业竞争、潜在进入者、替代者、供应商、购买者；
- 现状/未来为 0-100 威胁分（≈ 对应 1-5 力评分 × 20），P/E/S/T 为增量（可为负或 0）；
- 必须满足算术一致：现状 + P + E + S + T = 未来；
- 判断逻辑一句话，写清该力为什么变化。`;

/** 无 forcesDetail 时的兜底换算：由 1-5 力评分推 0-100 行，PEST 增量无法拆分则记 0 并把差额放进 Δ。 */
function fallbackForcesDetail(a: Step4OpportunityAnalysis): ForcesDetailRow[] {
  const now = forcesList(a.fiveForcesNow).map((v) => v * 20);
  const future = forcesList(a.fiveForcesFuture).map((v) => v * 20);
  return FORCE_NAMES.map((name, i) => ({
    力: name,
    现状: now[i],
    P: 0,
    E: 0,
    S: 0,
    T: future[i] - now[i],
    未来: future[i],
    判断逻辑: "（未拆分 PEST 增量，差额并入 T 列，交付前可人工补充）",
  }));
}

// ---------- 叙事组装（最后一次 LLM 调用） ----------

const ASSEMBLE_SYSTEM = `你是「职业/事业方向深度诊断报告」的首席顾问。前面的 Step3（客户真人滑卡点亮）、Step4（联网检索+PEST/波特五力）、Step5（VRIN）、Step6（失败验尸）已经由流水线分步算完，数值不许改。你的任务只有一个：把这些结构化结果写成金样本体例的叙事与结论。

硬性要求（金样本体例，逐条满足）：
- 全文不得出现「科学算命」「职场参谋」「小报告」「大报告」「完整咨询报告」字样，对客户统一说「初步诊断报告」「深度诊断报告」。
- 全程中文、大白话，咨询顾问判断密度，不说空话套话。
- 【证据带数值】一切判断必须回扣价值观（喜欢区/排除带的**具体项**）和天赋特质（引用**具体分位**，如「自主 2%、情绪滋养 8%、灵活 14%」「主原型：规则维护者＋批评者＋执行者」），并可引用 Step4 的五力/机会分、Step5 的 VRIN 分。禁止「较强/较弱/有一定潜力」这类无出处空泛话。
- 【诚实点名短板】方向的短板、风险要直说不许粉饰（如个人壁垒低就点明「难替代仅 2/5，靠现成人脉，而本人社交/自主极低，需搭合伙人」）；某方向胜算低仍入 Top3、或高却排后，都要说清为什么。
- 【量化收口】早期信号、通过线、止损线一律带数字（「续费 < 30%」「获客成本 > 客单价」「储备 < 3 个月」），不写「增长不行」这类模糊话。
- 【中文纯净】正文不得出现无必要英文与外部代号（如 Pre-mortem、compass、CAC、SOP、DAU、NPS）——一律换中文（获客成本、交付标准、日活、满意度…）；仅 PEST、波特五力、VRIN 作为方法名可保留。
- 最终推荐 3 条（主线 / 第一切口 / 暗线小 MVP）的「方向」字段必须从给定 Top3 里取，不得新造方向；三者是主次结构不是并列。
- 90 天计划的动作必须基于给定的 90 天验证动作改写，每阶段带可量化「继续条件」，不得凭空另编。
- final_judgement 按金样本「最终判断」体例写：先一句话结论 → 主推路线（主线利润锚 / 获客信任引擎 / 条件加码，各一句并说清依赖）→ 四条成立依据（各引一条 Step4/Step5 分数或画像证据）→「明确不要做」清单（引排除带与低分特质）→ 成败前提与信心底线（含总止损线，中性预期不打包票）。
- 每个 Step 的叙事按「输入 → 推理 → 输出」三段写；不承诺收益、不打包票。
- 只输出 JSON。`;

interface AssembleResult {
  conclusion_first?: Record<string, unknown>;
  step_narratives?: Record<string, { 输入?: string; 推理?: string; 输出?: string }>;
  sensory?: Record<string, unknown>;
  final_recommendations?: Record<string, unknown>;
  ninety_day_plan?: Record<string, unknown>;
  final_judgement?: Record<string, unknown>;
  premortem_table?: Array<Record<string, unknown>>;
  top3_table?: Array<Record<string, unknown>>;
}

function buildAssemblePrompt(args: {
  input: DeepPromptInput;
  likedCards: DirectionCard[];
  overview: MarketOverviewRow[];
  shortlistTitles: string[];
  vrins: Step5VRINItem[];
  top3: Array<{ title: string; opportunitySize: number; vrinTotal: number; actions: Array<{ day: string; action: string }> }>;
  premortems: Step6Output["premortems"];
}) {
  const { input, likedCards, overview, shortlistTitles, vrins, top3, premortems } = args;
  const profile = input.profile;
  const vp = profile.value_profile;
  const surveyInput = buildLiteCustomerInput(profile);
  const diagnosis = input.initialDiagnosis;

  return `
客户：${profile.customer_name}

【问卷关键信息】
当前决策：${surveyInput.current_decision}；最大卡点：${surveyInput.stuck_point}；能量来源：${surveyInput.energy_source}；想避开：${surveyInput.avoid_state}；可迁移资产：${surveyInput.transferable_assets}；感兴趣方向：${surveyInput.desired_direction}；明确不碰：${surveyInput.avoid_direction}

【价值观双三圈】
喜欢区：${vp.liked_values.join("、")}｜排除带：${vp.excluded_values.join("、")}
筛选句：${vp.filter_sentence}

【天赋】
${talentSummary(profile)}
${diagnosis ? `
【初步诊断报告（深度诊断报告必须与之逻辑一致；若最终推荐不同，在「与初步诊断报告的关系」里解释）】
一句话结论：${diagnosis.one_line_conclusion}
推荐主切口：${diagnosis.recommended_cut}
最大风险：${diagnosis.biggest_risk}` : ""}

【Step3 客户真人滑卡点亮（${likedCards.length} 个，即感性验证达标方向）】
${likedCards.map((c) => `- ${c.title}：${c.one_liner}`).join("\n")}

【Step4 市场总览（联网检索+PEST/五力换算，数字不许改）】
${overview.map((r) => `- ${r.方向}：五力 ${r.五力现状}→${r.五力未来}（Δ${r.Δ}），机会 ${r.机会现状}→${r.机会未来}，合计 ${r.合计}，判断=${r.Step4判断}`).join("\n")}
入围（进入 Step5）：${shortlistTitles.join("、") || "无"}

【Step5 VRIN】
${vrins.map((v) => `- ${v.title}：V${v.v} R${v.r} I${v.i} N${v.n} 总分 ${v.total}/20`).join("\n")}
Top3（最终推荐只能从这里取方向）：
${top3.map((t, i) => `${i + 1}. ${t.title}（Step4机会 ${t.opportunitySize}/20，VRIN ${t.vrinTotal}/20）\n   90天动作：${t.actions.map((a) => `${a.day}: ${a.action}`).join("；")}`).join("\n")}

【Step6 失败验尸（每方向 5 层失败因+信号+止损，数值细节略）】
${premortems.map((p) => `- ${p.title}：${p.narrative.slice(0, 160)}...
  信号示例：${p.findings.slice(0, 2).map((f) => f.earlySignal90d).join("；")}
  止损示例：${p.findings.slice(0, 2).map((f) => f.exitCondition).join("；")}`).join("\n")}

请输出如下 JSON（中文键，值要具体、可交付）：
{
  "conclusion_first": { "一句话结论": "", "最终建议": "", "主线": "", "第一切口": "", "暗线": "", "行动方式": "" },
  "step_narratives": {
    "step1": { "输入": "", "推理": "", "输出": "" },
    "step2": { "输入": "", "推理": "", "输出": "" },
    "step3": { "输入": "", "推理": "", "输出": "" },
    "step4": { "输入": "", "推理": "", "输出": "" },
    "step5": { "输入": "", "推理": "", "输出": "" },
    "step6": { "输入": "", "推理": "", "输出": "" }
  },
  "sensory": { "说明": "", "聚类主题": [""] },
  "top3_table": [ { "排序": 1, "方向": "", "角色": "主线|第一切口|暗线小 MVP", "进入原因": "40字以内短句" } ],
  "premortem_table": [ { "方向": "", "12个月后最可能怎么输": "50字以内概括", "早期信号": "3条量化信号，分号隔开", "止损线": "1-2条红线，分号隔开" } ],
  "final_recommendations": {
    "推荐1主线": { "方向": "", "推荐逻辑": "" },
    "推荐2第一切口": { "方向": "", "推荐逻辑": "" },
    "推荐3暗线": { "方向": "", "推荐逻辑": "" },
    "与初步诊断报告的关系": ""
  },
  "ninety_day_plan": {
    "表头": ["阶段", "主线", "切口", "暗线", "继续条件"],
    "Day0-30": { "主线": "", "切口": "", "暗线": "", "继续条件": "" },
    "Day30-60": { "主线": "", "切口": "", "暗线": "", "继续条件": "" },
    "Day60-90": { "主线": "", "切口": "", "暗线": "", "继续条件": "" },
    "止损线": ""
  },
  "final_judgement": { "判断": "3-4 个自然段，用 \\n\\n 分隔" }
}

补充要求：
- step2 叙事要说明方向来自滑卡多轮自适应发散（共 ${input.directionSession?.rounds_generated ?? 1} 轮）、只在喜欢区内发散；step3 叙事要强调达标名单是客户本人点亮、非 AI 代判。
- step4 叙事要说明用了联网检索片段修正五力，并提醒数字需人工核实。
- premortem_table 的内容必须从 Step6 结构化结果里浓缩，不得新编风险；90 天计划单元格用短句。
- 主线/第一切口/暗线要形成主次结构，不是三个并列项目。`.trim();
}

// ---------- 主流程 ----------

export async function generateDeepReportViaPipeline(input: DeepPromptInput): Promise<{
  generated: DeepReportGenerated;
  usage?: Record<string, unknown>;
}> {
  const session = input.directionSession;
  const likedCards = session ? sessionLikedCards(session) : [];
  if (!likedCards.length) {
    throw new Error("分步流水线需要已完成的方向滑卡点亮结果");
  }

  const opps = likedCardsToOpportunities(likedCards);
  const surveyLike = profileToSurveyLike(input.profile);
  const principlesYou = talentSummary(input.profile);

  // ---- Step4：联网检索 + PEST/波特五力（复用老流水线 prompt，扩展逐五力明细） ----
  const queries = opps.slice(0, 6).map((o) => `${o.title} 2026 中国 市场规模 竞争格局 PEST 政策 趋势`);
  const searches = await tavilyMulti(queries, { maxResults: 3 });
  const sourcesByOpp = new Map<number, string[]>();
  searches.forEach((s, i) => {
    sourcesByOpp.set(
      opps[i]?.idx ?? i + 1,
      s.results.slice(0, 2).map((r) => `${r.title}（${r.url}）`)
    );
  });
  const allSources = Array.from(
    new Set(searches.flatMap((s) => s.results).map((r) => `${r.title}（${r.url}）`))
  ).slice(0, 8);
  const marketSources = allSources.length
    ? allSources
    : ["外部检索暂未接入（TAVILY_API_KEY 未配置）：本节数字为模型推理结果，交付前需人工补充真实来源。"];
  const snippets = searches
    .flatMap((s) => s.results)
    .slice(0, 18)
    .map((r) => `${r.title} (${r.url}): ${r.content?.slice(0, 220) || ""}`);

  const qualified = opps.map((opp) => ({
    opp,
    userScore: 8,
    userReason: "客户本人方向滑卡点亮（想试试）",
  }));
  const step4Req = step4Prompt(surveyLike, qualified, snippets);
  const step4 = await llmJSON<Step4OutputEx>({
    system: step4Req.system,
    user: step4Req.user + STEP4_DETAIL_ADDON,
    maxTokens: 12000,
  });
  const analyses = (step4.data.analyses ?? []).filter((a) => opps.some((o) => o.idx === a.idx));
  if (!analyses.length) throw new Error("Step4 未返回有效分析");

  const totalOf = (a: Step4OpportunityAnalysis) => a.scoreNow + a.scoreFuture;
  let shortlist = (step4.data.shortlist ?? []).filter((idx) => analyses.some((a) => a.idx === idx));
  if (!shortlist.length) {
    shortlist = analyses
      .slice()
      .sort((a, b) => totalOf(b) - totalOf(a))
      .slice(0, 6)
      .map((a) => a.idx);
  }
  const judgementOf = (idx: number): string => {
    const a = analyses.find((x) => x.idx === idx);
    if (!a) return "观察";
    if (shortlist.includes(idx)) return "进入";
    return totalOf(a) >= 11 ? "观察" : "淘汰";
  };

  // ---- Step5：VRIN 收敛 Top3（复用老流水线 prompt） ----
  const shortlistPairs = shortlist
    .map((idx) => {
      const opp = opps.find((o) => o.idx === idx);
      const analysis = analyses.find((a) => a.idx === idx);
      return opp && analysis ? { opp, analysis } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const step5Req = step5Prompt(surveyLike, principlesYou, shortlistPairs);
  const step5 = await llmJSON<Step5Output>({ ...step5Req, maxTokens: 8000 });
  const vrins = (step5.data.vrins ?? []).filter((v) => shortlist.includes(v.idx));
  if (!vrins.length) throw new Error("Step5 未返回有效 VRIN");
  let top3Idx = (step5.data.top3 ?? []).filter((idx) => vrins.some((v) => v.idx === idx)).slice(0, 3);
  if (top3Idx.length < 3) {
    top3Idx = vrins
      .slice()
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((v) => v.idx);
  }

  // ---- Step6：失败验尸（复用老流水线 prompt） ----
  const top3Full = top3Idx
    .map((idx) => {
      const opp = opps.find((o) => o.idx === idx);
      const analysis = analyses.find((a) => a.idx === idx);
      const vrin = vrins.find((v) => v.idx === idx);
      if (!opp || !analysis || !vrin) return null;
      return { opp, analysis, vrin, userScore: 8, userReason: "客户本人方向滑卡点亮（想试试）" };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const step6Req = step6Prompt(surveyLike, principlesYou, top3Full);
  const step6 = await llmJSON<Step6Output>({ ...step6Req, maxTokens: 10000 });
  const premortems = step6.data.premortems ?? [];

  // ---- 结构化表格（程序换算，不经 LLM，保证数字一致） ----
  const titleOf = (idx: number) => opps.find((o) => o.idx === idx)?.title ?? `方向 ${idx}`;

  const sensoryTable = likedCards.map((card, i) => ({
    序号: i + 1,
    方向: card.title,
    来源: `第${card.round}轮`,
    Step4处理方式: judgementOf(i + 1),
    备注: card.one_liner,
  }));

  const marketOverview: MarketOverviewRow[] = analyses.map((a, i) => ({
    序号: i + 1,
    方向: a.title || titleOf(a.idx),
    五力现状: forcesTo100(a.fiveForcesNow),
    五力未来: forcesTo100(a.fiveForcesFuture),
    Δ: signed(forcesTo100(a.fiveForcesFuture) - forcesTo100(a.fiveForcesNow)),
    机会现状: a.scoreNow,
    机会未来: a.scoreFuture,
    合计: round1(totalOf(a)),
    Step4判断: judgementOf(a.idx),
  }));

  // 入围项市场分析明细（含逐五力明细行）
  const market = shortlistPairs.map(({ analysis: a }, i) => {
    const sources = sourcesByOpp.get(a.idx) ?? [];
    const now100 = forcesTo100(a.fiveForcesNow);
    const future100 = forcesTo100(a.fiveForcesFuture);
    const detail = (a.forcesDetail && a.forcesDetail.length === 5 ? a.forcesDetail : fallbackForcesDetail(a)).map(
      (row) => ({ ...row, Δ: signed(row.未来 - row.现状) })
    );
    const row: Record<string, unknown> = {
      序号: i + 1,
      方向: a.title || titleOf(a.idx),
      五力现状: now100,
      五力未来: future100,
      Δ: signed(future100 - now100),
      机会合计: round1(totalOf(a)),
      Step4判断: judgementOf(a.idx),
      五力明细: detail,
      含义: a.conclusion,
      待核实提示: "行业规模与增速等数字来自联网检索片段与模型推理，交付前需人工核实原始来源。",
    };
    if (sources.length) row["参考来源"] = sources.join("；");
    return row;
  });

  // 淘汰 / 不独立入围项概要
  const marketExcluded = analyses
    .filter((a) => !shortlist.includes(a.idx))
    .map((a) => ({
      方向: a.title || titleOf(a.idx),
      五力现状: forcesTo100(a.fiveForcesNow),
      五力未来: forcesTo100(a.fiveForcesFuture),
      Δ: signed(forcesTo100(a.fiveForcesFuture) - forcesTo100(a.fiveForcesNow)),
      处理: judgementOf(a.idx),
      概要理由: a.conclusion,
    }));

  const matrixByIdx = new Map((step5.data.decisionMatrix ?? []).map((m) => [m.idx, m]));
  const vrinRows = vrins.map((v) => {
    const a = analyses.find((x) => x.idx === v.idx);
    const oppSize = a ? round1(totalOf(a)) : (matrixByIdx.get(v.idx)?.opportunitySize ?? 0);
    const composite = Number(((oppSize / 20) * (v.total / 20)).toFixed(3));
    return {
      方向: v.title || titleOf(v.idx),
      价值V: v.v,
      稀缺R: v.r,
      难模仿I: v.i,
      难替代N: v.n,
      VRIN总分: v.total,
      Step4机会: oppSize,
      综合分: composite,
      凭证: `V：${v.evidence.v}；R：${v.evidence.r}；I：${v.evidence.i}；N：${v.evidence.n}`,
    };
  });

  const LAYER_LABEL: Record<string, string> = {
    market: "市场层",
    moat: "壁垒层",
    capability: "能力层",
    motivation: "动机层",
    reality: "现实层",
  };
  const premortemRows = premortems.map((p) => ({
    方向: p.title || titleOf(p.idx),
    失败剧本: p.narrative,
    "12个月怎么输": p.narrative,
    早期预警信号: p.findings.map(
      (f) => `${LAYER_LABEL[f.layer] ?? f.layer}：30天 ${f.earlySignal30d}；90天 ${f.earlySignal90d}`
    ),
    止损线: p.findings.map((f) => f.exitCondition).filter(Boolean).slice(0, 3).join("；"),
    对策: p.findings.map((f) => f.mitigation).filter(Boolean),
  }));

  const top3ForAssemble = top3Full.map((t) => ({
    title: t.opp.title,
    opportunitySize: round1(totalOf(t.analysis)),
    vrinTotal: t.vrin.total,
    actions: t.vrin.ninetyDayActions ?? [],
  }));

  // Step2 方向发散记录：滑卡全部卡片（点亮/划掉都保留）
  const swipesByCard = new Map((session?.swipes ?? []).map((s) => [s.card_id, s.liked]));
  const directions = (session?.cards ?? []).map((card) => ({
    方向: card.title,
    一句话: card.one_liner,
    发散轮次: `第${card.round}轮`,
    滑卡结果: swipesByCard.get(card.id) === true ? "点亮（进入 Step3）" : swipesByCard.get(card.id) === false ? "划掉（排除）" : "未滑",
  }));

  // ---- 叙事组装（最后一次 LLM 调用） ----
  const assemble = await llmJSON<AssembleResult>({
    system: ASSEMBLE_SYSTEM,
    user: buildAssemblePrompt({
      input,
      likedCards,
      overview: marketOverview,
      shortlistTitles: shortlistPairs.map((p) => p.opp.title),
      vrins,
      top3: top3ForAssemble,
      premortems,
    }),
    maxTokens: 7000,
    temperature: 0.4,
  });
  const narrative = scrubBrandTerms(assemble.data ?? {});

  // 最终推荐兜底：方向必须落在 Top3 上
  const finalRec: Record<string, unknown> = { ...(narrative.final_recommendations ?? {}) };
  (["推荐1主线", "推荐2第一切口", "推荐3暗线"] as const).forEach((key, i) => {
    const block = (finalRec[key] ?? {}) as Record<string, unknown>;
    const direction = typeof block["方向"] === "string" ? (block["方向"] as string).trim() : "";
    const allowed = top3ForAssemble.map((t) => t.title);
    if (!direction || !allowed.some((t) => direction.includes(t) || t.includes(direction))) {
      finalRec[key] = { ...block, 方向: allowed[i] ?? allowed[0] ?? "" };
    }
  });

  // Top3 表兜底
  const roleNames = ["主线", "第一切口", "暗线小 MVP"];
  const top3Table =
    narrative.top3_table && narrative.top3_table.length
      ? narrative.top3_table
      : top3ForAssemble.map((t, i) => ({
          排序: i + 1,
          方向: t.title,
          角色: roleNames[i],
          进入原因: `Step4 机会 ${t.opportunitySize}/20，VRIN ${t.vrinTotal}/20。`,
        }));

  // 浓缩验尸表兜底
  const premortemTable =
    narrative.premortem_table && narrative.premortem_table.length
      ? narrative.premortem_table
      : premortems.map((p) => ({
          方向: p.title,
          "12个月后最可能怎么输": p.narrative.slice(0, 60) + "…",
          早期信号: p.findings.slice(0, 3).map((f) => f.earlySignal90d).join("；"),
          止损线: p.findings.slice(0, 2).map((f) => f.exitCondition).join("；"),
        }));

  const sensory: Record<string, unknown> = {
    说明: "达标名单来自客户本人方向滑卡点亮（右滑=想试试），AI 不代替客户做感性判断。",
    ...(narrative.sensory ?? {}),
    达标方向: likedCards.map((c) => c.title),
    待客户录入: false,
  };

  const stepNarratives: DeepReportGenerated["step_narratives"] = {};
  for (const key of ["step1", "step2", "step3", "step4", "step5", "step6"] as const) {
    const block = narrative.step_narratives?.[key];
    if (block && Object.keys(block).length) stepNarratives[key] = block;
  }

  const generated: DeepReportGenerated = {
    generated_at: new Date().toISOString(),
    provider: assemble.raw.provider,
    model: assemble.raw.model,
    pipeline: "staged-v1",
    market_disclaimer: MARKET_DISCLAIMER,
    sensory_from_input: true,
    conclusion_first: narrative.conclusion_first ?? {},
    directions: scrubBrandTerms(directions),
    sensory,
    sensory_table: sensoryTable,
    market_overview: marketOverview,
    market: scrubBrandTerms(market),
    market_excluded: scrubBrandTerms(marketExcluded),
    market_sources: marketSources,
    vrin: scrubBrandTerms(vrinRows),
    premortem: scrubBrandTerms(premortemRows),
    premortem_table: scrubBrandTerms(premortemTable),
    top3_table: scrubBrandTerms(top3Table),
    final_recommendations: scrubBrandTerms(finalRec),
    ninety_day_plan: scrubBrandTerms(narrative.ninety_day_plan ?? {}),
    final_judgement: scrubBrandTerms(narrative.final_judgement ?? {}),
    step_narratives: Object.keys(stepNarratives).length ? scrubBrandTerms(stepNarratives) : undefined,
    diagram_data: {
      matrix: top3Full.map((t) => ({
        direction: t.opp.title,
        opportunity: Math.round((totalOf(t.analysis) / 20) * 16),
        win: Math.round((t.vrin.total / 20) * 16),
      })),
      bright_zone: likedCards.map((c) => ({ direction: c.title, score: 8 })),
      market_matrix: shortlistPairs.map(({ opp, analysis: a }) => ({
        direction: opp.title,
        opportunity: a.scoreFuture,
        barrier: Math.round(((a.fiveForcesNow.competitorIntensity + a.fiveForcesNow.newEntrantThreat) / 2) * 2),
      })),
    },
  };

  return {
    generated,
    usage: {
      pipeline: "staged-v1",
      searched_queries: queries.length,
      search_snippets: snippets.length,
      steps: {
        step4: { provider: step4.raw.provider, model: step4.raw.model },
        step5: { provider: step5.raw.provider, model: step5.raw.model },
        step6: { provider: step6.raw.provider, model: step6.raw.model },
        assemble: { provider: assemble.raw.provider, model: assemble.raw.model },
      },
    },
  };
}
