import { describe, expect, it } from "vitest";
import {
  buildSingleTitleMutation,
  lockTopicDirection,
  mergeRegeneratedNativeTopic,
} from "./singleTitleRegeneration";
import type { TopicCandidate } from "./types";

const topic = (
  id: string,
  title: string,
  methodId: TopicCandidate["method_id"] = "human_pain",
  group: TopicCandidate["method_group"] = "native",
): TopicCandidate => ({
  id,
  method_group: group,
  method_id: methodId,
  method_label: "行业人性痛点",
  generation_mode: "default",
  title,
  title_promise: "讲清高位职场人不敢离职背后的身份与收入冲突",
  target_user: "正在转型的中高管",
  pain: "担心离开平台后重新定价",
  hook: title,
  origin_force: "离职交接和工资条",
  conflict_judgement: "想离开高位又担心收入与身份落差",
  follow_reason: "持续获得职业判断",
  test_variable: "标题表达",
  expected_signal: "有效咨询",
  repeatable_angle: "继续测试",
  broad_traffic_risk: 3,
  priority: "A",
});

describe("原生法单槽换标题", () => {
  it("只替换目标槽位，其他标题保持不变", () => {
    const current = topic("old", "年薪百万，为何更不敢离职");
    const other = topic("other", "留高位还是重新定价", "tug_of_war");
    const generated = topic("new", "坐到高位，反而不敢提离职");

    expect(mergeRegeneratedNativeTopic({
      previous: [current, other],
      current,
      generated,
    })).toEqual([generated, other]);
  });

  it("对标法结果不能借单槽换标题覆盖原生槽位", () => {
    const current = topic("old", "年薪百万，为何更不敢离职");
    const benchmark = topic("new", "新对标标题", "viral_framework", "benchmark");
    expect(mergeRegeneratedNativeTopic({
      previous: [current],
      current,
      generated: benchmark,
    })).toEqual([current]);
  });

  it("方向锁保留目标人群、冲突和正文承诺", () => {
    const current = topic("old", "年薪百万，为何更不敢离职");
    expect(lockTopicDirection(current)).toEqual({
      method_id: "human_pain",
      target_user: current.target_user,
      pain: current.pain,
      title_promise: current.title_promise,
      origin_force: current.origin_force,
      conflict_judgement: current.conflict_judgement,
      source_id: undefined,
    });
  });

  it("保存可撤回的父批次和前后标题", () => {
    const current = topic("old", "年薪百万，为何更不敢离职");
    const generated = topic("new", "坐到高位，反而不敢提离职");
    expect(buildSingleTitleMutation({
      parentRunId: "run-old",
      current,
      generated,
      generationAttempts: 2,
      createdAt: "2026-07-23T08:00:00.000Z",
    })).toMatchObject({
      mutation_type: "single_title_regeneration",
      parent_run_id: "run-old",
      regenerated_topic_id: "old",
      method_id: "human_pain",
      previous_title: current.title,
      new_title: generated.title,
      generation_attempts: 2,
    });
  });
});
