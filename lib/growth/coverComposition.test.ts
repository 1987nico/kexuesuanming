import { describe, expect, it } from "vitest";
import { buildBuyerCCoverOverlay, splitCoverHeadline } from "./coverComposition";

describe("buyer C cover composition", () => {
  it("extracts a concrete company and role from real case material", () => {
    const overlay = buildBuyerCCoverOverlay({
      title: "一转眼，轮到老二秋招了",
      coverText: "老大已拿Offer 老二刚进秋招场",
      caseMode: "真实案例",
      caseMaterial: "中国石油数据分析师岗位，已收到录用通知，工作地点北京。",
    });

    expect(overlay.companyLine).toContain("中国石油");
    expect(overlay.venueBanner).toContain("2026届留学生招聘会");
    expect(overlay.emailRows.join(" ")).toContain("数据分析师");
    expect(overlay.disclosure).toContain("AI场景合成");
  });

  it("keeps a real-company fictional scene visibly marked", () => {
    const overlay = buildBuyerCCoverOverlay({
      title: "轮到老二秋招了",
      caseMode: "情景演绎",
      caseMaterial: "腾讯产品经理Offer场景",
    });

    expect(overlay.companyName).toBe("腾讯求职情景");
    expect(overlay.disclosure).toBe("情景演绎 / 示意图");
  });

  it("splits the headline into the two-line reference layout", () => {
    expect(splitCoverHeadline("老大已拿心仪Offer 老二刚进秋招场")).toEqual([
      "老大已拿心仪Offer",
      "老二刚进秋招场",
    ]);
  });
});
