import { describe, expect, it } from "vitest";
import type { ContentDraft, GrowthAccount, GrowthReview, GrowthReviewMetrics, TitleMethodId } from "./types";
import { buildLearningBrief, buildWeeklyReviewResult, canonicalizeReviews, computeDerivedMetrics, evaluateReviewSample, getReviewAvailability } from "./reviewLearning";

const NOW = new Date("2026-07-19T12:00:00.000Z");
const account: GrowthAccount = { id: "account", tenant_id: "mianbajun", persona: "expert", name: "面霸君", target_user: "中高管", core_problem: "职业方向", account_value: "判断框架", trust_source: "真实咨询", not_doing: "不做泛流量", hypotheses: [], created_at: "2026-06-01T00:00:00.000Z", updated_at: NOW.toISOString() };

function draft(index: number, method: TitleMethodId = "human_pain", mode: "default" | "explore" = "default"): ContentDraft {
  const published = new Date(NOW.getTime() - (2 + index / 100) * 86_400_000).toISOString();
  return {
    id: `draft-${index}`, tenant_id: "mianbajun", account_id: account.id, run_id: "run", status: "reviewed", business_line: "中高管职业决策",
    method_group: ["same_product", "same_effect", "similar_audience", "same_outcome", "viral_framework"].includes(method) ? "benchmark" : "native",
    method_id: method, method_label: method, generation_mode: mode, title_promise: "兑现判断", selected_body_version: "short",
    raw_body_tags: [{ id: `tag-${index}`, text: index % 2 ? "双路径比较" : "决策自查", reason: "正文依据", generated_at: published, body_version: "short" }],
    tagging_status: "tagged", canonical_tag_ids: [], cta_type: "on_platform_consult", validation_checks: [],
    test_variable: "标题入口", expected_signal: "有效咨询", title: `测试标题${index}`, alternative_titles: [], target_user: "中高管", cover_text: "封面", body: "正文内容足够长，围绕标题承诺展开。", hashtags: [], comment_prompt: "", word_count: { title: 5, body_and_tags: 20, total: 25, within_limit: true }, follow_reason: "", trust_anchor: "", review_points: [], cover_suggestion: "", published_at: published, created_at: published, updated_at: published,
  };
}

function review(note: ContentDraft, index: number, inquiry = 3, overrides: Partial<GrowthReviewMetrics> = {}): GrowthReview {
  const metrics: GrowthReviewMetrics = { published_at: note.published_at, snapshot_at: NOW.toISOString(), note_url: `https://example.com/${index}`, note_status: "normal", promoted: false, impressions: 10_000, reads: 2_000, average_view_seconds: 40, likes: 100, saves: 100, comments: 20, shares: 30, follows: 15, qualified_inquiries: inquiry, ...overrides };
  return { id: `review-${index}`, tenant_id: "mianbajun", draft_id: note.id, metrics, derived_metrics: computeDerivedMetrics(metrics), sample: evaluateReviewSample(metrics, note.published_at, NOW), classification: "retest", entry_judgement: "入口结论", body_judgement: "正文结论", value_judgement: "价值结论", follow_judgement: "咨询结论", audience_judgement: "人群结论", next_variable: "只改标题", experiment_variable: "title_cover", manager_instruction: "周证据", topic_instruction: "选题要求", writer_instruction: "写作要求", created_at: NOW.toISOString(), updated_at: NOW.toISOString() };
}

