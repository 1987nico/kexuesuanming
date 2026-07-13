import { describe, expect, it } from "vitest";
import {
  countPublishChars,
  enforceDraftCompliance,
  isPublishTextWithinLimit,
  normalizeTags,
  scanDraftCompliance,
} from "./validation";
import type { ContentDraft } from "./types";

describe("growth publish validation", () => {
  it("normalizes hashtags and keeps at most five", () => {
    expect(normalizeTags(["中高层转型", "#第二曲线", "小红书运营", "IP", "报告", "多余"])).toEqual([
      "#中高层转型",
      "#第二曲线",
      "#小红书运营",
      "#IP",
      "#报告",
    ]);
  });

  it("accepts publish text at the 1000 character boundary", () => {
    const title = "标题";
    const body = "一".repeat(992);
    const hashtags = ["#A", "#B"];
    const result = countPublishChars(title, body, hashtags);

    expect(result.total).toBe(1000);
    expect(result.within_limit).toBe(true);
    expect(isPublishTextWithinLimit(title, body, hashtags)).toBe(true);
  });

  it("rejects publish text above the 1000 character boundary", () => {
    const title = "标题";
    const body = "一".repeat(993);
    const hashtags = ["#A", "#B"];
    const result = countPublishChars(title, body, hashtags);

    expect(result.total).toBe(1001);
    expect(result.within_limit).toBe(false);
    expect(isPublishTextWithinLimit(title, body, hashtags)).toBe(false);
  });

  it("detects the comment-keyword-for-sample pattern from enforcement notices", () => {
    const issues = scanDraftCompliance({
      title: "离开平台，你到底值多少？",
      cover_text: "离开平台，你到底值多少？",
      body: "需要职业方向体检的可以评论区扣「1」，我发你匿名交付样例参考。",
      comment_prompt: "评论区扣1",
      hashtags: ["#职业方向决策"],
    });

    expect(issues.map((issue) => issue.code)).toContain("keyword_comment");
    expect(issues.map((issue) => issue.code)).toContain("interaction_exchange");
  });

  it("does not flag ordinary analysis of engagement metrics", () => {
    expect(
      scanDraftCompliance({
        title: "离开平台，你到底值多少？",
        cover_text: "平台价值自查",
        body: "不要用点赞和收藏代替真实需求。先看客户是否愿意为你的判断付费。",
        comment_prompt: "你更担心能力不能迁移，还是资源不能迁移？",
        hashtags: ["#职业方向决策"],
      }),
    ).toEqual([]);
  });

  it.each([
    "点赞接好运，关注我还有惊喜",
    "评论区留言参与抽奖",
    "免费送福利，关注后评论领取",
    "私信我拿完整报告",
  ])("detects other interaction-inducement examples: %s", (body) => {
    expect(
      scanDraftCompliance({
        title: "职业转型自查",
        cover_text: "职业转型自查",
        body,
        comment_prompt: "你最想先验证哪一项？",
        hashtags: ["#职业方向决策"],
      }).length,
    ).toBeGreaterThan(0);
  });

  it("removes risky CTA sentences and keeps a publishable draft", () => {
    const timestamp = new Date().toISOString();
    const draft: ContentDraft = {
      id: "draft-1",
      tenant_id: "tenant",
      account_id: "account",
      run_id: "run",
      status: "draft",
      direction: "A",
      content_type: "diagnostic",
      test_variable: "平台价值",
      expected_signal: "读者能完成自查",
      title: "离开平台，你到底值多少？",
      alternative_titles: ["你的价值属于谁？"],
      target_user: "中高管",
      cover_text: "平台价值自查",
      body:
        "很多中高管的职业焦虑，本质是平台价值错觉。先写下离开公司后你能带走的客户、资源和信任。\n\n需要职业方向体检的可以评论区扣「1」，我发你匿名交付样例参考。",
      hashtags: ["#职业方向决策"],
      comment_prompt: "评论区扣1，我发你样例",
      word_count: { title: 0, body_and_tags: 0, total: 0, within_limit: true },
      follow_reason: "持续拆解决策框架",
      trust_anchor: "真实案例",
      review_points: ["阅读"],
      cover_suggestion: "办公桌",
      created_at: timestamp,
      updated_at: timestamp,
    };

    const checked = enforceDraftCompliance(draft);

    expect(checked.compliance?.status).toBe("rewritten");
    expect(checked.body).not.toContain("评论区扣");
    expect(checked.comment_prompt).toBe("你更担心能力不能迁移，还是资源不能迁移？");
    expect(scanDraftCompliance(checked)).toEqual([]);
  });
});
