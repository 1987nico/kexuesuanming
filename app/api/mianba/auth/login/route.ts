import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/auth/activity";
import { loginMianbaUser, sanitizeNextPath, setMianbaSessionCookie } from "@/lib/auth/mianba";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  account: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await loginMianbaUser(parsed.data.account, parsed.data.password);
  if (!result) {
    return NextResponse.json({ error: "unauthenticated", message: "账号或密码不正确。" }, { status: 401 });
  }

  await logActivity({
    tenantId: result.auth.tenantId,
    userId: result.auth.user.id,
    action: "login",
    entityType: "session",
  });

  const response = NextResponse.json({
    user: result.auth.user,
    role: result.auth.role,
    tenantId: result.auth.tenantId,
    next: sanitizeNextPath(parsed.data.next),
  });
  setMianbaSessionCookie(response, result.token, result.expiresAt);
  return response;
}
