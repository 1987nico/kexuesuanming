/**
 * goldenPipeline —— 全新独立的深度诊断报告生成路线（不依赖旧 deepReportPipeline）。
 *
 * 设计：
 *  - LLM 只负责「文本」（判断逻辑、凭证、失败剧本、路线/结论措辞）。
 *  - 所有「数字」（五力未来/Δ/均值、机会、VRIN 总分/综合分、Top3 排名）一律由 deepMath 算定，不信 LLM。
 *  - 产出直接是金样本渲染器（goldenReportHtml）的数据结构 → 保证输出永远是金样本这张脸。
 *  - LLM 可注入（测试用 mock，生产用豆包 llmJSON）。
 */
import { llmJSON } from "@/lib/llm/router";
import { METHODOLOGY_SYSTEM } from "@/lib/llm/prompts/methodology";
import type { AssessmentProfile } from "./assessmentProfile";
import { sessionLikedCards } from "./directionSession";
import {
  completeForce,
  fiveForceSummary,
  opportunityFromThreat,
  rankByComposite,
  step4Verdict,
  type ForceRow,
} from "./deepMath";
import type {
  CrossPit,
  GoldenReportData,
  Kv,
  MarketRow,
  PremortemItem,
  RoadmapPhase,
  VerdictData,
  VrinRow,
} from "./goldenReportHtml";

// ---------- LLM 原始产物（只含文本 + 原始分，派生值不在此） ----------
export interface RawForce {
  力: string;
  现状: number;
  P: number;
  E: number;
  S: number;
  T: number;
  判断逻辑: string;
}
export interface RawMarket {
  序号?: number | string;
  方向: string;
  Step4判断?: string;
  处理方式: string;
  含义: string;
  五力明细: RawForce[];
}
export interface RawVrin {
  idx: number | string;
  dir: string;
  v: number;
  r: number;
  i: number;
  n: number;
  /** 机会大小 0-10：来自 Step4 判断（LLM 给或省略）；省略时由五力未来反推 */
  opp?: number;
  ev: { v: string; r: string; i: string; n: string };
  acts: string[];
}
export interface RawGolden {
  market: RawMarket[];
  vrin: RawVrin[];
  premortem: Array<Omit<PremortemItem, "comp">>;
  cross?: CrossPit[];
  roadmap?: {
    logic?: string;
    phases?: RoadmapPhase[];
    gates?: Kv[];
    reminds?: Kv[];
    totalStop?: string;
  };
  verdict?: VerdictData;
}

// ---------- 结构化后处理：数字全由 deepMath 算 ----------
export function postProcessGolden(raw: RawGolden, customerName: string): GoldenReportData {
  // 市场：补 未来/Δ、均值、判断
  const market: MarketRow[] = raw.market.map((m, i) => {
    const detail = m.五力明细.map((f) => {
      const done = completeForce(f as ForceRow);
      return { 力: f.力, 现状: f.现状, P: f.P, E: f.E, S: f.S, T: f.T, 未来: done.未来, Δ: done.Δ, 判断逻辑: f.判断逻辑 };
    });
    const sum = fiveForceSummary(detail);
    return {
      序号: m.序号 ?? i + 1,
      方向: m.方向,
      Step4判断: m.Step4判断 || step4Verdict(sum.五力未来),
      五力现状: sum.五力现状,
      五力未来: sum.五力未来,
      Δ: sum.Δ,
      处理方式: m.处理方式,
      含义: m.含义,
      五力明细: detail,
    };
  });
  const futureByDir = new Map(market.map((m) => [m.方向, m.五力未来]));

  // VRIN：机会优先取 Step4 判断，缺失才由五力未来反推；total/comp/rank 一律 deepMath
  const oppOf = (v: RawVrin) =>
    typeof v.opp === "number" ? v.opp : opportunityFromThreat(futureByDir.get(v.dir) ?? 60);
  const ranked = rankByComposite(
    raw.vrin.map((v) => ({ idx: v.idx, opportunity: oppOf(v), vrin: { v: v.v, r: v.r, i: v.i, n: v.n } }))
  );
  const rankById = new Map(ranked.map((r) => [r.idx, r]));
  const vrin: VrinRow[] = raw.vrin.map((v) => {
    const rk = rankById.get(v.idx)!;
    return { idx: v.idx, dir: v.dir, v: v.v, r: v.r, i: v.i, n: v.n, opp: oppOf(v), total: rk.total, comp: rk.comp, rank: rk.rank, ev: v.ev, acts: v.acts };
  });
  const compByIdx = new Map(vrin.map((v) => [v.idx, v.comp]));

  // 失败验尸：综合分取自 VRIN
  const premortem: PremortemItem[] = raw.premortem.map((p) => ({
    ...p,
    comp: compByIdx.get(p.idx) ?? 0,
  }));

  return {
    customerName,
    market,
    vrin,
    premortem,
    cross: raw.cross,
    roadmapLogic: raw.roadmap?.logic,
    phases: raw.roadmap?.phases,
    gates: raw.roadmap?.gates,
    reminds: raw.roadmap?.reminds,
    totalStop: raw.roadmap?.totalStop,
    verdict: raw.verdict,
  };
}

