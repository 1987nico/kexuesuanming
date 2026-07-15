import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthAccount, GrowthLearningBrief, GrowthRun, TopicCandidate } from "./types";

const { mockLlmJSON } = vi.hoisted(() => ({
  mockLlmJSON: vi.fn(),
}));

vi.mock("@/lib/llm/router", () => ({
  llmJSON: mockLlmJSON,
}));

import { generateDraftVariants } from "./runner";

const timestamp = "2026-07-14T00:00:00.000Z";

const account: GrowthAccount = {
  id: "account-1",
  tenant_id: "mianbajun",
  persona: "buyer",
  name: "面霸君买家号",
  target_user: "正在考虑裸辞的职场人",
  core_problem: "担心离开平台后失去价值",
  account_value: "记录真实转型过程",
  trust_source: "真实经历",
  not_doing: "不做硬广",
  hypotheses: [],
  created_at: timestamp,
  updated_at: timestamp,
};

const topic: TopicCandidate = {
  id: "topic-1",
  direction: "B",
  title: "裸辞2个月，才发现我靠的是平台",
  target_user: account.target_user,
  pain: account.core_problem,
  content_type: "story",
  hook: "裸辞后才看清平台价值",
  follow_reason: "持续记录裸辞后的真实变化",
  test_variable: "title_cover",
  expected_signal: "阅读和收藏",
  repeatable_angle: "裸辞后的认知变化",
  broad_traffic_risk: 3,
  priority: "S",
  scores: {
    positioning: 9,
    pain_clarity: 9,
    entry_strength: 9,
    follow_reason: 8,
    experiment_value: 9,
    repeatability: 8,
  },
};

const run: GrowthRun = {
  id: "run-1",
  tenant_id: "mianbajun",
  account_id: account.id,
  status: "draft",
  week: 1,
  objective: "测试标题后生成正文",
  experiment_hypothesis: "目标用户会认同这个处境",
  topic_pool: [topic],
  created_at: timestamp,
  updated_at: timestamp,
};

const learningBrief: GrowthLearningBrief = {
  trace: {
    version: "weekly-2026-07-14",
    generated_at: timestamp,
    source_review_ids: ["review-1"],
    basis: ["保留买家视角的真实感"],
  },
  weekly_strategy: "继续探索买家视角 B 类内容",
  topic_guidance: ["标题使用具体处境"],
  title_guidance: ["保留裸辞身份词"],
  body_guidance: ["增加会议室和咖啡店场景"],
  experiment_variable: "title_cover",
};

function modelPayload(index: number) {
  return {
    title: index === 0 ? "模型改写标题一" : "模型改写标题二",
    alternative_titles: ["模型备选标题"],
    target_user: topic.target_user,
    cover_text: index === 0 ? "精简封面" : "深度封面",
    body:
      index === 0
        ? "离开公司两个月，我才发现以前客户叫的是公司名字，不是我的名字。会议室里的掌声、预算表上的数字，都不等于市场愿意单独为我付费。先看三件事：有没有个人案例、有没有独立客户、有没有离开职位还能说清的价值。"
        : "上周和前同事坐在咖啡店，她还在原来的部门，张口就是今年的预算。我握着杯子，想起三个月前的会议室。那时我对着PPT讲年度规划，下属记笔记，合作方叫我张总。裸辞后投了几个合伙人岗位，我才慢慢看清：过去被认可的，有一部分是平台、预算和职位。真正能带走的，是我处理过的具体问题、能够复用的判断，以及愿意脱离公司继续找我的人。后来我把经历拆成项目、结果和证据，一项项检查，才知道下一步该补什么。",
    hashtags: ["#裸辞", "#职业转型"],
    comment_prompt: "离开平台后，你最想带走什么能力？",
    follow_reason: topic.follow_reason,
    trust_anchor: "真实裸辞经历",
    review_points: ["阅读", "收藏"],
    cover_suggestion: "真实咖啡店场景",
    story_mode: "意外人模式",
    pictorial_rate: "26%",
  };
}

