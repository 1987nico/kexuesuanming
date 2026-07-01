"use client";

import { useEffect, useState } from "react";
import type { AssessmentProfile } from "@/lib/reports/assessmentProfile";
import type { ReportOrder, ReportType } from "@/lib/reports/store";

const defaultValueProfile = {
  liked_values: ["学习/进化", "了解世界", "被爱"],
  excluded_values: ["安稳度日", "优哉游哉", "创新"],
  like_summary: "持续学习升级，看见更大的世界，并获得真实认可。",
  exclude_summary: "只求安稳舒适，停在小圈安全感，或为新奇而创新。",
  filter_sentence: "能持续学习、连接更大的世界、让个人判断被看见。",
};

export default function ReportsHubPage() {
  const [customerName, setCustomerName] = useState("测试用户");
  const [customerContact, setCustomerContact] = useState("");
  const [surveyAnswers, setSurveyAnswers] = useState("{}");
  const [valueProfile, setValueProfile] = useState(JSON.stringify(defaultValueProfile, null, 2));
  const [talentAnswers, setTalentAnswers] = useState("{}");
  const [profile, setProfile] = useState<AssessmentProfile | null>(null);
  const [latestOrder, setLatestOrder] = useState<ReportOrder | null>(null);
  const [message, setMessage] = useState("");
  const [orderMessage, setOrderMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState<ReportType | null>(null);

  useEffect(() => {
    fetch("/api/reports/talent-template")
      .then((res) => res.json())
      .then((data) => setTalentAnswers(JSON.stringify(data.neutral_answers || {}, null, 2)))
      .catch(() => setMessage("未能加载 252 题模板，请手动粘贴答案 JSON。"));
  }, []);

  async function createProfile() {
    setLoading(true);
    setMessage("生成测评底稿中...");
    setProfile(null);
    setLatestOrder(null);
    setOrderMessage("");
    try {
      const res = await fetch("/api/reports/assessment-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName,
          customer_contact: customerContact || undefined,
          survey_answers: JSON.parse(surveyAnswers),
          value_profile: JSON.parse(valueProfile),
          talent_answers: JSON.parse(talentAnswers),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "创建底稿失败");
      setProfile(data.profile);
      setMessage(`底稿已生成，天赋数据模式：${data.profile.talent_profile.mode}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function createReportOrder(reportType: ReportType) {
    if (!profile) return;
    setOrderLoading(reportType);
    setOrderMessage(`创建${reportType === "lite" ? "小" : "大"}报告订单中...`);
    try {
      const res = await fetch("/api/reports/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assessment_profile_id: profile.id,
          report_type: reportType,
          price_cents: reportType === "lite" ? 19900 : 699900,
          customer_name: profile.customer_name,
          customer_contact: profile.customer_contact,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "创建订单失败");
      setLatestOrder(data.order);
      setOrderMessage(`已创建${reportType === "lite" ? "小" : "大"}报告订单：${data.order.id}`);
    } catch (error) {
      setOrderMessage((error as Error).message);
    } finally {
      setOrderLoading(null);
    }
  }

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs uppercase tracking-[0.35em] text-gold-700">Reports</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">报告</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            测试链接 → 客户答题 → 生成统一底稿 → 交付小报告 / 大报告。大小报告共用同一底稿，价值观与天赋一致。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">小红书笔记</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/orders">订单后台</a>
        </div>
      </header>

      {/* 测试链接 */}
      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-4 text-xs uppercase tracking-[0.25em] text-gold-700">01 · 测试链接</div>
        <h2 className="mb-2 font-semibold">发给客户的测评入口</h2>
        <p className="mb-4 text-sm leading-6 text-ink-600">
          把客户引导到 252 题站内测评页，完成后自动生成统一测评底稿；大小报告都从这份底稿派生。
        </p>
        <a className="btn-primary" href="/mianba/reports/new" target="_blank">打开客户测评页（测试链接）</a>

        <div className="mt-6 rounded-2xl bg-ink-50 p-4">
          <div className="mb-3 text-xs font-medium text-ink-500">开发快捷：直接粘贴 JSON 生成底稿</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-ink-500">客户姓名</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mb-3 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm" />
              <label className="mb-1 block text-xs text-ink-500">联系方式（可选）</label>
              <input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-500">价值观双三圈 JSON</label>
              <textarea value={valueProfile} onChange={(e) => setValueProfile(e.target.value)} rows={5} className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 font-mono text-xs" />
            </div>
          </div>
          <button className="btn-primary mt-4" disabled={loading} onClick={createProfile}>{loading ? "生成中..." : "快速生成底稿"}</button>
          {message && <p className="mt-3 text-sm text-ink-600">{message}</p>}
        </div>
      </section>

      {/* 小报告 / 大报告 */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 text-xs uppercase tracking-[0.25em] text-gold-700">02 · 小报告</div>
          <h2 className="mb-2 font-semibold">初步诊断报告（约 ¥199）</h2>
          <p className="mb-4 text-sm leading-6 text-ink-600">方向初筛 + 价值观 + 天赋信号 + 90 天验证框架，12 版块。</p>
          {profile ? (
            <div className="flex flex-wrap gap-3">
              <a className="btn-primary" href={`/reports/lite/${profile.id}`} target="_blank">打开小报告</a>
              <button className="btn-primary" disabled={!!orderLoading} onClick={() => createReportOrder("lite")}>
                {orderLoading === "lite" ? "创建中..." : "创建小报告订单"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-400">先在上方生成底稿。</p>
          )}
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 text-xs uppercase tracking-[0.25em] text-gold-700">03 · 大报告</div>
          <h2 className="mb-2 font-semibold">完整咨询报告（约 ¥6999）</h2>
          <p className="mb-4 text-sm leading-6 text-ink-600">六步漏斗：喜欢区 → 发散 → 感性 → 市场 → VRIN → 失败验尸 + 90 天计划。</p>
          {profile ? (
            <div className="flex flex-wrap gap-3">
              <a className="btn-primary" href={`/reports/deep/${profile.id}`} target="_blank">打开大报告</a>
              <button className="btn-primary" disabled={!!orderLoading} onClick={() => createReportOrder("deep")}>
                {orderLoading === "deep" ? "创建中..." : "创建大报告订单"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-400">先在上方生成底稿。</p>
          )}
        </div>
      </section>

      {profile && (
        <section className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm leading-6 text-ink-600">当前底稿 ID：{profile.id}；天赋模式：{profile.talent_profile.mode}</p>
          {orderMessage && <p className="mt-2 text-sm text-ink-600">{orderMessage}</p>}
          {latestOrder && (
            <p className="mt-2 text-xs leading-5 text-ink-500">
              最近订单：{latestOrder.report_type} / {latestOrder.status} /
              {typeof latestOrder.price_cents === "number" ? ` ¥${(latestOrder.price_cents / 100).toFixed(2)}` : " 未填"}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
