import { describe, expect, it } from "vitest";
import {
  accountBelongsToProfileWorkspace,
  accountPlatformBinding,
  chooseAccountProfile,
  toAccountSummary,
} from "./accountProfiles";
import type { GrowthAccount } from "./types";

function account(id: string, overrides: Partial<GrowthAccount> = {}): GrowthAccount {
  return {
    id,
    tenant_id: "mianbajun",
    owner_user_id: "user-1",
    business_line: "overseas_student",
    persona: "buyer",
    name: "面霸君",
    target_user: "留学生家长",
    core_problem: "秋招方向",
    account_value: "真实复盘",
    trust_source: "亲历",
    not_doing: "不保Offer",
    hypotheses: [],
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("account profiles", () => {
  it("chooses the requested active profile and never chooses an archived one", () => {
    const parent = account("parent", { profile_name: "留学生家长号" });
    const student = account("student", {
      profile_name: "留学生本人号",
      is_default_profile: true,
    });
    const archived = account("archived", { profile_status: "archived" });

    expect(chooseAccountProfile([parent, student, archived], "parent")?.id).toBe("parent");
    expect(chooseAccountProfile([parent, student, archived])?.id).toBe("student");
    expect(chooseAccountProfile([parent, student, archived], "archived")).toBeNull();
  });

  it("keeps business, perspective and owner isolation", () => {
    const current = account("current");
    expect(accountBelongsToProfileWorkspace(current, {
      tenantId: "mianbajun",
      ownerUserId: "user-1",
      businessLine: "overseas_student",
      persona: "buyer",
    })).toBe(true);
    expect(accountBelongsToProfileWorkspace(current, {
      tenantId: "mianbajun",
      ownerUserId: "user-2",
      businessLine: "overseas_student",
      persona: "buyer",
    })).toBe(false);
    expect(accountBelongsToProfileWorkspace(current, {
      tenantId: "mianbajun",
      ownerUserId: "user-1",
      businessLine: "executive",
      persona: "buyer",
    })).toBe(false);
  });

  it("normalizes legacy accounts and public platform bindings", () => {
    const legacy = account("legacy", {
      one_liner: "陪孩子走秋招的家长记录",
      platform_binding: {
        platform: "xiaohongshu",
        account_name: "家长秋招日记",
        account_uid: "xhs-123",
        binding_status: "bound",
      },
    });
    expect(toAccountSummary(legacy).profile_name).toBe("陪孩子走秋招的家长记录");
    expect(accountPlatformBinding(legacy).binding_status).toBe("bound");
    expect(accountPlatformBinding(account("unbound")).binding_status).toBe("unbound");
  });
});
