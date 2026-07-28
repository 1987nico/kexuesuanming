import { describe, expect, it } from "vitest";
import {
  deterministicMigrationFit,
  ensureBenchmarkStructureCards,
  SOURCE_MIGRATION_VERSION,
  sourceMethodFit,
  sourceSnapshotFitsMethod,
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

describe("对标母题与迁移门禁 v3.7", () => {
  it("使用锁定结构卡版本，避免回退到生成器自述迁移", () => {
    expect(SOURCE_MIGRATION_VERSION).toBe("v3_7");
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
    expect(decision.evidence).toContain("可复用结构：");
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
