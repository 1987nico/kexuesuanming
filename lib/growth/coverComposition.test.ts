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

  it("marks a parent relay cover and ignores real target companies as proof", () => {
    const overlay = buildBuyerCCoverOverlay({
      title: "一转眼，轮到老二进终面了",
      structureName: "家长双线接力体",
      caseMode: "情景演绎",
      body: "我们研究过中国石油、阿里巴巴和腾讯。老二在锦岳消费科技（虚构）终面，A18号；老大收到澄海数字科技（虚构）杭州用户策略岗Offer，年薪34.2万元。",
    });

    expect(overlay.imageLabel).toBe("家长双线接力体图片");
    expect(overlay.companyName).toBe("锦岳消费科技（虚构）");
    expect(overlay.emailSender).toBe("澄海数字科技（虚构）");
    expect(overlay.emailRows.join(" ")).toContain("34.2万元");
    expect(overlay.emailRows.join(" ")).not.toContain("中国石油");
  });
});
