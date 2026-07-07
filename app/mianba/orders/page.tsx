import { roleLabel } from "@/lib/auth/constants";
import { mianbaAuthStore } from "@/lib/auth/mianbaStore";
import { appendPublicAccessToken } from "@/lib/auth/publicAccess";
import { canSeeOwnedRecord, requireReportPageAuth } from "@/lib/auth/tenant";
import { reportStore } from "@/lib/reports/store";
import MianbaLogoutButton from "../MianbaLogoutButton";
import OrderDashboardClient from "./OrderDashboardClient";

export const dynamic = "force-dynamic";

export default async function MianbaOrdersPage() {
  const auth = await requireReportPageAuth("/mianba/orders");
  const [allOrders, tenantUsers] = await Promise.all([
    reportStore().listReportOrders(auth.tenantId),
    mianbaAuthStore().listUsers(auth.tenantId),
  ]);
  // 操作者只看自己的 + 未归属订单；管理员看全部
  const orders = allOrders.filter((order) => canSeeOwnedRecord(auth, order.owner_user_id));
  const ordersWithLinks = orders.map((order) => {
    if (!order.assessment_profile_id) return order;
    const scope = order.report_type === "deep" ? "deep-report" : "initial-report";
    const reportPath =
      order.report_type === "deep"
        ? `/reports/deep/${order.assessment_profile_id}`
        : `/reports/initial/${order.assessment_profile_id}`;
    const pdfPath =
      order.report_type === "deep"
        ? `/api/reports/deep/${order.assessment_profile_id}/pdf`
        : `/api/reports/initial/${order.assessment_profile_id}/pdf`;
    return {
      ...order,
      links: {
        report_url: appendPublicAccessToken(reportPath, scope, order.assessment_profile_id),
        pdf_url: appendPublicAccessToken(pdfPath, scope, order.assessment_profile_id),
      },
    };
  });
  const members = tenantUsers.map((user) => ({
    id: user.id,
    display_name: user.display_name,
    role: user.role,
    disabled: user.disabled,
  }));

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">报告订单</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">报告订单后台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            {auth.role === "admin"
              ? "查看全部报告订单，并可按负责人筛选收款、交付和退款进度。"
              : "这里是你负责的订单和待认领订单。把收款、交付和退款状态沉淀到订单系统。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {auth.role === "admin" && (
            <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/dashboard">
              管理驾驶舱
            </a>
          )}
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports">
            创建报告订单
          </a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">
            返回首页
          </a>
          <MianbaLogoutButton />
        </div>
      </header>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <SummaryCard label="当前角色" value={roleLabel(auth.role)} />
        <SummaryCard label={auth.role === "admin" ? "订单总数" : "我可见的订单"} value={orders.length.toString()} />
        <SummaryCard
          label="未归属订单"
          value={orders.filter((order) => order.owner_user_id == null).length.toString()}
        />
      </section>

      <OrderDashboardClient
        initialOrders={ordersWithLinks}
        canManageOrders={auth.canManageReportOrders}
        viewerRole={auth.role}
        viewerUserId={auth.userId}
        members={members}
      />
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="text-xs tracking-[0.25em] text-gold-700">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-ink-900">{value}</div>
    </div>
  );
}
