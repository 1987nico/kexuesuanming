import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { toGoldenReportData } from "./goldenAdapter";
import { renderGoldenReportHtml } from "./goldenReportHtml";

const fixtures = [
  "/sessions/sweet-serene-newton/step4_data.json",
  "/sessions/sweet-serene-newton/step5_data.json",
  "/sessions/sweet-serene-newton/golden_body_data.json",
];
const emitIt = fixtures.every(existsSync) ? it : it.skip;

// 用金样本数据拼一个「存储态 deep_report」，验证 适配器→渲染器 能还原金样本
describe("goldenAdapter end-to-end", () => {
  emitIt("adapts a deep_report-shaped object and renders full golden report", () => {
    const market = JSON.parse(readFileSync("/sessions/sweet-serene-newton/step4_data.json", "utf8"));
    const vrin = JSON.parse(readFileSync("/sessions/sweet-serene-newton/step5_data.json", "utf8"));
    const body = JSON.parse(readFileSync("/sessions/sweet-serene-newton/golden_body_data.json", "utf8"));

    // 重塑成系统 Step6Premortem 存储形态
    const premortem = body.premortem.map((p: any) => ({
      idx: p.idx,
      title: p.dir,
      comp: p.comp,
      narrative: p.script,
      findings: p.findings.map((f: any) => ({
        layer: f.layer,
        failureReason: f.reason,
        earlySignal30d: f.s30,
        earlySignal90d: f.s90,
        earlySignal6m: f.s6,
        exitCondition: f.exit,
        mitigation: f.mit,
      })),
      actionLinks: p.links.map(([actionDay, failureLayer]: [string, string]) => ({ actionDay, failureLayer })),
    }));

    const generated: any = {
      generated_at: new Date().toISOString(),
      market,
      vrin,
      premortem,
      cross: body.cross,
      golden_roadmap: {
        logic: body.roadmapLogic,
        phases: body.phases,
        gates: body.gates,
        reminds: body.reminds,
        totalStop: body.totalStop,
      },
      final_verdict: {
        conclusion: body.verdict.conclusion,
        mainline: body.verdict.mainline.map(([k, t, d]: [string, string, string]) => ({ k, t, d })),
        why: body.verdict.why,
        dont: body.verdict.dont,
        prereq: body.verdict.prereq,
        confidence: body.verdict.confidence,
      },
    };
    const profile: any = { customer_name: "金样本大报告" };

    const data = toGoldenReportData(profile, generated);
    expect(data.market.length).toBe(10);
    expect(data.vrin.length).toBe(6);
    // Top3 应为 #2 > #10 > #6（deepMath 重排）
    expect(data.vrin.filter((v) => v.rank <= 3).map((v) => v.idx).sort()).toEqual([10, 2, 6].sort());
    expect(data.premortem?.length).toBe(3);
    expect(data.phases?.length).toBe(3);
    expect(data.verdict?.conclusion).toContain("行业判断");

    writeFileSync("/tmp/adapter_render.html", renderGoldenReportHtml(data));
  });
});
