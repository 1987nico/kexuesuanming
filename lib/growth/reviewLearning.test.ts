import { describe, expect, it } from "vitest";
import type { ContentDraft, GrowthAccount, GrowthReview, GrowthReviewMetrics } from "./types";
import {
  buildLearningBrief,
  buildWeeklyReviewResult,
  canonicalizeReviews,
  computeDerivedMetrics,
  evaluateReviewSample,
  getReviewAvailability,
} from "./reviewLearning";

const NOW = new Date("2026-07-13T12:00:00.000Z");

const account: GrowthAccount = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "mianbajun",
  persona: "expert",
  name: "面霸君",
  target_user: "中高管",
  core_problem: "职业方向决策",
  account_value: "提供判断框架",
  trust_source: "真实咨询案例",
  not_doing: "不做泛流量",
  hypotheses: [],
  content_directions: ["平台价值错觉", "职业方向工具", "真实转型故事"],
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: NOW.toISOString(),
};

function draft(index: number, direction: "A" | "B" | "C" = "A"): ContentDraft {
  const publishedAt = new Date(NOW.getTime() - (2 + index / 100) * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    tenant_id: "mianbajun",
    account_id: account.id,
    run_id: "22222222-2222-4222-8222-222222222222",
    status: "reviewed",
    direction,
    content_type: "diagnostic",
    test_variable: "标题入口",
    expected_signal: "点击与收藏",
    title: `测试标题${index}`,
    alternative_titles: [],
    target_user: "中高管",
    cover_text: "测试封面",
    body: "测试正文",
    hashtags: [],
    comment_prompt: "",
    word_count: { title: 5, body_and_tags: 4, total: 9, within_limit: true },
    follow_reason: "",
    trust_anchor: "",
    review_points: [],
    cover_suggestion: "",
    published_at: publishedAt,
    created_at: publishedAt,
    updated_at: publishedAt,
  };
}

function review(note: ContentDraft, index: number, overrides: Partial<GrowthReviewMetrics> = {}): GrowthReview {
  const metrics: GrowthReviewMetrics = {
    published_at: note.published_at,
    snapshot_at: new Date(Date.parse(note.published_at!) + 24 * 60 * 60 * 1000).toISOString(),
    note_status: "normal",
    promoted: false,
    input_source: "manual",
    impressions: 10_000,
    reads: 2_000,
    average_view_seconds: 40,
    likes: 100,
    saves: 120 - index,
    comments: 20,
    shares: 30,
    follows: 15,
    qualified_inquiries: 3,
    ...overrides,
  };
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    tenant_id: "mianbajun",
    draft_id: note.id,
    metrics,
    derived_metrics: computeDerivedMetrics(metrics),
    sample: evaluateReviewSample(metrics, note.published_at, NOW),
    classification: "retest",
    entry_judgement: `入口结论${index}`,
    body_judgement: `正文结论${index}`,
    value_judgement: `价值结论${index}`,
    follow_judgement: `关注结论${index}`,
    audience_judgement: `人群结论${index}`,
    next_variable: "下一篇只改标题",
    experiment_variable: "title_cover",
    manager_instruction: `周证据${index}`,
    topic_instruction: `选题要求${index}`,
    writer_instruction: `写作要求${index}`,
    created_at: metrics.snapshot_at!,
    updated_at: metrics.snapshot_at!,
  };
}

