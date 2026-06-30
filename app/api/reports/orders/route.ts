import { NextResponse } from "next/server";
import { z } from "zod";
import { REPORT_ORDER_STATUSES, reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  tenant_id: z.string().min(1).default(DEFAULT_TENANT_ID),
  assessment_profile_id: z.string().uuid(),
  report_type: z.enum(["lite", "deep"]),
  price_cents: z.number().int().nonnegative().nullable().optional(),
  customer_name: z.string().max(80).nullable().optional(),
  customer_contact: z.string().max(120).nullable().optional(),
  status: z.enum(REPORT_ORDER_STATUSES).default("unpaid"),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id") || DEFAULT_TENANT_ID;
  const orders = await reportStore().listReportOrders(tenantId);
  return NextResponse.json({ orders });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await reportStore().getAssessmentProfile(parsed.data.assessment_profile_id);
  if (!profile) return NextResponse.json({ error: "assessment_profile_not_found" }, { status: 404 });

  const order = await reportStore().createReportOrder({
    ...parsed.data,
    customer_name: parsed.data.customer_name ?? profile.customer_name,
    customer_contact: parsed.data.customer_contact ?? profile.customer_contact,
  });

  return NextResponse.json({ order }, { status: 201 });
}
