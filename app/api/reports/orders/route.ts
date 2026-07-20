import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/auth/activity";
import { canSeeOwnedRecord, DEFAULT_REPORT_TENANT_ID, requireReportApiAuth } from "@/lib/auth/tenant";
import { REPORT_ORDER_STATUSES, reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenant_id: z.string().min(1).default(DEFAULT_REPORT_TENANT_ID),
  assessment_profile_id: z.string().uuid(),
  report_type: z.enum(["lite", "deep"]),
  price_cents: z.number().int().nonnegative().nullable().optional(),
  customer_name: z.string().max(80).nullable().optional(),
  customer_contact: z.string().max(120).nullable().optional(),
  status: z.enum(REPORT_ORDER_STATUSES).default("unpaid"),
});

export async function GET(req: Request) {
  const guard = await requireReportApiAuth();
  if ("response" in guard) return guard.response;
  const auth = guard.auth;
  const all = await reportStore().listReportOrders(auth.tenantId);
  // 操作者只看自己的 + 未归属订单；管理员看全部
  const orders = all.filter((order) => canSeeOwnedRecord(auth, order.owner_user_id));
  return NextResponse.json({ orders });
}

export async function POST(req: Request) {
  const guard = await requireReportApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await reportStore().getAssessmentProfile(parsed.data.assessment_profile_id);
  if (!profile) return NextResponse.json({ error: "assessment_profile_not_found" }, { status: 404 });
  const auth = guard.auth;

  const order = await reportStore().createReportOrder({
    ...parsed.data,
    tenant_id: auth.tenantId,
    owner_user_id: auth.userId,
    customer_name: parsed.data.customer_name ?? profile.customer_name,
    customer_contact: parsed.data.customer_contact ?? profile.customer_contact,
  });
  await logActivity({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: "order_created",
    entityType: "report_order",
    entityId: order.id,
    metadata: { report_type: order.report_type, status: order.status },
  });

  return NextResponse.json({ order }, { status: 201 });
}
