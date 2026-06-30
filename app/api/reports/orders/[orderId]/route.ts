import { NextResponse } from "next/server";
import { z } from "zod";
import { REPORT_ORDER_STATUSES, reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(REPORT_ORDER_STATUSES),
});

export async function GET(_req: Request, { params }: { params: { orderId: string } }) {
  const order = await reportStore().getReportOrder(params.orderId);
  if (!order) return NextResponse.json({ error: "report_order_not_found" }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PATCH(req: Request, { params }: { params: { orderId: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const order = await reportStore().updateReportOrderStatus(params.orderId, parsed.data.status);
  if (!order) return NextResponse.json({ error: "report_order_not_found" }, { status: 404 });
  return NextResponse.json({ order });
}
