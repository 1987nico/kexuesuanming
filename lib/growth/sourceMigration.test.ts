import { describe, expect, it } from "vitest";
import {
  deterministicMigrationFit,
  sourceMethodFit,
  sourceSnapshotFitsMethod,
} from "./sourceMigration";
import type { TopicSourceSnapshot } from "./types";

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

describe("对标母题与迁移门禁 v3.6", () => {
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

  it("允许跨行业迁移相同的风险预警功效", () => {
    expect(sourceMethodFit({
      methodId: "same_effect",
      businessLine: "executive",
      title: "iPhone用户根本不知道自己手机已被入侵",
    }).passed).toBe(true);
    expect(deterministicMigrationFit({
      methodId: "same_effect",
      businessLine: "executive",
      sourceTitle: "iPhone用户根本不知道自己手机已被入侵",
      newTitle: "你选的方向，早有选错信号",
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
      newTitle: "高管转型，先把选择权拿回来",
    }).passed).toBe(true);
    expect(deterministicMigrationFit({
      methodId: "same_outcome",
      businessLine: "executive",
      sourceTitle: "别只争升职，要争职业选择权",
      newTitle: "离职前先改三版简历",
    }).passed).toBe(false);
  });
});
