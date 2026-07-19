import { describe, expect, it } from "vitest";
import { createGrowthPreviewFixture } from "./previewFixture";
import { ensureRecentTopicSources, normalizeRedFoxNotes, redFoxRankDate } from "./sourceDiscovery";

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

  if (process.env.RUN_LIVE_SOURCE_DISCOVERY === "1") {
    it("fetches and validates live career-ranking sources", async () => {
      const fixture = createGrowthPreviewFixture();
      const account = fixture.accounts.find((item) => item.business_line === "executive" && item.persona === "buyer");
      expect(account).toBeTruthy();
      const result = await ensureRecentTopicSources(account!);
      expect(result.summary.status).toBe("refreshed");
      expect(result.summary.fetched_count).toBeGreaterThan(0);
      expect(result.summary.selected_count).toBeGreaterThanOrEqual(4);
      expect(result.summary.usable_count).toBeGreaterThan(0);
      expect(result.account.topic_sources?.some((source) => source.source_provider === "redfox_daily")).toBe(true);
    }, 60_000);
  }
});
