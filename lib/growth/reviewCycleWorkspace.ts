import type { GrowthStore } from "./store";
import type { GrowthAccount, GrowthBusinessLine, ThreeDayReviewCycle } from "./types";
import { resolveAccountBusinessLine } from "./businessCompatibility";

export async function reviewWorkspaceAccounts(
  store: GrowthStore,
  current: GrowthAccount,
  ownerUserId?: string,
) {
  const businessLine = resolveAccountBusinessLine(current);
  return (await reviewOwnerAccounts(store, current, ownerUserId))
    .filter((account) => resolveAccountBusinessLine(account) === businessLine);
}

/**
 * Excel导入属于账号操作者，而不是某一条业务。这里在同一租户、同一真实
 * 归属下读取两条业务的全部人设，供跨业务、六视角匹配使用。
 */
export async function reviewOwnerAccounts(
  store: GrowthStore,
  current: GrowthAccount,
  _ownerUserId?: string,
) {
  // 复盘工作区只能在同一真实归属下聚合。历史未归属账号只与其他
  // 未归属账号聚合，不能因为 store 的旧版“共享可见”规则混入任意用户。
  const accounts = (await store.listAccounts(current.tenant_id, current.owner_user_id ?? undefined))
    .filter((account) => current.owner_user_id == null
      ? account.owner_user_id == null
      : account.owner_user_id === current.owner_user_id);
  return accounts.some((account) => account.id === current.id) ? accounts : [current, ...accounts];
}

export function reviewAccountsForBusiness(
  accounts: GrowthAccount[],
  businessLine: GrowthBusinessLine,
) {
  return accounts.filter((account) => resolveAccountBusinessLine(account) === businessLine);
}

export function mergeThreeDayReviewCycles(accounts: GrowthAccount[]) {
  const byId = new Map<string, ThreeDayReviewCycle>();
  for (const cycle of accounts.flatMap((account) => account.three_day_review_cycles ?? [])) {
    const existing = byId.get(cycle.id);
    if (!existing || cycle.updated_at.localeCompare(existing.updated_at) > 0) byId.set(cycle.id, cycle);
  }
  const cycles = [...byId.values()];
  const completed = cycles.filter((cycle) => cycle.status === "completed");
  const latestCompletedAt = completed.reduce((latest, cycle) => {
    const timestamp = cycle.updated_at || cycle.completed_at || cycle.created_at;
    return timestamp > latest ? timestamp : latest;
  }, "");
  // v3.3 之前三个视角可能各自留有一个草稿周期。共享工作区只保留
  // 最近更新的一轮，避免页面反复落回旧草稿、轮次永远无法结束。
  const active = cycles
    .filter((cycle) => cycle.status === "draft")
    .filter((cycle) => (cycle.updated_at || cycle.imported_at || cycle.created_at) > latestCompletedAt)
    .sort((a, b) => (b.updated_at || b.imported_at || b.created_at)
      .localeCompare(a.updated_at || a.imported_at || a.created_at))[0];
  return [...completed, ...(active ? [active] : [])]
    .sort((a, b) => a.cycle_number - b.cycle_number || a.created_at.localeCompare(b.created_at));
}

export async function saveSharedReviewCycles(
  store: GrowthStore,
  accounts: GrowthAccount[],
  cycles: ThreeDayReviewCycle[],
) {
  const timestamp = new Date().toISOString();
  // 周期是业务级数据，只写入一个稳定的规范账号；读取时统一聚合。
  // 这样避免多账号并行写入部分失败后，三个视角看到不同状态。
  const personaOrder = { merchant: 0, buyer: 1, expert: 2 } as const;
  const canonical = [...accounts].sort((a, b) =>
    personaOrder[a.persona] - personaOrder[b.persona]
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id))[0];
  if (!canonical) throw new Error("当前业务下没有可保存复盘周期的人设。");
  await store.saveAccount({
    ...canonical,
    three_day_review_cycles: cycles,
    updated_at: timestamp,
  });
}
