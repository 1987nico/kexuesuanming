import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  DEFAULT_MIANBA_TENANT_ID,
  MIANBA_ROLES,
  MIANBA_SESSION_COOKIE,
  type MianbaRole,
} from "./constants";
import { normalizeAccount, verifyPassword } from "./password";
import { mianbaAuthStore, type MianbaTenantUser } from "./mianbaStore";

const SESSION_TTL_DAYS = 7;

function growthPreviewAuth(): MianbaAuthContext | null {
  if (process.env.NODE_ENV === "production" || process.env.GROWTH_PREVIEW_MODE !== "fixture") return null;
  const timestamp = new Date(0).toISOString();
  return {
    tenantId: DEFAULT_MIANBA_TENANT_ID,
    role: "admin",
    user: {
      id: "growth-preview-local-admin",
      tenant_id: DEFAULT_MIANBA_TENANT_ID,
      account: "preview",
      display_name: "本地预览账号",
      role: "admin",
      disabled: false,
      created_at: timestamp,
      updated_at: timestamp,
    },
  };
}

export interface MianbaAuthContext {
  tenantId: string;
  role: MianbaRole;
  user: Omit<MianbaTenantUser, "password_hash">;
}

export function sanitizeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/mianba";
  if (value.startsWith("/api/")) return "/mianba";
  return value;
}

function getAuthSecret() {
  const secret = process.env.MIANBA_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("缺少 MIANBA_AUTH_SECRET");
  }
  return "local-mianba-auth-secret-change-me";
}

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function hashSessionToken(token: string) {
  return createHmac("sha256", getAuthSecret()).update(token).digest("base64url");
}

function makeSessionToken() {
  return randomBytes(32).toString("base64url");
}

function publicUser(user: MianbaTenantUser): MianbaAuthContext["user"] {
  const safeUser = { ...user };
  delete (safeUser as Partial<MianbaTenantUser>).password_hash;
  return safeUser;
}

export function canAccessMianbaAdmin(role: MianbaRole) {
  return role === "admin";
}

export function canManageReportOrders(role: MianbaRole) {
  return role === "admin" || role === "operator";
}

export async function loginMianbaUser(account: string, password: string) {
  const store = mianbaAuthStore();
  await store.ensureInitialUsers();

  const user = await store.findUserByAccount(DEFAULT_MIANBA_TENANT_ID, normalizeAccount(account));
  if (!user || user.disabled || !verifyPassword(password, user.password_hash)) return null;

  const token = makeSessionToken();
  const expiresAt = sessionExpiresAt();
  await store.createSession({
    tenant_id: user.tenant_id,
    user_id: user.id,
    token_hash: hashSessionToken(token),
    expires_at: expiresAt.toISOString(),
  });

  return {
    token,
    expiresAt,
    auth: {
      tenantId: user.tenant_id,
      role: user.role,
      user: publicUser(user),
    } satisfies MianbaAuthContext,
  };
}

export async function getMianbaAuthForToken(token: string | null | undefined): Promise<MianbaAuthContext | null> {
  if (!token) return null;
  const store = mianbaAuthStore();
  await store.ensureInitialUsers();

  const tokenHash = hashSessionToken(token);
  const session = await store.getSessionByTokenHash(tokenHash);
  if (!session) return null;

  if (Date.parse(session.expires_at) <= Date.now()) {
    await store.deleteSessionByTokenHash(tokenHash);
    return null;
  }

  const user = await store.getUserById(session.user_id);
  if (!user || user.disabled || !MIANBA_ROLES.includes(user.role)) {
    await store.deleteSessionByTokenHash(tokenHash);
    return null;
  }

  await store.touchSession(session.id);
  return {
    tenantId: user.tenant_id,
    role: user.role,
    user: publicUser(user),
  };
}

export async function getCurrentMianbaAuth() {
  return getMianbaAuthForToken(cookies().get(MIANBA_SESSION_COOKIE)?.value);
}

export async function logoutCurrentMianbaSession() {
  const token = cookies().get(MIANBA_SESSION_COOKIE)?.value;
  if (!token) return;
  await mianbaAuthStore().deleteSessionByTokenHash(hashSessionToken(token));
}

export function setMianbaSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({
    name: MIANBA_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearMianbaSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: MIANBA_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function requireMianbaPageAuth(nextPath: string, allowedRoles: MianbaRole[] = ["admin", "operator"]) {
  const auth = await getCurrentMianbaAuth();
  if (!auth) redirect(`/mianba/login?next=${encodeURIComponent(nextPath)}`);
  if (!allowedRoles.includes(auth.role)) redirect("/mianba?auth=forbidden");
  return auth;
}

export async function requireMianbaApiAuth(
  allowedRoles: MianbaRole[] = ["admin", "operator"],
): Promise<{ response: NextResponse } | { auth: MianbaAuthContext }> {
  const auth = growthPreviewAuth() ?? await getCurrentMianbaAuth();
  if (!auth) {
    return { response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (!allowedRoles.includes(auth.role)) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { auth };
}
