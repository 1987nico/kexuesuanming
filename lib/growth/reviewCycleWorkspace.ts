import type { GrowthStore } from "./store";
import type { GrowthAccount, ThreeDayReviewCycle } from "./types";
import { resolveAccountBusinessLine } from "./businessCompatibility";

export async function reviewWorkspaceAccounts(
  store: GrowthStore,
  current: GrowthAccount,
  ownerUserId?: string,
) {
  const businessLine = resolveAccountBusinessLine(current);
  const workspaceOwnerId = current.owner_user_id ?? ownerUserId;
  const accounts = await store.listAccounts(current.tenant_id, workspaceOwnerId, businessLine);
  return accounts.some((account) => account.id === current.id) ? accounts : [current, ...accounts];
}

export function mergeThreeDayReviewCycles(accounts: GrowthAccount[]) {
  const byId = new Map<string, ThreeDayReviewCycle>();
  for (const cycle of accounts.flatMap((account) => account.three_day_review_cycles ?? [])) {
    const existing = byId.get(cycle.id);
    if (!existing || cycle.updated_at.localeCompare(existing.updated_at) > 0) byId.set(cycle.id, cycle);
  }
  return [...byId.values()].sort((a, b) => a.cycle_number - b.cycle_number);
}

export async function saveSharedReviewCycles(
  store: GrowthStore,
  accounts: GrowthAccount[],
  cycles: ThreeDayReviewCycle[],
) {
  const timestamp = new Date().toISOString();
  await Promise.all(accounts.map((account) => store.saveAccount({
    ...account,
    three_day_review_cycles: cycles,
    updated_at: timestamp,
  })));
}
