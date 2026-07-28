import { describe, expect, it } from "vitest";
import {
  deterministicMigrationFit,
  ensureBenchmarkStructureCards,
  SOURCE_MIGRATION_VERSION,
  sourceMethodFit,
  sourceSnapshotFitsMethod,
  sourceSemanticSlots,
  titleStructureSignals,
  validateSourceMigrations,
} from "./sourceMigration";
import type { GrowthAccount, TopicSourceSnapshot } from "./types";

function source(
  methodId: TopicSourceSnapshot["method_id"],
  originalTitle: string,
): TopicSourceSnapshot {
  return {
    id: "source",
    method_id: methodId,
    platform: "小红书",
    author: "作者",
    original_title: originalTitle,
    original_url: "https://www.xiaohongshu.com/explore/source",
    published_at: new Date().toISOString(),
    heat_snapshot: "互动1000",
    collected_at: new Date().toISOString(),
    link_status: "accessible",
    verified_by_operator: true,
    freshness: "within_72h",
  };
}

function account(): GrowthAccount {
  const timestamp = new Date().toISOString();
  return {
    id: "account",
    tenant_id: "mianbajun",
    business_line: "executive",
    persona: "merchant",
    name: "职业决策服务商",
    target_user: "正在比较职业决策服务的中高管",
    core_problem: "不知道职业咨询是否适配自己的转型处境",
    account_value: "先判断适配，再说明交付边界",
    trust_source: "真实交付案例",
    one_liner: "职业决策服务商",
    follow_reason: "持续了解职业咨询如何交付",
    not_doing: "不承诺结果",
    compliance_redline: "不夸大",
    hypotheses: [],
    persona_specific: {},
    content_directions: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

describe("对标母题与迁移门禁 v3.8", () => {
  it("使用锁定结构卡版本，避免回退到生成器自述迁移", () => {
    expect(SOURCE_MIGRATION_VERSION).toBe("v3_8");
  });

  it("不把00后人群身份误判成数字清单结构", () => {
    expect(titleStructureSignals("00后毕业生邪修boss直聘，高尔夫球场找工作").has("number")).toBe(false);
  });

  it("拒绝把心理访谈当作中高管职业决策的相同产品", () => {
    const item = source(
      "same_product",
      "对谈武志红：为何你总在自卑自信间反复横跳？",
    );
    expect(sourceSnapshotFitsMethod(item, "executive").passed).toBe(false);
  });

  it("接受真正同类的职业咨询产品母题", () => {
    expect(sourceMethodFit({
      methodId: "same_product",
      businessLine: "executive",
      title: "职业规划咨询前，先确认顾问会不会做方向诊断",
    }).passed).toBe(true);
  });

  it("允许跨行业迁移相同的风险预警功效，但必须保留原题关系", () => {
    expect(sourceMethodFit({
      methodId: "same_effect",
      businessLine: "executive",
      title: "iPhone用户怎么识别入侵信号？",
    }).passed).toBe(true);
    expect(deterministicMigrationFit({
      methodId: "same_effect",
      businessLine: "executive",
      sourceTitle: "iPhone用户怎么识别入侵信号？",
      newTitle: "中高管怎么识别转型信号？",
    }).passed).toBe(true);
  });

  it("拒绝只套产品词、却没有迁移原题关系的相同产品标题", () => {
    expect(deterministicMigrationFit({
      methodId: "same_product",
      businessLine: "executive",
      sourceTitle: "为什么找职业顾问前，要先问这3件事？",
      newTitle: "职业卡壳？找顾问做方向体检",
    }).passed).toBe(false);
    expect(deterministicMigrationFit({
      methodId: "same_product",
      businessLine: "executive",
      sourceTitle: "为什么找职业顾问前，要先问这3件事？",
      newTitle: "中高管筛顾问，先过3道关",
    }).passed).toBe(true);
  });

  it("相似人群必须既保留处境关系，也点明当前业务人群", () => {
    expect(deterministicMigrationFit({
      methodId: "similar_audience",
      businessLine: "executive",
      sourceTitle: "为什么35岁中层转型前，总会忽略一件事？",
      newTitle: "转型前，最容易忽略的一件事",
    }).passed).toBe(false);
    expect(deterministicMigrationFit({
      methodId: "similar_audience",
      businessLine: "executive",
      sourceTitle: "为什么35岁中层转型前，总会忽略一件事？",
      newTitle: "为什么中高管转型前，总会忽略一件事？",
    }).passed).toBe(true);
  });

  it("相似人群原题若靠具体求职渠道制造反差，新标题不能退化成泛动作", () => {
    const sourceTitle = "00后毕业生邪修boss直聘，高尔夫球场找工作";
    expect(deterministicMigrationFit({
      methodId: "similar_audience",
      businessLine: "overseas_student",
      sourceTitle,
      newTitle: "留学生反向捋秋招，刚好赶上窗口",
    }).passed).toBe(false);
    expect(deterministicMigrationFit({
      methodId: "similar_audience",
      businessLine: "overseas_student",
      sourceTitle,
      newTitle: "留学生不只海投，先去校友会找内推",
    }).passed).toBe(true);
  });

  it("把具体渠道、人群和关系提取为 v3.8 语义槽位，而不是退化为通用句式卡", () => {
    const slots = sourceSemanticSlots({
      methodId: "similar_audience",
      sourceTitle: "00后毕业生邪修boss直聘，高尔夫球场找工作",
    });
    expect(slots).toMatchObject({
      audience_or_role: "00后毕业生",
      scene_or_channel: "线下非传统求职场景",
    });
    expect(slots?.required_slot_keys).toContain("audience_or_role");
    expect(slots?.required_slot_keys).toContain("scene_or_channel");
  });

  it("相似人群的渠道型母题必须在新标题中映射成当前业务的具体渠道", async () => {
    const current = {
      ...account(),
      business_line: "overseas_student" as const,
      persona: "buyer" as const,
      target_user: "正在准备秋招的留学生和家长",
      core_problem: "不知道如何在有限时间内找到合适岗位",
    };
    const item = source("similar_audience", "00后毕业生邪修boss直聘，高尔夫球场找工作");
    const prepared = await ensureBenchmarkStructureCards({ account: current, sources: [item] });
    const card = prepared.cards[0]!;

    const [generic] = await validateSourceMigrations({
      businessLine: "overseas_student",
      persona: "buyer",
      targetUser: current.target_user,
      coreProblem: current.core_problem,
      candidates: [{
        candidateId: "generic",
        methodId: "similar_audience",
        methodLabel: "相似人群",
        source: item,
        structureCard: card,
        title: "留学生反向捋秋招，刚好赶上窗口",
        inheritedStructure: card.inheritable_element,
        replacedContent: card.replacement_requirement,
      }],
    });
    expect(generic.passed).toBe(false);
    expect(generic.reason).toContain("原题场景/渠道");

    const [mapped] = await validateSourceMigrations({
      businessLine: "overseas_student",
      persona: "buyer",
      targetUser: current.target_user,
      coreProblem: current.core_problem,
      candidates: [{
        candidateId: "mapped",
        methodId: "similar_audience",
        methodLabel: "相似人群",
        source: item,
        structureCard: card,
        title: "留学生不只海投，先去校友会找内推",
        inheritedStructure: card.inheritable_element,
        replacedContent: card.replacement_requirement,
      }],
    });
    expect(mapped.passed).toBe(true);
    expect(mapped.evidence).toContain("原题「00后毕业生邪修boss直聘，高尔夫球场找工作」");
  });

  it("没有至少两项可迁移关系的母题不锁结构卡，来源型标题应暂停", async () => {
    const current = account();
    const item = source("viral_framework", "为什么要努力？");
    const prepared = await ensureBenchmarkStructureCards({ account: current, sources: [item] });
    expect(prepared.cards).toHaveLength(0);
    expect(prepared.rejected[0]?.reason).toContain("至少两项可迁移");
  });

  it("爆款框架必须继承可识别的句式或冲突结构", () => {
    expect(deterministicMigrationFit({
      methodId: "viral_framework",
      businessLine: "executive",
      sourceTitle: "老师过度真诚，是一种商业上的不成熟",
      newTitle: "高管怕裸辞，是错把平台当能力",
    }).passed).toBe(true);
    expect(deterministicMigrationFit({
      methodId: "viral_framework",
      businessLine: "executive",
      sourceTitle: "老师过度真诚，是一种商业上的不成熟",
      newTitle: "中高管转型前先查现金流",
    }).passed).toBe(false);
  });

  it("爆款框架只要求保留句式关系，不错误复刻来源动作", async () => {
    const current = account();
    const item = source("viral_framework", "你缺的不是客户，是跟进客户的能力");
    const prepared = await ensureBenchmarkStructureCards({ account: current, sources: [item] });
    const card = prepared.cards[0]!;
    const [decision] = await validateSourceMigrations({
      businessLine: "executive",
      persona: "merchant",
      targetUser: current.target_user,
      coreProblem: current.core_problem,
      candidates: [{
        candidateId: "framework",
        methodId: "viral_framework",
        methodLabel: "爆款框架",
        source: item,
        structureCard: card,
        title: "中高管缺的不是机会，是判断胜率",
        inheritedStructure: card.inheritable_element,
        replacedContent: card.replacement_requirement,
      }],
    });
    expect(card.semantic_slots.required_slot_keys).toEqual(["relationship"]);
    expect(decision.passed).toBe(true);
  });

  it("终极结果相同必须继承同类最终利益", () => {
    expect(deterministicMigrationFit({
      methodId: "same_outcome",
      businessLine: "executive",
      sourceTitle: "别只争升职，要争职业选择权",
      newTitle: "别只换岗位，要把选择权拿回来",
    }).passed).toBe(true);
    expect(deterministicMigrationFit({
      methodId: "same_outcome",
      businessLine: "executive",
      sourceTitle: "别只争升职，要争职业选择权",
      newTitle: "离职前先改三版简历",
    }).passed).toBe(false);
  });

  it("保存给操作者的链路能说明原题结构、当前替换和新标题", async () => {
    const current = account();
    const item = source("same_product", "为什么找职业顾问前，要先问这3件事？");
    const prepared = await ensureBenchmarkStructureCards({ account: current, sources: [item] });
    const card = prepared.cards[0];
    expect(card).toBeTruthy();

    const [decision] = await validateSourceMigrations({
      businessLine: "executive",
      persona: "merchant",
      targetUser: current.target_user,
      coreProblem: current.core_problem,
      candidates: [{
        candidateId: "candidate",
        methodId: "same_product",
        methodLabel: "相同产品",
        source: item,
        structureCard: card,
        title: "中高管筛顾问，先过3道关",
        inheritedStructure: card.inheritable_element,
        replacedContent: card.replacement_requirement,
      }],
    });

    expect(decision.passed).toBe(true);
    expect(decision.evidence).toContain(`原题「${item.original_title}」`);
    expect(decision.evidence).toContain("迁移逻辑：");
    expect(decision.evidence).toContain("新标题「中高管筛顾问，先过3道关」");
    expect(decision.evidence).toContain("当前替换：以商家视角");
    expect(decision.evidence).toContain(current.target_user);

    const [tooClose] = await validateSourceMigrations({
      businessLine: "executive",
      persona: "merchant",
      targetUser: current.target_user,
      coreProblem: current.core_problem,
      candidates: [{
        candidateId: "copy",
        methodId: "same_product",
        methodLabel: "相同产品",
        source: item,
        structureCard: card,
        title: "找职业顾问前，先问这3件事",
        inheritedStructure: card.inheritable_element,
        replacedContent: card.replacement_requirement,
      }],
    });
    expect(tooClose.passed).toBe(false);
    expect(tooClose.reason).toContain("过于接近");
  });
});
