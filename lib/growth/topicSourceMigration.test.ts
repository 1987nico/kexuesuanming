import { describe, expect, it } from "vitest";
import { buildTopicPoolUserPrompt } from "./agents";
import { TITLE_METHOD_BY_ID } from "./methods";
import type { BenchmarkStructureCard, TopicSourceSnapshot } from "./types";

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

const structureCard: BenchmarkStructureCard = {
  id: "card-1",
  account_id: "account-1",
  business_line: "executive",
  persona: "buyer",
  method_id: "viral_framework",
  source_id: source.id,
  source_url: source.original_url,
  source_title: source.original_title,
  source_author: source.author,
  sentence_structure: "你缺的不是A，而是B",
  conflict_structure: "表面缺少机会，实际缺少持续推进能力",
  audience_situation: "已经在转型，但行动很多仍没有明确进展",
  emotional_hook: "指出努力方向可能错了",
  promised_result: "帮助读者识别真正阻碍转型的变量",
  inheritable_element: "先否定表层问题，再指出深层能力",
  replacement_requirement: "把客户与跟进能力替换为中高管转型中的真实变量",
  forbidden_copy_elements: ["客户", "跟进客户"],
  source_fit_status: "passed",
  source_fit_reason: "爆款框架可迁移到职业决策场景",
  status: "locked",
  structure_version: "v3_7",
  generated_at: "2026-07-22T01:00:00.000Z",
  expires_at: "2026-07-23T01:00:00.000Z",
};

describe("来源型标题生成合同", () => {
  it("标题生成阶段只接收锁定结构卡，不再看到或解释原题", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.viral_framework],
      generationMode: "default",
      sources: [source],
      structureCards: [structureCard],
    });
    expect(prompt).toContain("来源型方法已经在上一步完成母题拆解");
    expect(prompt).toContain("只能使用“已锁定结构卡”生成");
    expect(prompt).toContain(structureCard.sentence_structure);
    expect(prompt).toContain(structureCard.replacement_requirement);
    expect(prompt).not.toContain(source.original_title);
    expect(prompt).not.toContain('"source_usage"');
  });

  it("来源存在但没有锁定结构卡时，明确禁止生成该方法标题", () => {
    const prompt = buildTopicPoolUserPrompt({
      week: 1,
      targetUser: "转型中的中高管",
      coreProblem: "方向不清晰",
      persona: "buyer",
      methods: [TITLE_METHOD_BY_ID.viral_framework],
      generationMode: "default",
      sources: [source],
      structureCards: [],
    });
    expect(prompt).toContain("没有锁定结构卡；不得为它生成标题");
    expect(prompt).not.toContain(source.original_title);
  });
});
