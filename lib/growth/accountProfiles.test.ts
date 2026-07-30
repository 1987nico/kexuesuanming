import { describe, expect, it } from "vitest";
import {
  accountBelongsToProfileWorkspace,
  accountPlatformBinding,
  chooseAccountProfile,
  partitionAccountProfiles,
  toAccountSummary,
} from "./accountProfiles";
import { createGrowthPreviewFixture } from "./previewFixture";
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
  it("shows both local overseas buyer fixture profiles in the correct workspace", () => {
    const fixture = createGrowthPreviewFixture();
    const partition = partitionAccountProfiles(fixture.accounts, {
      tenantId: "mianbajun",
      businessLine: "overseas_student",
      persona: "buyer",
    });

    expect(partition.visible.map((item) => item.id)).toEqual([
      "preview-overseas-buyer",
      "preview-overseas-student-buyer",
    ]);
    expect(partition.pending).toEqual([]);
  });

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

  it("quarantines missing or conflicting business attribution", () => {
    const executiveInsideOverseas = account("mixed", {
      profile_name: "34岁前中层裸辞找方向的真实记录",
      one_liner: "34岁前中层裸辞找方向的真实记录",
    });
    const legacy = account("legacy", {
      business_line: undefined,
      profile_name: "旧留学生家长号",
    });
    const valid = account("valid", { profile_name: "留学生本人求职实录" });
    const partition = partitionAccountProfiles([executiveInsideOverseas, legacy, valid], {
      tenantId: "mianbajun",
      ownerUserId: "user-1",
      businessLine: "overseas_student",
      persona: "buyer",
    });
    expect(partition.visible.map((item) => item.id)).toEqual(["valid"]);
    expect(partition.pending.map((item) => item.id).sort()).toEqual(["legacy", "mixed"]);
  });

  it("shows one canonical card for duplicate active profiles without deleting history", () => {
    const older = account("older", {
      profile_name: "陪娃闯秋招的留学生家长真实记录",
      updated_at: "2026-07-29T00:00:00.000Z",
    });
    const newer = account("newer", {
      profile_name: "陪娃闯秋招的留学生家长真实记录",
      updated_at: "2026-07-30T00:00:00.000Z",
      last_used_at: "2026-07-30T00:00:00.000Z",
    });
    const partition = partitionAccountProfiles([older, newer], {
      tenantId: "mianbajun",
      ownerUserId: "user-1",
      businessLine: "overseas_student",
      persona: "buyer",
    });
    expect(partition.visible.map((item) => item.id)).toEqual(["newer"]);
    expect(partition.duplicates.map((item) => item.id)).toEqual(["older"]);
  });

  it("always shows accounts explicitly created by the user even when names repeat", () => {
    const legacy = account("legacy", {
      profile_name: "中高管职业与事业方向决策顾问",
      business_line: "executive",
      persona: "expert",
      target_user: "正在做职业与事业方向决策的中高管",
      core_problem: "职业方向判断",
      account_value: "决策方法",
      updated_at: "2026-07-29T00:00:00.000Z",
    });
    const explicitlyCreated = account("created", {
      profile_name: "中高管职业与事业方向决策顾问",
      business_line: "executive",
      persona: "expert",
      target_user: "正在做职业与事业方向决策的中高管",
      core_problem: "职业方向判断",
      account_value: "决策方法",
      profile_creation_request_id: "create-request-123",
      updated_at: "2026-07-30T00:00:00.000Z",
    });

    const partition = partitionAccountProfiles([legacy, explicitlyCreated], {
      tenantId: "mianbajun",
      ownerUserId: "user-1",
      businessLine: "executive",
      persona: "expert",
    });

    expect(partition.visible.map((item) => item.id)).toEqual(["legacy", "created"]);
    expect(partition.duplicates).toEqual([]);
  });
});
