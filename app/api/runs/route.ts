import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const run = await store().createRun();
  return NextResponse.json({ run });
}
