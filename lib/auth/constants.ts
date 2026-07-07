export const MIANBA_SESSION_COOKIE = "mianba_session";
export const DEFAULT_MIANBA_TENANT_ID = "mianbajun";
export const MIANBA_ROLES = ["admin", "operator"] as const;

export type MianbaRole = (typeof MIANBA_ROLES)[number];

export function isMianbaRole(role: string | null | undefined): role is MianbaRole {
  return !!role && MIANBA_ROLES.includes(role as MianbaRole);
}

export function roleLabel(role: MianbaRole) {
  return role === "admin" ? "管理员" : "操作者";
}
