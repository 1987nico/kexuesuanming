import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const snap = await store().getSnapshot(params.id);
  if (!snap) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(snap);
}
