/**
 * goldenAdapter —— 把系统存储的 deep_report 映射成金样本渲染器的数据结构。
 *
 * 说明：market/vrin/premortem 是流水线已产出的结构；缺失的派生值（机会/综合/排名）用 deepMath 补算。
 * roadmap/verdict/cross 若 deep_report 已带（建议流水线叙事阶段一并产出金样本字段）则渲染，否则优雅省略。
 */
import type { AssessmentProfile } from "./assessmentProfile";
import type { DeepReportGenerated } from "./deepReport";
import { composite, opportunityFromThreat, rankByComposite, vrinTotal } from "./deepMath";
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

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
const str = (v: unknown, d = ""): string => (v == null ? d : String(v));
const numOr = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isNaN(n) ? d : n;
};

const LAYER_KEYS = ["market", "moat", "capability", "motivation", "reality"] as const;
type Layer = (typeof LAYER_KEYS)[number];
const asLayer = (v: unknown): Layer => (LAYER_KEYS.includes(v as Layer) ? (v as Layer) : "market");

function toMarket(generated: DeepReportGenerated): MarketRow[] {
  return arr(generated.market).map((m, i) => ({
    序号: (m["序号"] as number | string) ?? i + 1,
    方向: str(m["方向"] ?? m["direction"]),
    Step4判断: str(m["Step4判断"] ?? m["判断"], "进入"),
    五力现状: numOr(m["五力现状"]),
    五力未来: numOr(m["五力未来"]),
    Δ: numOr(m["Δ"] ?? numOr(m["五力未来"]) - numOr(m["五力现状"])),
    处理方式: str(m["处理方式"] ?? m["Step4处理方式"]),
    含义: str(m["含义"] ?? m["机会判断"]),
    五力明细: arr(m["五力明细"]).map((f) => ({
      力: str(f["力"]),
      现状: numOr(f["现状"]),
      P: numOr(f["P"]),
      E: numOr(f["E"]),
      S: numOr(f["S"]),
      T: numOr(f["T"]),
      未来: numOr(f["未来"]),
      Δ: numOr(f["Δ"]),
      判断逻辑: str(f["判断逻辑"]),
    })),
  }));
}

function toVrin(generated: DeepReportGenerated): VrinRow[] {
  const raw = arr(generated.vrin).map((v) => {
    const dir = str(v["方向"] ?? v["title"] ?? v["dir"]);
    const idx = (v["idx"] as number | string) ?? dir;
    const vv = numOr(v["v"] ?? v["价值V"] ?? v["value"]);
    const r = numOr(v["r"] ?? v["稀缺R"] ?? v["rarity"]);
    const iv = numOr(v["i"] ?? v["难模仿I"] ?? v["imitability"]);
    const n = numOr(v["n"] ?? v["难替代N"] ?? v["non_substitutability"]);
    const ev = rec(v["ev"] ?? v["evidence"] ?? v["凭证"]);
    const acts = Array.isArray(v["acts"])
      ? (v["acts"] as string[])
      : arr(v["ninetyDayActions"]).map((a) => `${str(a["day"])}：${str(a["action"])}`);
    // 机会：优先取已存，否则由五力未来反推（找同名 market）
    let opp = numOr(v["opp"] ?? v["机会"] ?? v["Step4机会"], -1);
    if (opp < 0) {
      const m = arr(generated.market).find((mm) => str(mm["方向"]) === dir);
      opp = m ? opportunityFromThreat(numOr(m["五力未来"])) : 0;
    }
    return {
      idx,
      dir,
      v: vv,
      r,
      i: iv,
      n,
      opp,
      ev: { v: str(ev["v"]), r: str(ev["r"]), i: str(ev["i"]), n: str(ev["n"]) },
      acts,
    };
  });
  // 用 deepMath 统一算 total/comp/rank（数值只读、可复现）
  const ranked = rankByComposite(raw.map((r) => ({ idx: r.idx, opportunity: r.opp, vrin: { v: r.v, r: r.r, i: r.i, n: r.n } })));
  const rankById = new Map(ranked.map((r) => [r.idx, r]));
  return raw.map((r) => {
    const rk = rankById.get(r.idx);
    return {
      ...r,
      total: rk?.total ?? vrinTotal({ v: r.v, r: r.r, i: r.i, n: r.n }),
      comp: rk?.comp ?? composite(r.opp, vrinTotal({ v: r.v, r: r.r, i: r.i, n: r.n })),
      rank: rk?.rank ?? 99,
    };
  });
}

