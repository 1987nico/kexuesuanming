import { describe, expect, it } from "vitest";
import { createGrowthPreviewFixture } from "./previewFixture";
import { generateTopicBatch } from "./runner";
import type { TopicSourceSnapshot } from "./types";

describe("direct benchmark title delivery", () => {
  it("uses the real source title verbatim without structure migration or title generation", async () => {
    const fixture = createGrowthPreviewFixture();
    const base = fixture.accounts.find((item) => item.business_line === "executive" && item.persona === "buyer");
    expect(base).toBeTruthy();
    const timestamp = new Date().toISOString();
    const source: TopicSourceSnapshot = {
      id: "direct-source",
      method_id: "viral_framework",
      platform: "小红书",
      author: "真实作者",
      original_title: "中高管缺的不是机会，是判断机会的能力",
      original_url: "https://www.xiaohongshu.com/explore/direct-source",
      published_at: timestamp,
      heat_snapshot: "互动1万",
      collected_at: timestamp,
      migration_note: "已匹配中高管业务、买家视角和当前账号人设；原标题直接采用。",
      link_status: "accessible",
      verified_by_operator: true,
      freshness: "within_72h",
    };
    const account = { ...base!, topic_sources: [source] };

    const result = await generateTopicBatch({
      account,
      generationMode: "default",
      methodIds: ["viral_framework"],
      allowSourcePause: true,
    });

    expect(result.generationAttempts).toBe(0);
    expect(result.structureCards).toEqual([]);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]).toMatchObject({
      title: source.original_title,
      benchmark_title_mode: "direct_source",
      source_snapshot: source,
      migration_validation_evidence: "直接采用真实原标题，未进行标题迁移或改写。",
    });
  });
});
