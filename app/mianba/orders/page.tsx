import { getDefaultReportAuthContext } from "@/lib/auth/tenant";
import { reportStore } from "@/lib/reports/store";
import OrderDashboardClient from "./OrderDashboardClient";

export const dynamic = "force-dynamic";

export default async function MianbaOrdersPage() {
  const auth = getDefaultReportAuthContext();
  const orders = await reportStore().listReportOrders(auth.tenantId);

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs uppercase tracking-[0.35em] text-gold-700">Report Orders</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">报告订单后台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            当前租户：{auth.tenantId}。查看小报告/大报告订单，并把收款、交付和退款状态沉淀到订单系统。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports">
            创建报告订单
          </a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">
            返回增长工作台
          </a>
        </div>
      </header>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <SummaryCard label="租户" value={auth.tenantId} />
        <SummaryCard label="当前角色" value={auth.role} />
        <SummaryCard label="订单总数" value={orders.length.toString()} />
      </section>

      <OrderDashboardClient initialOrders={orders} canManageOrders={auth.canManageReportOrders} />
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-[0.25em] text-gold-700">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-ink-900">{value}</div>
    </div>
  );
}