function toPremortem(generated: DeepReportGenerated): PremortemItem[] {
  return arr(generated.premortem).map((p) => ({
    idx: (p["idx"] as number | string) ?? str(p["方向"] ?? p["title"]),
    dir: str(p["方向"] ?? p["title"] ?? p["dir"]),
    comp: numOr(p["comp"] ?? p["综合分"]),
    script: str(p["输的剧本"] ?? p["narrative"] ?? p["script"] ?? p["失败剧本"]),
    findings: arr(p["findings"] ?? p["失败层"]).map((f) => ({
      layer: asLayer(f["layer"] ?? f["层"]),
      reason: str(f["reason"] ?? f["failureReason"] ?? f["失败原因"]),
      s30: str(f["s30"] ?? f["earlySignal30d"]),
      s90: str(f["s90"] ?? f["earlySignal90d"]),
      s6: str(f["s6"] ?? f["earlySignal6m"]),
      exit: str(f["exit"] ?? f["exitCondition"] ?? f["退出红线"]),
      mit: str(f["mit"] ?? f["mitigation"] ?? f["缓解动作"]),
    })),
    links: arr(p["actionLinks"] ?? p["links"]).map((l) => [
      Array.isArray(l) ? str(l[0]) : str(l["actionDay"]),
      asLayer(Array.isArray(l) ? l[1] : l["failureLayer"]),
    ]) as PremortemItem["links"],
  }));
}

function toRoadmap(generated: DeepReportGenerated): Pick<GoldenReportData, "phases" | "gates" | "reminds" | "totalStop" | "roadmapLogic"> {
  const src = rec((generated as unknown as Record<string, unknown>)["golden_roadmap"] ?? generated.ninety_day_plan);
  const phases = arr(src["phases"]).map(
    (p): RoadmapPhase => ({
      tag: str(p["tag"]),
      name: str(p["name"]),
      q: str(p["q"]),
      tone: (["blue", "gold", "green"].includes(str(p["tone"])) ? str(p["tone"]) : "blue") as RoadmapPhase["tone"],
      goal: str(p["goal"]),
      acts: (Array.isArray(p["acts"]) ? (p["acts"] as unknown[]) : []).map((a) =>
        Array.isArray(a) ? [str(a[0]), str(a[1])] : [str(rec(a)["k"]), str(rec(a)["t"])]
      ) as Array<[string, string]>,
      pass: str(p["pass"]),
      stop: str(p["stop"]),
    })
  );
  const kv = (v: unknown): Kv[] =>
    arr(v).map((x) => ({ t: str(x["t"] ?? x["title"]), d: str(x["d"] ?? x["desc"]) }));
  return {
    phases: phases.length ? phases : undefined,
    gates: kv(src["gates"]),
    reminds: kv(src["reminds"]),
    totalStop: str(src["totalStop"]) || undefined,
    roadmapLogic: str(src["logic"]) || undefined,
  };
}

function toVerdict(generated: DeepReportGenerated): VerdictData | undefined {
  const v = rec((generated as unknown as Record<string, unknown>)["final_verdict"]);
  if (!v || !v["conclusion"]) return undefined;
  const kv = (x: unknown): Kv[] => arr(x).map((c) => ({ t: str(c["t"] ?? c["title"]), d: str(c["d"] ?? c["desc"]) }));
  return {
    conclusion: str(v["conclusion"]),
    mainline: (Array.isArray(v["mainline"]) ? (v["mainline"] as unknown[]) : []).map((m) =>
      Array.isArray(m)
        ? [str(m[0]), str(m[1]), str(m[2])]
        : [str(rec(m)["k"]), str(rec(m)["t"]), str(rec(m)["d"])]
    ) as Array<[string, string, string]>,
    why: kv(v["why"]),
    dont: kv(v["dont"]),
    prereq: kv(v["prereq"]),
    confidence: str(v["confidence"]),
  };
}

export function toGoldenReportData(profile: AssessmentProfile, generated: DeepReportGenerated): GoldenReportData {
  const roadmap = toRoadmap(generated);
  const cross = arr((generated as unknown as Record<string, unknown>)["cross"]).map(
    (c): CrossPit => ({ title: str(c["title"] ?? c["t"]), desc: str(c["desc"] ?? c["d"]) })
  );
  return {
    customerName: profile.customer_name,
    generatedAt: generated.generated_at,
    routeMarker: profile.talent_profile.mode === "local" ? "B" : undefined,
    market: toMarket(generated),
    vrin: toVrin(generated),
    premortem: toPremortem(generated),
    cross: cross.length ? cross : undefined,
    verdict: toVerdict(generated),
    ...roadmap,
  };
}
