import { NextResponse } from "next/server";
import { getCurrentMianbaAuth } from "@/lib/auth/mianba";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getCurrentMianbaAuth();
  if (!auth) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ user: auth.user, role: auth.role, tenantId: auth.tenantId });
}
