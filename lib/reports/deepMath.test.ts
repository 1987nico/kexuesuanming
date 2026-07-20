import { describe, expect, it } from "vitest";
import {
  completeForce,
  composite,
  fiveForceSummary,
  opportunityFromThreat,
  rankByComposite,
  step4Verdict,
  verifyDeepMath,
  vrinTotal,
  type ForceRow,
} from "./deepMath";

// 金样本 #1「AI口播IP陪跑」五力（现状,P,E,S,T），期望 55.2 → 63.4，Δ+8.2
const gold1: ForceRow[] = [
  { 力: "行业竞争", 现状: 62, P: 0, E: 4, S: 3, T: 3 },
  { 力: "潜在进入者", 现状: 68, P: 0, E: 2, S: 2, T: 4 },
  { 力: "替代者", 现状: 58, P: 0, E: 2, S: 2, T: 5 },
  { 力: "供应商", 现状: 28, P: 0, E: 0, S: 0, T: 4 },
  { 力: "购买者", 现状: 60, P: 0, E: 5, S: 2, T: 3 },
];

describe("deepMath 五力换算（对齐金样本）", () => {
  it("单个力未来 = 现状 + P+E+S+T", () => {
    expect(completeForce(gold1[0]).未来).toBe(72);
    expect(completeForce(gold1[0]).Δ).toBe(10);
  });
  it("五力均值汇总 = 金样本数字", () => {
    expect(fiveForceSummary(gold1)).toEqual({ 五力现状: 55.2, 五力未来: 63.4, Δ: 8.2 });
  });
});

describe("deepMath VRIN 与综合分（对齐金样本）", () => {
  it("VRIN 总分求和", () => {
    expect(vrinTotal({ v: 5, r: 4, i: 4, n: 4 })).toBe(17);
  });
  it("综合分 = 机会 × VRIN/20", () => {
    expect(composite(8, 17)).toBe(6.8); // #2 IP咨询
    expect(composite(8, 16)).toBe(6.4); // #10 避坑社群
    expect(composite(9, 14)).toBe(6.3); // #6 私董会
    expect(composite(6, 14)).toBe(4.2); // #3 内训
  });
  it("Top3 按综合分降序（#2 > #10 > #6）", () => {
    const ranked = rankByComposite([
      { idx: 6, opportunity: 9, vrin: { v: 4, r: 4, i: 4, n: 2 } },
      { idx: 2, opportunity: 8, vrin: { v: 5, r: 4, i: 4, n: 4 } },
      { idx: 10, opportunity: 8, vrin: { v: 4, r: 4, i: 4, n: 4 } },
      { idx: 3, opportunity: 6, vrin: { v: 4, r: 3, i: 4, n: 3 } },
    ]);
    expect(ranked.map((r) => r.idx)).toEqual([2, 10, 6, 3]);
    expect(ranked.filter((r) => r.inTop3).map((r) => r.idx)).toEqual([2, 10, 6]);
  });
});

describe("deepMath 派生与校验", () => {
  it("机会由五力未来反推（越友好越大）", () => {
    expect(opportunityFromThreat(51.6)).toBe(8);
    expect(opportunityFromThreat(63.4)).toBe(5);
  });
  it("Step4 市场判断阈值", () => {
    expect(step4Verdict(51.6)).toBe("进入");
    expect(step4Verdict(63.4)).toBe("观察");
    expect(step4Verdict(73.4)).toBe("淘汰");
  });
  it("数值自洽校验：篡改未来会被抓出", () => {
    const bad = verifyDeepMath({
      market: [{ 方向: "测试", 五力明细: [{ 力: "行业竞争", 现状: 62, P: 0, E: 4, S: 3, T: 3, 未来: 99 }] }],
    });
    expect(bad.length).toBeGreaterThan(0);
  });
  it("数值自洽校验：正确数据通过", () => {
    expect(verifyDeepMath({ vrin: [{ 方向: "x", v: 5, r: 4, i: 4, n: 4, 机会: 8, 综合分: 6.8 }] })).toEqual([]);
  });
});
