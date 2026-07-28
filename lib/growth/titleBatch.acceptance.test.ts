import { describe, expect, it } from "vitest";
import { methodsForPersona } from "./methods";
import {
  fallbackTitleCandidates,
  titlePersonaProblems,
  topicBatchDuplicateProblems,
} from "./runner";
import { evaluateGrowthTitleQuality } from "./titleQuality";
import type {
  GrowthAccount,
  GrowthBusinessLine,
  GrowthPersona,
  TitleMethodId,
  TopicCandidate,
} from "./types";

/**
 * 发布前的确定性30批契约：2条业务 × 3种视角 × 每空间5批。
 * 这条测试专门覆盖模型异常时的原生法安全兜底池；真实模型、来源时效和页面
 * 时长仍由上线后的30批操作者回归覆盖。
 */

function account(business_line: GrowthBusinessLine, persona: GrowthPersona) {
  return { business_line, persona } as GrowthAccount;
}

function topic(
  businessLine: GrowthBusinessLine,
  persona: GrowthPersona,
  methodId: TitleMethodId,
  title: string,
  options: { titlePromise?: string; premiseKey?: string } = {},
): TopicCandidate {
  return {
    id: `${businessLine}-${persona}-${methodId}-${title}`,
    method_group: "native",
    method_id: methodId,
    method_label: methodId,
    generation_mode: "default",
    title,
    title_promise: options.titlePromise || "正文用具体场景和可执行判断兑现标题承诺。",
    fallback_premise_key: options.premiseKey,
    target_user: businessLine === "executive" ? "转型中的中高管" : "准备秋招的留学生与家长",
    pain: businessLine === "executive" ? "职业方向与风险判断" : "求职方向与招聘节奏判断",
    hook: title,
    follow_reason: "持续获得具体判断",
    test_variable: "标题入口",
    expected_signal: "有效咨询",
    repeatable_angle: "换新场景复测",
    broad_traffic_risk: 3,
    priority: "A",
  };
}

function candidateTopic(
  businessLine: GrowthBusinessLine,
  persona: GrowthPersona,
  methodId: TitleMethodId,
  candidate: ReturnType<typeof fallbackTitleCandidates>[number],
) {
  return topic(businessLine, persona, methodId, candidate.title, {
    titlePromise: candidate.title_promise,
    premiseKey: candidate.premise_key,
  });
}

