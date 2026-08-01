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
  return JSON.parse(match[1]) as Array<{ candidate_id: string; method_id: string; title: string }>;
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

  it("首审全部拒绝后，直接用严格安全候选完成整批交付", async () => {
    const auditBatches: Array<Array<{ candidate_id: string; method_id: string; title: string }>> = [];
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) return modelResponse(generatedTopics());
      const candidates = auditCandidates(input.user);
      auditBatches.push(candidates);
      const isFirstAudit = auditBatches.length === 1;
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: !isFirstAudit,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: isFirstAudit ? "模拟表达不自然" : "模拟二审通过",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(auditBatches).toHaveLength(1);
    expect(result.nativeTitleAudit?.status).toBe("fallback_recovery");
    expect(result.topics.map((topic) => topic.method_id)).toEqual(["human_pain", "tug_of_war"]);
    const firstAuditTitles = new Set(auditBatches[0].map((candidate) => candidate.title));
    for (const topic of result.topics) {
      expect(firstAuditTitles.has(topic.title)).toBe(false);
    }
    const modelTitles = new Set(generatedTopics().topics.flatMap((topic) => [
      topic.title,
      ...topic.alternative_titles,
    ]));
    expect(result.topics.every((topic) => !modelTitles.has(topic.title))).toBe(true);
  });

  it("语义审核传输超时时，用严格本地门禁交付动态候选而不整批失败", async () => {
    let generationCalls = 0;
    let auditCalls = 0;
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) {
        generationCalls += 1;
        return modelResponse(generatedTopics());
      }
      auditCalls += 1;
      throw new Error("audit transport timeout");
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(generationCalls).toBe(2);
    expect(auditCalls).toBe(1);
    expect(result.nativeTitleAudit?.status).toBe("fallback_recovery");
    expect(result.topics.map((topic) => topic.method_id)).toEqual(["human_pain", "tug_of_war"]);
    expect(result.topics.map((topic) => topic.title)).toEqual([
      "绩效不错，我却越来越想走",
      "等晋升，还是先看新机会？",
    ]);
  });

  it("二审漏掉一个方法的 decision 时，只对漏项候选走严格本地恢复", async () => {
    let auditCalls = 0;
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) return modelResponse(generatedTopics());
      auditCalls += 1;
      const candidates = auditCandidates(input.user);
      if (auditCalls === 1) {
        return modelResponse({
          decisions: candidates.map((candidate) => ({
            candidate_id: candidate.candidate_id,
            novel: true,
            natural: false,
            duplicate_reference_ids: [],
            conflicting_candidate_ids: [],
            reason: "模拟表达不自然",
          })),
        });
      }
      return modelResponse({
        decisions: candidates.filter((candidate) => candidate.method_id !== "tug_of_war").map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: true,
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

    expect(auditCalls).toBe(1);
    expect(result.topics.map((topic) => topic.method_id)).toEqual(["human_pain", "tug_of_war"]);
    expect(result.nativeTitleAudit?.status).toBe("fallback_recovery");
    expect(result.methodDeliveries.find((delivery) => delivery.method_id === "human_pain")?.status).toBe("ready");
    expect(result.methodDeliveries.find((delivery) => delivery.method_id === "tug_of_war")?.status).toBe("ready");
  });

  it("首审拒绝后，不再等待二审即可完成安全交付", async () => {
    let auditCalls = 0;
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) return modelResponse(generatedTopics());
      auditCalls += 1;
      const candidates = auditCandidates(input.user);
      if (auditCalls === 1) {
        return modelResponse({
          decisions: candidates.map((candidate) => ({
            candidate_id: candidate.candidate_id,
            novel: true,
            natural: false,
            duplicate_reference_ids: [],
            conflicting_candidate_ids: [],
            reason: "模拟表达不自然",
          })),
        });
      }
      if (auditCalls === 2) {
        return modelResponse({
          decisions: candidates.map((candidate) => ({
            candidate_id: candidate.candidate_id,
            novel: true,
            natural: true,
            duplicate_reference_ids: [],
            conflicting_candidate_ids: [],
            reason: "二审通过",
          })),
        });
      }
      throw new Error("不应再发起第三次审核");
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(auditCalls).toBe(1);
    expect(result.nativeTitleAudit?.status).toBe("fallback_recovery");
    expect(result.topics).toHaveLength(2);
  });

  it("审核漏回 natural 时，只对该漏项候选走严格本地恢复", async () => {
    const auditBatches: Array<Array<{ candidate_id: string; method_id: string; title: string }>> = [];
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) return modelResponse(generatedTopics());
      const candidates = auditCandidates(input.user);
      auditBatches.push(candidates);
      if (auditBatches.length === 1) {
        return modelResponse({
          decisions: candidates.map((candidate, index) => ({
            candidate_id: candidate.candidate_id,
            novel: true,
            ...(index === 0 ? {} : { natural: false }),
            duplicate_reference_ids: [],
            conflicting_candidate_ids: [],
            reason: "首轮表达不完整",
          })),
        });
      }
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: true,
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

    expect(auditBatches).toHaveLength(1);
    expect(result.topics.some((topic) => topic.title === "绩效不错，我却越来越想走")).toBe(true);
    expect(result.nativeTitleAudit?.status).toBe("fallback_recovery");
    expect(result.topics).toHaveLength(2);
  });

  it("首轮标题模型中断后，会在受限恢复轮重新生成缺失原生槽位", async () => {
    let generationCalls = 0;
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) {
        generationCalls += 1;
        if (generationCalls === 1) throw new Error("Request was aborted");
        return modelResponse(generatedTopics());
      }
      const candidates = auditCandidates(input.user);
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "新标题",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(generationCalls).toBe(2);
    expect(result.generationAttempts).toBe(2);
    expect(result.topics.map((topic) => topic.method_id)).toEqual(["human_pain", "tug_of_war"]);
  });

  it("残缺标题在送审前被本地门禁挡住，并自动交付自然备选", async () => {
    const parentAccount: GrowthAccount = {
      ...account,
      id: "native-audit-parent-title-quality",
      business_line: "overseas_student",
      persona: "buyer",
      name: "留学生家长",
      target_user: "正在陪孩子准备秋招的留学生家长",
      core_problem: "孩子求职选择很多，家长想帮忙又怕越帮越乱",
      account_value: "记录陪孩子判断岗位和节奏的真实过程",
      one_liner: "陪海外读书的娃走秋招的真实家长记录",
    };
    const malformed = "我替孩子找内推，不如先对岗位";
    const naturalAlternative = "我替孩子找内推，不如先看岗位匹配";
    const auditBatches: Array<Array<{ candidate_id: string; title: string }>> = [];

    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) {
        return modelResponse({
          topics: [{
            method_id: "contrarian",
            title: malformed,
            alternative_titles: [naturalAlternative],
          }],
        });
      }
      const candidates = auditCandidates(input.user);
      auditBatches.push(candidates);
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "自然且新颖",
        })),
      });
    });

    const result = await generateTopicBatch({
      account: parentAccount,
      methodIds: ["contrarian"],
    });

    expect(result.topics.map((topic) => topic.title)).toEqual([naturalAlternative]);
    expect(result.rejectedTitles).toContain(malformed);
    expect(auditBatches).toHaveLength(1);
    expect(auditBatches[0].map((candidate) => candidate.title)).not.toContain(malformed);
    expect(auditBatches[0].map((candidate) => candidate.title)).toContain(naturalAlternative);
  });

  it("结构化候选被选中后使用该标题自己的正文承诺", async () => {
    const firstTitle = "年终奖到账，我反而更想走";
    const secondTitle = "工位没变，我先去外面面试";
    const firstPromise = "讲清年终奖到账后仍想离开的收入与方向冲突。";
    const secondPromise = "讲清岗位停滞后先用外部面试验证市场反馈的过程。";

    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) {
        return modelResponse({
          topics: [{
            method_id: "human_pain",
            title_candidates: [
              { title: firstTitle, title_promise: firstPromise },
              { title: secondTitle, title_promise: secondPromise },
            ],
          }],
        });
      }
      const candidates = auditCandidates(input.user);
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: candidate.title === secondTitle,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: candidate.title === secondTitle ? "新标题" : "模拟表达不自然",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain"],
    });

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].title).toBe(secondTitle);
    expect(result.topics[0].title_promise).toBe(secondPromise);
    expect(result.topics[0].title_promise).not.toBe(firstPromise);
  });

  it("已有候选全被拒绝时，优先使用严格安全库存而不触发第三轮补题", async () => {
    let generationCalls = 0;
    let auditCalls = 0;
    const recoveredPain = "年终奖到账，我却更怕留错";
    const recoveredChoice = "继续带团队，还是去做独立顾问？";
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) {
        generationCalls += 1;
        return generationCalls <= 2
          ? modelResponse(generatedTopics())
          : modelResponse({
            topics: [
              { method_id: "human_pain", title: recoveredPain, alternative_titles: [] },
              { method_id: "tug_of_war", title: recoveredChoice, alternative_titles: [] },
            ],
          });
      }
      auditCalls += 1;
      const candidates = auditCandidates(input.user);
      const isRecoveryAudit = auditCalls === 3;
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: isRecoveryAudit,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: isRecoveryAudit ? "定向补题通过" : "旧候选表达不自然",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(generationCalls).toBe(2);
    expect(auditCalls).toBe(1);
    expect(result.topics).toHaveLength(2);
    expect(result.topics.map((topic) => topic.title)).not.toContain(recoveredPain);
    expect(result.topics.map((topic) => topic.title)).not.toContain(recoveredChoice);
    expect(result.nativeTitleAudit?.status).toBe("fallback_recovery");
  });

  it("语义审核传输异常后，直接用严格本地门禁恢复而不再请求操作者", async () => {
    let generationCalls = 0;
    let auditCalls = 0;
    const recoveredPain = "年终奖到账，我更怕留错位置";
    const recoveredChoice = "继续带团队，还是先去试水？";
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) {
        generationCalls += 1;
        return generationCalls <= 2
          ? modelResponse(generatedTopics())
          : modelResponse({
            topics: [
              { method_id: "human_pain", title: recoveredPain, alternative_titles: [] },
              { method_id: "tug_of_war", title: recoveredChoice, alternative_titles: [] },
            ],
          });
      }
      auditCalls += 1;
      if (auditCalls <= 2) throw new Error("audit transport timeout");
      const candidates = auditCandidates(input.user);
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "定向补题通过",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain", "tug_of_war"],
    });

    expect(generationCalls).toBe(2);
    expect(auditCalls).toBe(1);
    expect(result.topics.map((topic) => topic.title)).toEqual([
      "绩效不错，我却越来越想走",
      "等晋升，还是先看新机会？",
    ]);
    expect(result.nativeTitleAudit?.status).toBe("fallback_recovery");
  });

  it("首轮没有本地候选时，仍会为锁定槽位定向补题并审核交付", async () => {
    let generationCalls = 0;
    const lockedTitle = "升职后，我更不敢换方向";
    const recoveredTitle = "升职后，我为何先不换方向";
    const lockedTopic = {
      id: "locked-human-pain",
      method_group: "native",
      method_id: "human_pain",
      method_label: "行业人性痛点",
      generation_mode: "default",
      title: lockedTitle,
      title_promise: "讲清升职后的职业选择焦虑。",
      target_user: account.target_user,
      pain: account.core_problem,
      hook: lockedTitle,
      origin_force: "晋升后重新判断去留",
      conflict_judgement: "先守住平台还是验证新机会",
      follow_reason: "获得职业判断",
      test_variable: "标题测试",
      expected_signal: "有效咨询",
      repeatable_angle: "锁定方向的自然改写",
      broad_traffic_risk: 2,
      priority: "A",
    } as any;
    llmJSONMock.mockImplementation(async (input: { user: string }) => {
      if (!input.user.includes("语义新颖度终审")) {
        generationCalls += 1;
        return generationCalls <= 2
          ? modelResponse({ topics: [] })
          : modelResponse({
            topics: [{ method_id: "human_pain", title: recoveredTitle, alternative_titles: [] }],
          });
      }
      const candidates = auditCandidates(input.user);
      return modelResponse({
        decisions: candidates.map((candidate) => ({
          candidate_id: candidate.candidate_id,
          novel: true,
          natural: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "锁定方向补题通过",
        })),
      });
    });

    const result = await generateTopicBatch({
      account,
      methodIds: ["human_pain"],
      directionLocks: { human_pain: lockedTopic },
    });

    expect(generationCalls).toBe(3);
    expect(result.topics.map((topic) => topic.title)).toEqual([recoveredTitle]);
    expect(result.nativeTitleAudit?.status).toBe("passed");
  });
});
