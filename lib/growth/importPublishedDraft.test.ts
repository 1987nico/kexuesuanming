import { describe, expect, it } from "vitest";
import { buildImportedPublishedDraft, findDraftByTitle } from "./importPublishedDraft";
import type { ContentDraft, GrowthAccount, GrowthRun } from "./types";

const account: GrowthAccount = {
  id: "0d04c9b7-402e-4f7e-aa2b-1fcb15acd11b",
  tenant_id: "mianbajun",
  persona: "buyer",
  name: "面霸君",
  target_user: "转型中的中高管",
  core_problem: "职业方向",
  account_value: "提供决策参考",
  trust_source: "真实咨询案例",
  not_doing: "不承诺结果",
  hypotheses: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const run: GrowthRun = {
  id: "b8cb58ad-b697-468d-8622-8a1fc25d3dad",
  tenant_id: "mianbajun",
  account_id: account.id,
  status: "ready",
  week: 1,
  objective: "验证方向",
  experiment_hypothesis: "标题更具体会提升阅读",
  topic_pool: [],
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

describe("补录已发布笔记", () => {
  it("建立可进入24小时复盘的独立发布记录", () => {
    const draft = buildImportedPublishedDraft({
      account,
      run,
      ownerUserId: "operator-1",
      title: " 裸辞第60天，不敢删前公司工牌 ",
      body: "这是一篇已经实际发布、需要补回复盘清单的完整正文。",
      direction: "C",
      contentType: "story",
      publishedAt: "2026-07-13T02:00:00.000Z",
      now: "2026-07-14T03:00:00.000Z",
    });

    expect(draft.status).toBe("published");
    expect(draft.title).toBe("裸辞第60天，不敢删前公司工牌");
    expect(draft.published_at).toBe("2026-07-13T02:00:00.000Z");
    expect(draft.account_id).toBe(account.id);
    expect(draft.run_id).toBe(run.id);
  });

  it("忽略标点与空格识别同标题，防止补录重复", () => {
    const existing = buildImportedPublishedDraft({
      account,
      run,
      ownerUserId: "operator-1",
      title: "裸辞第60天，不敢删前公司工牌",
      body: "一段完整正文，用于补录和后续复盘判断。",
      direction: "C",
      contentType: "story",
      publishedAt: "2026-07-13T02:00:00.000Z",
    });

    expect(findDraftByTitle([existing] as ContentDraft[], "裸辞第 60 天：不敢删前公司工牌")).toBe(existing);
  });
});