describe("标题生成30批用户验收标准（确定性兜底回归）", () => {
  it("兜底候选保留自己的正文承诺和母题键", () => {
    const candidates = fallbackTitleCandidates(account("overseas_student", "buyer"), "tug_of_war");
    const internship = candidates.find((item) => item.title === "我家孩子，先补实习还是直接投递？");
    const localOrReturn = candidates.find((item) => item.title === "孩子留当地，还是回国找工作？");
    const returnOrLocal = candidates.find((item) => item.title === "陪孩子留英，还是赶回国秋招？");

    expect(internship?.title_promise).toContain("先补实习");
    expect(internship?.title_promise).toContain("直接投递");
    expect(internship?.title_promise).not.toContain("留当地与回国求职");
    expect(localOrReturn?.premise_key).not.toBe(returnOrLocal?.premise_key);
  });

  it("所有内置原生兜底标题本身都能通过发布质量门禁", () => {
    const businessLines: GrowthBusinessLine[] = ["overseas_student", "executive"];
    const personas: GrowthPersona[] = ["buyer", "merchant", "expert"];
    for (const businessLine of businessLines) {
      for (const persona of personas) {
        for (const method of methodsForPersona(persona, "default").filter((item) => !item.sourceRequired)) {
          for (const candidate of fallbackTitleCandidates(account(businessLine, persona), method.id)) {
            expect(
              evaluateGrowthTitleQuality(candidate.title).acceptable,
              `${businessLine}/${method.id} 的兜底标题“${candidate.title}”不应依赖未经验证的个人事实或抽象空话`,
            ).toBe(true);
            expect(
              titlePersonaProblems(candidateTopic(businessLine, persona, method.id, candidate), account(businessLine, persona)),
              `${businessLine}/${persona}/${method.id} 的兜底标题“${candidate.title}”必须适配当前视角`,
            ).toHaveLength(0);
          }
        }
      }
    }
  });

  it("六个业务×视角空间各连续五批：原生槽位始终交付新、自然、无换皮标题", () => {
    const spaces: Array<[GrowthBusinessLine, GrowthPersona, number]> = [
      ["overseas_student", "buyer", 4],
      ["overseas_student", "merchant", 3],
      ["overseas_student", "expert", 6],
      ["executive", "buyer", 4],
      ["executive", "merchant", 3],
      ["executive", "expert", 6],
    ];
    let batches = 0;

    for (const [businessLine, persona, minimumNewTitles] of spaces) {
      const methods = methodsForPersona(persona, "default").filter((method) => !method.sourceRequired);
      expect(methods).toHaveLength(minimumNewTitles);
      const historyTitles: string[] = [];
      const historyTopics: Array<{ method_id: TitleMethodId; title: string }> = [];

      for (let round = 0; round < 5; round += 1) {
        const batch: TopicCandidate[] = [];
        for (const method of methods) {
          const candidate = fallbackTitleCandidates(account(businessLine, persona), method.id).find((item) => {
            const current = candidateTopic(businessLine, persona, method.id, item);
            if (!evaluateGrowthTitleQuality(item.title).acceptable) return false;
            if (titlePersonaProblems(current, account(businessLine, persona)).length) return false;
            return topicBatchDuplicateProblems(
              [...batch, current],
              historyTitles,
              historyTopics,
              businessLine,
            ).length === 0;
          });
          expect(candidate, `${businessLine}/${persona}/第${round + 1}批/${method.id}缺少全新兜底标题`).toBeTruthy();
          batch.push(candidateTopic(businessLine, persona, method.id, candidate!));
        }

        expect(batch).toHaveLength(minimumNewTitles);
        expect(
          topicBatchDuplicateProblems(batch, historyTitles, historyTopics, businessLine),
          `${businessLine}/${persona}/第${round + 1}批出现历史或批内换皮标题`,
        ).toHaveLength(0);
        historyTitles.push(...batch.map((item) => item.title));
        historyTopics.push(...batch.map((item) => ({ method_id: item.method_id, title: item.title })));
        batches += 1;
      }
    }
    expect(batches).toBe(30);
  });

  it("语义审核最多只看两个合格兜底候选时，五批里每个原生槽位仍有可替代项", () => {
    const spaces: Array<[GrowthBusinessLine, GrowthPersona]> = [
      ["overseas_student", "buyer"],
      ["overseas_student", "merchant"],
      ["overseas_student", "expert"],
      ["executive", "buyer"],
      ["executive", "merchant"],
      ["executive", "expert"],
    ];

    for (const [businessLine, persona] of spaces) {
      const methods = methodsForPersona(persona, "default").filter((method) => !method.sourceRequired);
      const historyTitles: string[] = [];
      const historyTopics: Array<{ method_id: TitleMethodId; title: string }> = [];

      for (let round = 0; round < 5; round += 1) {
        const batch: TopicCandidate[] = [];
        for (const method of methods) {
          const eligible = fallbackTitleCandidates(account(businessLine, persona), method.id)
            .filter((candidate) => evaluateGrowthTitleQuality(candidate.title).acceptable)
            .filter((candidate) => titlePersonaProblems(
              candidateTopic(businessLine, persona, method.id, candidate),
              account(businessLine, persona),
            ).length === 0)
            .filter((candidate) => topicBatchDuplicateProblems(
              [...batch, candidateTopic(businessLine, persona, method.id, candidate)],
              historyTitles,
              historyTopics,
              businessLine,
            ).length === 0)
            .slice(0, 2);
          expect(
            eligible.length,
            `${businessLine}/${persona}/第${round + 1}批/${method.id}没有给语义审核留下两个安全兜底候选`,
          ).toBe(2);
          batch.push(candidateTopic(businessLine, persona, method.id, eligible[0]));
        }
        historyTitles.push(...batch.map((item) => item.title));
        historyTopics.push(...batch.map((item) => ({ method_id: item.method_id, title: item.title })));
      }
    }
  });

  it("繁体、乱码、虚构事实和换词重复都不能进入成功批次", () => {
    for (const value of [
      "留學當下別衝動轉職",
      "38岁gangga离开小公司，尴尬",
      "前国企高管，创业首年营收五百万",
      "离体制邪修六步漏斗，饭局判胜算",
    ]) expect(evaluateGrowthTitleQuality(value).acceptable).toBe(false);

    const first = topic("overseas_student", "buyer", "tug_of_war", "先补实习，还是直接冲秋招？");
    const second = topic("overseas_student", "buyer", "tug_of_war", "补实习攒经历，还是直接冲秋招");
    expect(topicBatchDuplicateProblems([second], [first.title], [{
      method_id: first.method_id,
      title: first.title,
    }], "overseas_student").length).toBeGreaterThan(0);
  });
});
