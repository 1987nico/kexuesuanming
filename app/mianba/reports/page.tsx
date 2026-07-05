"use client";

import { useCallback, useEffect, useState } from "react";

type ReportOrderStatus = "unpaid" | "paid" | "delivering" | "delivered" | "refunded";
type StatusTone = "neutral" | "active" | "success" | "warning";
type DeliveryActionKey = "smallReportSent" | "deepSurveyLinkSent" | "deepReportSent";

interface SubmissionSummary {
  id: string;
  customer_name: string;
  customer_contact: string | null;
  created_at: string;
  updated_at: string;
  talent_mode: string;
  talent_answer_count: number;
  report_status: "ready" | "generating";
  report_copy_source: "llm" | "fallback" | null;
  direction_status: "none" | "active" | "completed";
  direction_likes: number;
  direction_rounds_generated: number;
  lite_order_status: ReportOrderStatus | null;
  deep_order_status: ReportOrderStatus | null;
  deep_report_status: "none" | "generating" | "ready";
}

type DeliveryActions = Record<string, Partial<Record<DeliveryActionKey, boolean>>>;

interface UserStatusTag {
  label: string;
  tone: StatusTone;
}

const DELIVERY_ACTIONS_STORAGE_KEY = "mianba.report-delivery-actions.v1";

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-white text-ink-600 shadow-sm",
  active: "bg-gold-50 text-ink-800 ring-1 ring-gold-100",
  success: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
};

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormat.format(date);
}

function readDeliveryActions(): DeliveryActions {
  try {
    const raw = window.localStorage.getItem(DELIVERY_ACTIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeliveryActions) : {};
  } catch {
    return {};
  }
}

function saveDeliveryActions(actions: DeliveryActions) {
  try {
    window.localStorage.setItem(DELIVERY_ACTIONS_STORAGE_KEY, JSON.stringify(actions));
  } catch {}
}

