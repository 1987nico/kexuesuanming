import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentMianbaAuth } from "@/lib/auth/mianba";

export type PublicAccessScope = "initial-report" | "deep-report" | "direction-session";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 45;

function getSigningSecret() {
  const secret = process.env.MIANBA_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("缺少 MIANBA_AUTH_SECRET");
  return "local-mianba-auth-secret-change-me";
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function signPayload(scope: PublicAccessScope, resourceId: string, expiresAt: number) {
  return createHmac("sha256", getSigningSecret())
    .update(`${TOKEN_VERSION}.${scope}.${resourceId}.${expiresAt}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signPublicAccessToken(
  scope: PublicAccessScope,
  resourceId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  const expiresAt = nowSeconds() + ttlSeconds;
  return `${TOKEN_VERSION}.${expiresAt}.${signPayload(scope, resourceId, expiresAt)}`;
}

export function verifyPublicAccessToken(scope: PublicAccessScope, resourceId: string, token: string | null | undefined) {
  if (!token) return false;
  const [version, expiresRaw, signature] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (version !== TOKEN_VERSION || !Number.isFinite(expiresAt) || !signature) return false;
  if (expiresAt < nowSeconds()) return false;
  return safeEqual(signature, signPayload(scope, resourceId, expiresAt));
}

export function publicAccessTokenFromRequest(req: Request) {
  const url = new URL(req.url);
  return (
    url.searchParams.get("access_token") ||
    url.searchParams.get("token") ||
    req.headers.get("x-mianba-public-access")
  );
}

export function appendPublicAccessToken(path: string, scope: PublicAccessScope, resourceId: string, ttlSeconds?: number) {
  const url = new URL(path, "https://mianba.local");
  url.searchParams.set("access_token", signPublicAccessToken(scope, resourceId, ttlSeconds));
  return `${url.pathname}${url.search}`;
}

export async function hasSignedOrMianbaAccess(
  scope: PublicAccessScope,
  resourceId: string,
  token: string | null | undefined,
) {
  if (verifyPublicAccessToken(scope, resourceId, token)) return true;
  const auth = await getCurrentMianbaAuth().catch(() => null);
  return Boolean(auth);
}

export async function requireSignedOrMianbaAccess(
  req: Request,
  scope: PublicAccessScope,
  resourceId: string,
) {
  if (await hasSignedOrMianbaAccess(scope, resourceId, publicAccessTokenFromRequest(req))) return null;
  console.warn("[public-access] blocked", { scope, resourceId });
  return NextResponse.json(
    { error: "forbidden", message: "链接已过期或无权访问，请联系你的参谋顾问重新发送。" },
    { status: 403 },
  );
}
