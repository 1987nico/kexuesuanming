import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/auth/activity";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { mianbaAuthStore } from "@/lib/auth/mianbaStore";
import { reportStore } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  owner_user_id: z.string().uuid().nullable(),
});

/**
 * 客户负责人的认领与指派：
 * - 操作者：只能把「未认领」客户认领给自己
 * - 管理员：可指派给任何成员，或设为 null（释放）
 * 同时把该客户名下未归属的订单一并带给新负责人。
 */
export async function PATCH(req: Request, { params }: { params: { profileId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const auth = guard.auth;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = reportStore();
  const profile = await store.getAssessmentProfile(params.profileId);
  if (!profile || profile.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: "assessment_profile_not_found" }, { status: 404 });
  }

  const nextOwner = parsed.data.owner_user_id;

  if (auth.role === "operator") {
    if (nextOwner !== auth.user.id) {
      return NextResponse.json({ error: "forbidden", message: "操作者只能认领给自己。" }, { status: 403 });
    }
    if (profile.owner_user_id && profile.owner_user_id !== auth.user.id) {
      return NextResponse.json(
        { error: "already_owned", message: "该客户已有负责人，请联系管理员改派。" },
        { status: 409 },
      );
    }
  }

  if (nextOwner) {
    const target = await mianbaAuthStore().getUserById(nextOwner);
    if (!target || target.tenant_id !== auth.tenantId || target.disabled) {
      return NextResponse.json({ error: "member_not_found", message: "目标成员不存在或已停用。" }, { status: 400 });
    }
  }

  const previousOwner = profile.owner_user_id ?? null;
  profile.owner_user_id = nextOwner;
  profile.updated_at = new Date().toISOString();
  await store.saveAssessmentProfile(profile);

  // 该客户名下未归属的订单一并带给新负责人（不覆盖已有归属）
  if (nextOwner) {
    const orders = await store.listReportOrders(auth.tenantId);
    for (const order of orders) {
      if (order.assessment_profile_id === profile.id && order.owner_user_id == null) {
        await store.updateReportOrderOwner(order.id, nextOwner);
      }
    }
  }

  await logActivity({
    tenantId: auth.tenantId,
    userId: auth.user.id,
    action: nextOwner ? (previousOwner ? "profile_reassigned" : "profile_claimed") : "profile_released",
    entityType: "assessment_profile",
    entityId: profile.id,
    metadata: { customer_name: profile.customer_name, from: previousOwner, to: nextOwner },
  });

  return NextResponse.json({
    profile: { id: profile.id, owner_user_id: profile.owner_user_id ?? null },
  });
}
