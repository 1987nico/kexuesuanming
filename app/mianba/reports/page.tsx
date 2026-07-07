"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ReportOrderStatus = "unpaid" | "paid" | "delivering" | "delivered" | "refunded";
type StatusTone = "neutral" | "active" | "success" | "warning";
type DeliveryActionKey = "smallReportSent" | "deepSurveyLinkSent" | "deepReportSent";
type MianbaRole = "admin" | "operator";

interface TeamMember {
  id: string;
  display_name: string;
  role: MianbaRole;
  disabled: boolean;
}

interface SubmissionSummary {
  id: string;
  owner_user_id: string | null;
  owner_display_name: string | null;
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
  links: {
    initial_report_url: string;
    lite_report_url: string;
    initial_pdf_url: string;
    deep_report_url: string;
    deep_pdf_url: string;
    direction_survey_url: string;
  };
}

type SubmissionFilterKey =
  | "all"
  | "initial_generating"
  | "initial_unsent"
  | "deep_survey_pending"
  | "deep_survey_active"
  | "deep_report_pending"
  | "deep_ready"
  | "unassigned"
  | "mine";

type DeliveryActions = Record<string, Partial<Record<DeliveryActionKey, boolean>>>;

interface UserStatusTag {
  label: string;
  tone: StatusTone;
}

const DELIVERY_ACTIONS_STORAGE_KEY = "mianba.report-delivery-actions.v1";
const INITIAL_REPORT_LABEL = "初步诊断报告";
const DEEP_REPORT_LABEL = "深度诊断报告";

const SUBMISSION_FILTERS: Array<{ key: SubmissionFilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "initial_generating", label: "初步生成中" },
  { key: "initial_unsent", label: "初步待发送" },
  { key: "deep_survey_pending", label: "深度测评待发送" },
  { key: "deep_survey_active", label: "深度测评填写中" },
  { key: "deep_report_pending", label: "深度待生成" },
  { key: "deep_ready", label: "深度已生成" },
  { key: "unassigned", label: "未认领" },
  { key: "mine", label: "我负责" },
];

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

function initialReportSent(item: SubmissionSummary, actions: DeliveryActions) {
  return Boolean(actions[item.id]?.smallReportSent || item.lite_order_status === "delivered");
}

function matchesSubmissionFilter(
  item: SubmissionSummary,
  filter: SubmissionFilterKey,
  currentUserId: string | null,
  actions: DeliveryActions
) {
  if (filter === "all") return true;
  if (filter === "initial_generating") return item.report_status === "generating";
  if (filter === "initial_unsent") return item.report_status === "ready" && !initialReportSent(item, actions);
  if (filter === "deep_survey_pending") return item.direction_status === "none";
  if (filter === "deep_survey_active") return item.direction_status === "active";
  if (filter === "deep_report_pending") return item.direction_status === "completed" && item.deep_report_status !== "ready";
  if (filter === "deep_ready") return item.deep_report_status === "ready";
  if (filter === "unassigned") return item.owner_user_id == null;
  if (filter === "mine") return Boolean(currentUserId && item.owner_user_id === currentUserId);
  return true;
}

