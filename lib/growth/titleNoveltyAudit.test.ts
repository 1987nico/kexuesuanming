import { describe, expect, it } from "vitest";
import {
  buildNativeTitleNoveltyAuditPrompt,
  nativeTitleNoveltyCoverage,
  normalizeNativeTitleNoveltyDecisions,
  type NativeTitleNoveltyCandidate,
  type NativeTitleNoveltyReference,
} from "./titleNoveltyAudit";

const candidates: NativeTitleNoveltyCandidate[] = [
  { id: "C1", methodId: "human_pain", kind: "model", title: "供娃留完学，秋招方向他自己都懵" },
  { id: "C2", methodId: "nostalgia", kind: "fallback", title: "以前拼学校，现在练面试" },
];

const references: NativeTitleNoveltyReference[] = [
  { id: "H1", kind: "history", title: "娃留完学，连秋招投什么都犹豫" },
  { id: "S1", kind: "selected", title: "留学生秋招前先查时间线" },
];

describe("原生标题批次语义新颖度审核", () => {
  it("把同义改写的历史标题标成不通过，并过滤没有本地证据的批内冲突", () => {
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [
        {
          candidate_id: "C1",
          novel: false,
          natural: true,
          duplicate_reference_ids: ["H1"],
          conflicting_candidate_ids: ["C2"],
          reason: "与历史同一亲子秋招困境",
        },
        {
          candidate_id: "C2",
          novel: true,
          natural: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: ["C1"],
          reason: "素材不同",
        },
      ],
    }, candidates, references);

    expect(decisions[0]).toMatchObject({
      candidateId: "C1",
      novel: false,
      natural: true,
      eligible: false,
      duplicateReferenceIds: ["H1"],
      conflictingCandidateIds: [],
    });
    expect(decisions[1]).toMatchObject({ candidateId: "C2", novel: true, natural: true, eligible: true });
  });

  it("缺失候选或自相矛盾的审核结果默认不放行", () => {
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{ candidate_id: "C1", novel: true, natural: true, duplicate_reference_ids: ["H1"] }],
    }, candidates, references);
    expect(decisions[0].novel).toBe(false);
    expect(decisions[1]).toMatchObject({ novel: false, natural: false, eligible: false });
  });

  it("模型只因方法形式泛化拒绝、却没有重复证据时，按本地严格门禁放行", () => {
    const inventoryCandidates: NativeTitleNoveltyCandidate[] = [
      {
        id: "I1",
        methodId: "inventory",
        kind: "model",
        title: "秋招陪跑，盘点4个投递盲区",
        titlePromise: "盘点投递动作里容易忽略的四个盲区",
      },
    ];
    const inventoryReferences: NativeTitleNoveltyReference[] = [
      { id: "IH1", kind: "history", title: "留学生求职，盘点5项简历硬证据" },
    ];
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{
        candidate_id: "I1",
        novel: false,
        natural: true,
        duplicate_reference_ids: [],
        conflicting_candidate_ids: [],
        reason: "都是盘点句式",
      }],
    }, inventoryCandidates, inventoryReferences);

    expect(decisions[0]).toMatchObject({
      novel: true,
      natural: true,
      eligible: true,
      duplicateReferenceIds: [],
    });
    expect(decisions[0]?.reason).toContain("缺少可复核");
  });

  it("痛点、拔河和反认知等方法没有可复核同题证据时也不能被泛化误拒", () => {
    const nativeCandidates: NativeTitleNoveltyCandidate[] = [
      { id: "P1", methodId: "human_pain", kind: "model", title: "老板问续约，我却先看回国窗口" },
      { id: "T1", methodId: "tug_of_war", kind: "model", title: "先守毕业论文，还是提前进岗？" },
      { id: "C1", methodId: "contrarian", kind: "model", title: "面试越多，越要停下查方向" },
    ];
    const nativeReferences: NativeTitleNoveltyReference[] = [
      { id: "H1", kind: "history", title: "秋招没回音，我开始怀疑方向" },
    ];
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: nativeCandidates.map((candidate) => ({
        candidate_id: candidate.id,
        novel: false,
        natural: true,
        duplicate_reference_ids: [],
        conflicting_candidate_ids: [],
        reason: "都属于留学生求职",
      })),
    }, nativeCandidates, nativeReferences);

    expect(decisions).toHaveLength(3);
    expect(decisions.every((decision) => decision.eligible)).toBe(true);
    expect(decisions.every((decision) => decision.reason.includes("缺少可复核"))).toBe(true);
  });

  it("非资料类方法指出且本地复核确认的同题仍然必须拒绝", () => {
    const nativeCandidates: NativeTitleNoveltyCandidate[] = [
      { id: "P1", methodId: "human_pain", kind: "model", title: "绩效越好，辞职信越难写" },
    ];
    const nativeReferences: NativeTitleNoveltyReference[] = [
      { id: "H1", kind: "history", title: "绩效越高，辞职信越难写" },
    ];
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{
        candidate_id: "P1",
        novel: false,
        natural: true,
        duplicate_reference_ids: ["H1"],
        conflicting_candidate_ids: [],
        reason: "同一绩效辞职困境",
      }],
    }, nativeCandidates, nativeReferences);

    expect(decisions[0]).toMatchObject({
      novel: false,
      natural: true,
      eligible: false,
      duplicateReferenceIds: ["H1"],
    });
  });

  it("模型引用了并不同题的历史标题时，不把无效引用当成硬拒绝", () => {
    const inventoryCandidates: NativeTitleNoveltyCandidate[] = [
      { id: "I1", methodId: "inventory", kind: "model", title: "秋招陪跑，盘点4个投递盲区" },
    ];
    const inventoryReferences: NativeTitleNoveltyReference[] = [
      { id: "IH1", kind: "history", title: "留学生求职，盘点5项简历硬证据" },
    ];
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{
        candidate_id: "I1",
        novel: false,
        natural: true,
        duplicate_reference_ids: ["IH1"],
        conflicting_candidate_ids: [],
        reason: "都是盘点",
      }],
    }, inventoryCandidates, inventoryReferences);

    expect(decisions[0]).toMatchObject({
      novel: true,
      eligible: true,
      duplicateReferenceIds: [],
    });
  });

  it("盘点法固定外壳相同但盘点对象不同时放行", () => {
    const inventoryCandidates: NativeTitleNoveltyCandidate[] = [
      {
        id: "I1",
        methodId: "inventory",
        kind: "model",
        title: "留学生求职，盘点4类入职认证材料",
      },
    ];
    const inventoryReferences: NativeTitleNoveltyReference[] = [
      {
        id: "IH1",
        kind: "history",
        title: "留学生求职，盘点3种群面核心角色",
      },
    ];
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{
        candidate_id: "I1",
        novel: false,
        natural: true,
        duplicate_reference_ids: ["IH1"],
        conflicting_candidate_ids: [],
        reason: "都以留学生求职盘点开头",
      }],
    }, inventoryCandidates, inventoryReferences);

    expect(decisions[0]).toMatchObject({
      novel: true,
      eligible: true,
      duplicateReferenceIds: [],
    });
  });

  it("盘点法同一对象只换数量时继续拒绝", () => {
    const inventoryCandidates: NativeTitleNoveltyCandidate[] = [
      {
        id: "I1",
        methodId: "inventory",
        kind: "model",
        title: "秋招陪跑，盘点5项异地入职提前量",
      },
    ];
    const inventoryReferences: NativeTitleNoveltyReference[] = [
      {
        id: "IH1",
        kind: "history",
        title: "秋招陪跑，盘点3项异地入职提前量",
      },
    ];
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{
        candidate_id: "I1",
        novel: false,
        natural: true,
        duplicate_reference_ids: ["IH1"],
        conflicting_candidate_ids: [],
        reason: "同一异地入职提前量盘点",
      }],
    }, inventoryCandidates, inventoryReferences);

    expect(decisions[0]).toMatchObject({
      novel: false,
      eligible: false,
      duplicateReferenceIds: ["IH1"],
    });
  });

  it("模型指出且本地复核确认的历史同题仍然必须拒绝", () => {
    const duplicateCandidates: NativeTitleNoveltyCandidate[] = [
      { id: "D1", methodId: "inventory", kind: "model", title: "秋招陪跑常见的4个低效动作" },
    ];
    const duplicateReferences: NativeTitleNoveltyReference[] = [
      { id: "DH1", kind: "history", title: "秋招陪跑常见的3个低效动作" },
    ];
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{
        candidate_id: "D1",
        novel: false,
        natural: true,
        duplicate_reference_ids: ["DH1"],
        conflicting_candidate_ids: [],
        reason: "同一低效动作盘点",
      }],
    }, duplicateCandidates, duplicateReferences);

    expect(decisions[0]).toMatchObject({
      novel: false,
      natural: true,
      eligible: false,
      duplicateReferenceIds: ["DH1"],
    });
  });

  it("把审核漏项单独识别为不完整，而不是伪装成标题重复", () => {
    const raw = {
      decisions: [{ candidate_id: "C1", novel: true, natural: true, duplicate_reference_ids: [] }],
    };
    expect(nativeTitleNoveltyCoverage(raw, candidates)).toEqual({
      complete: false,
      missingCandidateIds: ["C2"],
    });
  });

  it("完整但明确拒绝的审核，和审核漏项保持可区分", () => {
    const raw = {
      decisions: [
        { candidate_id: "C1", novel: false, natural: true, duplicate_reference_ids: ["H1"] },
        { candidate_id: "C2", novel: false, natural: true, duplicate_reference_ids: [] },
      ],
    };
    expect(nativeTitleNoveltyCoverage(raw, candidates)).toEqual({
      complete: true,
      missingCandidateIds: [],
    });
  });

  it("提示词明确要求按真实母题而非词面重合审核", () => {
    const prompt = buildNativeTitleNoveltyAuditPrompt({
      businessLine: "overseas_student",
      persona: "buyer",
      targetUser: "留学生家长",
      coreProblem: "秋招方向与家庭沟通",
      candidates,
      references,
    });
    expect(prompt).toContain("同一个“具体人物/阶段 + 场景或动作 + 核心冲突/结果”");
    expect(prompt).toContain("供娃留完学，秋招方向他自己都懵");
    expect(prompt).toContain("娃留完学，连秋招投什么都犹豫");
    expect(prompt).toContain("自然、完整的简体中文");
    expect(prompt).toContain("\"natural\": true");
    expect(prompt).toContain("我替孩子找内推，不如先对岗位");
    expect(prompt).toContain("必须区分“方法固有形式”和“真实母题”");
    expect(prompt).toContain("岗位匹配清单");
    expect(prompt).toContain("投递优先级清单");
    expect(prompt).toContain("novel=false 必须同时给出至少一个真正同题");
  });

  it("语义新颖但被判为残句的标题不能放行", () => {
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [
        {
          candidate_id: "C1",
          novel: true,
          natural: false,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "表达残缺",
        },
        {
          candidate_id: "C2",
          novel: true,
          natural: true,
          duplicate_reference_ids: [],
          conflicting_candidate_ids: [],
          reason: "自然完整",
        },
      ],
    }, candidates, references);

    expect(decisions[0]).toMatchObject({ candidateId: "C1", natural: false, novel: true, eligible: false });
    expect(decisions[1]).toMatchObject({ candidateId: "C2", natural: true, novel: true, eligible: true });
  });

  it("自然度字段缺失时不放行，避免审核模型漏字段后交付残句", () => {
    const decisions = normalizeNativeTitleNoveltyDecisions({
      decisions: [{ candidate_id: "C1", novel: true, duplicate_reference_ids: [] }],
    }, candidates, references);

    expect(decisions[0]).toMatchObject({ candidateId: "C1", novel: true, natural: false, eligible: false });
  });

  it("自然度或新颖度字段缺失时，覆盖率必须标为不完整并进入补审", () => {
    const raw = {
      decisions: [
        { candidate_id: "C1", novel: true, duplicate_reference_ids: [] },
        { candidate_id: "C2", natural: true, duplicate_reference_ids: [] },
      ],
    };
    expect(nativeTitleNoveltyCoverage(raw, candidates)).toEqual({
      complete: false,
      missingCandidateIds: ["C1", "C2"],
    });
  });
});
