import {
  accountBusinessAttribution,
  accountForBusinessGeneration,
} from "./businessCompatibility";
import { resolveProfileIdentity } from "./accountIdentity";
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
    profile_identity: resolveProfileIdentity(account),
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

function normalizedProfileKey(account: GrowthAccount) {
  return [
    account.business_line ?? "pending",
    account.persona,
    accountProfileName(account)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s，。、“”‘’！？!?,.:：；;|｜·—_-]+/gu, ""),
  ].join(":");
}

function profilePriority(account: GrowthAccount) {
  return [
    account.platform_binding?.binding_status === "bound" ? 1 : 0,
    account.is_default_profile ? 1 : 0,
    Date.parse(account.last_used_at || account.updated_at || account.created_at) || 0,
  ] as const;
}

function preferredProfile(a: GrowthAccount, b: GrowthAccount) {
  const left = profilePriority(a);
  const right = profilePriority(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? a : b;
  }
  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

export interface AccountProfilePartition {
  visible: GrowthAccount[];
  pending: GrowthAccount[];
  duplicates: GrowthAccount[];
}

/**
 * 只在展示层折叠重复人设，不删除任何历史记录。绑定账号、默认账号和最近使用
 * 的记录依次优先成为代表，其余记录进入重复待整理区。
 */
export function partitionAccountProfiles(
  accounts: GrowthAccount[],
  input: {
    tenantId: string;
    ownerUserId?: string;
    businessLine: GrowthBusinessLine;
    persona: GrowthPersona;
  },
): AccountProfilePartition {
  const visibleCandidates: GrowthAccount[] = [];
  const pending: GrowthAccount[] = [];
  for (const account of accounts) {
    const sameOwner = account.tenant_id === input.tenantId
      && (!input.ownerUserId || account.owner_user_id === input.ownerUserId);
    if (!sameOwner || account.persona !== input.persona) continue;
    const attribution = accountBusinessAttribution(account);
    if (attribution === "confirmed" && account.business_line !== input.businessLine) {
      // 另一条业务中已确认的人设不是“当前业务待确认”，也不能出现在当前页面的计数里。
      continue;
    }
    if (attribution !== "confirmed") {
      // 只有未确认归属，或明确标记为当前业务却发生内容冲突的历史人设，才进入当前待整理区。
      if (account.business_line && account.business_line !== input.businessLine) continue;
      pending.push(account);
      continue;
    }
    visibleCandidates.push(account);
  }

  const canonical = new Map<string, GrowthAccount>();
  const duplicates: GrowthAccount[] = [];
  for (const account of visibleCandidates) {
    if (accountProfileStatus(account) === "archived") {
      // 已归档记录由运营显式管理，不和正常活跃人设争代表位。
      canonical.set(`${normalizedProfileKey(account)}:${account.id}`, account);
      continue;
    }
    const key = normalizedProfileKey(account);
    const existing = canonical.get(key);
    if (!existing) {
      canonical.set(key, account);
      continue;
    }
    const winner = preferredProfile(existing, account);
    const loser = winner.id === existing.id ? account : existing;
    canonical.set(key, winner);
    duplicates.push(loser);
  }
  return { visible: [...canonical.values()], pending, duplicates };
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
    && account.business_line === input.businessLine
    && accountBusinessAttribution(account) === "confirmed";
}
