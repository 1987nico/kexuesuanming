import { describe, expect, it } from "vitest";
import {
  isProfileTitleCompatible,
  profileIdentityContract,
  resolveProfileIdentity,
} from "./accountIdentity";
import type { GrowthAccount } from "./types";

function buyer(overrides: Partial<GrowthAccount>): GrowthAccount {
  return {
    id: "account",
    tenant_id: "mianbajun",
    owner_user_id: "user",
    business_line: "overseas_student",
    persona: "buyer",
    name: "面霸君",
    target_user: "准备海外秋招或回国求职的留学生，以及关注孩子就业的家长",
    core_problem: "求职方向和节奏",
    account_value: "真实记录",
    trust_source: "亲历",
    not_doing: "不保Offer",
    hypotheses: [],
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("account profile identity", () => {
  it("does not turn a student diary into a parent account because the broad audience mentions parents", () => {
    const account = buyer({
      profile_name: "留子回国求职踩坑实录｜边找方向边更新",
      one_liner: "留子回国求职踩坑实录｜边找方向边更新",
    });
    expect(resolveProfileIdentity(account)).toBe("overseas_student_self");
    expect(profileIdentityContract(account).forbiddenVoice).toContain("我家孩子");
  });

  it("keeps a parent account in parent voice", () => {
    const account = buyer({
      profile_name: "陪娃海外秋招的家长真实记录",
      one_liner: "陪孩子闯秋招的家长",
    });
    expect(resolveProfileIdentity(account)).toBe("overseas_student_parent");
  });

  it("always prefers an explicitly selected identity", () => {
    const account = buyer({
      profile_name: "秋招记录",
      profile_identity: "overseas_student_parent",
    });
    expect(resolveProfileIdentity(account)).toBe("overseas_student_parent");
  });

  it("blocks parent titles on student accounts and requires parent evidence on parent accounts", () => {
    const student = buyer({ profile_identity: "overseas_student_self" });
    const parent = buyer({ profile_identity: "overseas_student_parent" });

    expect(isProfileTitleCompatible("娃投了半个月，全石沉大海", student)).toBe(false);
    expect(isProfileTitleCompatible("我投了半个月，面试还是少", student)).toBe(true);
    expect(isProfileTitleCompatible("回国还是留下，先验证哪一边", parent)).toBe(false);
    expect(isProfileTitleCompatible("孩子回国还是留下，先验证哪一边", parent)).toBe(true);
  });
});