describe("有效样本口径", () => {
  it("满24小时才开放", () => {
    const published = "2026-07-18T12:00:00.000Z";
    expect(getReviewAvailability(published, new Date("2026-07-19T11:59:00.000Z")).ready).toBe(false);
    expect(getReviewAvailability(published, NOW).ready).toBe(true);
  });

  it("必须有原帖链接、投流状态、500曝光和50阅读", () => {
    const base: GrowthReviewMetrics = { published_at: "2026-07-18T00:00:00.000Z", note_url: "https://example.com/note", note_status: "normal", promoted: false, impressions: 1000, reads: 100, likes: 10, saves: 5, comments: 2, shares: 3, follows: 1, qualified_inquiries: 1 };
    expect(computeDerivedMetrics(base).inquiry_rate).toBe(0.01);
    expect(evaluateReviewSample(base, base.published_at, NOW).status).toBe("valid");
    expect(evaluateReviewSample({ ...base, note_url: undefined }, base.published_at, NOW).status).toBe("historical_unknown");
    expect(evaluateReviewSample({ ...base, promoted: true }, base.published_at, NOW).status).toBe("paid");
    expect(evaluateReviewSample({ ...base, reads: 49 }, base.published_at, NOW).status).toBe("low_sample");
  });

  it("同篇只保留最新复盘", () => {
    const note = draft(1); const old = review(note, 1); const latest = { ...old, id: "latest", updated_at: "2026-07-19T13:00:00.000Z" };
    expect(canonicalizeReviews([old, latest])).toEqual([latest]);
  });
});

describe("方法与开放标签复盘", () => {
  it("legacy samples never enter the new method baseline", () => {
    const legacy = { ...draft(99), schema_version: "legacy_v1" as const, eligible_for_method_learning: false };
    const weekly = buildWeeklyReviewResult({ account, notes: [legacy], reviews: [review(legacy, 99)], at: NOW });
    expect(weekly.eligible_total).toBe(0);
    expect(weekly.by_method).toEqual([]);
  });

  it("unpublished tags do not enter tag learning", () => {
    const ready = { ...draft(98), status: "ready" as const, published_at: undefined };
    const weekly = buildWeeklyReviewResult({ account, notes: [ready], reviews: [], at: NOW });
    expect(weekly.by_tag).toEqual([]);
  });
  it("30篇有效样本前只描述数据", () => {
    const notes = [draft(1), draft(2, "nostalgia", "explore")];
    const weekly = buildWeeklyReviewResult({
      account,
      notes,
      reviews: notes.map((note, index) => review(note, index, 3, {
        profile_visits: 80,
        diagnosis_199_sales: 1,
        deep_6999_sales: 1,
      })),
      at: NOW,
    });
    expect(weekly.eligible_total).toBe(2);
    expect(weekly.by_direction).toEqual([]);
    expect(weekly.decision.scale_direction).toContain("不足30篇");
    expect(weekly.promotion_suggestions).toEqual([]);
    expect(weekly.by_tag.length).toBe(2);
    expect(weekly.by_method[0]).toMatchObject({
      median_impressions: 10_000,
      median_reads: 2_000,
      median_saves: 100,
      median_shares: 30,
      median_profile_visits: 80,
      median_sales: 2,
    });
  });

  it("探索方法只有连续两周期超过中位数才提出人工晋升", () => {
    const exploreNotes = Array.from({ length: 5 }, (_, index) => draft(index + 1, "nostalgia", "explore"));
    const defaultNotes = Array.from({ length: 25 }, (_, index) => draft(index + 10, "human_pain", "default"));
    const notes = [...exploreNotes, ...defaultNotes];
    const reviews = [...exploreNotes.map((note, index) => review(note, index, 20)), ...defaultNotes.map((note, index) => review(note, index + 10, 1))];
    const previous = { ...buildWeeklyReviewResult({ account, notes, reviews, at: NOW }), generated_at: new Date(NOW.getTime() - 8 * 86_400_000).toISOString() };
    const weekly = buildWeeklyReviewResult({ account, notes, reviews, previous, at: NOW });
    expect(weekly.eligible_total).toBe(30);
    expect(weekly.promotion_suggestions.map((item) => item.method_id)).toContain("nostalgia");
  });

  it("学习简报按方法读取证据", () => {
    const notes = [draft(1), draft(2)]; const reviews = notes.map((note, index) => review(note, index));
    const weekly = buildWeeklyReviewResult({ account, notes, reviews, at: NOW });
    const brief = buildLearningBrief({ account, notes, reviews, weekly, methodId: "human_pain" });
    expect(brief.trace.source_review_ids.length).toBeGreaterThan(0);
    expect(brief.body_guidance.length).toBeGreaterThan(0);
  });
});
