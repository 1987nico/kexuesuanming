import { NextResponse } from "next/server";
import { requireRunGenerationAccess } from "@/lib/auth/costGate";
import { runStep2 } from "@/lib/workflow/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireRunGenerationAccess(req);
  if (access) return access;

  try {
    const data = await runStep2(params.id);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
