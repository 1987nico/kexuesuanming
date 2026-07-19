"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MianbaLogoutButton from "@/app/mianba/MianbaLogoutButton";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthBusinessLine,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthRun,
  MethodAggregate,
  MethodGenerationMode,
  TitleMethodGroup,
  TitleMethodId,
  TopicCandidate,
  TopicSourceSnapshot,
  WeeklyReviewResult,
} from "@/lib/growth/types";
import {
  GROWTH_BUSINESS_DEFINITIONS,
  GROWTH_BUSINESS_LINES,
  GROWTH_PERSONA_LABELS,
  GROWTH_PERSONAS,
  PERSONA_SPECIFIC_FIELDS,
} from "@/lib/growth/types";
import {
  methodsForPersona,
  TITLE_METHOD_BY_ID,
  type TitleMethodDefinition,
} from "@/lib/growth/methods";

interface BootstrapData {
  businessLine: GrowthBusinessLine;
  account: GrowthAccount | null;
  plan: GrowthPlan | null;
  runs: GrowthRun[];
  drafts: ContentDraft[];
  currentDrafts: ContentDraft[];
  historicalDrafts: ContentDraft[];
  reviews: Record<string, GrowthReview>;
  weeklyReview: WeeklyReviewResult | null;
  capabilities: { reviewScreenshot: boolean };
  preview: { enabled: boolean; banner?: string; productionDataConnected?: boolean };
  sourceCounts: Record<MethodGenerationMode, { configured: number; generatable: number; blockedBySource: number }>;
  learningSummary: { historicalEffectiveSamples: number; newLearningSamples: number; explanation: string };
}

interface AccountForm {
  name: string;
  one_liner: string;
  target_user: string;
  core_problem: string;
  account_value: string;
  follow_reason: string;
  trust_source: string;
  not_doing: string;
  tone_style: string;
  compliance_redline: string;
  hypotheses: string;
  filter_words: string;
  avoid_expressions: string;
  private_domain: string;
  persona_specific: Record<string, string>;
}

interface SourceForm {
  method_id: TitleMethodId;
  platform: string;
  author: string;
  original_title: string;
  original_url: string;
  published_at: string;
  heat_snapshot: string;
  migration_note: string;
  verified_by_operator: boolean;
}

const numericReviewFields = [
  ["impressions", "曝光"], ["reads", "阅读"], ["average_view_seconds", "平均阅读秒数"], ["likes", "点赞"],
  ["saves", "收藏"], ["comments", "评论"], ["shares", "分享"], ["profile_visits", "主页访问"],
  ["follows", "关注"], ["private_messages", "主动私信"], ["qualified_inquiries", "有效咨询"],
  ["diagnosis_199_entries", "199诊断进入"], ["diagnosis_199_sales", "199诊断成交"],
  ["deep_6999_qualified", "6999适配"], ["deep_6999_sales", "6999成交"],
] as const;

const emptyAccount: AccountForm = {
  name: "面霸君",
  one_liner: "",
  target_user: "",
  core_problem: "",
  account_value: "",
  follow_reason: "",
  trust_source: "",
  not_doing: "",
  tone_style: "",
  compliance_redline: "",
  hypotheses: "",
  filter_words: "",
  avoid_expressions: "",
  private_domain: "",
  persona_specific: {},
};

const emptySource: SourceForm = {
  method_id: "traffic",
  platform: "小红书",
  author: "",
  original_title: "",
  original_url: "",
  published_at: "",
  heat_snapshot: "",
  migration_note: "",
  verified_by_operator: false,
};

const emptyReview = () => Object.fromEntries([
  ["note_url", ""],
  ["note_status", "normal"],
  ["promoted", false],
  ...numericReviewFields.map(([key]) => [key, ""]),
]) as Record<string, string | boolean>;

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  ready: "待人工发布",
  published: "已发布",
  reviewed: "已复盘",
};

async function requestJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "操作失败");
  return data as T;
}

const lines = (value: string) => value.split(/[\n，,]/).map((item) => item.trim()).filter(Boolean);

function asLocalDateTime(value = new Date().toISOString()) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function accountForm(account: GrowthAccount): AccountForm {
  return {
    name: account.name,
    one_liner: account.one_liner || "",
    target_user: account.target_user,
    core_problem: account.core_problem,
    account_value: account.account_value,
    follow_reason: account.follow_reason || "",
    trust_source: account.trust_source,
    not_doing: account.not_doing,
    tone_style: account.tone_style || "",
    compliance_redline: account.compliance_redline || "",
    hypotheses: (account.hypotheses || []).join("\n"),
    filter_words: (account.filter_words || []).join("，"),
    avoid_expressions: (account.avoid_expressions || []).join("，"),
    private_domain: account.private_domain || "",
    persona_specific: account.persona_specific || {},
  };
}

function reviewForm(review?: GrowthReview): Record<string, string | boolean> {
  if (!review) return emptyReview();
  const form = emptyReview();
  form.note_url = review.metrics.note_url || "";
  form.note_status = review.metrics.note_status || "normal";
  form.promoted = review.metrics.promoted ?? false;
  for (const [key] of numericReviewFields) {
    form[key] = review.metrics[key] === undefined ? "" : String(review.metrics[key]);
  }
  return form;
}

function changedKeys(current: Record<string, string | boolean>, baseline: Record<string, string | boolean>) {
  return Object.keys(current).filter((key) => current[key] !== baseline[key]);
}

function sourceAge(source: TopicSourceSnapshot) {
  if (source.freshness === "within_72h") return "72小时内";
  if (source.freshness === "day_4_to_7") return "4—7天";
  return "历史框架库";
}

function sourceCanGenerate(source?: TopicSourceSnapshot) {
  if (!source || source.freshness === "historical" || source.link_status === "invalid") return false;
  return source.link_status === "accessible" || Boolean(source.verified_by_operator);
}

function latestSourceForMethod(sources: TopicSourceSnapshot[], methodId: TitleMethodId) {
  return [...sources]
    .filter((item) => item.method_id === methodId)
    .sort((a, b) => b.collected_at.localeCompare(a.collected_at))[0];
}