describe("24小时单篇复盘", () => {
  it("23小时59分不可复盘，满24小时才开放", () => {
    const publishedAt = "2026-07-12T12:00:00.000Z";
    expect(getReviewAvailability(publishedAt, new Date("2026-07-13T11:59:00.000Z")).ready).toBe(false);
    expect(getReviewAvailability(publishedAt, NOW).ready).toBe(true);
  });

  it("服务器重新计算比例并过滤无效样本", () => {
    const metrics: GrowthReviewMetrics = {
      published_at: "2026-07-12T00:00:00.000Z",
      note_status: "normal",
      promoted: false,
      impressions: 1000,
      reads: 100,
      likes: 10,
      saves: 5,
      comments: 2,
      shares: 3,
      follows: 1,
      qualified_inquiries: 1,
    };
    expect(computeDerivedMetrics(metrics)).toMatchObject({ ctr: 0.1, save_rate: 0.05, inquiry_rate: 0.01 });
    expect(evaluateReviewSample(metrics, metrics.published_at, NOW).strategy_eligible).toBe(true);
    expect(evaluateReviewSample({ ...metrics, promoted: true }, metrics.published_at, NOW).status).toBe("paid");
    expect(evaluateReviewSample({ ...metrics, reads: 49 }, metrics.published_at, NOW).status).toBe("low_sample");
    expect(evaluateReviewSample({ ...metrics, note_status: "limited" }, metrics.published_at, NOW).status).toBe("limited");
  });

  it("同一篇笔记只读取最新复盘", () => {
    const note = draft(1);
    const oldReview = review(note, 1);
    const newReview = { ...oldReview, id: "new", updated_at: "2026-07-13T11:00:00.000Z" };
    const canonical = canonicalizeReviews([oldReview, newReview]);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].id).toBe("new");
  });
});

describe("周复盘与内容进化", () => {
  it("样本不足时只探索，不允许暂停方向", () => {
    const notes = [draft(1, "A"), draft(2, "B")];
    const weekly = buildWeeklyReviewResult({ account, notes, reviews: notes.map((note, index) => review(note, index)), at: NOW });
    expect(weekly.eligible_total).toBe(2);
    expect(weekly.by_direction.every((item) => item.action === "explore")).toBe(true);
    expect(weekly.decision.pause_direction).toContain("暂无");
    expect(weekly.decision.scale_direction).toContain("保持均衡探索");
    expect(weekly.decision.next_focus).toContain("三个方向继续均衡探索");
    expect(weekly.decision.content_allocation?.map((item) => item.percentage)).toEqual([33, 33, 34]);
  });

  it("只用有效自然样本做方向决策，并在证据充分后放大和暂停", () => {
    const notes = [
      ...Array.from({ length: 4 }, (_, index) => draft(index + 1, "A")),
      ...Array.from({ length: 3 }, (_, index) => draft(index + 10, "B")),
      ...Array.from({ length: 3 }, (_, index) => draft(index + 20, "C")),
      draft(30, "C"),
    ];
    const reviews = notes.map((note, index) => {
      if (index === notes.length - 1) return review(note, index, { promoted: true });
      if (note.direction === "A") return review(note, index, { saves: 220, shares: 80, follows: 35, qualified_inquiries: 8 });
      if (note.direction === "C") return review(note, index, { saves: 25, shares: 4, follows: 1, qualified_inquiries: 0 });
      return review(note, index);
    });
    const weekly = buildWeeklyReviewResult({ account, notes, reviews, at: NOW });
    expect(weekly.eligible_total).toBe(10);
    expect(weekly.by_direction.find((item) => item.direction === "A")?.action).toBe("scale");
    expect(weekly.by_direction.find((item) => item.direction === "C")?.action).toBe("pause");
    expect(weekly.source_review_ids).toHaveLength(11);
  });

  it("生成学习简报时周复盘决定方向，单篇复盘决定写法", () => {
    const notes = [draft(1, "A"), draft(2, "A"), draft(3, "B")];
    const reviews = notes.map((note, index) => review(note, index));
    const weekly = buildWeeklyReviewResult({ account, notes, reviews, at: NOW });
    const brief = buildLearningBrief({ account, notes, reviews, weekly, direction: "A" });
    expect(brief.weekly_strategy).toContain("下周");
    expect(brief.topic_guidance.length).toBeGreaterThan(0);
    expect(brief.body_guidance.length).toBeGreaterThan(0);
    expect(brief.experiment_variable).toBe("title_cover");
    expect(brief.trace.source_review_ids.length).toBeGreaterThan(0);
  });
});
