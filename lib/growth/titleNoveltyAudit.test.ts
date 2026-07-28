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
  it("把同义改写的历史标题标成不通过，并保留批内冲突信息", () => {
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
      conflictingCandidateIds: ["C2"],
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
