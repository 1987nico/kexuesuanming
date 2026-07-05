"use client";

import { useEffect, useState } from "react";

function formatPriceLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "未设置价格";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `¥${trimmed}`;
  return trimmed;
}

export default function MianbaAdminPage() {
  const [settingsForm, setSettingsForm] = useState({ report_lite_price: "199", report_deep_price: "6999" });
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/growth/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettingsForm({
            report_lite_price: data.settings.report_lite_price ?? "199",
            report_deep_price: data.settings.report_deep_price ?? "6999",
          });
        }
      })
      .catch(() => setSettingsMessage("价格设置加载失败，请刷新重试。"));
  }, []);

  async function saveSettings() {
    setSettingsLoading(true);
    setSettingsMessage("保存价格中...");
    try {
      const res = await fetch("/api/growth/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "保存价格失败");
      setSettingsForm({
        report_lite_price: data.settings.report_lite_price ?? settingsForm.report_lite_price,
        report_deep_price: data.settings.report_deep_price ?? settingsForm.report_deep_price,
      });
      setSettingsMessage("价格已保存。");
    } catch (error) {
      setSettingsMessage((error as Error).message);
    } finally {
      setSettingsLoading(false);
    }
  }

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">管理员</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">管理员后台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            集中管理系统级配置。业务人员日常操作请使用报告交付系统和订单后台。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">返回首页</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports">报告交付系统</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/orders">订单后台</a>
        </div>
      </header>

      {/* 业务设置 · 报告价格 */}
      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-4 text-xs tracking-[0.25em] text-gold-700">01 · 业务设置</div>
        <h2 className="mb-2 font-semibold">报告价格</h2>
        <p className="mb-4 text-sm leading-6 text-ink-600">
          初步诊断报告（{formatPriceLabel(settingsForm.report_lite_price)}）和完整咨询报告（{formatPriceLabel(settingsForm.report_deep_price)}）。价格会写进自动登记的订单，也会同步给增长系统。
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-ink-500">初步诊断报告价格</label>
            <input
              value={settingsForm.report_lite_price}
              onChange={(e) => setSettingsForm({ ...settingsForm, report_lite_price: e.target.value })}
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              placeholder="例如：199、199 元、免费体验"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-500">完整咨询报告价格</label>
            <input
              value={settingsForm.report_deep_price}
              onChange={(e) => setSettingsForm({ ...settingsForm, report_deep_price: e.target.value })}
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              placeholder="例如：6999、6999 元"
            />
          </div>
        </div>
        <button className="btn-primary mt-4" disabled={settingsLoading} onClick={saveSettings}>
          {settingsLoading ? "保存中..." : "保存价格"}
        </button>
        {settingsMessage && <p className="mt-3 text-sm text-ink-600">{settingsMessage}</p>}
      </section>
    </main>
  );
}
