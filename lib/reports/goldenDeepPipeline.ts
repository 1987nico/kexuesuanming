/**
 * 金样本深度诊断报告路线。
 *
 * 这条路线不再复用旧 /run 六步流水线的中间结构，而是直接生产
 * goldenReportHtml 能渲染的结构化数据：market / vrin / premortem /
 * golden_roadmap / final_verdict。能算的数值仍由代码兜底，判断文案优先
 * 交给模型；模型不可用时产出一份可预览、可编辑、可导出 PDF 的本地版本。
 */
import { llmJSON, type LLMResponse } from "@/lib/llm/router";
import type { AssessmentProfile } from "./assessmentProfile";
import type { DeepReportGenerated } from "./deepReport";
import { scrubBrandTerms } from "./deepReportAgent";
import { completeForce, fiveForceSummary, opportunityFromThreat, step4Verdict } from "./deepMath";
import { sessionLikedCards } from "./directionSession";
import type {
  GoldenReportData,
  MarketRow,
  PremortemFinding,
  PremortemItem,
  RoadmapPhase,
  VerdictData,
  VrinRow,
} from "./goldenReportHtml";
import type { InitialDiagnosisGenerated } from "./initialDiagnosis";
import { archetypeZhName, traitZhName } from "./talentNames";

const MARKET_DISCLAIMER =
  "本节市场分析由 AI 基于公开常识、客户输入与咨询方法论推理生成，其中涉及市场规模、竞争格局、政策与数据均需人工核实后再交付，不可直接作为投资依据。";

const FORCE_NAMES = ["行业竞争", "潜在进入者", "替代者", "供应商", "购买者"] as const;
const ROLE_LABELS = ["主线", "第一切口", "条件加码"] as const;

type GoldenPayload = Omit<GoldenReportData, "customerName">;

export interface GenerateGoldenDeepReportOptions {
  initialDiagnosis?: InitialDiagnosisGenerated;
  forceFixture?: boolean;
}

function value<T>(items: T[], index: number, fallback: T): T {
  return items[index] ?? fallback;
}