export default function GrowthPage() {
  const [businessLine, setBusinessLine] = useState<GrowthBusinessLine>("overseas_student");
  const [persona, setPersona] = useState<GrowthPersona>("buyer");
  const [data, setData] = useState<BootstrapData | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyAccount);
  const [source, setSource] = useState<SourceForm>(emptySource);
  const [sourceEditorMethod, setSourceEditorMethod] = useState<TitleMethodId | null>(null);
  const [variants, setVariants] = useState<ContentDraft[]>([]);
  const [activeTopic, setActiveTopic] = useState<{ run: GrowthRun; topic: TopicCandidate } | null>(null);
  const [chosen, setChosen] = useState<ContentDraft | null>(null);
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>({});
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const [exploreOpen, setExploreOpen] = useState<Record<TitleMethodGroup, boolean>>({ native: false, benchmark: false });
  const [busy, setBusy] = useState<string | null>("load");
  const [message, setMessage] = useState("");
  const [reviewDraft, setReviewDraft] = useState<ContentDraft | null>(null);
  const [reviewValues, setReviewValues] = useState<Record<string, string | boolean>>(emptyReview());
  const [reviewBaseline, setReviewBaseline] = useState<Record<string, string | boolean>>(emptyReview());
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaEditing, setPersonaEditing] = useState(false);
  const [businessEditOpen, setBusinessEditOpen] = useState(false);

  const load = useCallback(async (nextBusinessLine: GrowthBusinessLine, nextPersona: GrowthPersona) => {
    setBusy("load");
    setMessage("");
    try {
      const next = await requestJSON<BootstrapData>(
        `/api/growth/bootstrap?businessLine=${nextBusinessLine}&persona=${nextPersona}`,
      );
      setData(next);
      setForm(next.account ? accountForm(next.account) : { ...emptyAccount });
      setVariants([]);
      setActiveTopic(null);
      setChosen(next.currentDrafts.find((draft) => draft.status === "ready") || null);
      setTitleEdits({});
      setSavingTitleId(null);
      setExploreOpen({ native: false, benchmark: false });
      setSourceEditorMethod(null);
      setSource(emptySource);
      setReviewDraft(null);
      setReviewValues(emptyReview());
      setReviewBaseline(emptyReview());
      setPersonaOpen(false);
      setPersonaEditing(false);
      setBusinessEditOpen(false);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load(businessLine, persona);
  }, [businessLine, persona, load]);

  const businessDefinition = GROWTH_BUSINESS_DEFINITIONS[businessLine];
  const runs = useMemo(() => ({
    default: data?.runs.find((run) => run.generation_mode === "default"),
    explore: data?.runs.find((run) => run.generation_mode === "explore"),
  }), [data?.runs]);
  const defaultMethods = useMemo(
    () => methodsForPersona(persona, "default", data?.account?.method_overrides),
    [data?.account?.method_overrides, persona],
  );
  const exploreMethods = useMemo(
    () => methodsForPersona(persona, "explore", data?.account?.method_overrides),
    [data?.account?.method_overrides, persona],
  );
  const reviewDrafts = useMemo(
    () => (data?.currentDrafts || []).filter((draft) =>
      draft.schema_version !== "legacy_v1" && (draft.status === "published" || draft.status === "reviewed")),
    [data?.currentDrafts],
  );

  function switchBusiness(next: GrowthBusinessLine) {
    if (next === businessLine) return;
    setData(null);
    setBusinessLine(next);
  }

  function switchPersona(next: GrowthPersona) {
    if (next === persona) return;
    setData(null);
    setPersona(next);
  }

  async function createPersona() {
    setBusy("persona");
    setMessage("");
    try {
      const result = await requestJSON<{ account: GrowthAccount; plan: GrowthPlan }>("/api/growth/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          businessLine,
          persona,
          accountName: form.name || "面霸君",
          targetUser: form.target_user || undefined,
          coreProblem: form.core_problem || undefined,
          trustSource: form.trust_source || undefined,
          regenerateAccountId: data?.account?.id,
        }),
      });
      setData((current) => current ? { ...current, account: result.account, plan: result.plan || current.plan } : current);
      setForm(accountForm(result.account));
      setPersonaOpen(true);
      setMessage("人设已合并更新，视角专属字段、高级业务事实与历史字段均已保留。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function savePersona() {
    if (!data?.account) return;
    setBusy("save-persona");
    try {
      const result = await requestJSON<{ account: GrowthAccount }>("/api/growth/account", {
        method: "PUT",
        body: JSON.stringify({
          id: data.account.id,
          ...form,
          hypotheses: lines(form.hypotheses),
          filter_words: lines(form.filter_words),
          avoid_expressions: lines(form.avoid_expressions),
          persona_specific: form.persona_specific,
        }),
      });
      setData({ ...data, account: result.account });
      setPersonaEditing(false);
      setMessage("人设已保存。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openSourceEditor(methodId: TitleMethodId) {
    setSource({ ...emptySource, method_id: methodId });
    setSourceEditorMethod(methodId);
  }

  async function saveSource() {
    if (!data?.account) return;
    setBusy("source");
    try {
      const result = await requestJSON<{
        source: TopicSourceSnapshot;
        usable: boolean;
        validation: { message: string };
      }>("/api/growth/sources", {
        method: "POST",
        body: JSON.stringify({
          ...source,
          accountId: data.account.id,
          published_at: new Date(source.published_at).toISOString(),
        }),
      });
      await load(businessLine, persona);
      setMessage(`${result.validation.message}；${result.usable ? "已进入近期可用池" : "当前不参与标题生成"}。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refreshSource(sourceId: string, restricted: boolean) {
    if (!data?.account) return;
    const verified = restricted
      ? window.confirm("该站点限制自动检测。你是否已人工打开并核对作者、时间与内容？")
      : false;
    setBusy(`source-${sourceId}`);
    try {
      const result = await requestJSON<{
        source: TopicSourceSnapshot;
        usable: boolean;
        validation: { message: string };
      }>(`/api/growth/sources/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify({ accountId: data.account.id, verified_by_operator: verified }),
      });
      await load(businessLine, persona);
      setMessage(`${result.validation.message}；${result.usable ? "可参与生成" : "不参与生成"}。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateTopics(mode: MethodGenerationMode, group?: TitleMethodGroup) {
    if (!data?.account) return;
    setBusy(`topics-${mode}`);
    if (group) setExploreOpen((current) => ({ ...current, [group]: true }));
    try {
      const result = await requestJSON<{ run: GrowthRun; unavailableMethods: GrowthRun["unavailable_methods"] }>(
        "/api/growth/topics",
        { method: "POST", body: JSON.stringify({ accountId: data.account.id, generationMode: mode }) },
      );
      setData((current) => current ? {
        ...current,
        runs: [result.run, ...current.runs.filter((run) => run.id !== result.run.id)],
      } : current);
      setVariants([]);
      setActiveTopic(null);
      setChosen(null);
      setTitleEdits({});
      setMessage(`已生成${result.run.topic_pool.length}个标题；${result.unavailableMethods?.length || 0}个方法因来源不足暂停。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function changeTopicTitle(topic: TopicCandidate, title: string) {
    const limitedTitle = Array.from(title).slice(0, 20).join("");
    setTitleEdits((current) => ({ ...current, [topic.id]: limitedTitle }));
    if (activeTopic?.topic.id === topic.id) setActiveTopic(null);
    setVariants([]);
    setChosen(null);
  }

  async function persistTopicTitle(run: GrowthRun, topic: TopicCandidate, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) throw new Error("标题不能为空");
    if (nextTitle === topic.title) return { run, topic };
    const result = await requestJSON<{ run: GrowthRun; topic: TopicCandidate }>("/api/growth/topics", {
      method: "PATCH",
      body: JSON.stringify({ runId: run.id, topicId: topic.id, title: nextTitle }),
    });
    setData((current) => current ? {
      ...current,
      runs: current.runs.map((item) => item.id === result.run.id ? result.run : item),
    } : current);
    setTitleEdits((current) => {
      const next = { ...current };
      delete next[topic.id];
      return next;
    });
    return result;
  }

  async function saveTopicTitle(run: GrowthRun, topic: TopicCandidate, title: string) {
    if (!title.trim() || title.trim() === topic.title) return;
    setSavingTitleId(topic.id);
    try {
      await persistTopicTitle(run, topic, title);
      setMessage("标题修改已保存，生成正文时会使用新标题。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSavingTitleId(null);
    }
  }

  async function generateBodies(run: GrowthRun, topic: TopicCandidate) {
    setBusy(`body-${topic.id}`);
    setVariants([]);
    setChosen(null);
    try {
      const editedTitle = titleEdits[topic.id] ?? topic.title;
      const saved = await persistTopicTitle(run, topic, editedTitle);
      setActiveTopic(saved);
      const result = await requestJSON<{ drafts: ContentDraft[] }>("/api/growth/drafts/variants", {
        method: "POST",
        body: JSON.stringify({ runId: saved.run.id, topicId: saved.topic.id }),
      });
      setVariants(result.drafts);
      setMessage("短版和长版已生成，两版使用同一核心判断。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function chooseDraft(draft: ContentDraft) {
    setBusy(`choose-${draft.id}`);
    try {
      const result = await requestJSON<{ draft: ContentDraft }>("/api/growth/drafts/choose", {
        method: "POST",
        body: JSON.stringify({ draft }),
      });
      await load(businessLine, persona);
      setChosen(result.draft);
      setMessage("已选定最终正文；开放标签会在后台只依据这个版本生成。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function markPublished(draft: ContentDraft, publishedAt: string) {
    setBusy(`publish-${draft.id}`);
    try {
      await requestJSON(`/api/growth/drafts/${draft.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ published_at: new Date(publishedAt).toISOString() }),
      });
      await load(businessLine, persona);
      setMessage("已记录实际发布时间，这篇内容已进入单篇复盘；满24小时后可保存复盘数据。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openReview(draft: ContentDraft) {
    const values = reviewForm(data?.reviews[draft.id]);
    setReviewDraft(draft);
    setReviewValues(values);
    setReviewBaseline({ ...values });
  }

  async function extractScreenshot(files: FileList | null) {
    if (!files?.length) return;
    setBusy("extract");
    try {
      const images = await Promise.all([...files].slice(0, 6).map((file) =>
        new Promise<{ dataUrl: string; name: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ dataUrl: String(reader.result), name: file.name });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })));
      const result = await requestJSON<{ prefill: Record<string, number> }>("/api/growth/reviews/extract", {
        method: "POST",
        body: JSON.stringify({ images }),
      });
      setReviewValues((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(result.prefill).map(([key, value]) => [key, String(value)])),
      }));
      setMessage("截图中高置信度字段已预填，请人工核对后保存。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitReview() {
    if (!reviewDraft || !data) return;
    const existing = data.reviews[reviewDraft.id];
    const changed = changedKeys(reviewValues, reviewBaseline);
    const payload: Record<string, unknown> = {};
    const keys = existing ? changed : Object.keys(reviewValues);
    for (const key of keys) {
      const value = reviewValues[key];
      if (value === "") continue;
      payload[key] = numericReviewFields.some(([item]) => item === key) ? Number(value) : value;
    }
    if (!existing) payload.input_source = "manual";
    setBusy(`review-${reviewDraft.id}`);
    try {
      const result = await requestJSON<{ changedFields: string[] }>(
        `/api/growth/drafts/${reviewDraft.id}/review`,
        { method: existing ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setReviewDraft(null);
      await load(businessLine, persona);
      setMessage(`复盘已保存；本次更新：${result.changedFields.join("、") || "无指标变化"}。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runWeeklyReview() {
    if (!data?.account) return;
    setBusy("weekly");
    try {
      await requestJSON("/api/growth/weekly-review", {
        method: "POST",
        body: JSON.stringify({ accountId: data.account.id, snapshot: true }),
      });
      await load(businessLine, persona);
      setMessage("已保存固定周期快照；实时汇总不会覆盖上一周期。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (busy === "load" && !data) {
    return <main className="mx-auto max-w-6xl p-8 text-center text-slate-500">正在载入本地脱敏预览…</main>;
  }

  return (
    <main className="mianba-workspace min-h-screen bg-[#f7f6f3] text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {data?.preview.enabled && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-950">
            <b>{data.preview.banner}</b>
            <span>生产 Supabase 未连接 · Vercel 零写入</span>
          </div>
        )}

        <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.24em] text-slate-500">小红书内容工厂</div>
            <h1 className="serif mt-3 text-4xl leading-tight md:text-5xl">小红书笔记</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              业务定位 → 三家视角 → 人设 → 选题 → 正文 → 24小时单篇复盘 → 周复盘。人工确认后复制发布，系统不自动发帖。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm" href="/mianba">返回首页</a>
            <MianbaLogoutButton className="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm disabled:opacity-50" />
            <span className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">就绪</span>
          </div>
        </header>

        {message && (
          <div className="mb-6 rounded-2xl border border-[#ead7b5] bg-[#fffaf0] px-5 py-3 text-sm">{message}</div>
        )}

        {data && (
          <div className="space-y-6">
            <Section
              number="0"
              title="先选业务定位"
              subtitle="先决定服务哪条业务。切换后，人设、来源、标题、正文和复盘都会进入对应业务空间。"
            >
              <div className="grid gap-4 md:grid-cols-2">
                {GROWTH_BUSINESS_LINES.map((item) => {
                  const definition = GROWTH_BUSINESS_DEFINITIONS[item];
                  const active = item === businessLine;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => switchBusiness(item)}
                      className={`rounded-2xl border p-5 text-left transition ${active ? "border-[#d8a95b] bg-[#fffaf0] shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-lg font-semibold">{definition.label}</div>
                        {active && <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white">当前业务</span>}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">{definition.summary}</div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">服务：{definition.service}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-slate-500">当前业务母定位</div>
                    <h3 className="mt-2 text-xl font-semibold">{businessDefinition.label}</h3>
                    <p className="mt-2 text-sm text-slate-600">{businessDefinition.target}</p>
                  </div>
                  <SecondaryButton onClick={() => setBusinessEditOpen((open) => !open)}>调整业务定位</SecondaryButton>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <MotherFact label="你是什么（品类）" value={businessDefinition.category} />
                  <MotherFact label="有何不同" value={businessDefinition.difference} />
                  <MotherFact label="何以见得（信任来源）" value={businessDefinition.trust} />
                </div>
                {businessEditOpen && (
                  <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    本地预览沿用线上两条业务母定位。本轮可检查信息结构；正式编辑仍走现有业务定位保存接口，不写生产数据。
                  </div>
                )}
              </div>
            </Section>

            <Section
              number="1"
              title="选择商家 / 买家 / 专家视角"
              subtitle="同一业务下三种内容身份彼此隔离。切换视角会清空上一视角未保存的标题、正文和复盘表单。"
            >
              <div className="grid gap-3 md:grid-cols-3">
                {GROWTH_PERSONAS.map((item) => {
                  const view = businessDefinition.personas[item];
                  const active = persona === item;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => switchPersona(item)}
                      className={`rounded-2xl border p-4 text-left ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"}`}
                    >
                      <div className={`text-xs font-semibold ${active ? "text-amber-200" : "text-slate-500"}`}>
                        {GROWTH_PERSONA_LABELS[item]}
                      </div>
                      <div className="mt-1 font-semibold">{view.role}</div>
                      <div className={`mt-2 text-xs leading-5 ${active ? "text-slate-300" : "text-slate-500"}`}>{view.description}</div>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              number="2"
              title={`${businessDefinition.personas[persona].role}人设`}
              subtitle={`继承「${businessDefinition.label}」母定位；默认收起，只展示一句话人设。`}
            >
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">一句话人设</div>
                <div className="mt-2 text-lg font-semibold">{form.one_liner || "尚未生成"}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <SecondaryButton onClick={() => setPersonaOpen((open) => !open)}>
                    {personaOpen ? "收起人设" : "展开人设"}
                  </SecondaryButton>
                  <SecondaryButton onClick={() => { setPersonaOpen(true); setPersonaEditing(true); }}>编辑人设</SecondaryButton>
                  <PrimaryButton disabled={Boolean(busy)} onClick={createPersona}>系统生成人设</PrimaryButton>
                </div>
              </div>

              {personaOpen && data.account && (
                <div className="mt-5">
                  {personaEditing ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <TextInput label="人设名称" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
                      <TextInput label="一句话人设" value={form.one_liner} onChange={(value) => setForm({ ...form, one_liner: value })} />
                      <TextArea label="目标人群" value={form.target_user} onChange={(value) => setForm({ ...form, target_user: value })} />
                      <TextArea label="核心问题" value={form.core_problem} onChange={(value) => setForm({ ...form, core_problem: value })} />
                      <TextArea label="持续提供的价值" value={form.account_value} onChange={(value) => setForm({ ...form, account_value: value })} />
                      <TextArea label="信任来源" value={form.trust_source} onChange={(value) => setForm({ ...form, trust_source: value })} />
                      <TextArea label="不做什么" value={form.not_doing} onChange={(value) => setForm({ ...form, not_doing: value })} />
                      <TextArea label="合规红线" value={form.compliance_redline} onChange={(value) => setForm({ ...form, compliance_redline: value })} />
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <PersonFact label="目标人群" value={form.target_user} />
                      <PersonFact label="核心问题" value={form.core_problem} />
                      <PersonFact label="持续提供的价值" value={form.account_value} />
                      <PersonFact label="信任来源" value={form.trust_source} />
                    </div>
                  )}

                  <h3 className="mt-6 font-semibold">{GROWTH_PERSONA_LABELS[persona]}视角专属字段</h3>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {PERSONA_SPECIFIC_FIELDS[persona].map((field) => personaEditing ? (
                      <TextArea
                        key={field.key}
                        label={field.label}
                        value={form.persona_specific[field.key] || ""}
                        onChange={(value) => setForm({
                          ...form,
                          persona_specific: { ...form.persona_specific, [field.key]: value },
                        })}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <PersonFact key={field.key} label={field.label} value={form.persona_specific[field.key] || "未填写"} />
                    ))}
                  </div>

                  <details className="mt-5 rounded-2xl border border-slate-200">
                    <summary className="cursor-pointer p-4 font-medium">高级业务事实</summary>
                    <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                      {personaEditing ? (
                        <>
                          <TextArea label="业务假设（每行一条）" value={form.hypotheses} onChange={(value) => setForm({ ...form, hypotheses: value })} />
                          <TextArea label="过滤词" value={form.filter_words} onChange={(value) => setForm({ ...form, filter_words: value })} />
                          <TextArea label="禁用表达" value={form.avoid_expressions} onChange={(value) => setForm({ ...form, avoid_expressions: value })} />
                          <TextArea label="私域承接边界" value={form.private_domain} onChange={(value) => setForm({ ...form, private_domain: value })} />
                        </>
                      ) : (
                        <>
                          <PersonFact label="业务假设" value={form.hypotheses || "未填写"} />
                          <PersonFact label="过滤词" value={form.filter_words || "未填写"} />
                          <PersonFact label="禁用表达" value={form.avoid_expressions || "未填写"} />
                          <PersonFact label="私域承接边界" value={form.private_domain || "未填写"} />
                        </>
                      )}
                    </div>
                  </details>

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">
                    <b>只读历史方向</b>
                    <div className="mt-2 text-slate-600">{data.account.content_directions?.join(" / ") || "无历史值"}</div>
                  </div>

                  {personaEditing && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <PrimaryButton disabled={Boolean(busy)} onClick={savePersona}>保存人设</PrimaryButton>
                      <SecondaryButton onClick={() => { setForm(accountForm(data.account!)); setPersonaEditing(false); }}>取消编辑</SecondaryButton>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {data.account && (
              <>
                <Section
                  number="3"
                  title="选题"
                  subtitle="一个方法对应一个标题槽位。默认方法直接显示，探索方法在原生法或对标法内部折叠，禁用方法不出现。"
                >
                  <div className="flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold">当前视角：{businessDefinition.personas[persona].role}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        默认 {defaultMethods.length} 个槽位 · 探索 {exploreMethods.length} 个槽位 · 不做标题评分
                      </div>
                    </div>
                    <PrimaryButton disabled={Boolean(busy)} onClick={() => generateTopics("default")}>生成选题</PrimaryButton>
                  </div>

                  <div className="mt-6 space-y-6">
                    {(["native", "benchmark"] as TitleMethodGroup[]).map((group) => (
                      <MethodArea
                        key={group}
                        group={group}
                        defaultMethods={defaultMethods.filter((method) => method.group === group)}
                        exploreMethods={exploreMethods.filter((method) => method.group === group)}
                        defaultRun={runs.default}
                        exploreRun={runs.explore}
                        sources={data.account?.topic_sources || []}
                        busy={busy}
                        exploreOpen={exploreOpen[group]}
                        sourceEditorMethod={sourceEditorMethod}
                        source={source}
                        activeTopicId={activeTopic?.topic.id}
                        titleEdits={titleEdits}
                        savingTitleId={savingTitleId}
                        onExploreOpen={(open) => setExploreOpen((current) => ({ ...current, [group]: open }))}
                        onExplore={() => generateTopics("explore", group)}
                        onGenerateBody={generateBodies}
                        onTitleChange={changeTopicTitle}
                        onSaveTitle={saveTopicTitle}
                        onOpenSource={openSourceEditor}
                        onCloseSource={() => setSourceEditorMethod(null)}
                        onSourceChange={setSource}
                        onSaveSource={saveSource}
                        onRefreshSource={refreshSource}
                      />
                    ))}
                  </div>
                </Section>

                <Section
                  number="4"
                  title="正文"
                  subtitle={activeTopic ? `已选标题：${activeTopic.topic.title}；标题承诺：${activeTopic.topic.title_promise}` : "先在选题槽位中选择一个标题，再生成短版和长版正文。"}
                >
                  {variants.length > 0 ? (
                    <div className="grid gap-5 lg:grid-cols-2">
                      {variants.map((draft) => (
                        <DraftCard key={draft.id} draft={draft} busy={busy} onChoose={chooseDraft} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">短版和长版使用同一核心判断；正文不选择内容方向或正文阶段。</p>
                  )}

                  {chosen && (
                    <div className="mt-7 border-t border-slate-200 pt-6">
                      <h3 className="text-lg font-semibold">已选最终正文</h3>
                      <p className="mt-1 text-sm text-slate-500">发布前只做来源、身份、兑现、合规四项硬校验。</p>
                      <div className="mt-4">
                        <FinalDraft key={chosen.id} draft={chosen} busy={busy} onPublish={markPublished} />
                      </div>
                    </div>
                  )}
                </Section>

                <Section
                  number="5"
                  title="单篇复盘"
                  subtitle="只展示当前业务、当前视角的新流程已发布或已复盘内容。首次复盘与更新复盘使用同一入口。"
                >
                  {reviewDrafts.length ? (
                    <div className="space-y-3">
                      {reviewDrafts.map((draft) => (
                        <ReviewRow
                          key={draft.id}
                          draft={draft}
                          review={data.reviews[draft.id]}
                          onOpen={() => openReview(draft)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      暂无新流程已发布内容。请先在正文中填写实际发布时间并标记发布。
                    </div>
                  )}
                </Section>

                <Section
                  number="6"
                  title="周复盘"
                  subtitle="按当前视角 × 原生/对标方法 × 默认/探索复盘。北极星指标固定为有效咨询率。"
                >
                  <div className="flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold">v3.2 新有效样本：{data.learningSummary.newLearningSamples}/30</div>
                      <p className="mt-1 text-sm text-slate-600">30篇前只展示数据，不推荐最佳方法；旧版样本不进入新方法胜率。</p>
                    </div>
                    <PrimaryButton disabled={Boolean(busy)} onClick={runWeeklyReview}>保存固定周期快照</PrimaryButton>
                  </div>

                  {data.weeklyReview ? (
                    <WeeklyReview review={data.weeklyReview} />
                  ) : (
                    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      尚无本视角周复盘快照。保存后将按13种标题方法展示描述性数据。
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        )}
      </div>

      {reviewDraft && (
        <Modal title={`复盘：${reviewDraft.title}`} onClose={() => setReviewDraft(null)}>
          <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            已完整预填已有数据。本次变更：{changedKeys(reviewValues, reviewBaseline).join("、") || "尚未修改"}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="小红书原帖链接" value={String(reviewValues.note_url)} onChange={(value) => setReviewValues({ ...reviewValues, note_url: value })} />
            <Select
              label="分发状态"
              value={String(reviewValues.note_status)}
              onChange={(value) => setReviewValues({ ...reviewValues, note_status: value })}
              options={[
                { value: "normal", label: "正常" },
                { value: "limited", label: "限流" },
                { value: "violation", label: "违规" },
                { value: "deleted", label: "删除" },
              ]}
            />
            {numericReviewFields.map(([key, label]) => (
              <TextInput
                key={key}
                label={label}
                type="number"
                value={String(reviewValues[key])}
                onChange={(value) => setReviewValues({ ...reviewValues, [key]: value })}
              />
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(reviewValues.promoted)} onChange={(event) => setReviewValues({ ...reviewValues, promoted: event.target.checked })} />
            本篇有投流
          </label>
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4">
            <div className="text-sm font-medium">上传数据截图预填</div>
            <p className="mt-1 text-xs text-slate-500">只填高置信度字段，保存前仍需人工核对。</p>
            <input
              className="mt-3 block w-full text-sm"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={!data?.capabilities.reviewScreenshot || Boolean(busy)}
              onChange={(event) => extractScreenshot(event.target.files)}
            />
            {!data?.capabilities.reviewScreenshot && (
              <p className="mt-2 text-xs text-amber-700">当前本地模型未配置视觉能力，上传入口保留但暂不可识别。</p>
            )}
          </div>
          <div className="mt-5">
            <PrimaryButton
              disabled={Boolean(busy) || !reviewValues.note_url || (Boolean(data?.reviews[reviewDraft.id]) && changedKeys(reviewValues, reviewBaseline).length === 0)}
              onClick={submitReview}
            >
              {data?.reviews[reviewDraft.id] ? "只保存变更字段" : "保存首次复盘"}
            </PrimaryButton>
          </div>
        </Modal>
      )}
    </main>
  );
}

function MethodArea({
  group,
  defaultMethods,
  exploreMethods,
  defaultRun,
  exploreRun,
  sources,
  busy,
  exploreOpen,
  sourceEditorMethod,
  source,
  activeTopicId,
  titleEdits,
  savingTitleId,
  onExploreOpen,
  onExplore,
  onGenerateBody,
  onTitleChange,
  onSaveTitle,
  onOpenSource,
  onCloseSource,
  onSourceChange,
  onSaveSource,
  onRefreshSource,
}: {
  group: TitleMethodGroup;
  defaultMethods: TitleMethodDefinition[];
  exploreMethods: TitleMethodDefinition[];
  defaultRun?: GrowthRun;
  exploreRun?: GrowthRun;
  sources: TopicSourceSnapshot[];
  busy: string | null;
  exploreOpen: boolean;
  sourceEditorMethod: TitleMethodId | null;
  source: SourceForm;
  activeTopicId?: string;
  titleEdits: Record<string, string>;
  savingTitleId: string | null;
  onExploreOpen: (open: boolean) => void;
  onExplore: () => void;
  onGenerateBody: (run: GrowthRun, topic: TopicCandidate) => void;
  onTitleChange: (topic: TopicCandidate, title: string) => void;
  onSaveTitle: (run: GrowthRun, topic: TopicCandidate, title: string) => void;
  onOpenSource: (methodId: TitleMethodId) => void;
  onCloseSource: () => void;
  onSourceChange: (source: SourceForm) => void;
  onSaveSource: () => void;
  onRefreshSource: (sourceId: string, restricted: boolean) => void;
}) {
  const isNative = group === "native";
  return (
    <div data-method-group={group} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{isNative ? "原生法" : "对标法"}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {isNative ? "从业务、人群和内部洞察出发；蹭流量必须绑定近期热点。" : "先找到7天内真实母题，再迁移标题逻辑。"}
          </p>
        </div>
        <Badge>默认 {defaultMethods.length} · 探索 {exploreMethods.length}</Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {defaultMethods.map((method) => (
          <MethodSlot
            key={method.id}
            method={method}
            mode="default"
            run={defaultRun}
            source={latestSourceForMethod(sources, method.id)}
            busy={busy}
            sourceEditorOpen={sourceEditorMethod === method.id}
            sourceForm={source}
            activeTopicId={activeTopicId}
            editedTitle={topicTitle(defaultRun, method.id, titleEdits)}
            savingTitle={savingTitleId === defaultRun?.topic_pool.find((item) => item.method_id === method.id)?.id}
            onGenerateBody={onGenerateBody}
            onTitleChange={onTitleChange}
            onSaveTitle={onSaveTitle}
            onOpenSource={onOpenSource}
            onCloseSource={onCloseSource}
            onSourceChange={onSourceChange}
            onSaveSource={onSaveSource}
            onRefreshSource={onRefreshSource}
          />
        ))}
      </div>

      {exploreMethods.length > 0 && (
        <details
          className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/50"
          open={exploreOpen}
          onToggle={(event) => onExploreOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-4 font-semibold">探索方法（{exploreMethods.length}个，默认收起）</summary>
          <div className="border-t border-amber-100 px-4 pb-4 pt-4">
            <SecondaryButton disabled={Boolean(busy)} onClick={onExplore}>探索生成{isNative ? "原生法" : "对标法"}</SecondaryButton>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {exploreMethods.map((method) => (
                <MethodSlot
                  key={method.id}
                  method={method}
                  mode="explore"
                  run={exploreRun}
                  source={latestSourceForMethod(sources, method.id)}
                  busy={busy}
                  sourceEditorOpen={sourceEditorMethod === method.id}
                  sourceForm={source}
                  activeTopicId={activeTopicId}
                  editedTitle={topicTitle(exploreRun, method.id, titleEdits)}
                  savingTitle={savingTitleId === exploreRun?.topic_pool.find((item) => item.method_id === method.id)?.id}
                  onGenerateBody={onGenerateBody}
                  onTitleChange={onTitleChange}
                  onSaveTitle={onSaveTitle}
                  onOpenSource={onOpenSource}
                  onCloseSource={onCloseSource}
                  onSourceChange={onSourceChange}
                  onSaveSource={onSaveSource}
                  onRefreshSource={onRefreshSource}
                />
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function MethodSlot({
  method,
  mode,
  run,
  source,
  busy,
  sourceEditorOpen,
  sourceForm,
  activeTopicId,
  editedTitle,
  savingTitle,
  onGenerateBody,
  onTitleChange,
  onSaveTitle,
  onOpenSource,
  onCloseSource,
  onSourceChange,
  onSaveSource,
  onRefreshSource,
}: {
  method: TitleMethodDefinition;
  mode: MethodGenerationMode;
  run?: GrowthRun;
  source?: TopicSourceSnapshot;
  busy: string | null;
  sourceEditorOpen: boolean;
  sourceForm: SourceForm;
  activeTopicId?: string;
  editedTitle?: string;
  savingTitle: boolean;
  onGenerateBody: (run: GrowthRun, topic: TopicCandidate) => void;
  onTitleChange: (topic: TopicCandidate, title: string) => void;
  onSaveTitle: (run: GrowthRun, topic: TopicCandidate, title: string) => void;
  onOpenSource: (methodId: TitleMethodId) => void;
  onCloseSource: () => void;
  onSourceChange: (source: SourceForm) => void;
  onSaveSource: () => void;
  onRefreshSource: (sourceId: string, restricted: boolean) => void;
}) {
  const topic = run?.topic_pool.find((item) => item.method_id === method.id);
  const unavailable = run?.unavailable_methods?.find((item) => item.method_id === method.id);
  const usableSource = sourceCanGenerate(source);
  const active = topic?.id === activeTopicId;
  const currentTitle = topic ? editedTitle ?? topic.title : "";

  return (
    <div data-method-slot={`${method.id}-${mode}`} className={`rounded-2xl border p-4 ${active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">{method.order}. {method.label}</div>
        <Badge>{mode === "default" ? "默认" : "探索方法"}</Badge>
      </div>

      {method.sourceRequired && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          {source ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-xs font-medium text-slate-700">{source.author}｜{source.original_title}</div>
                <SourceStatus status={source.link_status} verified={source.verified_by_operator} />
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                {source.platform} · {new Date(source.published_at).toLocaleDateString("zh-CN")} · {sourceAge(source)} · {source.heat_snapshot}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <a className="text-[#9a6b24] underline" href={source.original_url} target="_blank" rel="noreferrer">原链接</a>
                <button className="text-slate-700 underline" onClick={() => onRefreshSource(source.id, source.link_status === "restricted")}>
                  {busy === `source-${source.id}` ? "检测中…" : "刷新校验"}
                </button>
                <button className="text-slate-700 underline" onClick={() => onOpenSource(method.id)}>补充近期来源</button>
              </div>
              {!usableSource && <div className="mt-2 text-xs text-amber-700">该来源当前不能生成标题，请补充7天内可用来源。</div>}
            </>
          ) : (
            <button className="text-sm font-medium text-[#9a6b24] underline" onClick={() => onOpenSource(method.id)}>补充近期来源</button>
          )}
        </div>
      )}

      {sourceEditorOpen && (
        <SourceEditor
          method={method}
          value={sourceForm}
          busy={busy}
          onChange={onSourceChange}
          onSave={onSaveSource}
          onClose={onCloseSource}
        />
      )}

      <div className="mt-4">
        {topic && run ? (
          <>
            <label className="block">
              <span className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
                <span>标题（可编辑）</span>
                <span>{Array.from(currentTitle).length}/20{savingTitle ? " · 保存中…" : currentTitle !== topic.title ? " · 已修改" : ""}</span>
              </span>
              <textarea
                aria-label={`编辑${method.label}标题`}
                rows={2}
                value={currentTitle}
                onChange={(event) => onTitleChange(topic, event.target.value)}
                onBlur={() => onSaveTitle(run, topic, currentTitle)}
                className={`mt-2 w-full resize-none rounded-xl border bg-white px-3 py-2.5 text-base font-semibold leading-6 outline-none focus:border-amber-500 ${currentTitle.trim() ? "border-slate-200" : "border-red-400"}`}
              />
            </label>
            <p className="mt-2 text-sm leading-6 text-slate-600">正文承诺：{topic.title_promise}</p>
            <div className="mt-4">
              <PrimaryButton disabled={Boolean(busy) || !currentTitle.trim()} onClick={() => onGenerateBody(run, topic)}>用这个标题写正文</PrimaryButton>
            </div>
          </>
        ) : unavailable ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            暂停生成：{unavailable.reason || "缺少近期有效来源"}。系统不会虚构标题。
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-400">
            {method.sourceRequired && !usableSource ? "补充近期来源后再生成" : mode === "default" ? "等待生成默认选题" : "展开后点击探索生成"}
          </div>
        )}
      </div>
    </div>
  );
}

function topicTitle(run: GrowthRun | undefined, methodId: TitleMethodId, edits: Record<string, string>) {
  const topic = run?.topic_pool.find((item) => item.method_id === methodId);
  return topic ? edits[topic.id] ?? topic.title : undefined;
}

function SourceEditor({
  method,
  value,
  busy,
  onChange,
  onSave,
  onClose,
}: {
  method: TitleMethodDefinition;
  value: SourceForm;
  busy: string | null;
  onChange: (value: SourceForm) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const ready = value.original_url && value.original_title && value.published_at && value.heat_snapshot;
  return (
    <div className="mt-3 rounded-xl border border-[#ead7b5] bg-[#fffaf0] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <b className="text-sm">为“{method.label}”补充{method.id === "traffic" ? "热点" : "对标母题"}</b>
        <button className="text-sm text-slate-500" onClick={onClose}>关闭</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="平台" value={value.platform} onChange={(platform) => onChange({ ...value, platform })} />
        <TextInput label="原作者" value={value.author} onChange={(author) => onChange({ ...value, author })} />
        <TextInput label="原标题" value={value.original_title} onChange={(original_title) => onChange({ ...value, original_title })} />
        <TextInput label="原链接" value={value.original_url} onChange={(original_url) => onChange({ ...value, original_url })} />
        <TextInput label="发布时间" type="datetime-local" value={value.published_at} onChange={(published_at) => onChange({ ...value, published_at })} />
        <TextInput label="热度快照" value={value.heat_snapshot} onChange={(heat_snapshot) => onChange({ ...value, heat_snapshot })} />
      </div>
      <div className="mt-3">
        <TextArea label="迁移说明" value={value.migration_note} onChange={(migration_note) => onChange({ ...value, migration_note })} />
      </div>
      <div className="mt-3">
        <PrimaryButton disabled={Boolean(busy) || !ready} onClick={onSave}>检测链接并保存</PrimaryButton>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  busy,
  onChoose,
}: {
  draft: ContentDraft;
  busy: string | null;
  onChoose: (draft: ContentDraft) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <div className="flex gap-2">
        <Badge>{draft.selected_body_version === "long" ? "长版" : "短版"}</Badge>
        <Badge>同一核心判断</Badge>
      </div>
      <h3 className="mt-3 text-lg font-semibold">{draft.title}</h3>
      <pre className="mt-3 max-h-[430px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">{draft.body}</pre>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {draft.validation_checks.map((check) => <Check key={check.key} check={check} />)}
      </div>
      <div className="mt-4">
        <PrimaryButton disabled={Boolean(busy)} onClick={() => onChoose(draft)}>选定这个版本</PrimaryButton>
      </div>
    </div>
  );
}

function FinalDraft({
  draft,
  busy,
  onPublish,
}: {
  draft: ContentDraft;
  busy: string | null;
  onPublish: (draft: ContentDraft, publishedAt: string) => void;
}) {
  const [publishedAt, setPublishedAt] = useState(asLocalDateTime(draft.published_at));
  const packageText = `${draft.title}\n\n${draft.body}\n\n${draft.hashtags.join(" ")}`;
  const feedback = `标题：${draft.title}\n方法：${draft.method_label}\n承诺：${draft.title_promise}\n复盘重点：${draft.review_points.join("、")}`;
  const publishable = draft.validation_checks.length === 4 && draft.validation_checks.every((check) => check.status === "passed");
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <div className="flex flex-wrap gap-2">
        <Badge>{draft.method_group === "native" ? "原生法" : "对标法"}</Badge>
        <Badge>{draft.method_label}</Badge>
        <Badge>{draft.selected_body_version === "long" ? "长版" : "短版"}</Badge>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-2xl bg-slate-900 p-5 text-white">
          <div className="text-xs text-slate-300">封面句</div>
          <div className="mt-3 text-2xl font-semibold leading-tight">{draft.cover_text}</div>
          <div className="mt-5 text-xs leading-5 text-slate-300">{draft.cover_suggestion}</div>
        </div>
        <div>
          <h3 className="text-xl font-semibold">{draft.title}</h3>
          <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700">{draft.body}</pre>
          <div className="mt-3 text-sm text-[#9a6b24]">{draft.hashtags.join(" ")}</div>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {draft.validation_checks.map((check) => <Check key={check.key} check={check} />)}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <CopyButton text={draft.cover_text} label="复制封面" />
        <CopyButton text={feedback} label="复制反馈" />
        <CopyButton text={packageText} label="复制完整发布包" />
      </div>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-end">
        <TextInput label="实际发布时间" type="datetime-local" value={publishedAt} onChange={setPublishedAt} />
        <PrimaryButton
          disabled={Boolean(busy) || draft.status !== "ready" || !publishable || !publishedAt}
          onClick={() => onPublish(draft, publishedAt)}
        >
          标记实际发布
        </PrimaryButton>
      </div>
      {!publishable && <p className="mt-3 text-xs text-red-600">硬校验未全部通过，系统会阻止标记发布。</p>}
    </div>
  );
}

function ReviewRow({ draft, review, onOpen }: { draft: ContentDraft; review?: GrowthReview; onOpen: () => void }) {
  const publishedMs = Date.parse(draft.published_at || draft.distributed_at || draft.updated_at);
  const availableAt = Number.isFinite(publishedMs) ? publishedMs + 24 * 60 * 60 * 1000 : Number.NaN;
  const ready = draft.status === "reviewed" || Boolean(review) || (Number.isFinite(availableAt) && Date.now() >= availableAt);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge>{draft.method_group === "native" ? "原生法" : "对标法"}</Badge>
          <Badge>{draft.generation_mode === "default" ? "默认" : "探索"}</Badge>
          <Badge>{STATUS_LABEL[draft.status]}</Badge>
        </div>
        <div className="mt-2 font-semibold">{draft.title}</div>
        <div className="mt-1 text-xs text-slate-500">
          {draft.method_label} · 实际发布于 {new Date(draft.published_at || draft.distributed_at || draft.updated_at).toLocaleString("zh-CN")}
        </div>
      </div>
      <div>
        {ready ? (
          <SecondaryButton onClick={onOpen}>{review ? "更新复盘" : "首次复盘"}</SecondaryButton>
        ) : (
          <div className="text-right text-xs text-slate-500">
            等待24小时<br />{Number.isFinite(availableAt) ? new Date(availableAt).toLocaleString("zh-CN") : "发布时间缺失"}
          </div>
        )}
      </div>
    </div>
  );
}

function WeeklyReview({ review }: { review: WeeklyReviewResult }) {
  return (
    <div className="mt-5">
      <div className="rounded-2xl border border-slate-200 p-4 text-sm leading-7">
        <b>本周期结论：</b>{review.decision.summary}<br />
        <b>新有效样本：</b>{review.eligible_total || 0}/30<br />
        <b>规则：</b>{(review.eligible_total || 0) < 30 ? "只展示描述性数据，不推荐最佳方法。" : review.decision.scale_direction}
      </div>

      {(["native", "benchmark"] as TitleMethodGroup[]).map((group) => {
        const rows = review.by_method.filter((item) =>
          item.method_id !== "legacy" && TITLE_METHOD_BY_ID[item.method_id]?.group === group);
        return (
          <div key={group} className="mt-5">
            <h3 className="font-semibold">{group === "native" ? "原生法" : "对标法"}</h3>
            {rows.length ? (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[980px] w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-3">方法</th>
                      <th className="px-3 py-3">模式</th>
                      <th className="px-3 py-3">有效/复盘</th>
                      <th className="px-3 py-3">有效咨询率</th>
                      <th className="px-3 py-3">曝光</th>
                      <th className="px-3 py-3">阅读</th>
                      <th className="px-3 py-3">收藏</th>
                      <th className="px-3 py-3">分享</th>
                      <th className="px-3 py-3">主页访问</th>
                      <th className="px-3 py-3">成交</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => <WeeklyMethodRow key={`${item.method_id}-${item.generation_mode}`} item={item} />)}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-400">本周期暂无该类方法样本。</div>
            )}
          </div>
        );
      })}

      {review.promotion_suggestions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <b>探索晋升建议（需人工确认）</b>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {review.promotion_suggestions.map((item) => <li key={item.method_id}>{item.method_label}：{item.reason}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function WeeklyMethodRow({ item }: { item: MethodAggregate }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-3 font-medium">{item.method_label}</td>
      <td className="px-3 py-3">{item.generation_mode === "default" ? "默认" : "探索"}</td>
      <td className="px-3 py-3">{item.valid_count}/{item.reviewed_count}</td>
      <td className="px-3 py-3 font-semibold text-[#9a6b24]">{formatPercent(item.median_inquiry_rate)}</td>
      <td className="px-3 py-3">{formatNumber(item.median_impressions)}</td>
      <td className="px-3 py-3">{formatNumber(item.median_reads)}</td>
      <td className="px-3 py-3">{formatNumber(item.median_saves)}</td>
      <td className="px-3 py-3">{formatNumber(item.median_shares)}</td>
      <td className="px-3 py-3">{formatNumber(item.median_profile_visits)}</td>
      <td className="px-3 py-3">{formatNumber(item.median_sales)}</td>
    </tr>
  );
}

const formatPercent = (value?: number) => `${((value || 0) * 100).toFixed(2)}%`;
const formatNumber = (value?: number) => Math.round(value || 0).toLocaleString("zh-CN");

function Check({ check }: { check: ContentDraft["validation_checks"][number] }) {
  const label = ({ source: "来源", identity: "身份", fulfillment: "兑现", compliance: "合规" } as Record<string, string>)[check.key];
  return (
    <div className={`rounded-xl px-3 py-2 text-xs ${check.status === "passed" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
      <b>{label}</b> · {check.status === "passed" ? "通过" : "需修改"}
      <div className="mt-1 opacity-75">{check.message}</div>
    </div>
  );
}

function MotherFact({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-2 text-sm font-medium leading-6 text-slate-800">{value}</div></div>;
}

function PersonFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value || "未填写"}</div></div>;
}

function SourceStatus({ status, verified }: { status: "accessible" | "restricted" | "invalid"; verified?: boolean }) {
  const text = status === "accessible" ? "可访问" : status === "invalid" ? "已失效" : verified ? "受限·已人工复核" : "受限·待复核";
  const color = status === "accessible" ? "bg-emerald-50 text-emerald-700" : status === "invalid" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${color}`}>{text}</span>;
}

function Section({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section data-step={number} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{number}</span>
        <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p></div>
      </div>
      {children}
    </section>
  );
}

function TextInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block min-w-[180px] flex-1">
      <span className="mb-2 block text-xs font-medium text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500" />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-slate-500">{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block min-w-[180px]">
      <span className="mb-2 block text-xs font-medium text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function PrimaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{children}</button>;
}

function SecondaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-40">{children}</button>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{children}</span>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <SecondaryButton onClick={async () => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }}>
      {copied ? "已复制" : label}
    </SecondaryButton>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-2xl text-slate-400">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
