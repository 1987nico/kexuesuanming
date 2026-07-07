import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { postProcessGolden, type RawGolden } from "./goldenPipeline";
import { renderGoldenReportHtml } from "./goldenReportHtml";

const F = {
  market: "/sessions/sweet-serene-newton/step4_data.json",
  vrin: "/sessions/sweet-serene-newton/step5_data.json",
  body: "/sessions/sweet-serene-newton/golden_body_data.json",
};
const run = existsSync(F.market) && existsSync(F.vrin) && existsSync(F.body) ? it : it.skip;

describe("goldenPipeline postProcess（数字由 deepMath 算，不信 LLM）", () => {
  run("从 LLM 原始产物还原金样本数字与排名", () => {
    const marketRaw = JSON.parse(readFileSync(F.market, "utf8"));
    const vrinRaw = JSON.parse(readFileSync(F.vrin, "utf8"));
    const body = JSON.parse(readFileSync(F.body, "utf8"));

    // 模拟 LLM 原始产物：market 去掉派生 未来/Δ；vrin 去掉 total/comp/rank/opp；premortem 去掉 comp
    const raw: RawGolden = {
      market: marketRaw.map((m: any) => ({
        序号: m.序号,
        方向: m.方向,
        处理方式: m.处理方式,
        含义: m.含义,
        五力明细: m.五力明细.map((f: any) => ({ 力: f.力, 现状: f.现状, P: f.P, E: f.E, S: f.S, T: f.T, 判断逻辑: f.判断逻辑 })),
      })),
      vrin: vrinRaw.map((v: any) => ({ idx: v.idx, dir: v.dir, v: v.v, r: v.r, i: v.i, n: v.n, opp: v.opp, ev: v.ev, acts: v.acts })),
      premortem: body.premortem.map((p: any) => ({ idx: p.idx, dir: p.dir, script: p.script, findings: p.findings, links: p.links })),
      cross: body.cross,
      roadmap: { logic: body.roadmapLogic, phases: body.phases, gates: body.gates, reminds: body.reminds, totalStop: body.totalStop },
      verdict: body.verdict,
    };

    const data = postProcessGolden(raw, "金样本大报告");

    // 市场：五力均值应被算回金样本（#1 = 55.2 → 63.4）
    const m1 = data.market.find((m) => String(m.序号) === "1")!;
    expect(m1.五力现状).toBe(55.2);
    expect(m1.五力未来).toBe(63.4);
    expect(m1.五力明细[0].未来).toBe(72);

    // VRIN：综合分与 Top3 由 deepMath 排（#2 6.8 / #10 6.4 / #6 6.3）
    const byIdx = new Map(data.vrin.map((v) => [v.idx, v]));
    expect(byIdx.get(2)!.comp).toBe(6.8);
    expect(byIdx.get(10)!.comp).toBe(6.4);
    expect(byIdx.get(6)!.comp).toBe(6.3);
    const top3 = data.vrin.filter((v) => v.rank <= 3).sort((a, b) => a.rank - b.rank).map((v) => v.idx);
    expect(top3).toEqual([2, 10, 6]);

    // 失败验尸综合分取自 VRIN
    expect(data.premortem!.find((p) => p.idx === 2)!.comp).toBe(6.8);

    writeFileSync("/tmp/golden_pipeline.html", renderGoldenReportHtml(data));
  });
});
