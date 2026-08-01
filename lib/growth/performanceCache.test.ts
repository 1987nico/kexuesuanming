import { describe, expect, it } from "vitest";
import {
  accountProfileVersion,
  draftCacheKey,
  freshDraftCache,
  markTopicRunConsumed,
  markTopicRunQueued,
  queuedTopicRuns,
  visibleTopicRuns,
  withDraftCache,
} from "./performanceCache";
import type { ContentDraft, GrowthAccount, GrowthRun, TopicCandidate } from "./types";

function account(overrides: Partial<GrowthAccount> = {}): GrowthAccount {
  return {
    id: "account-1",
    tenant_id: "mianbajun",
    owner_user_id: "user-1",
    business_line: "overseas_student",
    persona: "buyer",
    profile_name: "留学生本人号",
    profile_identity: "overseas_student_self",
    name: "留学生本人号",
    target_user: "准备回国求职的留学生",
    core_problem: "回国还是留当地",
    account_value: "求职决策复盘",
    trust_source: "真实经历",
    not_doing: "不承诺Offer",
    hypotheses: [],
    persona_specific: { identity: "英国读硕的留学生本人" },
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function topic(title = "回国还是留下，我先算清3笔账"): TopicCandidate {
  return {
    id: "topic-1",
    method_group: "native",
    method_id: "tug_of_war",
    method_label: "拔河式选题",
    generation_mode: "default",
    title,
    title_promise: "用留学生本人视角比较回国与留下的三个变量",
    target_user: "留学生本人",
    pain: "两边都想准备",
    hook: "两难选择",
    follow_reason: "继续看决策过程",
    test_variable: "标题",
    expected_signal: "有效咨询",
    repeatable_angle: "更换决策变量",
    broad_traffic_risk: 2,
    priority: "A",
  };
}

function run(item = topic()): GrowthRun {
  return {
    id: "run-1",
    tenant_id: "mianbajun",
    owner_user_id: "user-1",
    account_id: "account-1",
    status: "draft",
    week: 1,
    objective: "生成标题",
    experiment_hypothesis: "验证标题",
    generation_mode: "default",
    generation_status: "completed",
    topic_pool: [item],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("growth performance cache", () => {
  it("only invalidates a profile cache when generation facts change", () => {
    const current = account();
    expect(accountProfileVersion({ ...current, updated_at: "2026-08-02T00:00:00.000Z" }))
      .toBe(accountProfileVersion(current));
    expect(accountProfileVersion({ ...current, profile_identity: "overseas_student_parent" }))
      .not.toBe(accountProfileVersion(current));
  });

  it("queues, consumes and hides prefetched title batches", () => {
    const current = account();
    const queued = markTopicRunQueued({
      run: run(),
      account: current,
      mode: "default",
      batchNumber: 1,
      timestamp: new Date().toISOString(),
    });
    expect(queuedTopicRuns([queued], current, "default")).toHaveLength(1);
    expect(visibleTopicRuns([queued])).toHaveLength(0);
    const consumed = markTopicRunConsumed(queued, new Date().toISOString(), "request-1");
    expect(visibleTopicRuns([consumed]).map((item) => item.id)).toEqual(["run-1"]);
    expect(consumed.prefetch?.consumed_request_id).toBe("request-1");
  });

  it("does not expose a retained-only prefetch batch as fresh inventory", () => {
    const current = account();
    const retainedOnly = markTopicRunQueued({
      run: {
        ...run(),
        method_deliveries: [{
          method_id: "tug_of_war",
          method_label: "拔河式选题",
          status: "failed",
          reason: "本轮没有通过去重的新标题",
          attempts: 3,
          topic_id: "topic-1",
          title_origin: "retained",
          retained_from_run_id: "previous-run",
        }],
      },
      account: current,
      mode: "default",
      batchNumber: 1,
      timestamp: new Date().toISOString(),
    });
    expect(queuedTopicRuns([retainedOnly], current, "default")).toHaveLength(0);
    // 仍保持后台隐藏，不会污染操作者最近3批。
    expect(visibleTopicRuns([retainedOnly])).toHaveLength(0);
  });

  it("isolates title queues by account persona facts", () => {
    const student = account();
    const queued = markTopicRunQueued({
      run: run(),
      account: student,
      mode: "default",
      batchNumber: 1,
      timestamp: new Date().toISOString(),
    });
    const parent = account({
      profile_name: "留学生家长号",
      profile_identity: "overseas_student_parent",
      persona_specific: { identity: "留学生家长" },
    });
    expect(queuedTopicRuns([queued], parent, "default")).toHaveLength(0);
  });

  it("reuses only certified body variants for the exact title contract", () => {
    const current = account();
    const item = topic();
    const drafts = ["short", "long"].map((version) => ({
      id: `draft-${version}`,
      certification_status: "certified",
      selected_body_version: version,
    })) as ContentDraft[];
    const cachedRun = withDraftCache({
      run: run(item),
      account: current,
      topic: item,
      drafts,
      timestamp: new Date().toISOString(),
    });
    expect(freshDraftCache(cachedRun, current, item)?.drafts).toHaveLength(2);
    expect(draftCacheKey(current, topic("换了标题后缓存应失效")))
      .not.toBe(draftCacheKey(current, item));
    expect(freshDraftCache(cachedRun, current, topic("换了标题后缓存应失效"))).toBeUndefined();
  });

  it("serves a certified short draft before the long draft is ready", () => {
    const current = account();
    const item = topic();
    const shortRun = withDraftCache({
      run: run(item),
      account: current,
      topic: item,
      drafts: [{
        id: "draft-short",
        certification_status: "certified",
        selected_body_version: "short",
      } as ContentDraft],
      timestamp: new Date().toISOString(),
    });

    expect(freshDraftCache(shortRun, current, item)).toBeUndefined();
    expect(freshDraftCache(shortRun, current, item, Date.now(), "short")?.drafts)
      .toHaveLength(1);
    expect(freshDraftCache(shortRun, current, item, Date.now(), "long")).toBeUndefined();

    const completeRun = withDraftCache({
      run: shortRun,
      account: current,
      topic: item,
      drafts: [{
        id: "draft-long",
        certification_status: "certified",
        selected_body_version: "long",
      } as ContentDraft],
      timestamp: new Date().toISOString(),
    });

    expect(freshDraftCache(completeRun, current, item)?.drafts
      .map((draft) => draft.selected_body_version))
      .toEqual(["long", "short"]);
  });
});