function n(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function s(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function talentSummary(profile: AssessmentProfile): string {
  const top = profile.talent_profile.top_archetypes
    .slice(0, 5)
    .map((item) => archetypeZhName(item.key, item.name))
    .join("、");
  const highs = profile.talent_profile.high_traits
    .slice(0, 6)
    .map((item) => `${traitZhName(item.key, item.name)}${item.percentile != null ? ` ${item.percentile}%` : ""}`)
    .join("、");
  const lows = profile.talent_profile.low_traits
    .slice(0, 6)
    .map((item) => `${traitZhName(item.key, item.name)}${item.percentile != null ? ` ${item.percentile}%` : ""}`)
    .join("、");
  return `主原型：${top || "未同步"}；高分特质：${highs || "未同步"}；低分短板：${lows || "未同步"}`;
}

function likedDirections(profile: AssessmentProfile) {
  const cards = profile.direction_session ? sessionLikedCards(profile.direction_session) : [];
  return cards.map((card, index) => ({
    idx: index + 1,
    title: card.title,
    oneLiner: card.one_liner,
    round: card.round,
  }));
}

function makeForceRows(seed: number, direction: string): MarketRow["五力明细"] {
  const now = [54, 62, 56, 30, 56].map((base, i) => base + ((seed + i * 7) % 9) - 4);
  const deltas = [
    [6, 2, 4, 2],
    [3, 3, 2, 2],
    [2, 4, 2, 3],
    [1, 1, 1, 1],
    [4, 2, 3, 2],
  ];

  return FORCE_NAMES.map((name, i) => {
    const row = completeForce({
      力: name,
      现状: now[i],
      P: deltas[i][0],
      E: deltas[i][1],
      S: deltas[i][2],
      T: deltas[i][3],
      判断逻辑: `${direction} 的 ${name} 会被供给增加、客户教育成本与工具普及共同推高，需要用定位和交付边界抵消。`,
    });
    return { ...row, 未来: row.未来, Δ: row.Δ, 判断逻辑: row.判断逻辑 ?? "" };
  });
}

function fallbackMarket(profile: AssessmentProfile): MarketRow[] {
  const directions = likedDirections(profile);
  const source = directions.length
    ? directions
    : [{ idx: 1, title: s(profile.survey_answers.interested_direction, "待确认方向"), oneLiner: "", round: 1 }];

  return source.slice(0, 10).map((item, index) => {
    const details = makeForceRows(index + 1, item.title);
    const summary = fiveForceSummary(details);
    const judgement = step4Verdict(summary.五力未来);
    return {
      序号: item.idx,
      方向: item.title,
      Step4判断: judgement,
      五力现状: summary.五力现状,
      五力未来: summary.五力未来,
      Δ: summary.Δ,
      处理方式:
        judgement === "进入"
          ? "保留，先做小成本验证并收窄客群"
          : judgement === "观察"
            ? "观察，等待真实付费或渠道数据再加码"
            : "暂不独立下注，只保留为内容素材",
      含义: `${item.title} 可以作为验证对象，但必须先证明真实付费、交付边界与获客成本三件事。`,
      五力明细: details,
    };
  });
}

function fallbackVrin(market: MarketRow[]): VrinRow[] {
  const entered = market.filter((item) => item.Step4判断 === "进入").slice(0, 6);
  const rows = (entered.length >= 3 ? entered : market.slice(0, 6)).slice(0, 6);
  const scores = [
    [5, 4, 4, 4],
    [4, 4, 4, 4],
    [4, 4, 4, 2],
    [4, 3, 4, 3],
    [3, 3, 3, 3],
    [3, 3, 2, 3],
  ];

  return rows.map((item, index) => {
    const [v, r, i, non] = value(scores, index, [3, 3, 3, 3]);
    const opp = opportunityFromThreat(item.五力未来);
    const total = v + r + i + non;
    return {
      idx: item.序号,
      dir: item.方向,
      v,
      r,
      i,
      n: non,
      opp,
      total,
      comp: Number(((opp * total) / 20).toFixed(1)),
      rank: index + 1,
      ev: {
        v: "能直接调用客户已有经验、判断力或表达资产。",
        r: "同类人不少，但能把经验讲清、卖成决策的人更少。",
        i: "依赖个人案例、行业语感与方法沉淀，短期不容易复制。",
        n: non <= 2 ? "替代性偏高，必须靠搭档、案例或私域信任补位。" : "替代性可控，关键在形成稳定交付标准。",
      },
      acts: [
        "0-30天：访谈 20 个目标客户，验证痛点是否真实",
        "30-60天：卖出 3-5 个最小付费产品",
        "60-90天：沉淀标准流程与 2 个可公开案例",
      ],
    };
  });
}

function finding(layer: PremortemFinding["layer"], reason: string): PremortemFinding {
  return {
    layer,
    reason,
    s30: "30 天有效线索 < 5 条/周，或没有任何真实付费意向",
    s90: "90 天成交 < 3 单，且获客成本高于可承受客单价",
    s6: "6 个月仍依赖零散定制，没有复购、转介绍或标准产品",
    exit: "连续 2 个月触及成本/成交红线即停止加码",
    mit: "先做私域沉淀、标准化交付和小额付费验证，再扩大投入",
  };
}

function fallbackPremortem(vrin: VrinRow[]): PremortemItem[] {
  return vrin.slice(0, 3).map((item, index) => ({
    idx: item.idx,
    dir: item.dir,
    comp: item.comp,
    script: `12 个月后复盘，${item.dir} 最容易输在把「我觉得可行」当成「市场持续付费」。如果没有在 90 天内跑出真实成交、稳定内容线索和可复用交付，这条路会退回低价执行或零散接单。`,
    findings: [
      finding("market", "市场层：需求看似热，但客户不一定愿意为判断与方案付费。"),
      finding("moat", "壁垒层：如果不产品化，个人经验会卡在工时天花板。"),
      finding("capability", "能力层：低自主、低情绪支持或弱社交会拖慢持续交付。"),
      finding("motivation", "动机层：若方向不产生复利和认可，会很快失去能量。"),
      finding("reality", "现实层：现金流和时间窗口不允许长期空转。"),
    ],
    links: [
      ["0-30天", "market"],
      ["30-60天", "moat"],
      ["60-90天", "capability"],
    ],
  }));
}

function fallbackRoadmap(top3: VrinRow[]): Pick<GoldenPayload, "roadmapLogic" | "phases" | "gates" | "totalStop" | "reminds"> {
  const a = top3[0]?.dir ?? "主线方向";
  const b = top3[1]?.dir ?? "获客引擎";
  const c = top3[2]?.dir ?? "条件加码方向";
  const phases: RoadmapPhase[] = [
    {
      tag: "第 0-30 天",
      name: "验证需求",
      q: "到底有没有人真的要？",
      tone: "blue",
      goal: `用访谈和内容验证 ${a} / ${b} 是否能击中真实痛点。`,
      acts: [
        ["主线", `围绕 ${a} 访谈 20 个精准客户。`],
        ["内容", `连续发布 10 条与 ${b} 相关的判断/避坑内容。`],
        ["线索", "把互动线索导入私域，记录付费意向。"],
      ],
      pass: ">=20 个有效访谈，>=5 人明确付费意向，>=2 条内容互动高于均值。",
      stop: "30 天 0 条付费意向，或自然线索持续 < 5 条/周。",
    },
    {
      tag: "第 30-60 天",
      name: "验证付费",
      q: "愿不愿真金白银买？",
      tone: "gold",
      goal: "只看真实成交，不用点赞收藏替代需求。",
      acts: [
        ["产品", "做 1 个最小付费诊断产品。"],
        ["成交", "向高意向客户成交 3-5 单。"],
        ["复盘", "沉淀交付清单和复盘模板。"],
      ],
      pass: "至少 3 单真实付费，成交率 >=30%，客户愿意转介绍或复购。",
      stop: "60 天累计付费 < 最低生活线，或获客成本 > 客单价。",
    },
    {
      tag: "第 60-90 天",
      name: "验证可复制",
      q: "能不能不靠一个人硬扛？",
      tone: "green",
      goal: `把 ${a} 标准化，判断 ${c} 是否值得条件加码。`,
      acts: [
        ["流程", "把交付标准化成固定流程和模板。"],
        ["案例", "沉淀 2-3 个可公开案例。"],
        ["加码", `若付费成立，再小规模试点 ${c}。`],
      ],
      pass: "标准流程成型，有可复用产品，出现 >=1 次复购/转介绍。",
      stop: "90 天仍无可复用交付、无复购、无转介绍。",
    },
  ];

  return {
    roadmapLogic: `组合逻辑：先用 ${b} 做获客和信任，再把高意向线索导入 ${a}；${c} 只在付费验证成立后加码。`,
    phases,
    gates: [
      { t: "需求门", d: "没有真实付费意向，不进入成交阶段。" },
      { t: "付费门", d: "没有 3-5 单真实成交，不扩大投入。" },
      { t: "复制门", d: "没有标准流程和复购，不扩团队。" },
    ],
    totalStop: "总止损线：连续 2 个月获客成本高于客单价，或现金储备低于 3 个月，立即收缩。",
    reminds: [
      { t: "守住排除带", d: "不退回低价执行、纯消耗型交付和没有复利的项目。" },
      { t: "只认真金白银", d: "用付费、复购、转介绍验证，不用点赞收藏自我安慰。" },
      { t: "补短板", d: "需要外部节点、搭档或固定节奏补足自驱和社交短板。" },
    ],
  };
}

function fallbackVerdict(profile: AssessmentProfile, top3: VrinRow[]): VerdictData {
  const a = top3[0]?.dir ?? "主线方向";
  const b = top3[1]?.dir ?? "获客引擎";
  const c = top3[2]?.dir ?? "条件加码方向";
  const excluded = profile.value_profile.excluded_values.join("、") || "排除带";
  return {
    conclusion: `优先验证「${a}」，用「${b}」做获客和信任，等真实付费成立后再小规模加码「${c}」。不要碰低价执行和没有复利的消耗型项目。`,
    mainline: [
      ["主线（利润锚）", a, "直接承接高价值判断和付费交付。"],
      ["引擎（获客+信任）", b, "用内容/社群/案例建立信任，给主线供线索。"],
      ["条件加码", c, "只在 60-90 天验证成立后试点。"],
    ],
    why: [
      { t: "机会可验证", d: "Step4 已把方向拆成市场结构，先看真实需求和付费信号。" },
      { t: "能调用资产", d: talentSummary(profile) },
      { t: "有复利可能", d: `符合喜欢区：${profile.value_profile.liked_values.join("、")}。` },
      { t: "风险可止损", d: "90 天路线设置了通过线和总止损线。" },
    ],
    dont: [
      { t: "低价代运营/纯执行", d: "容易滑向价格战和消耗型交付。" },
      { t: "为新而新", d: `排除带包含：${excluded}，不能为了新奇而下注。` },
      { t: "无人盯的长期项目", d: "如果画像里自驱/灵活/情绪支持偏低，必须设置外部节点。" },
      { t: "只看流量不看成交", d: "内容热度不能替代真实付费。" },
    ],
    prereq: [
      { t: "判断产品化", d: "尽早沉淀清单、模板、案例和标准交付。" },
      { t: "私域沉淀", d: "第一天起保留线索和复盘，不只靠投流。" },
      { t: "外部节点", d: "用合伙人、固定交付节奏或客户承诺补短板。" },
      { t: "现金纪律", d: "触及止损线就换切口，不赌沉没成本。" },
    ],
    confidence: "信心与底线：中性预期是 90 天跑通正向验证，不承诺高收益；用真实付费、复购和转介绍决定是否继续。",
  };
}

function fallbackPayload(profile: AssessmentProfile): GoldenPayload {
  const market = fallbackMarket(profile);
  const vrin = fallbackVrin(market);
  const top3 = [...vrin].sort((a, b) => b.comp - a.comp || b.total - a.total).slice(0, 3);
  const roadmap = fallbackRoadmap(top3);
  return {
    market,
    vrin,
    cross: [
      { title: "只投流、无私域、无信任", desc: "三个方向都必须沉淀私域和案例，投流只做放大。" },
      { title: "卖判断却不产品化", desc: "判断如果停在一对一定制，就没有复利。" },
      { title: "个人短板无人补位", desc: "自驱、社交、情绪支持等短板要用节点或搭档补。" },
      { title: "没有止损纪律", desc: "看到沉没成本就硬扛，会把好方向做成坏项目。" },
    ],
    premortem: fallbackPremortem(top3),
    ...roadmap,
    verdict: fallbackVerdict(profile, top3),
  };
}

function buildSystemPrompt() {
  return `你是职业/事业方向深度诊断报告的首席顾问。你要直接产出金样本深度诊断报告渲染器可用的数据结构，而不是旧流水线摘要。

硬规则：
- 只输出 JSON。
- market 必须覆盖客户点亮的全部方向，通常 10 个。
- vrin 只保留 Step4 后进入的 6 个方向，并收敛 Top3。
- premortem 只写 Top3，每个方向必须有 5 层失败验尸：market / moat / capability / motivation / reality。
- 90 天路线必须有 3 个阶段，每阶段包含通过线和止损线。
- final verdict 要有一句话结论、主推路线、四条依据、明确不要做、成败前提。
- 精确数值必须自洽：五力未来 = 现状 + P + E + S + T；综合分 = 机会 * VRIN总分 / 20。
- 中文干净，不出现内部品牌词、销售话术或工具过程。`;
}

function buildUserPrompt(profile: AssessmentProfile, initialDiagnosis?: InitialDiagnosisGenerated) {
  const directions = likedDirections(profile);
  return `客户：${profile.customer_name}

问卷：${JSON.stringify(profile.survey_answers)}
喜欢区：${profile.value_profile.liked_values.join("、")}
排除带：${profile.value_profile.excluded_values.join("、")}
筛选句：${profile.value_profile.filter_sentence}
天赋证据：${talentSummary(profile)}
初步诊断：${initialDiagnosis ? JSON.stringify(initialDiagnosis) : "未生成"}

客户本人点亮方向：
${directions.map((item) => `${item.idx}. ${item.title} —— ${item.oneLiner}`).join("\n")}

请输出 JSON，字段如下：
{
  "market": [{ "序号": 1, "方向": "", "Step4判断": "进入|观察|淘汰", "五力现状": 55.2, "五力未来": 63.4, "Δ": 8.2, "处理方式": "", "含义": "", "五力明细": [{ "力": "行业竞争", "现状": 60, "P": 1, "E": 2, "S": 3, "T": 4, "未来": 70, "Δ": 10, "判断逻辑": "" }] }],
  "vrin": [{ "idx": 1, "dir": "", "v": 5, "r": 4, "i": 4, "n": 4, "opp": 8, "total": 17, "comp": 6.8, "rank": 1, "ev": { "v": "", "r": "", "i": "", "n": "" }, "acts": ["0-30天："] }],
  "cross": [{ "title": "", "desc": "" }],
  "premortem": [{ "idx": 1, "dir": "", "comp": 6.8, "script": "", "findings": [{ "layer": "market", "reason": "", "s30": "", "s90": "", "s6": "", "exit": "", "mit": "" }], "links": [["0-30天", "market"]] }],
  "roadmapLogic": "",
  "phases": [{ "tag": "第 0-30 天", "name": "", "q": "", "tone": "blue", "goal": "", "acts": [["主线", ""]], "pass": "", "stop": "" }],
  "gates": [{ "t": "", "d": "" }],
  "totalStop": "",
  "reminds": [{ "t": "", "d": "" }],
  "verdict": { "conclusion": "", "mainline": [["主线（利润锚）", "", ""]], "why": [{ "t": "", "d": "" }], "dont": [{ "t": "", "d": "" }], "prereq": [{ "t": "", "d": "" }], "confidence": "" }
}`.trim();
}

function normalizePayload(profile: AssessmentProfile, payload: Partial<GoldenPayload>): GoldenPayload {
  const fallback = fallbackPayload(profile);
  const market = Array.isArray(payload.market) && payload.market.length ? payload.market : fallback.market;
  const vrin = Array.isArray(payload.vrin) && payload.vrin.length ? payload.vrin : fallback.vrin;
  const premortem =
    Array.isArray(payload.premortem) && payload.premortem.length ? payload.premortem : fallback.premortem;
  return {
    market: market.map((row, index) => ({
      ...fallback.market[index % fallback.market.length],
      ...row,
      序号: row.序号 ?? index + 1,
      五力现状: n(row.五力现状, fallback.market[index % fallback.market.length].五力现状),
      五力未来: n(row.五力未来, fallback.market[index % fallback.market.length].五力未来),
      Δ: n(row.Δ, n(row.五力未来) - n(row.五力现状)),
      五力明细: Array.isArray(row.五力明细) && row.五力明细.length ? row.五力明细 : fallback.market[index % fallback.market.length].五力明细,
    })),
    vrin,
    cross: Array.isArray(payload.cross) && payload.cross.length ? payload.cross : fallback.cross,
    premortem,
    roadmapLogic: payload.roadmapLogic || fallback.roadmapLogic,
    phases: Array.isArray(payload.phases) && payload.phases.length ? payload.phases : fallback.phases,
    gates: Array.isArray(payload.gates) && payload.gates.length ? payload.gates : fallback.gates,
    totalStop: payload.totalStop || fallback.totalStop,
    reminds: Array.isArray(payload.reminds) && payload.reminds.length ? payload.reminds : fallback.reminds,
    verdict: payload.verdict?.conclusion ? payload.verdict : fallback.verdict,
  };
}

async function generatePayloadWithLLM(
  profile: AssessmentProfile,
  initialDiagnosis?: InitialDiagnosisGenerated
): Promise<{ payload: GoldenPayload; raw: LLMResponse }> {
  const result = await llmJSON<Partial<GoldenPayload>>({
    system: buildSystemPrompt(),
    user: buildUserPrompt(profile, initialDiagnosis),
    maxTokens: 14000,
    temperature: 0.35,
  });
  return { payload: normalizePayload(profile, result.data), raw: result.raw };
}

function payloadToDeepReport(profile: AssessmentProfile, payload: GoldenPayload, raw?: LLMResponse): DeepReportGenerated {
  const directions = likedDirections(profile).map((item) => ({
    方向: item.title,
    一句话: item.oneLiner,
    发散轮次: `第${item.round}轮`,
    滑卡结果: "点亮（进入 Step3）",
  }));
  const top3 = [...payload.vrin].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const generated: DeepReportGenerated = {
    generated_at: new Date().toISOString(),
    provider: raw?.provider ?? "local",
    model: raw?.model ?? "golden-fallback-v1",
    pipeline: "golden-route-v1",
    market_disclaimer: MARKET_DISCLAIMER,
    sensory_from_input: true,
    conclusion_first: {
      一句话结论: payload.verdict?.conclusion ?? "",
      主线: top3[0]?.dir ?? "",
      第一切口: top3[1]?.dir ?? "",
      条件加码: top3[2]?.dir ?? "",
      行动方式: payload.roadmapLogic ?? "",
    },
    directions,
    sensory: {
      说明: "达标名单来自客户本人方向滑卡点亮（右滑=想试试），AI 不代替客户做感性判断。",
      达标方向: directions.map((item) => item.方向),
      待客户录入: false,
    },
    market: payload.market as unknown as Array<Record<string, unknown>>,
    vrin: payload.vrin as unknown as Array<Record<string, unknown>>,
    premortem: payload.premortem as unknown as Array<Record<string, unknown>>,
    cross: payload.cross as unknown as Array<Record<string, unknown>>,
    golden_roadmap: {
      logic: payload.roadmapLogic,
      phases: payload.phases,
      gates: payload.gates,
      reminds: payload.reminds,
      totalStop: payload.totalStop,
    },
    final_verdict: payload.verdict as unknown as Record<string, unknown>,
    final_recommendations: Object.fromEntries(
      top3.map((item, index) => [
        ROLE_LABELS[index] ?? `推荐${index + 1}`,
        { 方向: item.dir, 推荐逻辑: item.ev?.v || "进入 90 天验证。" },
      ])
    ),
    ninety_day_plan: {
      说明: payload.roadmapLogic,
      阶段: payload.phases,
      总止损线: payload.totalStop,
    },
    final_judgement: {
      判断: payload.verdict?.conclusion ?? "",
    },
  };
  return scrubBrandTerms(generated);
}

export async function generateGoldenDeepReport(
  profile: AssessmentProfile,
  opts?: GenerateGoldenDeepReportOptions
): Promise<{ generated: DeepReportGenerated; usage: Record<string, unknown> }> {
  const liked = likedDirections(profile);
  if (!profile.direction_session || profile.direction_session.status !== "completed" || !liked.length) {
    throw new Error("金样本路线需要已完成的方向滑卡点亮结果");
  }

  let raw: LLMResponse | undefined;
  let payload: GoldenPayload;
  let source = "llm";

  if (opts?.forceFixture) {
    payload = fallbackPayload(profile);
    source = "fixture";
  } else {
    try {
      const result = await generatePayloadWithLLM(profile, opts?.initialDiagnosis);
      payload = result.payload;
      raw = result.raw;
    } catch (error) {
      console.warn("[goldenDeepPipeline] 模型路线失败，使用本地金样本兜底：", (error as Error)?.message);
      payload = fallbackPayload(profile);
      source = "fallback";
    }
  }

  return {
    generated: payloadToDeepReport(profile, payload, raw),
    usage: {
      pipeline: "golden-route-v1",
      source,
      liked_directions: liked.length,
      provider: raw?.provider ?? "local",
      model: raw?.model ?? "golden-fallback-v1",
    },
  };
}