describe("generateDraftVariants", () => {
  beforeEach(() => {
    mockLlmJSON.mockReset();
    mockLlmJSON.mockImplementation(async () => {
      const index = mockLlmJSON.mock.calls.length - 1;
      return {
        data: modelPayload(index),
        raw: {
          text: "{}",
          provider: "anthropic",
          model: "test-model",
          usage: { inputTokens: 100, outputTokens: 200 },
        },
      };
    });
  });

  it("锁定已选标题并独立生成精简版和深度版", async () => {
    const oldBody = "上一轮已经生成过的正文，新的两个方案都不应该重复这一段。";
    const result = await generateDraftVariants({
      account,
      run,
      topic,
      count: 2,
      excludeBodies: [oldBody],
      learningBrief,
    });

    expect(mockLlmJSON).toHaveBeenCalledTimes(2);
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0].body).not.toBe(result.drafts[1].body);
    expect(result.drafts.map((draft) => draft.title)).toEqual([topic.title, topic.title]);
    expect(result.drafts.map((draft) => draft.alternative_titles)).toEqual([[topic.title], [topic.title]]);
    expect(result.drafts.every((draft) => draft.test_variable === topic.test_variable)).toBe(true);
    expect(result.drafts.every((draft) => draft.learning_trace?.version === learningBrief.trace.version)).toBe(true);

    const firstPrompt = mockLlmJSON.mock.calls[0][0].user as string;
    const secondPrompt = mockLlmJSON.mock.calls[1][0].user as string;
    expect(firstPrompt).toContain("150-300 字");
    expect(secondPrompt).toContain("600-900 字");
    expect(firstPrompt).toContain("标题已经由用户选定");
    expect(firstPrompt).toContain("增加会议室和咖啡店场景");
    expect(firstPrompt).toContain("标题/封面建议已经在选题阶段执行");
    expect(secondPrompt).toContain(oldBody);
    expect(secondPrompt).toContain(result.drafts[0].body.slice(0, 80));
  });

  it("模型失败时仍返回标题锁定且内容不同的两个兜底方案", async () => {
    mockLlmJSON.mockRejectedValue(new Error("provider unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await generateDraftVariants({ account, run, topic, count: 2, learningBrief });

    expect(result.drafts).toHaveLength(2);
    expect(result.drafts.map((draft) => draft.title)).toEqual([topic.title, topic.title]);
    expect(result.drafts[0].body).not.toBe(result.drafts[1].body);
    expect(result.drafts.every((draft) => draft.word_count.within_limit)).toBe(true);
    warn.mockRestore();
  });

  it("情景演绎模式强制补齐正文和封面的公开标识", async () => {
    const fictionalAccount: GrowthAccount = {
      ...account,
      business_track: "international-student-career",
      persona_specific: {
        case_mode: "情景演绎",
        case_material: "虚构能源公司的数据分析岗；老大拿到Offer；老二第一次参加校园招聘会。",
      },
    };
    const fictionalTopic: TopicCandidate = {
      ...topic,
      id: "fictional-topic",
      direction: "C",
      content_type: "story",
    };
    const fictionalRun: GrowthRun = { ...run, topic_pool: [fictionalTopic] };

    const result = await generateDraftVariants({
      account: fictionalAccount,
      run: fictionalRun,
      topic: fictionalTopic,
      count: 1,
    });

    expect(result.drafts[0].body).toMatch(/^【情景演绎｜根据常见留学生求职经历改编】/);
    expect(result.drafts[0].case_mode).toBe("情景演绎");
    expect(result.drafts[0].cover_suggestion).toContain("情景演绎 / 示意图");
    expect(result.drafts[0].comment_prompt).toBe("");
  });

  it("真实案例模式没有案例素材时拒绝生成 buyer C 正文", async () => {
    const realAccount: GrowthAccount = {
      ...account,
      business_track: "international-student-career",
      persona_specific: { case_mode: "真实案例", case_material: "" },
    };
    const realTopic: TopicCandidate = { ...topic, direction: "C", content_type: "story" };
    const realRun: GrowthRun = { ...run, topic_pool: [realTopic] };

    await expect(
      generateDraftVariants({ account: realAccount, run: realRun, topic: realTopic, count: 1 }),
    ).rejects.toThrow("buyer_c_case_material_required");
  });
});