// ---------- Prompt 上下文 ----------
export interface GoldenContext {
  customerName: string;
  likedDirections: Array<{ title: string; oneLiner: string }>;
  likedValues: string[];
  excludedValues: string[];
  topArchetypes: string;
  highTraits: string;
  lowTraits: string;
  transferable: string;
  diagnosisConclusion: string;
  recommendedCut: string;
  biggestRisk: string;
}

export function buildGoldenContext(profile: AssessmentProfile): GoldenContext {
  const session = profile.direction_session;
  const liked = session ? sessionLikedCards(session) : [];
  const tp = profile.talent_profile;
  const traitStr = (t: { name: string; percentile?: number }) =>
    typeof t.percentile === "number" ? `${t.name} ${t.percentile}%` : t.name;
  const survey = profile.survey_answers as Record<string, unknown>;
  const transferable = String(
    survey["transferable_asset"] ?? survey["transferable_assets"] ?? survey["可迁移资产"] ?? "行业经验"
  );
  const d = profile.initial_diagnosis;
  return {
    customerName: profile.customer_name,
    likedDirections: liked.map((c) => ({ title: c.title, oneLiner: c.one_liner })),
    likedValues: profile.value_profile.liked_values,
    excludedValues: profile.value_profile.excluded_values,
    topArchetypes: (tp.top_archetypes ?? []).slice(0, 3).map((a) => a.name).join("＋"),
    highTraits: (tp.high_traits ?? []).slice(0, 4).map(traitStr).join("、"),
    lowTraits: (tp.low_traits ?? []).slice(0, 5).map(traitStr).join("、"),
    transferable,
    diagnosisConclusion: d?.one_line_conclusion ?? "",
    recommendedCut: d?.recommended_cut ?? "",
    biggestRisk: d?.biggest_risk ?? "",
  };
}

