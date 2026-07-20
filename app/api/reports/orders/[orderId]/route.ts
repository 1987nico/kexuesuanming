import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/auth/activity";
import { canSeeOwnedRecord, requireReportApiAuth } from "@/lib/auth/tenant";
import { REPORT_ORDER_STATUSES, reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(REPORT_ORDER_STATUSES),
});

export async function GET(req: Request, { params }: { params: { orderId: string } }) {
  const guard = await requireReportApiAuth();
  if ("response" in guard) return guard.response;
  const auth = guard.auth;
  const order = await reportStore().getReportOrder(params.orderId);
  if (!order) return NextResponse.json({ error: "report_order_not_found" }, { status: 404 });
  if (order.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: "report_order_not_found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}

export async function PATCH(req: Request, { params }: { params: { orderId: string } }) {
  const guard = await requireReportApiAuth();
  if ("response" in guard) return guard.response;
  const auth = guard.auth;
  if (!auth.canManageReportOrders) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await reportStore().getReportOrder(params.orderId);
  if (!existing || existing.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: "report_order_not_found" }, { status: 404 });
  }
  // 操作者不能改别人名下的订单
  if (!canSeeOwnedRecord(auth, existing.owner_user_id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const order = await reportStore().updateReportOrderStatus(params.orderId, parsed.data.status);
  if (!order) return NextResponse.json({ error: "report_order_not_found" }, { status: 404 });
  await logActivity({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: "order_status_updated",
    entityType: "report_order",
    entityId: order.id,
    metadata: { from: existing.status, to: order.status, report_type: order.report_type },
  });
  return NextResponse.json({ order });
}
