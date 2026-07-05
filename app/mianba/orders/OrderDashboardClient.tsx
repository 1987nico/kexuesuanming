"use client";

import { useMemo, useState } from "react";
import type { ReportOrder, ReportOrderStatus } from "@/lib/reports/store";

const STATUS_LABELS: Record<ReportOrderStatus, string> = {
  unpaid: "待付款",
  paid: "已付款",
  delivering: "交付中",
  delivered: "已交付",
  refunded: "已退款",
};

const STATUS_FILTERS: Array<ReportOrderStatus | "all"> = ["all", "unpaid", "paid", "delivering", "delivered", "refunded"];
const STATUS_ACTIONS: ReportOrderStatus[] = ["paid", "delivering", "delivered", "refunded"];

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface OrderDashboardClientProps {
  initialOrders: ReportOrder[];
  canManageOrders: boolean;
}

export default function OrderDashboardClient({ initialOrders, canManageOrders }: OrderDashboardClientProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [activeStatus, setActiveStatus] = useState<ReportOrderStatus | "all">("all");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const counts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.all += 1;
        acc[order.status] += 1;
        return acc;
      },
      { all: 0, unpaid: 0, paid: 0, delivering: 0, delivered: 0, refunded: 0 } as Record<ReportOrderStatus | "all", number>,
    );
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (activeStatus === "all") return orders;
    return orders.filter((order) => order.status === activeStatus);
  }, [activeStatus, orders]);

  function reportPathFor(order: ReportOrder) {
    if (!order.assessment_profile_id) return null;
    return order.report_type === "deep"
      ? `/reports/deep/${order.assessment_profile_id}`
      : `/reports/initial/${order.assessment_profile_id}`;
  }

  async function copyDeliveryLink(order: ReportOrder) {
    const path = reportPathFor(order);
    if (!path) return;
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`订单 ${shortId(order.id)} 的交付链接已复制：${url}`);
    } catch {
      setMessage(`复制失败，请手动复制：${url}`);
    }
  }

  async function updateStatus(orderId: string, status: ReportOrderStatus) {
    setUpdatingOrderId(orderId);
    setMessage("");
    try {
      const res = await fetch(`/api/reports/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "更新订单状态失败");
      setOrders((current) => current.map((order) => (order.id === orderId ? data.order : order)));
      setMessage(`订单 ${shortId(orderId)} 已更新为 ${STATUS_LABELS[status]}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setUpdatingOrderId(null);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-semibold">订单列表</h2>
          <p className="mt-1 text-xs leading-5 text-ink-500">
            按状态筛选报告订单，并把已收款订单推进到交付、完成或退款。
          </p>
        </div>
        <div className="rounded-full bg-ink-50 px-3 py-1 text-xs text-ink-500">{canManageOrders ? "可管理订单" : "只读权限"}</div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => setActiveStatus(status)}
            className={`rounded-full px-3 py-2 text-xs transition ${
              activeStatus === status ? "bg-ink-900 text-white" : "bg-ink-50 text-ink-600 hover:bg-gold-50"
            }`}
          >
            {status === "all" ? "全部" : STATUS_LABELS[status]} · {counts[status]}
          </button>
        ))}
      </div>

      {message && <p className="mb-4 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-700">{message}</p>}

      {visibleOrders.length === 0 ? (
        <div className="rounded-2xl bg-ink-50 p-6 text-sm text-ink-500">当前状态下暂无订单。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs text-ink-400">
              <tr>
                <th className="px-3 py-2 font-medium">订单</th>
                <th className="px-3 py-2 font-medium">客户</th>
                <th className="px-3 py-2 font-medium">类型 / 金额</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">创建时间</th>
                <th className="px-3 py-2 font-medium">报告交付</th>
                <th className="px-3 py-2 font-medium">状态操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id} className="bg-ink-50/70">
                  <td className="rounded-l-2xl px-3 py-3 font-mono text-xs text-ink-600">{shortId(order.id)}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-ink-800">{order.customer_name || "未填姓名"}</div>
                    <div className="mt-1 text-xs text-ink-400">{order.customer_contact || "未填联系方式"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{order.report_type === "lite" ? "初步诊断报告" : "完整咨询报告"}</div>
                    <div className="mt-1 text-xs text-ink-400">{formatPrice(order.price_cents)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-ink-700 shadow-sm">{STATUS_LABELS[order.status]}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-500">{formatDate(order.created_at)}</td>
                  <td className="px-3 py-3">
                    {reportPathFor(order) ? (
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900"
                          href={reportPathFor(order)!}
                          target="_blank"
                        >
                          打开报告
                        </a>
                        {order.report_type === "lite" && (
                          <a
                            className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900"
                            href={`/api/reports/initial/${order.assessment_profile_id}/pdf`}
                            target="_blank"
                          >
                            下载 PDF
                          </a>
                        )}
                        <button
                          onClick={() => copyDeliveryLink(order)}
                          className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900"
                        >
                          复制交付链接
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-400">未关联底稿</span>
                    )}
                  </td>
                  <td className="rounded-r-2xl px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {STATUS_ACTIONS.map((status) => (
                        <button
                          key={status}
                          onClick={() => updateStatus(order.id, status)}
                          disabled={!canManageOrders || updatingOrderId === order.id || order.status === status}
                          className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900 disabled:opacity-40"
                        >
                          {STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatPrice(priceCents?: number | null) {
  if (typeof priceCents !== "number") return "未填金额";
  return `¥${(priceCents / 100).toFixed(2)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormat.format(date);
}
