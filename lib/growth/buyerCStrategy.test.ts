import { describe, expect, it } from "vitest";
import type { GrowthAccount, TopicCandidate } from "./types";
import { buyerCaseMode, buyerCNeedsMaterial, prioritizeBuyerCTopics } from "./buyerCStrategy";

const timestamp = "2026-07-14T00:00:00.000Z";
const account: GrowthAccount = {
  id: "account-1",
  tenant_id: "mianbajun",
  persona: "buyer",
  business_track: "international-student-career",
  name: "留学生家长",
  target_user: "留学生家长",
  core_problem: "孩子第一次参加秋招",
  account_value: "记录两个孩子的求职过程",
  trust_source: "家庭经历",
  not_doing: "不做硬广",
  hypotheses: [],
  persona_specific: { case_mode: "情景演绎", case_material: "" },
  created_at: timestamp,
  updated_at: timestamp,
};

const topic: TopicCandidate = {
  id: "a-1",
  direction: "A",
  title: "孩子面试后不说话",
  target_user: "留学生家长",
  pain: "不知道如何陪伴",
  content_type: "diagnostic",
  hook: "面试后的沉默",
  follow_reason: "持续记录",
  test_variable: "标题",
  expected_signal: "阅读",
  repeatable_angle: "家长视角",
  broad_traffic_risk: 2,
  priority: "A",
  scores: { positioning: 8, pain_clarity: 8, entry_strength: 8, follow_reason: 8, experiment_value: 8, repeatability: 8 },
};

describe("buyer C strategy", () => {
  it("defaults buyer cases to dramatization", () => {
    expect(buyerCaseMode({ ...account, persona_specific: {} })).toBe("情景演绎");
  });

  it("requires one combined material field only for real buyer cases", () => {
    expect(buyerCNeedsMaterial({ ...account, persona_specific: { case_mode: "真实案例", case_material: "" } })).toBe(true);
    expect(buyerCNeedsMaterial(account)).toBe(false);
  });

  it("puts buyer C first as an S topic during this week's test", () => {
    const topics = prioritizeBuyerCTopics({
      account,
      topics: [topic],
      topicId: "c-1",
      at: new Date("2026-07-15T12:00:00+08:00"),
    });
    expect(topics[0].direction).toBe("C");
    expect(topics[0].priority).toBe("S");
    expect(topics[0].evidence).toContain("本周高优");
  });
});
