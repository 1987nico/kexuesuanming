import { accountForBusinessGeneration } from "./businessCompatibility";
import type {
  GrowthAccount,
  GrowthAccountSummary,
  GrowthBusinessLine,
  GrowthPersona,
  GrowthPlatformBinding,
} from "./types";

const DEFAULT_PROFILE_NAMES: Record<GrowthBusinessLine, Record<GrowthPersona, string>> = {
  overseas_student: {
    merchant: "求职辅导服务商号",
    buyer: "留学生家长号",
    expert: "留学生求职老师号",
  },
  executive: {
    merchant: "职业决策服务商号",
    buyer: "转型中高管号",
    expert: "职业决策顾问号",
  },
};

export function accountProfileName(account: GrowthAccount) {
  const line = accountForBusinessGeneration(account).business_line!;
  return account.profile_name?.trim()
    || account.one_liner?.trim()
    || DEFAULT_PROFILE_NAMES[line][account.persona];
}

export function accountProfileStatus(account: GrowthAccount): "active" | "archived" {
  return account.profile_status === "archived" ? "archived" : "active";
}

export function accountPlatformBinding(account: GrowthAccount): GrowthPlatformBinding {
  const binding = account.platform_binding;
  if (!binding?.account_name?.trim()) {
    return {
      platform: "xiaohongshu",
      account_name: "",
      binding_status: "unbound",
    };
  }
  return {
    platform: "xiaohongshu",
    account_name: binding.account_name.trim(),
    account_uid: binding.account_uid?.trim() || undefined,
    profile_url: binding.profile_url?.trim() || undefined,
    binding_status: "bound",
    bound_at: binding.bound_at,
  };
}

export function toAccountSummary(account: GrowthAccount): GrowthAccountSummary {
  const normalized = accountForBusinessGeneration(account);
  return {
    id: account.id,
    business_line: normalized.business_line!,
    persona: account.persona,
    profile_name: accountProfileName(account),
    one_liner: account.one_liner || "",
    profile_status: accountProfileStatus(account),
    is_default_profile: account.is_default_profile === true,
    display_order: account.display_order ?? 0,
    last_used_at: account.last_used_at || account.updated_at || account.created_at,
    platform_binding: accountPlatformBinding(account),
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

export function chooseAccountProfile(
  accounts: GrowthAccount[],
  requestedAccountId?: string | null,
) {
  const active = accounts
    .filter((account) => accountProfileStatus(account) === "active")
    .sort((a, b) => {
      if (Boolean(a.is_default_profile) !== Boolean(b.is_default_profile)) {
        return a.is_default_profile ? -1 : 1;
      }
      const order = (a.display_order ?? 0) - (b.display_order ?? 0);
      if (order !== 0) return order;
      return (b.last_used_at || b.updated_at).localeCompare(a.last_used_at || a.updated_at);
    });
  if (requestedAccountId) {
    return active.find((account) => account.id === requestedAccountId) ?? null;
  }
  return active[0] ?? null;
}

export function accountBelongsToProfileWorkspace(
  account: GrowthAccount,
  input: {
    tenantId: string;
    ownerUserId?: string;
    businessLine: GrowthBusinessLine;
    persona: GrowthPersona;
  },
) {
  return account.tenant_id === input.tenantId
    && (!input.ownerUserId || account.owner_user_id === input.ownerUserId)
    && account.persona === input.persona
    && accountForBusinessGeneration(account).business_line === input.businessLine;
}
