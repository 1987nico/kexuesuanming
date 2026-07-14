import { describe, expect, it } from "vitest";
import { buildAccountPlanUserPrompt, buildDraftUserPrompt, buildTopicPoolUserPrompt } from "./agents";

describe("buyer C prompts", () => {
  it("defaults auto-generated buyer positioning to dramatization with only two case fields", () => {
    const prompt = buildAccountPlanUserPrompt({
      accountName: "留学生家长记录",
      persona: "buyer",
      reportPrices: { lite: "199元", deep: "6999元" },
    });
    expect(prompt).toContain("case_mode 默认填写「情景演绎」");
    expect(prompt).toContain("case_mode 和 case_material");
    expect(prompt).toContain("不得自行编造");
  });

  it("marks buyer C as this week's S-level focus", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 2,
      persona: "buyer",
      targetUser: "留学生家长",
      coreProblem: "孩子第一次参加秋招",
      at: new Date("2026-07-14T12:00:00+08:00"),
    });

    expect(prompt).toContain("本周高优 · 留学生家长Offer转折");
    expect(prompt).toContain("方向 C、content_type=story");
    expect(prompt).toContain('priority="S"');
    expect(prompt).toContain("后来找专业的人带");
    expect(prompt).not.toContain("template_id");
  });

  it("stops forcing the weekly focus when the window ends", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 3,
      persona: "buyer",
      targetUser: "留学生家长",
      coreProblem: "孩子第一次参加秋招",
      at: new Date("2026-07-20T00:00:00+08:00"),
    });
    expect(prompt).not.toContain("本周高优 · 留学生家长Offer转折");
  });

  it("applies the parent Offer strategy to every buyer C draft", () => {
    const prompt = buildDraftUserPrompt({
      persona: "buyer",
      targetUser: "留学生家长",
      trustSource: "家庭经历",
      direction: "C",
      contentType: "story",
      title: "一转眼，轮到老二秋招了",
      testVariable: "Offer现场对照",
      expectedSignal: "目标家长阅读",
      followReason: "继续看两个孩子的求职过程",
    });

    expect(prompt).toContain("留学生家长＋企业Offer");
    expect(prompt).toContain("鼓励使用「后来找专业的人带」");
    expect(prompt).toContain("不做评论、私信、资料领取或销售引导");
    expect(prompt).toContain("【情景演绎｜根据常见留学生求职经历改编】");
    expect(prompt).toContain("虚构企业不得使用真实公司名称或近似Logo");
  });
});
