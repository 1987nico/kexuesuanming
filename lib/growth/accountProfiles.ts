import {
  accountBusinessAttribution,
  accountForBusinessGeneration,
} from "./businessCompatibility";
import { resolveProfileIdentity } from "./accountIdentity";
import type {
  GrowthAccount,
  GrowthAccountSummary,
  GrowthPendingAccountProfileSummary,
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

export function pendingAccountProfileSummary(
  account: GrowthAccount,
  hasHistory = false,
): GrowthPendingAccountProfileSummary {
  const missingBusinessLine = !account.business_line;
  const suggestedBusinessLine = missingBusinessLine
    ? accountForBusinessGeneration(account).business_line!
    : account.business_line === "overseas_student"
      ? "executive"
      : "overseas_student";
  return {
    id: account.id,
    profile_name: account.profile_name?.trim() || account.one_liner?.trim() || account.name,
    one_liner: account.one_liner?.trim() || "",
    source_business_line: account.business_line,
    source_persona: account.persona,
    suggested_business_line: suggestedBusinessLine,
    reason: missingBusinessLine ? "missing_business_line" : "content_conflict",
    reason_label: missingBusinessLine
      ? "历史人设缺少明确的业务归属"
      : "已保存的业务归属与人设内容存在冲突",
    has_history: hasHistory,
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

/**
 * 用户在明确的“业务 × 视角”工作区主动新建的账号，以保存时的工作区归属
 * 为准。模型补全出来的某个文案字段即使暂时触发了兼容性检查，也不能把
 * 已创建成功的账号从列表中隐藏；后续生成仍会经过业务上下文清洗。
 */
export function isExplicitWorkspaceProfile(
  account: GrowthAccount,
  input: {
    tenantId: string;
    ownerUserId?: string;
    businessLine: GrowthBusinessLine;
    persona: GrowthPersona;
  },
) {
  return Boolean(account.profile_creation_request_id)
    && account.tenant_id === input.tenantId
    && (!input.ownerUserId || account.owner_user_id === input.ownerUserId)
    && account.persona === input.persona
    && account.business_line === input.businessLine;
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
    if (isExplicitWorkspaceProfile(account, input)) {
      // “创建成功”必须意味着列表中立即可见。不能让模型补全字段的内容判定
      // 覆盖用户刚刚完成的显式工作区归属。
      visibleCandidates.push(account);
      continue;
    }
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
    if (
      accountProfileStatus(account) === "archived"
      || Boolean(account.profile_creation_request_id)
      || Boolean(account.profile_attribution_confirmation)
    ) {
      // 已归档记录由运营显式管理；带新建请求标记的记录是用户主动创建的
      // 独立账号。即使名称与旧账号相同，也必须单独展示，不能被历史去重
      // 规则误隐藏。
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
  return isExplicitWorkspaceProfile(account, input) || (
    account.tenant_id === input.tenantId
    && (!input.ownerUserId || account.owner_user_id === input.ownerUserId)
    && account.persona === input.persona
    && account.business_line === input.businessLine
    && accountBusinessAttribution(account) === "confirmed"
  );
}
