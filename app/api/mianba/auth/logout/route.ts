import { NextResponse } from "next/server";
import { clearMianbaSessionCookie, logoutCurrentMianbaSession } from "@/lib/auth/mianba";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await logoutCurrentMianbaSession();
  const response = NextResponse.json({ ok: true });
  clearMianbaSessionCookie(response);
  return response;
}
