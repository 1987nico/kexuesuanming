/**
 * deepMath —— 大报告「结构化数值」的唯一真源（前后端 / 流水线 / 编辑器共用）。
 *
 * 原则：凡是能算的都在这里算，不交给大模型（保证可复现、可校验、零成本）。
 * 口径对齐《金样本大报告》：
 *  - 五力威胁分 0-100（1-5 分 × 20）；未来 = 现状 + P + E + S + T；Δ = 未来 - 现状。
 *  - 五力现状/未来 = 五个力的均值。
 *  - 机会大小 0-10（越友好越大）；VRIN 总分 = V+R+I+N（0-20）。
 *  - 综合分 0-10 = 机会 × VRIN总分 / 20。
 *  - Top3 按综合分降序、并列看 VRIN 总分。
 */

export interface PestDelta {
  P: number;
  E: number;
  S: number;
  T: number;
}

export interface ForceRow {
  /** 力名：行业竞争 / 潜在进入者 / 替代者 / 供应商 / 购买者 */
  力: string;
  现状: number; // 0-100
  P: number;
  E: number;
  S: number;
  T: number;
  未来?: number;
  Δ?: number;
  判断逻辑?: string;
}

export const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, n));

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 1-5 波特分 → 0-100 威胁分 */
export const threatFrom1to5 = (n: number): number => clamp(Math.round(n) * 20);

/** 未来威胁 = 现状 + P + E + S + T（0-100 口径，钳制） */
export const futureThreat = (now: number, d: PestDelta): number =>
  clamp(now + d.P + d.E + d.S + d.T);

/** 补全单个力的 未来 / Δ */
export function completeForce(f: ForceRow): Required<Pick<ForceRow, "未来" | "Δ">> & ForceRow {
  const future = futureThreat(f.现状, f);
  return { ...f, 未来: future, Δ: future - f.现状 };
}

export const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/** 五力现状/未来/Δ 均值汇总 */
export function fiveForceSummary(rows: ForceRow[]): {
  五力现状: number;
  五力未来: number;
  Δ: number;
} {
  const done = rows.map(completeForce);
  const now = round1(mean(done.map((r) => r.现状)));
  const future = round1(mean(done.map((r) => r.未来)));
  return { 五力现状: now, 五力未来: future, Δ: round1(future - now) };
}

/** 由「五力未来威胁」反推机会大小 0-10（越不友好机会越小）。可被 LLM/人工覆盖。 */
export const opportunityFromThreat = (futureThreatAvg: number): number =>
  Math.max(0, Math.min(10, Math.round((90 - futureThreatAvg) / 5)));

/** Step4 市场结构判断阈值（仅看市场，不含个人胜算） */
export function step4Verdict(futureThreatAvg: number): "进入" | "观察" | "淘汰" {
  if (futureThreatAvg <= 55) return "进入";
  if (futureThreatAvg <= 66) return "观察";
  return "淘汰";
}

export interface VrinInput {
  v: number;
  r: number;
  i: number;
  n: number;
}

/** VRIN 总分（0-20） */
export const vrinTotal = (x: VrinInput): number =>
  clamp(x.v + x.r + x.i + x.n, 0, 20);

/** 综合胜算 0-10 = 机会 × VRIN总分 / 20 */
export const composite = (opportunity0to10: number, total0to20: number): number =>
  round1((opportunity0to10 * total0to20) / 20);

export interface RankableRow {
  idx: number | string;
  opportunity: number; // 0-10
  vrin: VrinInput;
}

export interface RankedRow extends RankableRow {
  total: number;
  comp: number;
  rank: number;
  inTop3: boolean;
}

/** 按综合分降序排名并标记 Top3（并列看 VRIN 总分） */
export function rankByComposite(rows: RankableRow[]): RankedRow[] {
  const withScores = rows.map((r) => {
    const total = vrinTotal(r.vrin);
    return { ...r, total, comp: composite(r.opportunity, total) };
  });
  withScores.sort((a, b) => b.comp - a.comp || b.total - a.total);
  return withScores.map((r, i) => ({ ...r, rank: i + 1, inTop3: i < 3 }));
}

/**
 * 校验一份 deep_report 的数值自洽（供保存/生成时断言，防手改或 LLM 改乱）。
 * 返回问题列表，空数组=通过。
 */
export function verifyDeepMath(input: {
  market?: Array<{ 方向?: string; 五力明细?: ForceRow[]; 五力现状?: number; 五力未来?: number }>;
  vrin?: Array<{ 方向?: string; v: number; r: number; i: number; n: number; 综合分?: number; 机会?: number }>;
}): string[] {
  const issues: string[] = [];
  for (const m of input.market ?? []) {
    if (!m.五力明细) continue;
    for (const f of m.五力明细) {
      const expect = futureThreat(f.现状, f);
      if (f.未来 !== undefined && Math.round(f.未来) !== Math.round(expect)) {
        issues.push(`[${m.方向}] ${f.力} 未来应为 ${expect}（现状+P+E+S+T），实为 ${f.未来}`);
      }
    }
    const sum = fiveForceSummary(m.五力明细);
    if (m.五力未来 !== undefined && Math.abs(m.五力未来 - sum.五力未来) > 0.11) {
      issues.push(`[${m.方向}] 五力未来均值应为 ${sum.五力未来}，实为 ${m.五力未来}`);
    }
  }
  for (const v of input.vrin ?? []) {
    if (v.综合分 !== undefined && v.机会 !== undefined) {
      const expect = composite(v.机会, vrinTotal(v));
      if (Math.abs(v.综合分 - expect) > 0.11) {
        issues.push(`[${v.方向}] 综合分应为 ${expect}（机会×VRIN/20），实为 ${v.综合分}`);
      }
    }
  }
  return issues;
}
