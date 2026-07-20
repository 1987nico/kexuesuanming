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
    const brief = buildCoverBrief({
      title: "一个很长的标题",
      coverText: "先判断目标客户",
    });

    expect(brief.coverText).toBe("先判断目标客户");
    expect(brief.overlayGuidance).toContain("先判断目标客户");
  });
});
