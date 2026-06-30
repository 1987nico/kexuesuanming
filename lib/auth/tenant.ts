export const DEFAULT_REPORT_TENANT_ID = "mianbajun";
export const DEFAULT_REPORT_ROLE: TenantRole = "owner";

export const TENANT_ROLES = ["owner", "admin", "operator", "viewer"] as const;
export const REPORT_ORDER_MANAGER_ROLES = ["owner", "admin", "operator"] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];

export interface ReportAuthContext {
  tenantId: string;
  role: TenantRole;
  canViewReportOrders: boolean;
  canManageReportOrders: boolean;
}

interface ResolveReportAuthContextInput {
  tenantId?: string | null;
  role?: string | null;
}

interface ReportAuthEnvironment {
  MIANBA_TENANT_ID?: string;
  MIANBA_TENANT_ROLE?: string;
  [key: string]: string | undefined;
}

export function isTenantRole(role: string | null | undefined): role is TenantRole {
  return !!role && TENANT_ROLES.includes(role as TenantRole);
}

export function canManageReportOrders(role: TenantRole) {
  return REPORT_ORDER_MANAGER_ROLES.includes(role as (typeof REPORT_ORDER_MANAGER_ROLES)[number]);
}

export function resolveReportAuthContext(input: ResolveReportAuthContextInput = {}): ReportAuthContext {
  const tenantId = input.tenantId?.trim() || DEFAULT_REPORT_TENANT_ID;
  const role = isTenantRole(input.role) ? input.role : DEFAULT_REPORT_ROLE;

  return {
    tenantId,
    role,
    canViewReportOrders: true,
    canManageReportOrders: canManageReportOrders(role),
  };
}

export function getDefaultReportAuthContext(env: ReportAuthEnvironment = process.env) {
  return resolveReportAuthContext({
    tenantId: env.MIANBA_TENANT_ID,
    role: env.MIANBA_TENANT_ROLE,
  });
}

export function getReportAuthContextFromRequest(req: Request, input: ResolveReportAuthContextInput = {}) {
  return resolveReportAuthContext({
    tenantId:
      input.tenantId ??
      req.headers.get("x-mianba-tenant-id") ??
      req.headers.get("x-tenant-id") ??
      process.env.MIANBA_TENANT_ID,
    role:
      input.role ??
      req.headers.get("x-mianba-role") ??
      req.headers.get("x-tenant-role") ??
      process.env.MIANBA_TENANT_ROLE,
  });
}