function matchesSearch(item: SubmissionSummary, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.id, item.customer_name, item.customer_contact, item.owner_display_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
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
  const [currentRole, setCurrentRole] = useState<MianbaRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<SubmissionFilterKey>("all");

  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true);
    try {
      const res = await fetch("/api/reports/assessment-profiles?view=list", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = `/mianba/login?next=${encodeURIComponent("/mianba/reports")}`;
        return;
      }
      if (!res.ok) throw new Error(data.message || data.error || "加载提交列表失败");
      setSubmissions(data.submissions || []);
      setMembers(data.members || []);
      if (data.viewer) {
        setCurrentRole(data.viewer.role ?? null);
        setCurrentUserId(data.viewer.user_id ?? null);
      }
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
    fetch("/api/mianba/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCurrentRole(data?.role ?? null))
      .catch(() => setCurrentRole(null));
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
          next[item.id] = new URL(item.links.direction_survey_url, origin).toString();
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

    tags.push({ label: `已发送${INITIAL_REPORT_LABEL}测评链接`, tone: "success" });

    if (item.report_status === "generating") {
      tags.push({ label: `${INITIAL_REPORT_LABEL}生成中`, tone: "active" });
    } else if (actions.smallReportSent || item.lite_order_status === "delivered") {
      tags.push({ label: `已发送${INITIAL_REPORT_LABEL}`, tone: "success" });
    } else {
      tags.push({ label: `已生成${INITIAL_REPORT_LABEL}`, tone: "neutral" });
    }

    if (directionLoadingId === item.id) {
      tags.push({ label: `${DEEP_REPORT_LABEL}测评选项生成中`, tone: "active" });
    } else if (item.direction_status === "none") {
      tags.push({ label: `待发送${DEEP_REPORT_LABEL}测评链接`, tone: "warning" });
    } else if (item.direction_status === "active") {
      if (item.direction_likes > 0) {
        tags.push({ label: `${DEEP_REPORT_LABEL}测评链接填写中 ${item.direction_likes}/10`, tone: "active" });
      } else if (actions.deepSurveyLinkSent) {
        tags.push({ label: `已发送${DEEP_REPORT_LABEL}测评链接`, tone: "success" });
      } else if (item.direction_rounds_generated > 0) {
        tags.push({ label: `已生成${DEEP_REPORT_LABEL}测评链接`, tone: "neutral" });
      } else {
        tags.push({ label: `${DEEP_REPORT_LABEL}测评选项生成中`, tone: "active" });
      }
    } else {
      tags.push({ label: `${DEEP_REPORT_LABEL}测评已完成`, tone: "success" });
    }

    if (deepReportLoadingId === item.id) {
      tags.push({ label: `${DEEP_REPORT_LABEL}生成中`, tone: "active" });
    } else if (item.deep_report_status === "ready") {
      tags.push({
        label:
          actions.deepReportSent || item.deep_order_status === "delivered"
            ? `${DEEP_REPORT_LABEL}已发送`
            : `已生成${DEEP_REPORT_LABEL}`,
        tone: actions.deepReportSent || item.deep_order_status === "delivered" ? "success" : "neutral",
      });
    } else if (item.direction_status === "completed") {
      tags.push({ label: `待生成${DEEP_REPORT_LABEL}`, tone: "warning" });
    }

    return tags;
  }

  async function assignOwner(item: SubmissionSummary, ownerUserId: string | null) {
    setAssigningId(item.id);
    try {
      const res = await fetch(`/api/reports/assessment-profiles/${item.id}/owner`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner_user_id: ownerUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "设置负责人失败");
      setCopyMessage(
        ownerUserId
          ? `${item.customer_name} 已交给 ${members.find((m) => m.id === ownerUserId)?.display_name ?? "所选成员"} 负责。`
          : `${item.customer_name} 已释放为未认领。`
      );
      await loadSubmissions();
    } catch (error) {
      setCopyMessage((error as Error).message);
    } finally {
      setAssigningId(null);
    }
  }

  async function copyText(text: string, label: string, onCopied?: () => void) {
    try {
      await writeClipboard(text);
      onCopied?.();
      setCopyMessage(`${label}已复制：${text}`);
    } catch {
      setCopyMessage(`复制失败，请手动复制：${text}`);
    }
  }

  function buildDirectionSurveyUrl(item: SubmissionSummary) {
    if (directionSurveyLinks[item.id]) return directionSurveyLinks[item.id];
    if (!origin || item.direction_status === "none" || item.direction_rounds_generated === 0) return "";
    return new URL(item.links.direction_survey_url, origin).toString();
  }

  async function startDirectionSurvey(item: SubmissionSummary) {
    const existingUrl = buildDirectionSurveyUrl(item);
    if (existingUrl) {
      setCopyMessage(`${item.customer_name} 的${DEEP_REPORT_LABEL}测评链接已生成，请使用链接旁边的一键复制链接。`);
      return;
    }

    setDirectionLoadingId(item.id);
    setCopyMessage(`${item.customer_name} 的首批${DEEP_REPORT_LABEL}测评选项正在生成...`);
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
      setCopyMessage(`${item.customer_name} 的专属${DEEP_REPORT_LABEL}测评链接已生成。`);
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
      if (!res.ok) throw new Error(data.message || data.error || `生成${DEEP_REPORT_LABEL}失败`);
      setCopyMessage(`${item.customer_name} 的${DEEP_REPORT_LABEL}已提交生成，约需 1–2 分钟，请稍后刷新查看。`);
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

  const filterCounts = useMemo(() => {
    return Object.fromEntries(
      SUBMISSION_FILTERS.map((filter) => [
        filter.key,
        submissions.filter((item) => matchesSubmissionFilter(item, filter.key, currentUserId, deliveryActions)).length,
      ])
    ) as Record<SubmissionFilterKey, number>;
  }, [currentUserId, deliveryActions, submissions]);

  const visibleSubmissions = useMemo(() => {
    return submissions.filter((item) => {
      return (
        matchesSearch(item, searchQuery) &&
        matchesSubmissionFilter(item, activeFilter, currentUserId, deliveryActions)
      );
    });
  }, [activeFilter, currentUserId, deliveryActions, searchQuery, submissions]);

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">报告交付系统</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">返回首页</a>
          {currentRole === "admin" && (
            <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/admin">管理员后台</a>
          )}
          <button
            className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm"
            onClick={async () => {
              await fetch("/api/mianba/auth/logout", { method: "POST" });
              window.location.href = "/mianba/login";
            }}
          >
            退出登录
          </button>
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
      <section className="rounded-3xl bg-white p-5 shadow-sm md:p-7">
        <div className="mb-5 flex flex-col gap-4 border-b border-ink-100 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-medium tracking-[0.22em] text-gold-700">02 · 客户提交与报告交付</div>
            <h2 className="mt-3 text-xl font-semibold text-ink-900">提交列表</h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">
              客户提交测评后会出现在这里。
            </p>
          </div>
          <button
            className="w-fit rounded-full border border-ink-100 bg-white px-4 py-2 text-sm text-ink-700 shadow-sm transition hover:bg-gold-50 disabled:opacity-40"
            disabled={submissionsLoading}
            onClick={loadSubmissions}
          >
            {submissionsLoading ? "刷新中..." : "手动刷新"}
          </button>
        </div>

        {copyMessage && <p className="mb-3 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-700">{copyMessage}</p>}
        {submissionsMessage && <p className="mb-3 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-700">{submissionsMessage}</p>}

        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-0 rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-800 outline-none transition focus:border-gold-300 focus:bg-white"
            placeholder="搜索客户名、手机号、邮箱或报告 ID"
          />
          {searchQuery && (
            <button
              type="button"
              className="w-fit rounded-full bg-ink-100 px-4 py-2 text-sm text-ink-600 transition hover:bg-gold-50"
              onClick={() => setSearchQuery("")}
            >
              清空搜索
            </button>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {SUBMISSION_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`rounded-full px-3 py-2 text-xs transition ${
                activeFilter === filter.key ? "bg-ink-900 text-white" : "bg-ink-50 text-ink-600 hover:bg-gold-50"
              }`}
            >
              {filter.label} · {filterCounts[filter.key]}
            </button>
          ))}
        </div>

        {submissions.length === 0 ? (
          <div className="rounded-2xl bg-ink-50 p-6 text-sm text-ink-500">
            还没有客户提交。把上方测评入口发给客户，提交后这里会自动出现记录。
          </div>
        ) : visibleSubmissions.length === 0 ? (
          <div className="rounded-2xl bg-ink-50 p-6 text-sm text-ink-500">
            没有符合当前搜索或筛选条件的提交。
          </div>
        ) : (
          <div className="space-y-3">
            {visibleSubmissions.map((item) => {
              const directionSurveyUrl = buildDirectionSurveyUrl(item);
              const statusTags = userStatusTags(item);

              return (
                <article key={item.id} className="rounded-2xl border border-ink-100 bg-ink-50/40 p-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(150px,0.75fr)_minmax(220px,1.25fr)_minmax(300px,1.65fr)] lg:items-start">
                    <div>
                      <div className="text-[11px] font-medium text-ink-400">客户</div>
                      <div className="mt-1 font-semibold text-ink-900">{item.customer_name || "未填姓名"}</div>
                      <div className="mt-1 break-all text-xs leading-5 text-ink-500">{item.customer_contact || "未填联系方式"}</div>
                      <div className="mt-3 text-[11px] text-ink-400">提交时间 · {formatDate(item.created_at)}</div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-medium text-ink-400">负责人</div>
                      {currentRole === "admin" ? (
                        <select
                          className="w-full rounded-full border border-ink-100 bg-white px-3 py-2 text-xs text-ink-700 shadow-sm"
                          value={item.owner_user_id ?? ""}
                          disabled={assigningId === item.id}
                          onChange={(event) => assignOwner(item, event.target.value || null)}
                        >
                          <option value="">未认领</option>
                          {members
                            .filter((member) => !member.disabled || member.id === item.owner_user_id)
                            .map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.display_name}
                              </option>
                            ))}
                        </select>
                      ) : item.owner_user_id ? (
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-xs ${
                            item.owner_user_id === currentUserId
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                              : "bg-white text-ink-600 shadow-sm"
                          }`}
                        >
                          {item.owner_user_id === currentUserId ? `${item.owner_display_name ?? "我"}（我）` : item.owner_display_name}
                        </span>
                      ) : (
                        <button
                          className="rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-800 ring-1 ring-amber-100 transition hover:bg-amber-100 disabled:opacity-40"
                          disabled={assigningId === item.id || !currentUserId}
                          onClick={() => assignOwner(item, currentUserId)}
                        >
                          {assigningId === item.id ? "认领中..." : "认领客户"}
                        </button>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-medium text-ink-400">用户状态</div>
                      <div className="flex flex-wrap gap-1.5">
                        {statusTags.map((tag) => (
                          <span
                            key={tag.label}
                            className={`rounded-full px-2.5 py-1 text-[11px] leading-4 ${STATUS_TONE_CLASSES[tag.tone]}`}
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-medium text-ink-400">报告交付</div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900"
                          href={item.links.initial_report_url}
                          target="_blank"
                          onClick={() => markDeliveryAction(item.id, "smallReportSent")}
                        >
                          {INITIAL_REPORT_LABEL}
                        </a>
                        <button
                          className={
                            directionSurveyUrl
                              ? "cursor-not-allowed rounded-full bg-ink-100 px-3 py-1.5 text-xs text-ink-400"
                              : "rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900 disabled:opacity-40"
                          }
                          disabled={directionLoadingId === item.id || !!directionSurveyUrl}
                          onClick={() => startDirectionSurvey(item)}
                          title={directionSurveyUrl ? "链接已生成，请使用下方一键复制链接" : `生成${DEEP_REPORT_LABEL}测评链接`}
                        >
                          {directionLoadingId === item.id ? "生成链接中..." : `生成${DEEP_REPORT_LABEL}测评链接`}
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
                              ? `方向测评已完成，可生成${DEEP_REPORT_LABEL}`
                              : item.direction_status === "active"
                                ? `方向测评进行中（${item.direction_likes}/10），完成全部点亮后可生成`
                                : `请先发送专属${DEEP_REPORT_LABEL}测评入口，待客户点亮 10 个方向`
                          }
                          onClick={() => generateDeepReport(item)}
                        >
                          {deepReportLoadingId === item.id
                            ? "生成中..."
                            : item.deep_report_status === "ready"
                              ? `重新生成${DEEP_REPORT_LABEL}`
                              : `生成${DEEP_REPORT_LABEL}`}
                        </button>
                        {item.deep_report_status === "ready" && (
                          <a
                            className="rounded-full bg-white px-3 py-1.5 text-xs text-ink-600 shadow-sm transition hover:text-ink-900"
                            href={item.links.deep_report_url}
                            target="_blank"
                            onClick={() => markDeliveryAction(item.id, "deepReportSent")}
                          >
                            {DEEP_REPORT_LABEL}
                          </a>
                        )}
                      </div>
                      {directionSurveyUrl && (
                        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white p-2 md:flex-row md:items-center">
                          <div className="min-w-0 flex-1 break-all px-1 font-mono text-[11px] leading-5 text-ink-500">
                            {directionSurveyUrl}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-full bg-ink-50 px-3 py-1.5 text-xs text-ink-600 transition hover:bg-gold-50"
                            onClick={() =>
                              copyText(directionSurveyUrl, `${item.customer_name} 的${DEEP_REPORT_LABEL}测评链接`, () =>
                                markDeliveryAction(item.id, "deepSurveyLinkSent")
                              )
                            }
                          >
                            一键复制链接
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
