import { describe, expect, it } from "vitest";
import { buildTopicPoolUserPrompt } from "./agents";
import { TITLE_METHOD_BY_ID } from "./methods";
import type { TopicSourceSnapshot } from "./types";

const source: TopicSourceSnapshot = {
  id: "source-1",
  method_id: "viral_framework",
  platform: "小红书",
  author: "作者",
  original_title: "你缺的不是客户，是跟进客户的能力",
  original_url: "https://example.com/note",
  published_at: "2026-07-21T00:00:00.000Z",
  heat_snapshot: "互动1万",
  collected_at: "2026-07-22T00:00:00.000Z",
  migration_note: "迁移‘缺的不是A，是B’冲突结构",
  link_status: "accessible",
  verified_by_operator: true,
  freshness: "within_72h",
};

describe("来源型标题生成合同", () => {
  it("明确要求真实迁移母题并输出仅供本次校验的来源使用说明", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.viral_framework],
      generationMode: "default",
      sources: [source],
    });
    expect(prompt).toContain("不能只把母题当作来源附件");
    expect(prompt).toContain("爆款框架迁移句式与冲突结构");
    expect(prompt).toContain('"source_usage"');
    expect(prompt).toContain(source.original_title);
  });
});
