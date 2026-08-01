import { describe, expect, it } from "vitest";
import {
  appendBodyGenerationHistory,
  bodyFingerprint,
  historyExcludingCurrentPair,
  bodySimilarityScore,
  bodyUniquenessProblem,
  repeatedParagraphCount,
} from "./bodyUniqueness";
import type { ContentDraft, GrowthRun } from "./types";

const repeatedOpening = "前阵子我又把辞职这件事按了回去，不是突然不想走，而是越算越发现有几笔账没弄明白。";
const repeatedIdentity = "这段时间我把自己的职业经历、现实约束和几个候选方向放在一起，才看清过去哪些判断只是想当然。";
const repeatedBridge = "我自己越想越乱，后来才请一位职业决策顾问陪我梳理能力、市场机会和失败成本。最后没有被催着辞职，反而先排除了一个看似体面的方向，也知道下一步该验证什么。";

describe("body history uniqueness", () => {
  it("blocks the production regression where different titles shared most paragraphs", () => {
    const contrarian = [
      repeatedOpening,
      repeatedIdentity,
      "职业选择真正难的不是缺少选项，而是没有把能力证据、市场机会和失败成本放在一起判断。",
      repeatedBridge,
      "先讲大家普遍的认知，再用自己的真实经历给出反转和背后的原因。",
    ].join("\n\n");
    const nostalgia = [
      repeatedOpening,
      repeatedIdentity,
      "职业选择真正难的不是缺少选项，而是没有把能力证据、市场机会和失败成本放在一起判断。",
      repeatedBridge,
      "用过去职场高光和现在裸辞处境的对比，讲身份落差和真实心态。",
    ].join("\n\n");

    expect(repeatedParagraphCount(contrarian, nostalgia)).toBeGreaterThanOrEqual(4);
    expect(bodySimilarityScore(contrarian, nostalgia)).toBeGreaterThan(0.72);
    expect(bodyUniquenessProblem(nostalgia, [{ body: contrarian }])?.reason)
      .toMatch(/repeated_opening|repeated_paragraphs|high_similarity/);
  });

  it("allows a genuinely different scene and argument", () => {
    const previous = [
      "周一开会时，老板问我还愿不愿意再接一个跨部门项目，我第一次没有马上点头。",
      "我把过去三年的项目单独列出来，才发现大部分成果都依赖原公司的渠道。",
      "所以我先约了三位目标行业从业者核对门槛，再决定要不要离开。",
    ].join("\n\n");
    const next = [
      "昨晚十点，我盯着一份创业合作协议看了半小时，最后把最想签的那一页折了起来。",
      "这次我没有先算能赚多少，而是把现金流、获客方式和退出条件写成三栏。",
      "等真实客户愿意为小样付费后，再决定是否投入全部时间。",
    ].join("\n\n");

    expect(bodyUniquenessProblem(next, [{ body: previous }])).toBeNull();
  });

  it("removes only the current paired short draft from long-version history", () => {
    const currentShort = "当前标题的短版正文，保留相同核心判断。";
    const olderDraft = "另一篇真正属于近90天历史的正文。";
    const filtered = historyExcludingCurrentPair([
      { body: currentShort, topic_id: "current" },
      { body: olderDraft, topic_id: "older" },
    ], [currentShort]);

    expect(filtered).toEqual([{ body: olderDraft, topic_id: "older" }]);
  });

  it("records unselected generated bodies inside the run payload", () => {
    const now = new Date().toISOString();
    const run = {
      id: "run", tenant_id: "tenant", account_id: "account", status: "draft", week: 1,
      objective: "目标", experiment_hypothesis: "假设", topic_pool: [{
        id: "topic", method_group: "native", method_id: "contrarian", method_label: "反认知",
        generation_mode: "default", title: "标题", title_promise: "承诺", target_user: "中高管",
        pain: "痛点", hook: "钩子", follow_reason: "理由", test_variable: "变量",
        expected_signal: "信号", repeatable_angle: "角度", broad_traffic_risk: 1, priority: "A",
      }],
      created_at: now, updated_at: now,
    } as GrowthRun;
    const draft = {
      id: "draft", tenant_id: "tenant", account_id: "account", run_id: "run",
      method_id: "contrarian", title: "标题", title_promise: "承诺",
      selected_body_version: "short", body: "一篇需要进入历史去重的未选用正文。",
      created_at: now,
    } as ContentDraft;

    const updated = appendBodyGenerationHistory(run, [draft]);
    expect(updated.body_generation_history).toHaveLength(1);
    expect(updated.body_generation_history?.[0]).toMatchObject({
      draft_id: "draft",
      topic_id: "topic",
      body_fingerprint: bodyFingerprint(draft.body),
    });
  });
});
