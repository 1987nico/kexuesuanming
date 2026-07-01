import { NextResponse } from "next/server";
import { z } from "zod";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  report_lite_price: z.string().min(1).max(60),
  report_deep_price: z.string().min(1).max(60),
});

export async function GET() {
  const store = growthStore();
  const settings = await store.getBusinessSettings(DEFAULT_TENANT_ID);
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const settings = {
    tenant_id: DEFAULT_TENANT_ID,
    report_lite_price: parsed.data.report_lite_price.trim(),
    report_deep_price: parsed.data.report_deep_price.trim(),
    updated_at: new Date().toISOString(),
  };
  await store.saveBusinessSettings(settings);
  return NextResponse.json({ settings });
}
