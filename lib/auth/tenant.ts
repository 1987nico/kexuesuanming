import { DEFAULT_MIANBA_TENANT_ID, MIANBA_ROLES, type MianbaRole } from "./constants";
import type { NextResponse } from "next/server";
import {
  canManageReportOrders,
  getCurrentMianbaAuth,
  requireMianbaApiAuth,
  requireMianbaPageAuth,
} from "./mianba";

export { canManageReportOrders };

export const DEFAULT_REPORT_TENANT_ID = DEFAULT_MIANBA_TENANT_ID;
export const TENANT_ROLES = MIANBA_ROLES;
export const REPORT_ORDER_MANAGER_ROLES = MIANBA_ROLES;

export type TenantRole = MianbaRole;

export interface ReportAuthContext {
  tenantId: string;
  role: TenantRole;
  /** 当前登录账号 id（tenant_users.id）；用于数据归属与操作审计 */
  userId: string | null;
  canViewReportOrders: boolean;
  canManageReportOrders: boolean;
}

export function isTenantRole(role: string | null | undefined): role is TenantRole {
  return !!role && TENANT_ROLES.includes(role as TenantRole);
}

/**
 * 数据可见性规则（阶段1）：
 * 管理员看全部；操作者看「自己的 + 未归属（历史数据/公开提交待认领）」。
 */
export function canSeeOwnedRecord(auth: ReportAuthContext, ownerUserId: string | null | undefined) {
  if (auth.role === "admin") return true;
  return ownerUserId == null || ownerUserId === auth.userId;
}

export function resolveReportAuthContext(input: { tenantId?: string | null; role?: string | null } = {}) {
  if (!isTenantRole(input.role)) return null;
  const tenantId = input.tenantId?.trim() || DEFAULT_REPORT_TENANT_ID;

  return {
    tenantId,
    role: input.role,
    userId: null,
    canViewReportOrders: true,
    canManageReportOrders: canManageReportOrders(input.role),
  };
}

export function toReportAuthContext(input: {
  tenantId: string;
  role: TenantRole;
  userId?: string | null;
}): ReportAuthContext {
  return {
    tenantId: input.tenantId,
    role: input.role,
    userId: input.userId ?? null,
    canViewReportOrders: true,
    canManageReportOrders: canManageReportOrders(input.role),
  };
}

export async function getDefaultReportAuthContext() {
  const auth = await getCurrentMianbaAuth();
  return auth ? toReportAuthContext({ tenantId: auth.tenantId, role: auth.role, userId: auth.user.id }) : null;
}

export async function requireReportPageAuth(nextPath: string, roles: TenantRole[] = ["admin", "operator"]) {
  const auth = await requireMianbaPageAuth(nextPath, roles);
  return toReportAuthContext({ tenantId: auth.tenantId, role: auth.role, userId: auth.user.id });
}

export async function requireReportApiAuth(
  roles: TenantRole[] = ["admin", "operator"],
): Promise<{ response: NextResponse } | { auth: ReportAuthContext }> {
  const result = await requireMianbaApiAuth(roles);
  if ("response" in result) return result;
  return {
    auth: toReportAuthContext({
      tenantId: result.auth.tenantId,
      role: result.auth.role,
      userId: result.auth.user.id,
    }),
  };
}
