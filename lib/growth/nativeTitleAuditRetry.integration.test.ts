import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthAccount } from "./types";

const { llmJSONMock } = vi.hoisted(() => ({ llmJSONMock: vi.fn() }));

vi.mock("@/lib/llm/router", () => ({ llmJSON: llmJSONMock }));

import { generateTopicBatch } from "./runner";

const account: GrowthAccount = {
  id: "native-audit-retry",
  tenant_id: "mianbajun",
  business_line: "executive",
  persona: "buyer",
  name: "转型中的中高管",
  target_user: "正在评估职业转型的中高管",
  core_problem: "担心离开现有平台后，职业价值与收入无法重新验证",
  account_value: "用事实和行动验证下一步方向",
  trust_source: "真实职业决策陪跑经验",
  one_liner: "记录中高管重新判断职业方向的真实过程",
  follow_reason: "获得具体的职业判断",
  not_doing: "不承诺结果",
  compliance_redline: "不夸大、不虚构",
  hypotheses: [],
  persona_specific: {},
  content_directions: [],
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};

function generatedTopics() {
  return {
    topics: [
      {
        method_id: "human_pain",
        title: "绩效不错，我却越来越想走",
        alternative_titles: [
          "职位升了，反而不敢换公司",
          "团队扩张，我却想离开",
          "工资涨了，我更怕选错",
        ],
      },
      {
        method_id: "tug_of_war",
        title: "等晋升，还是先看新机会？",
        alternative_titles: [
          "留在原岗，还是出去面试？",
          "继续带团队，还是转回业务？",
          "先守住收入，还是试水创业？",
        ],
      },
    ],
  };
}

function auditCandidates(user: string) {
  const match = user.match(/候选标题：\n([\s\S]*?)\n\n仅输出 JSON/u);
  if (!match) throw new Error("test audit prompt did not include candidates");
  return JSON.parse(match[1]) as Array<{ candidate_id: string; title: string }>;
}

function modelResponse(data: unknown) {
  return {
    data,
    raw: { provider: "test", model: "test" },
  };
}

describe("原生标题语义审核二次恢复", () => {
  beforeEach(() => {
    llmJSONMock.mockReset();
  });

  it("首审全部拒绝后，只能由二审通过的未审静态候选完成整批交付", async () => {
    const auditBatches: Array<Array<{ candidate_id: string; title: string }>> = [];
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) return modelResponse(generatedTopics());
      const candidates = auditCandidates(input.user);
      auditBatches.push(candidates);
      const isFirstAudit = auditBatches.length === 1;
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: !isFirstAudit,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: isFirstAudit ? "模拟历史重复" : "模拟二审通过",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(auditBatches).toHaveLength(2);
    expect(result.nativeTitleAudit?.status).toBe("passed");
    expect(result.topics.map((topic) => topic.method_id)).toEqual(["human_pain", "tug_of_war"]);
    const firstAuditTitles = new Set(auditBatches[0].map((candidate) => candidate.title));
    const secondAuditTitles = new Set(auditBatches[1].map((candidate) => candidate.title));
    for (const topic of result.topics) {
      expect(firstAuditTitles.has(topic.title)).toBe(false);
      expect(secondAuditTitles.has(topic.title)).toBe(true);
    }
  });

  it("二审漏项时不释放任何未经审核的标题", async () => {
    let auditCalls = 0;
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) return modelResponse(generatedTopics());
      auditCalls += 1;
      const candidates = auditCandidates(input.user);
      if (auditCalls === 1) {
        return modelResponse({
          decisions: candidates.map((candidate) => ({
            candidate_id: candidate.candidate_id,
            novel: false,
            duplicate_reference_ids: [],
            conflicting_candidate_ids: [],
            reason: "模拟历史重复",
          })),
        });
      }
      return modelResponse({
        decisions: candidates.slice(0, -1).map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "故意漏项",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
      allowSourcePause: true,
    });

    // 二审自身会先追问一次漏掉的候选；仍然漏项才会 fail-closed。
    expect(auditCalls).toBe(3);
    expect(result.topics).toHaveLength(0);
    expect(result.nativeTitleAudit?.status).toBe("incomplete");
    expect(result.methodDeliveries.every((delivery) => delivery.status === "failed")).toBe(true);
  });

  it("审核偶发漏项时，只补审漏掉的候选后即可完成交付", async () => {
    let auditCalls = 0;
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) return modelResponse(generatedTopics());
      auditCalls += 1;
      const candidates = auditCandidates(input.user);
      if (auditCalls === 1) {
        return modelResponse({
          decisions: candidates.map((candidate) => ({
            candidate_id: candidate.candidate_id,
            novel: false,
            duplicate_reference_ids: [],
            conflicting_candidate_ids: [],
            reason: "模拟历史重复",
          })),
        });
      }
      if (auditCalls === 2) {
        return modelResponse({
          decisions: candidates.slice(0, -1).map((candidate) => ({
            candidate_id: candidate.candidate_id,
            novel: true,
            duplicate_reference_ids: [],
            conflicting_candidate_ids: [],
            reason: "故意漏掉一项",
          })),
        });
      }
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "补审通过",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(auditCalls).toBe(3);
    expect(result.nativeTitleAudit?.status).toBe("passed");
    expect(result.topics).toHaveLength(2);
  });
});
