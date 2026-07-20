import { describe, expect, it } from "vitest";
import {
  countPublishChars,
  enforceDraftCompliance,
  extractPromisedCount,
  isPublishTextWithinLimit,
  normalizeTags,
  scanDraftCompliance,
  sourceIsUsable,
  hardChecksAllowPublishing,
  analyzeDraftValidation,
  validateDraftHardChecks,
  withDraftValidation,
} from "./validation";
import type { ContentDraft } from "./types";
import { classifySourceStatus } from "./sourceValidation";

describe("growth publish validation", () => {
  function hardCheckDraft(body: string): ContentDraft {
    const timestamp = "2026-07-19T00:00:00.000Z";
    return {
      id: "hard-check", tenant_id: "tenant", account_id: "account", run_id: "run", status: "ready",
      business_line: "中高管职业决策", method_group: "native", method_id: "inventory", method_label: "盘点",
      generation_mode: "default", title_promise: "交付5项离职检查", selected_body_version: "short", raw_body_tags: [],
      tagging_status: "pending", canonical_tag_ids: [], cta_type: "on_platform_consult", validation_checks: [],
      test_variable: "清单兑现", expected_signal: "有效咨询", title: "中高管离职前查这5项", alternative_titles: [],
      target_user: "中高管", cover_text: "离职前查5项", body, hashtags: ["#中高管"], comment_prompt: "",
      word_count: { title: 12, body_and_tags: body.length, total: body.length + 12, within_limit: true },
      follow_reason: "职业判断", trust_anchor: "真实咨询", review_points: [], cover_suggestion: "办公桌",
      created_at: timestamp, updated_at: timestamp,
    };
  }

  it("只把真正的数量承诺当成逐项兑现要求", () => {
    expect(extractPromisedCount("中高管离职前查这5项")).toBe(5);
    expect(extractPromisedCount("这2条转型路，到底怎么选？")).toBe(2);
    expect(extractPromisedCount("投了15家，为何只有3个AI面")).toBeUndefined();
  });

  it("classifies live source responses", () => {
    expect(classifySourceStatus(200)).toBe("accessible");
    expect(classifySourceStatus(302)).toBe("accessible");
    expect(classifySourceStatus(403)).toBe("restricted");
    expect(classifySourceStatus(429)).toBe("restricted");
    expect(classifySourceStatus(404)).toBe("invalid");
    expect(classifySourceStatus(410)).toBe("invalid");
  });

  it("blocks publishing when numeric promises are not matched exactly", () => {
    const checks = validateDraftHardChecks(hardCheckDraft("中高管离职前先看这组冲突。\n1. 能力\n2. 现金流\n3. 市场\n4. 停止条件\n\n可在站内补充职位和路径。"), "expert");
    expect(checks.find((item) => item.key === "fulfillment")?.status).not.toBe("passed");
    expect(hardChecksAllowPublishing(checks)).toBe(false);
  });

  it("keeps only identity, fulfillment and conversion checks for a body", () => {
    const checks = validateDraftHardChecks(hardCheckDraft("中高管离职前先看这组冲突。\n1. 能力\n2. 现金流\n3. 市场\n4. 停止条件\n5. 证据\n\n可在站内补充职位和路径。"), "expert");
    expect(checks.map((item) => item.key)).toEqual(["identity", "fulfillment", "conversion"]);
    expect(checks.find((item) => item.key === "conversion")?.status).toBe("needs_edit");
    expect(hardChecksAllowPublishing(checks)).toBe(false);
  });

  it("passes conversion when professional service is naturally embedded", () => {
    const body = "中高管离职前先看这组冲突。\n1. 能力\n2. 现金流\n3. 市场\n4. 停止条件\n5. 证据\n\n后来我请职业决策顾问一起梳理，先把能力和市场机会拆开判断。最后没有立刻辞职，而是先排除了一个方向，也知道下一步该验证什么。";
    const checks = validateDraftHardChecks(hardCheckDraft(body), "expert");
    expect(checks.find((item) => item.key === "conversion")?.status).toBe("passed");
    expect(hardChecksAllowPublishing(checks)).toBe(true);

    const analysis = analyzeDraftValidation(hardCheckDraft(body), "expert", 1);
    expect(analysis.report.status).toBe("passed");
    expect(analysis.report.attempts).toBe(1);
    expect(new Set(analysis.report.annotations.map((item) => item.key))).toEqual(new Set(["identity", "fulfillment", "conversion"]));
    expect(analysis.report.annotations.find((item) => item.key === "conversion")?.quote).toContain("最后没有立刻辞职");
    for (const item of analysis.report.annotations) {
      expect(body.slice(item.start, item.end)).toBe(item.quote);
    }
  });

  it("does not pass a service mention without a restrained outcome", () => {
    const body = "中高管离职前先看这组冲突。\n1. 能力\n2. 现金流\n3. 市场\n4. 停止条件\n5. 证据\n\n后来我请职业决策顾问一起梳理，先把能力和市场机会拆开判断。";
    const checks = validateDraftHardChecks(hardCheckDraft(body), "expert");
    expect(checks.find((item) => item.key === "conversion")?.status).toBe("needs_edit");
  });

  it("rejects formulaic self-introductions even when the structure is complete", () => {
    const body = "作为职业决策顾问，我的判断是中高管离职前要先看冲突。\n1. 能力\n2. 现金流\n3. 市场\n4. 停止条件\n5. 证据\n\n有次职业咨询里，我先把能力和市场机会拆开判断。最后排除了一个方向，也知道下一步该验证什么。";
    const checks = validateDraftHardChecks(hardCheckDraft(body), "expert");
    expect(checks.find((item) => item.key === "fulfillment")?.status).toBe("needs_edit");
  });

  it("keeps the operator report failed until all three checks have exact evidence", () => {
    const draft = withDraftValidation(hardCheckDraft("中高管离职前先看这组冲突。\n1. 能力\n2. 现金流\n3. 市场\n4. 停止条件\n5. 证据"), "expert", 2);
    expect(draft.validation_report?.status).toBe("failed");
    expect(draft.validation_report?.attempts).toBe(2);
    expect(draft.validation_report?.annotations.some((item) => item.key === "conversion")).toBe(false);
  });
  it("对标来源同时要求7天内母题和24小时内快照", () => {
    const at = new Date("2026-07-19T12:00:00.000Z");
    const source = {
      id: "source", method_id: "viral_framework" as const, platform: "小红书", author: "作者",
      original_title: "原标题", original_url: "https://example.com/note",
      published_at: "2026-07-16T12:00:00.000Z", heat_snapshot: "1000赞",
      collected_at: "2026-07-19T08:00:00.000Z", link_status: "accessible" as const,
      verified_by_operator: true, freshness: "within_72h" as const,
    };
    expect(sourceIsUsable(source, at)).toBe(true);
    expect(sourceIsUsable({ ...source, collected_at: "2026-07-18T08:00:00.000Z" }, at)).toBe(false);
    expect(sourceIsUsable({ ...source, published_at: "2026-07-10T12:00:00.000Z" }, at)).toBe(false);
  });

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
      business_line: "中高管职业决策",
      method_group: "native",
      method_id: "human_pain",
      method_label: "行业人性痛点",
      generation_mode: "default",
      title_promise: "解释平台价值错觉",
      selected_body_version: "short",
      raw_body_tags: [],
      tagging_status: "pending",
      canonical_tag_ids: [],
      cta_type: "on_platform_consult",
      validation_checks: [],
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
