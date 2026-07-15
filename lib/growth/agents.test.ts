import { describe, expect, it } from "vitest";
import { buildAccountPlanUserPrompt, buildDraftUserPrompt, buildTopicPoolUserPrompt } from "./agents";
import { DEFAULT_BUSINESS_POSITIONS } from "./businessPosition";
import { PARENT_RELAY_STRUCTURE_NAME } from "./buyerCStrategy";

describe("buyer C prompts", () => {
  it("keeps auto-generated buyer positioning in concrete dramatization mode", () => {
    const prompt = buildAccountPlanUserPrompt({
      accountName: "留学生家长记录",
      persona: "buyer",
      businessTrack: "international-student-career",
      businessPosition: DEFAULT_BUSINESS_POSITIONS["international-student-career"],
      reportPrices: { lite: "199元", deep: "6999元" },
    });
    expect(prompt).toContain("只使用情景演绎");
    expect(prompt).toContain("有名有姓、有地点、有日期、有数字");
    expect(prompt).toContain("真实企业可以作为孩子关注、研究或准备投递的目标");
  });

  it("marks buyer C as this week's S-level focus", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 2,
      persona: "buyer",
      businessTrack: "international-student-career",
      targetUser: "留学生家长",
      coreProblem: "孩子第一次参加秋招",
      at: new Date("2026-07-14T12:00:00+08:00"),
    });

    expect(prompt).toContain("本周高优 · 留学生家长Offer转折");
    expect(prompt).toContain("方向 C、content_type=story");
    expect(prompt).toContain('priority="S"');
    expect(prompt).toContain("后来找专业的人带");
    expect(prompt).toContain("具体招聘单位、具体岗位、具体会场或城市");
    expect(prompt).not.toContain("template_id");
  });

  it("stops forcing the weekly focus when the window ends", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 3,
      persona: "buyer",
      businessTrack: "international-student-career",
      targetUser: "留学生家长",
      coreProblem: "孩子第一次参加秋招",
      at: new Date("2026-07-20T00:00:00+08:00"),
    });
    expect(prompt).not.toContain("本周高优 · 留学生家长Offer转折");
  });

  it("applies the parent Offer strategy to every buyer C draft", () => {
    const prompt = buildDraftUserPrompt({
      persona: "buyer",
      businessTrack: "international-student-career",
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
    expect(prompt).toContain("至少 2 组数字锚点");
    expect(prompt).toContain("不得用「某学校」「某公司」「某大厂」");
    expect(prompt).toContain("学校、招聘企业、Offer结果和会场关系必须是有名有姓的虚构设定");
    expect(prompt).toContain("【情景演绎｜根据常见留学生求职经历改编】");
    expect(prompt).toContain("真实企业可出现在孩子的投递目标清单或行业研究中");
  });

  it("adds the complete parent relay structure only when the system designates it", () => {
    const prompt = buildDraftUserPrompt({
      persona: "buyer",
      businessTrack: "international-student-career",
      targetUser: "留学生家长",
      trustSource: "家庭经历",
      direction: "C",
      contentType: "story",
      title: "一转眼，轮到老二秋招了",
      testVariable: "正文呈现方式",
      expectedSignal: "目标家长阅读",
      followReason: "继续看两个孩子的求职过程",
      structureName: PARENT_RELAY_STRUCTURE_NAME,
    });

    expect(prompt).toContain(`【本篇指定结构：${PARENT_RELAY_STRUCTURE_NAME}】`);
    expect(prompt).toContain("阶段事件");
    expect(prompt).toContain("三点家长感受");
    expect(prompt).toContain("信息差清单");
    expect(prompt).toContain("老大结果线与老二当下线要交替衔接");
  });
});
