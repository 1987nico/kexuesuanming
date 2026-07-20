import { describe, expect, it } from "vitest";
import type {
  ContentDraft,
  GrowthAccount,
  ThreeDayNoteSnapshot,
  ThreeDayReviewCycle,
  TitleMethodId,
} from "./types";
import {
  buildThreeDayLearningBrief,
  buildThreeDayLearningSamples,
  buildThreeDayLearningState,
  createThreeDayCycleExperiment,
} from "./threeDayLearning";

const NOW = "2026-07-20T00:00:00.000Z";

function note(index: number, method: TitleMethodId = "human_pain", inquiries = 1): ThreeDayNoteSnapshot {
  const explore = method === "nostalgia";
  return {
    source_key: `note-${index}`,
    source_title: `测试笔记${index}`,
    published_at: `2026-07-${String(10 + Math.floor(index / 10)).padStart(2, "0")}T00:00:00.000Z`,
    content_format: "图文",
    draft_id: `draft-${index}`,
    method_id: method,
    method_label: method === "nostalgia" ? "怀旧" : "行业人性痛点",
    method_group: "native",
    generation_mode: explore ? "explore" : "default",
    match_status: "matched",
    match_reason: "标题与首次发布时间匹配",
    metrics: {
      impressions: 5000,
      views: 1000,
      cover_ctr: explore ? 0.3 : 0.2,
      likes: 100,
      comments: 10,
      saves: explore ? 100 : 50,
      follows: 5,
      shares: explore ? 50 : 20,
      avg_view_seconds: 30,
      danmaku: 0,
    },
    derived: {
      save_rate: explore ? 0.1 : 0.05,
      share_rate: explore ? 0.05 : 0.02,
      value_rate: explore ? 0.15 : 0.07,
    },
    traffic_status: "organic_normal",
    content_eligible: true,
    commercial_eligible: true,
    attributed_inquiries: inquiries,
    eligibility_reasons: [],
  };
}

function cycle(number: number, notes: ThreeDayNoteSnapshot[]): ThreeDayReviewCycle {
  return {
    id: `cycle-${number}`,
    account_id: "account",
    business_line: "executive",
    persona: "expert",
    cycle_number: number,
    status: "completed",
    started_at: NOW,
    due_at: NOW,
    completed_at: `2026-07-${15 + number}T00:00:00.000Z`,
    next_due_at: `2026-07-${18 + number}T00:00:00.000Z`,
    source_row_count: notes.length,
    traffic_confirmed: true,
    notes,
    qualified_inquiries: notes.reduce((sum, item) => sum + (item.attributed_inquiries ?? 0), 0),
    unattributed_inquiries: 0,
    decision: {
      keep: ["行业人性痛点"],
      retest_or_pause: ["复测当前方法"],
      next_variable: "opening",
      next_variable_reason: "入口较强，正文承接需要复测。",
      summary: `第${number}轮复盘完成。`,
    },
    created_at: NOW,
    updated_at: `2026-07-${15 + number}T00:00:00.000Z`,
  };
}

function draft(index: number): ContentDraft {
  return {
    id: `draft-${index}`,
    account_id: "account",
    tenant_id: "mianbajun",
    run_id: "run",
    status: "reviewed",
    business_line: "中高管职业决策",
    method_group: "native",
    method_id: "human_pain",
    method_label: "行业人性痛点",
    generation_mode: "default",
    title_promise: "兑现",
    selected_body_version: "short",
    raw_body_tags: [{ id: `tag-${index}`, text: "决策自查", reason: "正文", generated_at: NOW, body_version: "short" }],
    tagging_status: "tagged",
    canonical_tag_ids: [],
    cta_type: "on_platform_consult",
    validation_checks: [],
    test_variable: "入口",
    expected_signal: "咨询",
    title: `测试笔记${index}`,
    alternative_titles: [],
    target_user: "中高管",
    cover_text: "封面",
    body: "正文",
    hashtags: [],
    comment_prompt: "",
    word_count: { title: 5, body_and_tags: 5, total: 10, within_limit: true },
    follow_reason: "",
    trust_anchor: "",
    review_points: [],
    cover_suggestion: "",
    published_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  };
}

function account(cycles: ThreeDayReviewCycle[]): GrowthAccount {
  return {
    id: "account",
    tenant_id: "mianbajun",
    business_line: "executive",
    persona: "expert",
    name: "面霸君",
    target_user: "中高管",
    core_problem: "职业决策",
    account_value: "判断框架",
    trust_source: "真实案例",
    not_doing: "不保证结果",
    hypotheses: [],
    three_day_review_cycles: cycles,
    created_at: NOW,
    updated_at: NOW,
  };
}

describe("三日复盘学习闭环", () => {
  it("同一笔记跨周期只保留最近一次学习样本", () => {
    const old = note(1);
    const latest = { ...note(1), metrics: { ...note(1).metrics, views: 2000 } };
    const samples = buildThreeDayLearningSamples(account([cycle(1, [old]), cycle(2, [latest])]));
    expect(samples).toHaveLength(1);
    expect(samples[0].cycle_id).toBe("cycle-2");
    expect(samples[0].metrics.views).toBe(2000);
  });

  it("少于3篇内容有效样本时不创建实验", () => {
    const current = cycle(1, [note(1), note(2)]);
    expect(createThreeDayCycleExperiment(account([current]), current)).toBeUndefined();
  });

  it("达到3篇后只创建待人工确认实验，确认前不影响生成", () => {
    const current = cycle(1, [note(1), note(2), note(3)]);
    const base = account([current]);
    const experiment = createThreeDayCycleExperiment(base, current)!;
    expect(experiment.status).toBe("pending");
    const pendingAccount = { ...base, cycle_experiments: [experiment] };
    const pendingBrief = buildThreeDayLearningBrief({ account: pendingAccount, drafts: [draft(1), draft(2), draft(3)] });
    expect(pendingBrief.experiment_variable).toBeUndefined();
    const confirmedAccount = { ...base, cycle_experiments: [{ ...experiment, status: "confirmed" as const }] };
    const confirmedBrief = buildThreeDayLearningBrief({ account: confirmedAccount, drafts: [draft(1), draft(2), draft(3)] });
    expect(confirmedBrief.experiment_variable).toBe("opening");
    expect(confirmedBrief.body_guidance[0]).toContain("前30字");
  });

  it("30篇商业有效样本且探索方法连续两周期领先时才建议人工晋升", () => {
    const first = Array.from({ length: 15 }, (_, index) =>
      index < 3 ? note(index + 1, "nostalgia", 10) : note(index + 1, "human_pain", 1));
    const second = Array.from({ length: 15 }, (_, index) =>
      index < 2 ? note(index + 16, "nostalgia", 10) : note(index + 16, "human_pain", 1));
    const currentAccount = account([cycle(1, first), cycle(2, second)]);
    const state = buildThreeDayLearningState(currentAccount, Array.from({ length: 30 }, (_, index) => draft(index + 1)));
    expect(state.commercial_eligible_total).toBe(30);
    expect(state.promotion_suggestions.map((item) => item.method_id)).toContain("nostalgia");
  });
});