export default function ReportsHubPage() {
  const testEntryPath = "/mianba/reports/new";
  const [origin, setOrigin] = useState("");
  const [testEntryUrl, setTestEntryUrl] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [submissionsMessage, setSubmissionsMessage] = useState("");
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [directionSurveyLinks, setDirectionSurveyLinks] = useState<Record<string, string>>({});
  const [deliveryActions, setDeliveryActions] = useState<DeliveryActions>({});
  const [directionLoadingId, setDirectionLoadingId] = useState<string | null>(null);
  const [deepReportLoadingId, setDeepReportLoadingId] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true);
    try {
      const res = await fetch("/api/reports/assessment-profiles?view=list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "加载提交列表失败");
      setSubmissions(data.submissions || []);
      setSubmissionsMessage("");
    } catch (error) {
      setSubmissionsMessage((error as Error).message);
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    setTestEntryUrl(new URL(testEntryPath, window.location.origin).toString());
    setDeliveryActions(readDeliveryActions());
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    if (!origin) return;
    setDirectionSurveyLinks((current) => {
      let changed = false;
      const next = { ...current };
      for (const item of submissions) {
        if (item.direction_status !== "none" && item.direction_rounds_generated > 0 && !next[item.id]) {
          next[item.id] = new URL(`/survey/directions/${item.id}`, origin).toString();
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [origin, submissions]);

  // 有报告在生成中时，每 10 秒自动刷新一次状态
  useEffect(() => {
    const needsPoll = submissions.some(
      (item) => item.report_status === "generating" || item.deep_report_status === "generating"
    );
    if (!needsPoll) return;
    const timer = setInterval(loadSubmissions, 10000);
    return () => clearInterval(timer);
  }, [submissions, loadSubmissions]);

  function markDeliveryAction(profileId: string, key: DeliveryActionKey) {
    setDeliveryActions((current) => {
      const next = {
        ...current,
        [profileId]: {
          ...(current[profileId] ?? {}),
          [key]: true,
        },
      };
      saveDeliveryActions(next);
      return next;
    });
  }

  function userStatusTags(item: SubmissionSummary): UserStatusTag[] {
    const actions = deliveryActions[item.id] ?? {};
    const tags: UserStatusTag[] = [];

    tags.push({ label: "已发送小报告测评链接", tone: "success" });

    if (item.report_status === "generating") {
      tags.push({ label: "小报告生成中", tone: "active" });
    } else if (actions.smallReportSent || item.lite_order_status === "delivered") {
      tags.push({ label: "已发送小报告", tone: "success" });
    } else {
      tags.push({ label: "已生成小报告", tone: "neutral" });
    }

    if (directionLoadingId === item.id) {
      tags.push({ label: "大报告测评选项生成中", tone: "active" });
    } else if (item.direction_status === "none") {
      tags.push({ label: "待发送大报告测评链接", tone: "warning" });
    } else if (item.direction_status === "active") {
      if (item.direction_likes > 0) {
        tags.push({ label: `大报告测评链接填写中 ${item.direction_likes}/10`, tone: "active" });
      } else if (actions.deepSurveyLinkSent) {
        tags.push({ label: "已发送大报告测评链接", tone: "success" });
      } else if (item.direction_rounds_generated > 0) {
        tags.push({ label: "已生成大报告测评链接", tone: "neutral" });
      } else {
        tags.push({ label: "大报告测评选项生成中", tone: "active" });
      }
    } else {
      tags.push({ label: "大报告测评已完成", tone: "success" });
    }

    if (deepReportLoadingId === item.id) {
      tags.push({ label: "大报告生成中", tone: "active" });
    } else if (item.deep_report_status === "ready") {
      tags.push({
        label: actions.deepReportSent || item.deep_order_status === "delivered" ? "大报告已发送" : "已生成大报告",
        tone: actions.deepReportSent || item.deep_order_status === "delivered" ? "success" : "neutral",
      });
    } else if (item.direction_status === "completed") {
      tags.push({ label: "待生成大报告", tone: "warning" });
    }

    return tags;
  }

  async function copyText(text: string, label: string, onCopied?: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      onCopied?.();
      setCopyMessage(`${label}已复制：${text}`);
    } catch {
      setCopyMessage(`复制失败，请手动复制：${text}`);
    }
  }

  function buildDirectionSurveyUrl(item: SubmissionSummary) {
    if (directionSurveyLinks[item.id]) return directionSurveyLinks[item.id];
    if (!origin || item.direction_status === "none" || item.direction_rounds_generated === 0) return "";
    return new URL(`/survey/directions/${item.id}`, origin).toString();
  }

  async function startDirectionSurvey(item: SubmissionSummary) {
    const existingUrl = buildDirectionSurveyUrl(item);
    if (existingUrl) {
      setCopyMessage(`${item.customer_name} 的大报告测评链接已生成，请使用链接旁边的一键复制链接。`);
      return;
    }

    setDirectionLoadingId(item.id);
    setCopyMessage(`${item.customer_name} 的首批大报告测评选项正在生成...`);
    try {
      const res = await fetch("/api/reports/direction-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assessment_profile_id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "创建测评失败");
      const url = new URL(data.survey_url, window.location.origin).toString();
      setDirectionSurveyLinks((current) => ({ ...current, [item.id]: url }));
      setCopyMessage(`${item.customer_name} 的专属大报告测评链接已生成。`);
      await loadSubmissions();
    } catch (error) {
      setCopyMessage((error as Error).message);
    } finally {
      setDirectionLoadingId(null);
    }
  }

  async function generateDeepReport(item: SubmissionSummary) {
    if (item.direction_status !== "completed") return;
    setDeepReportLoadingId(item.id);
    setCopyMessage("");
    try {
      const res = await fetch("/api/reports/deep", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assessment_profile_id: item.id,
          regenerate: item.deep_report_status === "ready",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成大报告失败");
      setCopyMessage(`${item.customer_name} 的完整报告已提交生成，约需 1–2 分钟，请稍后刷新查看。`);
      await loadSubmissions();
    } catch (error) {
      setCopyMessage((error as Error).message);
    } finally {
      setDeepReportLoadingId(null);
    }
  }

  function canGenerateDeepReport(item: SubmissionSummary) {
    return item.direction_status === "completed";
  }

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">报告交付系统</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">返回首页</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/orders">订单后台</a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/admin">管理员后台</a>
        </div>
      </header>

      {/* 测评入口 */}
      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="rounded-2xl border border-ink-100 bg-ink-50 p-4">
          <label className="mb-2 block text-xs font-medium text-ink-500">01 · 初步诊断报告测评入口</label>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              readOnly
              value={testEntryUrl || "正在生成完整测评入口..."}
              className="min-w-0 flex-1 rounded-xl border border-ink-100 bg-white px-3 py-3 font-mono text-xs text-ink-700"
            />
            <button
              type="button"
              disabled={!testEntryUrl}
              onClick={() => copyText(testEntryUrl, "测评入口")}
              className="rounded-full bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:opacity-40"
            >
              复制测评入口
            </button>
          </div>
        </div>
      </section>

      {/* 客户提交与报告交付 */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-4 text-xs tracking-[0.25em] text-gold-700">02 · 客户提交与报告交付</div>
            <h2 className="font-semibold">提交列表</h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              客户提交测评后会出现在这里。报告约 1 分钟生成完毕，「生成中」状态会自动刷新。
            </p>
          </div>
          <button
            className="rounded-full bg-ink-50 px-4 py-2 text-sm text-ink-700 transition hover:bg-gold-50 disabled:opacity-40"
            disabled={submissionsLoading}
            onClick={loadSubmissions}
          >
            {submissionsLoading ? "刷新中..." : "手动刷新"}
          </button>
        </div>

        {copyMessage && <p className="mb-3 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-700">{copyMessage}</p>}
        {submissionsMessage && <p className="mb-3 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-700">{submissionsMessage}</p>}

        {submissions.length === 0 ? (
          <div className="rounded-2xl bg-ink-50 p-6 text-sm text-ink-500">
            还没有客户提交。把上方测评入口发给客户，提交后这里会自动出现记录。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs text-ink-400">
                <tr>
                  <th className="px-3 py-2 font-medium">客户</th>
                  <th className="px-3 py-2 font-medium">提交时间</th>
                  <th className="px-3 py-2 font-medium">用户状态</th>
                  <th className="px-3 py-2 font-medium">报告交付</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((item) => {
                  const directionSurveyUrl = buildDirectionSurveyUrl(item);
                  const statusTags = userStatusTags(item);

                  return (
                    <tr key={item.id} className="bg-ink-50/70">
                      <td className="rounded-l-2xl px-3 py-3">
                        <div className="font-medium text-ink-800">{item.customer_name || "未填姓名"}</div>
                        <div className="mt-1 text-xs text-ink-400">{item.customer_contact || "未填联系方式"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-500">{formatDate(item.created_at)}</td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[22rem] flex-wrap gap-1.5">
                          {statusTags.map((tag) => (
                            <span
                              key={tag.label}
                              className={`rounded-full px-2.5 py-1 text-[11px] leading-4 ${STATUS_TONE_CLASSES[tag.tone]}`}
                            >
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="rounded-r-2xl px-3 py-3">
                        <div className="flex min-w-[24rem] flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            <a
                              className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900"
                              href={`/reports/initial/${item.id}`}
                              target="_blank"
                              onClick={() => markDeliveryAction(item.id, "smallReportSent")}
                            >
                              小报告
                            </a>
                            <button
                              className={
                                directionSurveyUrl
                                  ? "cursor-not-allowed rounded-full bg-ink-100 px-3 py-1.5 text-xs text-ink-400"
                                  : "rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900 disabled:opacity-40"
                              }
                              disabled={directionLoadingId === item.id || !!directionSurveyUrl}
                              onClick={() => startDirectionSurvey(item)}
                              title={directionSurveyUrl ? "链接已生成，请使用下方一键复制链接" : "生成大报告测评链接"}
                            >
                              {directionLoadingId === item.id ? "生成链接中..." : "生成大报告测评链接"}
                            </button>
                            <button
                              type="button"
                              className={
                                canGenerateDeepReport(item)
                                  ? "rounded-full bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ink-800 disabled:opacity-60"
                                  : "cursor-not-allowed rounded-full bg-ink-100 px-3 py-1.5 text-xs text-ink-400"
                              }
                              disabled={!canGenerateDeepReport(item) || deepReportLoadingId === item.id}
                              title={
                                canGenerateDeepReport(item)
                                  ? "方向测评已完成，可生成完整咨询报告"
                                  : item.direction_status === "active"
                                    ? `方向测评进行中（${item.direction_likes}/10），完成全部点亮后可生成`
                                    : "请先发送专属大报告测评入口，待客户点亮 10 个方向"
                              }
                              onClick={() => generateDeepReport(item)}
                            >
                              {deepReportLoadingId === item.id ? "生成中..." : "生成大报告"}
                            </button>
                          </div>
                          {directionSurveyUrl && (
                            <div className="flex max-w-[34rem] flex-col gap-2 rounded-2xl border border-ink-100 bg-white/70 p-2 md:flex-row md:items-center">
                              <div className="min-w-0 flex-1 break-all px-1 font-mono text-[11px] leading-5 text-ink-500">
                                {directionSurveyUrl}
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900"
                                onClick={() =>
                                  copyText(directionSurveyUrl, `${item.customer_name} 的大报告测评链接`, () =>
                                    markDeliveryAction(item.id, "deepSurveyLinkSent")
                                  )
                                }
                              >
                                一键复制链接
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