// ---------- Prompt 构造（金样本体例 + few-shot + 严格 JSON） ----------
export function buildGoldenPrompt(ctx: GoldenContext): { system: string; user: string } {
  const system =
    METHODOLOGY_SYSTEM +
    `

【本次任务：一次性产出「深度诊断报告」的结构化 JSON（金样本体例）】
你要对下面这些「客户本人点亮的方向」做完整分析，输出严格 JSON（只输出 JSON，不要多余文字）。
硬性要求（逐条满足，违反则视为失败）：
- 数字只写「现状威胁(0-100)」和 PEST 增量(P/E/S/T，可正可负)；「未来/Δ/均值/综合分/排名」一律不要写，由系统计算。
- 每个力必须写一句「判断逻辑」，讲清这一力为什么这样演化（含具体机制，如「AI 拉平制作门槛→潜在进入者威胁上升」）。
- VRIN 每维 1-5，每维「凭证」必须引用一条画像证据（带分位/具体项，如「自主 2%」「排除带含创意」「主原型规则维护者」）；难替代低分要写清「可被谁替代」。
- 避坑「输的剧本」用 200 字第一人称场景化复盘；5 层各配 30/90/6 月「量化」预警 + 「红线数值」+ 缓解动作。
- 90 天路线三阶段各给「量化通过线」「止损红线」；最终判断按「一句话结论→主推路线→四条依据→不要做→成败前提」写。
- 全程中文、无多余英文/品牌词；诚实点名短板不粉饰。`;

  const dirs = ctx.likedDirections.map((d, i) => `${i + 1}. ${d.title}：${d.oneLiner}`).join("\n");
  const user = `【客户】${ctx.customerName}
【点亮的方向（客户本人滑卡，全部要做 Step4 市场分析）】
${dirs}

【画像（判断与凭证必须回扣这些，带分位）】
- 主原型：${ctx.topArchetypes}
- 高分特质：${ctx.highTraits}
- 低分特质（短板，直接点名）：${ctx.lowTraits}
- 价值观喜欢区：${ctx.likedValues.join("、")}
- 价值观排除带（守住不碰）：${ctx.excludedValues.join("、")}
- 可迁移资产：${ctx.transferable}
- 初步诊断结论：${ctx.diagnosisConclusion}
- 推荐主切口：${ctx.recommendedCut}
- 最大风险：${ctx.biggestRisk}

【严格输出 JSON（键名照抄；数组长度：market=方向数，vrin=进入方向数，premortem=Top3=3）】
{
  "market": [
    {"序号":1,"方向":"","Step4判断":"进入|观察|淘汰","处理方式":"一句","含义":"对后续选择的含义，一句",
     "五力明细":[
       {"力":"行业竞争","现状":0,"P":0,"E":0,"S":0,"T":0,"判断逻辑":""},
       {"力":"潜在进入者","现状":0,"P":0,"E":0,"S":0,"T":0,"判断逻辑":""},
       {"力":"替代者","现状":0,"P":0,"E":0,"S":0,"T":0,"判断逻辑":""},
       {"力":"供应商","现状":0,"P":0,"E":0,"S":0,"T":0,"判断逻辑":""},
       {"力":"购买者","现状":0,"P":0,"E":0,"S":0,"T":0,"判断逻辑":""}
     ]}
  ],
  "vrin": [
    {"idx":1,"dir":"","v":1,"r":1,"i":1,"n":1,"opp":0,
     "ev":{"v":"引画像证据","r":"","i":"","n":""},
     "acts":["第 0–30 天：","第 30–60 天：","第 60–90 天："]}
  ],
  "premortem": [
    {"idx":1,"dir":"","script":"200字第一人称输的剧本",
     "findings":[
       {"layer":"market","reason":"","s30":"量化","s90":"量化","s6":"量化","exit":"红线数值","mit":""},
       {"layer":"moat","reason":"","s30":"","s90":"","s6":"","exit":"","mit":""},
       {"layer":"capability","reason":"","s30":"","s90":"","s6":"","exit":"","mit":""},
       {"layer":"motivation","reason":"","s30":"","s90":"","s6":"","exit":"","mit":""},
       {"layer":"reality","reason":"","s30":"","s90":"","s6":"","exit":"","mit":""}
     ],
     "links":[["第 0–30 天","market"],["第 30–60 天","capability"],["第 60–90 天","motivation"]]}
  ],
  "cross":[{"title":"跨方向共性大坑","desc":""}],
  "roadmap":{
    "logic":"组合逻辑一段（可含<b>加粗</b>）",
    "phases":[
      {"tag":"第 0–30 天","name":"验证「需求」","q":"","tone":"blue","goal":"",
       "acts":[["主线 · 咨询",""],["内容 · 引擎",""],["组合 · 导流",""]],"pass":"量化通过线","stop":"量化止损线"},
      {"tag":"第 30–60 天","name":"验证「付费」","q":"","tone":"gold","goal":"","acts":[["","" ]],"pass":"","stop":""},
      {"tag":"第 60–90 天","name":"验证「可复制」","q":"","tone":"green","goal":"","acts":[["","" ]],"pass":"","stop":""}
    ],
    "gates":[{"t":"第 30 天 · 需求门","d":""},{"t":"第 60 天 · 付费门","d":""},{"t":"第 90 天 · 放大门","d":""}],
    "reminds":[{"t":"短板名 + 分位","d":""}],
    "totalStop":"贯穿全程的总止损线（含数值）"
  },
  "verdict":{
    "conclusion":"一句话结论",
    "mainline":[["主线（利润锚）","方向名","一句"],["引擎（获客+信任）","方向名","一句"],["条件加码","方向名","一句"]],
    "why":[{"t":"机会够大","d":"引 Step4 分"},{"t":"你能赢","d":"引 VRIN 分"},{"t":"调用核心资产","d":""},{"t":"有复利、被认可","d":""}],
    "dont":[{"t":"排除项1","d":""},{"t":"排除项2","d":""},{"t":"排除项3","d":""},{"t":"排除项4","d":""}],
    "prereq":[{"t":"前提1","d":""},{"t":"前提2","d":""},{"t":"前提3","d":""},{"t":"前提4","d":""}],
    "confidence":"信心与底线：中性预期不打包票 + 总止损线"
  }
}`;
  return { system, user };
}

// ---------- 运行 ----------
export interface GoldenLlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
}
export type GoldenLlm = (req: GoldenLlmRequest) => Promise<{ data: RawGolden }>;

export async function generateGoldenReport(
  profile: AssessmentProfile,
  deps: { llm: GoldenLlm; buildPrompt?: (ctx: GoldenContext) => { system: string; user: string } }
): Promise<GoldenReportData> {
  const ctx = buildGoldenContext(profile);
  const { system, user } = (deps.buildPrompt ?? buildGoldenPrompt)(ctx);
  const { data } = await deps.llm({ system, user, maxTokens: 16000 });
  return postProcessGolden(data, ctx.customerName);
}

/** 生产便捷入口：用豆包（llmJSON）+ 金样本提示词跑完整报告 */
export async function runGoldenReport(profile: AssessmentProfile): Promise<GoldenReportData> {
  return generateGoldenReport(profile, {
    llm: async (req) => {
      const { data } = await llmJSON<RawGolden>({ system: req.system, user: req.user, maxTokens: req.maxTokens });
      return { data };
    },
  });
}
