import { listActivity, type ActivityEntry } from "@/lib/auth/activity";
import { requireMianbaPageAuth } from "@/lib/auth/mianba";
import { mianbaAuthStore } from "@/lib/auth/mianbaStore";
import { roleLabel } from "@/lib/auth/constants";
import { reportStore, type ReportOrder, type ReportOrderStatus } from "@/lib/reports/store";
import MianbaLogoutButton from "../MianbaLogoutButton";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<ReportOrderStatus, string> = {
  unpaid: "待付款",
  paid: "已付款",
  delivering: "交付中",
  delivered: "已交付",
  refunded: "已退款",
};

const FUNNEL_ORDER: ReportOrderStatus[] = ["unpaid", "paid", "delivering", "delivered", "refunded"];

const ACTION_LABELS: Record<string, string> = {
  login: "登录系统",
  order_created: "创建订单",
  order_status_updated: "更新订单状态",
  draft_published: "发布笔记",
  profile_submitted: "客户提交测评",
  profile_claimed: "认领客户",
  profile_reassigned: "改派客户",
  profile_released: "释放客户",
};

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormat.format(date);
}

function formatYuan(cents: number) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function activityDetail(entry: ActivityEntry) {
  const meta = entry.metadata ?? {};
  const parts: string[] = [];
  if (typeof meta.customer_name === "string" && meta.customer_name) parts.push(meta.customer_name);
  if (typeof meta.title === "string" && meta.title) parts.push(`《${meta.title}》`);
  if (entry.action === "order_status_updated" && typeof meta.to === "string") {
    const from = typeof meta.from === "string" ? STATUS_LABELS[meta.from as ReportOrderStatus] ?? meta.from : "";
    const to = STATUS_LABELS[meta.to as ReportOrderStatus] ?? meta.to;
    parts.push(from ? `${from} → ${to}` : `→ ${to}`);
  }
  if (entry.action === "order_created" && typeof meta.report_type === "string") {
    parts.push(meta.report_type === "deep" ? "深度诊断报告" : "初步诊断报告");
  }
  return parts.join(" · ");
}

