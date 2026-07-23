import { describe, expect, it, vi } from "vitest";
import type { GrowthStore } from "./store";
import type { GrowthAccount, ThreeDayReviewCycle } from "./types";
import {
  mergeThreeDayReviewCycles,
  reviewOwnerAccounts,
  reviewWorkspaceAccounts,
  saveSharedReviewCycles,
} from "./reviewCycleWorkspace";

function account(
  id: string,
  persona: GrowthAccount["persona"],
  ownerUserId: string | null,
  businessLine: GrowthAccount["business_line"] = "executive",
): GrowthAccount {
  return {
    id,
    tenant_id: "mianbajun",
    owner_user_id: ownerUserId,
    business_line: businessLine,
    persona,
    name: id,
    target_user: "中高管",
    core_problem: "职业决策",
    account_value: "判断",
    trust_source: "案例",
    not_doing: "不保证结果",
    hypotheses: [],
    created_at: `2026-07-0${persona === "merchant" ? 1 : persona === "buyer" ? 2 : 3}T00:00:00.000Z`,
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function cycle(id: string, status: ThreeDayReviewCycle["status"], updatedAt: string, cycleNumber: number): ThreeDayReviewCycle {
  return {
    id,
    account_id: "merchant",
    business_line: "executive",
    persona: "merchant",
    cycle_number: cycleNumber,
    status,
    started_at: updatedAt,
    due_at: updatedAt,
    source_file_name: "x.xlsx",
    source_file_size: 1,
    source_row_count: 0,
    imported_at: updatedAt,
    traffic_confirmed: false,
    notes: [],
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

describe("三日复盘业务工作区", () => {
  it("只聚合同一真实归属的三视角账号", async () => {
    const current = account("buyer-a", "buyer", "user-a");
    const accounts = [
      account("merchant-a", "merchant", "user-a"),
      current,
      account("expert-b", "expert", "user-b"),
      account("legacy", "expert", null),
    ];
    const store = { listAccounts: vi.fn().mockResolvedValue(accounts) } as unknown as GrowthStore;
    const result = await reviewWorkspaceAccounts(store, current, "user-a");
    expect(result.map((item) => item.id).sort()).toEqual(["buyer-a", "merchant-a"]);
  });

  it("账号级导入会读取同一归属下两条业务的全部人设", async () => {
    const current = account("buyer-a", "buyer", "user-a");
    const accounts = [
      current,
      account("expert-a", "expert", "user-a"),
      account("overseas-a", "merchant", "user-a", "overseas_student"),
      account("overseas-b", "buyer", "user-b", "overseas_student"),
      account("legacy", "expert", null, "overseas_student"),
    ];
    const store = { listAccounts: vi.fn().mockResolvedValue(accounts) } as unknown as GrowthStore;
    const result = await reviewOwnerAccounts(store, current, "user-a");
    expect(result.map((item) => item.id).sort()).toEqual(["buyer-a", "expert-a", "overseas-a"]);
  });

  it("多个旧草稿周期只保留最近更新的一轮", () => {
    const merchant = { ...account("merchant", "merchant", "user-a"), three_day_review_cycles: [
      cycle("completed", "completed", "2026-07-19T00:00:00.000Z", 1),
      cycle("stale", "draft", "2026-07-20T00:00:00.000Z", 2),
    ] };
    const buyer = { ...account("buyer", "buyer", "user-a"), three_day_review_cycles: [
      cycle("latest", "draft", "2026-07-21T00:00:00.000Z", 2),
    ] };
    expect(mergeThreeDayReviewCycles([merchant, buyer]).map((item) => item.id))
      .toEqual(["completed", "latest"]);
  });

  it("完成新周期后不会让其他视角残留的旧草稿复活", () => {
    const merchant = { ...account("merchant", "merchant", "user-a"), three_day_review_cycles: [
      cycle("completed-new", "completed", "2026-07-22T12:00:00.000Z", 3),
    ] };
    const buyer = { ...account("buyer", "buyer", "user-a"), three_day_review_cycles: [
      cycle("stale-old", "draft", "2026-07-21T12:00:00.000Z", 2),
    ] };
    expect(mergeThreeDayReviewCycles([merchant, buyer]).map((item) => item.id))
      .toEqual(["completed-new"]);
  });

  it("共享周期只写入稳定的规范账号", async () => {
    const saveAccount = vi.fn().mockResolvedValue(undefined);
    const store = { saveAccount } as unknown as GrowthStore;
    const accounts = [account("expert", "expert", "user-a"), account("merchant", "merchant", "user-a")];
    await saveSharedReviewCycles(store, accounts, [cycle("active", "draft", "2026-07-21T00:00:00.000Z", 1)]);
    expect(saveAccount).toHaveBeenCalledTimes(1);
    expect(saveAccount.mock.calls[0][0].id).toBe("merchant");
  });
});
