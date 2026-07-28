import { describe, expect, it } from "vitest";
import { createGrowthPreviewFixture } from "./previewFixture";
import {
  ensureRecentTopicSources,
  normalizeRedFoxNotes,
  redFoxRankDate,
  REDFOX_FETCH_TIMEOUT_MS,
  selectDeterministicSources,
  SOURCE_LINK_TIMEOUT_MS,
} from "./sourceDiscovery";
import type { TopicSourceSnapshot } from "./types";

function freshSource(methodId: TopicSourceSnapshot["method_id"]): TopicSourceSnapshot {
  const now = new Date().toISOString();
  return {
    id: `fresh-${methodId}`,
    method_id: methodId,
    platform: "小红书",
    author: "测试作者",
    original_title: "别急着辞职，先把这三笔账算清",
    original_url: `https://www.xiaohongshu.com/explore/fresh-${methodId}`,
    published_at: now,
    heat_snapshot: "互动1000",
    collected_at: now,
    migration_note: "只迁移标题结构。",
    link_status: "accessible",
    verified_by_operator: true,
    freshness: "within_72h",
  };
}

describe("RedFox Xiaohongshu source discovery", () => {
  it("uses the latest available ranking date in Asia/Shanghai", () => {
    expect(redFoxRankDate(new Date("2026-07-20T10:00:00Z"))).toBe("2026-07-18");
    expect(redFoxRankDate(new Date("2026-07-20T12:00:00Z"))).toBe("2026-07-19");
  });

  it("normalizes real ranking fields into traceable source candidates", () => {
    const notes = normalizeRedFoxNotes({
      code: 2000,
      data: [{
        title: "普通人上班不痛苦的唯一解法",
        desc: "一条职业发展笔记",
        userName: "帽子糊",
        photoJumpUrl: "https://www.xiaohongshu.com/explore/6a5a31b6000000001003da43",
        publicTime: "2026-07-17 18:30:00",
        anaAdd: {
          interactiveCount: "7698",
          addInteractiveount: "7544",
          useLikeCount: "4195",
          collectedCount: "3450",
          useCommentCount: "53",
          useShareCount: "272",
        },
      }],
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      rank: 1,
      title: "普通人上班不痛苦的唯一解法",
      author: "帽子糊",
      published_at: "2026-07-17T10:30:00.000Z",
    });
    expect(notes[0].heat_snapshot).toContain("互动7698");
    expect(notes[0].heat_snapshot).toContain("享272");
  });

  it("drops records without a title, author, date or real Xiaohongshu note link", () => {
    expect(normalizeRedFoxNotes({ data: [{
      title: "",
      userName: "作者",
      photoJumpUrl: "https://example.com/fake",
      publicTime: "2026-07-17 18:30:00",
    }] })).toEqual([]);
  });

  it("uses bounded network budgets instead of adding a source-selection model call", () => {
    expect(REDFOX_FETCH_TIMEOUT_MS).toBe(8_000);
    expect(SOURCE_LINK_TIMEOUT_MS).toBe(4_000);
  });

  it("selects sources deterministically and only when each source fits its method", () => {
    const notes = normalizeRedFoxNotes({
      code: 2000,
      data: [
        {
          title: "职业规划咨询前，先问这3件事",
          desc: "给想转型的中高管做职业咨询时，先确认目标和风险。",
          userName: "职业顾问",
          photoJumpUrl: "https://www.xiaohongshu.com/explore/product-fit",
          publicTime: "2026-07-17 18:30:00",
          anaAdd: {},
        },
        {
          title: "转型前怎么判断方向？这份清单先收好",
          desc: "职场转型前先比较选择和风险。",
          userName: "职场笔记",
          photoJumpUrl: "https://www.xiaohongshu.com/explore/effect-fit",
          publicTime: "2026-07-17 18:20:00",
          anaAdd: {},
        },
        {
          title: "35岁中层转型前，最容易忽略的一件事",
          desc: "中层管理者在职业变化期的共同压力。",
          userName: "管理者说",
          photoJumpUrl: "https://www.xiaohongshu.com/explore/audience-fit",
          publicTime: "2026-07-17 18:10:00",
          anaAdd: {},
        },
      ],
    });
    const methods = ["same_product", "same_effect", "similar_audience"] as const;
    const first = selectDeterministicSources(notes, "executive", [...methods]);
    const second = selectDeterministicSources(notes, "executive", [...methods]);

    expect([...first.entries()].map(([methodId, selection]) => [methodId, selection.note.original_url]))
      .toEqual([...second.entries()].map(([methodId, selection]) => [methodId, selection.note.original_url]));
    expect(first.get("same_product")?.note.original_url).toContain("product-fit");
    expect(first.get("same_effect")?.note.original_url).toContain("effect-fit");
    expect(first.get("similar_audience")?.note.original_url).toContain("audience-fit");
    expect(new Set([...first.values()].map((selection) => selection.note.original_url)).size).toBe(3);
  });

  it("does not fetch any source unless the caller explicitly names source methods", async () => {
    const fixture = createGrowthPreviewFixture();
    const account = fixture.accounts.find((item) => item.business_line === "executive" && item.persona === "buyer");
    expect(account).toBeTruthy();

    const result = await ensureRecentTopicSources(account!);

    expect(result.summary).toMatchObject({
      status: "cached",
      fetched_count: 0,
      selected_count: 0,
    });
    expect(result.summary.message).toContain("未指定");
  });

  it("reuses a valid unused source without calling the daily ranking service", async () => {
    const fixture = createGrowthPreviewFixture();
    const base = fixture.accounts.find((item) => item.business_line === "executive" && item.persona === "buyer");
    expect(base).toBeTruthy();
    const account = { ...base!, topic_sources: [freshSource("viral_framework")] };

    const result = await ensureRecentTopicSources(account, { methodIds: ["viral_framework"] });

    expect(result.summary).toMatchObject({
      status: "cached",
      fetched_count: 0,
      selected_count: 1,
      usable_count: 1,
    });
    expect(result.summary.message).toContain("不重复请求热榜");
  });

  if (process.env.RUN_LIVE_SOURCE_DISCOVERY === "1") {
    it("fetches and validates live career-ranking sources", async () => {
      const fixture = createGrowthPreviewFixture();
      const account = fixture.accounts.find((item) => item.business_line === "executive" && item.persona === "buyer");
      expect(account).toBeTruthy();
      const result = await ensureRecentTopicSources(account!, {
        methodIds: ["traffic", "same_product", "same_effect", "similar_audience", "same_outcome", "viral_framework"],
      });
      expect(result.summary.status).toBe("refreshed");
      expect(result.summary.fetched_count).toBeGreaterThan(0);
      expect(result.summary.selected_count).toBeGreaterThanOrEqual(4);
      expect(result.summary.usable_count).toBeGreaterThan(0);
      expect(result.account.topic_sources?.some((source) => source.source_provider === "redfox_daily")).toBe(true);
    }, 60_000);
  }
});