export default async function MianbaDashboardPage() {
  const auth = await requireMianbaPageAuth("/mianba/dashboard", ["admin"]);
  const tenantId = auth.tenantId;

  const [orders, profiles, tenantUsers, activity] = await Promise.all([
    reportStore().listReportOrders(tenantId),
    reportStore().listAssessmentProfiles(tenantId, 500),
    mianbaAuthStore().listUsers(tenantId),
    listActivity(tenantId, 1000),
  ]);

  // ===== 订单漏斗与收入 =====
  const funnelCounts = FUNNEL_ORDER.reduce(
    (acc, status) => ({ ...acc, [status]: orders.filter((order) => order.status === status).length }),
    {} as Record<ReportOrderStatus, number>,
  );
  const paidStatuses: ReportOrderStatus[] = ["paid", "delivering", "delivered"];
  const sumCents = (list: ReportOrder[]) => list.reduce((acc, order) => acc + (order.price_cents ?? 0), 0);
  const collectedCents = sumCents(orders.filter((order) => paidStatuses.includes(order.status)));
  const deliveredCents = sumCents(orders.filter((order) => order.status === "delivered"));

  // ===== 团队产出 =====
  const now = Date.now();
  const days7 = 7 * 24 * 60 * 60 * 1000;
  const days30 = 30 * 24 * 60 * 60 * 1000;
  const memberRows = tenantUsers.map((user) => {
    const own = (entry: ActivityEntry) => entry.user_id === user.id;
    const memberActivity = activity.filter(own);
    const lastActive = memberActivity[0]?.created_at ?? null;
    const actions7d = memberActivity.filter((entry) => now - Date.parse(entry.created_at) <= days7).length;
    const published30d = memberActivity.filter(
      (entry) => entry.action === "draft_published" && now - Date.parse(entry.created_at) <= days30,
    ).length;
    const ownedOrders = orders.filter((order) => order.owner_user_id === user.id);
    const ownedCustomers = profiles.filter((profile) => profile.owner_user_id === user.id).length;
    return {
      id: user.id,
      name: user.display_name,
      role: user.role,
      disabled: user.disabled,
      ownedCustomers,
      orderCount: ownedOrders.length,
      deliveredCount: ownedOrders.filter((order) => order.status === "delivered").length,
      published30d,
      actions7d,
      lastActive,
    };
  });

  // ===== 客户概览 =====
  const unassignedProfiles = profiles.filter((profile) => profile.owner_user_id == null).length;
  const deepReady = profiles.filter((profile) => profile.deep_report).length;
  const directionCompleted = profiles.filter((profile) => profile.direction_session?.status === "completed").length;

  const recentActivity = activity.slice(0, 40);
  const memberNameById = new Map(tenantUsers.map((user) => [user.id, user.display_name]));

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">管理者视图</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">管理驾驶舱</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            {auth.user.display_name} · {roleLabel(auth.role)}。项目运行状态、成员产出与客户进度一屏总览。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">返回首页</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/orders">订单后台</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports">交付系统</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/admin">账号与设置</a>
          <MianbaLogoutButton />
        </div>
      </header>

      {/* 顶部指标 */}
      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <MetricCard label="客户总数" value={profiles.length.toString()} hint={`未认领 ${unassignedProfiles}`} />
        <MetricCard label="订单总数" value={orders.length.toString()} hint={`已交付 ${funnelCounts.delivered}`} />
        <MetricCard label="已收款金额" value={formatYuan(collectedCents)} hint="已付款 + 交付中 + 已交付" />
        <MetricCard label="已交付金额" value={formatYuan(deliveredCents)} hint="仅已交付订单" />
      </section>

      {/* 订单漏斗 */}
      <section className="mb-6 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">订单漏斗</h2>
        <p className="mt-1 text-xs text-ink-500">待付款 → 已付款 → 交付中 → 已交付（退款单独统计）</p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {FUNNEL_ORDER.map((status) => (
            <div
              key={status}
              className={`rounded-2xl p-4 ${status === "refunded" ? "bg-amber-50" : "bg-ink-50"}`}
            >
              <div className="text-xs text-ink-500">{STATUS_LABELS[status]}</div>
              <div className="mt-2 text-2xl font-semibold text-ink-900">{funnelCounts[status]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 团队产出 */}
      <section className="mb-6 rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">团队产出与工作状态</h2>
        <p className="mt-1 text-xs text-ink-500">
          订单与客户为当前名下总数；笔记为近 30 天发布；动作为近 7 天操作流水条数。
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs text-ink-400">
              <tr>
                <th className="px-3 py-2 font-medium">成员</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">负责客户</th>
                <th className="px-3 py-2 font-medium">名下订单</th>
                <th className="px-3 py-2 font-medium">已交付</th>
                <th className="px-3 py-2 font-medium">笔记(30天)</th>
                <th className="px-3 py-2 font-medium">动作(7天)</th>
                <th className="px-3 py-2 font-medium">最近活跃</th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map((row) => (
                <tr key={row.id} className="bg-ink-50/70">
                  <td className="rounded-l-2xl px-3 py-3 font-medium text-ink-800">
                    {row.name}
                    {row.disabled && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">已停用</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-600">{roleLabel(row.role)}</td>
                  <td className="px-3 py-3">{row.ownedCustomers}</td>
                  <td className="px-3 py-3">{row.orderCount}</td>
                  <td className="px-3 py-3">{row.deliveredCount}</td>
                  <td className="px-3 py-3">{row.published30d}</td>
                  <td className="px-3 py-3">{row.actions7d}</td>
                  <td className="rounded-r-2xl px-3 py-3 text-xs text-ink-500">{formatDate(row.lastActive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 客户进度 */}
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <MetricCard label="未认领客户" value={unassignedProfiles.toString()} hint="等待操作者认领或管理员指派" />
        <MetricCard label="方向测评已完成" value={directionCompleted.toString()} hint="可以生成深度诊断报告" />
        <MetricCard label="深度诊断报告已就绪" value={deepReady.toString()} hint="等待发送给客户" />
      </section>

      {/* 操作流水 */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">最近操作流水</h2>
        <p className="mt-1 text-xs text-ink-500">最近 40 条。客户公开链接触发的动作显示为「客户」。</p>
        {recentActivity.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-ink-50 p-6 text-sm text-ink-500">
            还没有操作记录。团队开始登录、认领客户、推进订单后，这里会出现流水。
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {recentActivity.map((entry, index) => (
              <li
                key={entry.id ?? `${entry.created_at}-${index}`}
                className="flex flex-col gap-1 rounded-2xl bg-ink-50/70 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-ink-700 shadow-sm">
                    {entry.user_id ? memberNameById.get(entry.user_id) ?? "未知成员" : "客户"}
                  </span>
                  <span className="text-ink-800">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                  {activityDetail(entry) && <span className="text-xs text-ink-500">{activityDetail(entry)}</span>}
                </div>
                <div className="text-xs text-ink-400">{formatDate(entry.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="text-xs tracking-[0.25em] text-gold-700">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-ink-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}
