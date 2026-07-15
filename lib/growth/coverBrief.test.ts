import { describe, expect, it } from "vitest";
import { buildCoverBrief } from "./coverBrief";

describe("growth cover brief", () => {
  it("builds a practical cover brief for tool posts", () => {
    const brief = buildCoverBrief({
      title: "中高层做内容先写目标客户判断表",
      targetUser: "中高层、创业者",
      contentType: "tool",
      testVariable: "工具收藏价值",
    });

    expect(brief.coverText.length).toBeLessThanOrEqual(18);
    expect(brief.scene).toContain("判断表");
    expect(brief.imagePrompt).toContain("9:16");
    expect(brief.negativePrompt).toContain("不要玄学符号");
  });

  it("uses the explicit cover text when provided", () => {
    const brief = buildCoverBrief({ title: "一个很长的标题", coverText: "先判断目标客户" });
    expect(brief.coverText).toBe("先判断目标客户");
    expect(brief.overlayGuidance).toContain("先判断目标客户");
  });

  it("builds a wild onsite buyer C cover with deterministic signage and email overlays", () => {
    const brief = buildCoverBrief({
      title: "一转眼，轮到老二秋招了",
      buyerC: true,
      caseMode: "真实案例",
      caseMaterial: "中国石油数据分析岗；老大拿到Offer；老二参加秋招。",
      styleHint: "招聘现场版",
    });

    expect(brief.scene).toContain("招聘会入口");
    expect(brief.scene).toContain("成年留学生");
    expect(brief.imagePrompt).toContain("不要生成任何文字");
    expect(brief.negativePrompt).toContain("不要伪造Offer");
    expect(brief.overlay?.companyLine).toContain("中国石油");
    expect(brief.overlay?.emailSubject).toContain("Offer Notification");
  });

  it("keeps the fictional disclosure in deterministic overlay guidance", () => {
    const brief = buildCoverBrief({
      title: "一转眼，轮到老二秋招了",
      buyerC: true,
      caseMode: "情景演绎",
      styleHint: "结果对照版",
    });

    expect(brief.scene).toContain("低头看手机");
    expect(brief.overlayGuidance).toContain("情景演绎 / 示意图");
    expect(brief.negativePrompt).toContain("不要真实企业或学校标识");
  });
});
