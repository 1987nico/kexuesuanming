"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MianbaLogoutButton from "@/app/mianba/MianbaLogoutButton";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthBusinessLine,
  GrowthBusinessPosition,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthReviewWindow,
  GrowthRun,
  MethodAggregate,
  MethodGenerationMode,
  ThreeDayReviewCycle,
  ThreeDayTrafficStatus,
  TitleMethodGroup,
  TitleMethodId,
  TopicCandidate,
  TopicSourceSnapshot,
  WeeklyReviewResult,
} from "@/lib/growth/types";
import { DEFAULT_BUSINESS_POSITIONS } from "@/lib/growth/businessPosition";
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
import { visibleBusinessText } from "@/lib/growth/businessCompatibility";
import {
  inquiryQualificationRate,
  perThousandImpressions,
  resolveReviewProgress,
  type ReviewTaskState,
} from "@/lib/growth/reviewCenter";

interface BootstrapData {
  businessLine: GrowthBusinessLine;
  businessPosition: GrowthBusinessPosition;
  businessPositions: Record<GrowthBusinessLine, GrowthBusinessPosition>;
  account: GrowthAccount | null;
  plan: GrowthPlan | null;
  runs: GrowthRun[];
  drafts: ContentDraft[];
  currentDrafts: ContentDraft[];
  historicalDrafts: ContentDraft[];
  reviews: Record<string, GrowthReview>;
  threeDayReviewCycles: ThreeDayReviewCycle[];
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

interface BackfillForm {
  title: string;
  title_promise: string;
  published_at: string;
  method_id: TitleMethodId;
}

interface ReviewExcelImport {
  fileName: string;
  detectedFields: string[];
  warnings: string[];
}

const contentReviewFields = [
  ["impressions", "曝光"], ["reads", "阅读"], ["average_view_seconds", "平均阅读秒数"], ["likes", "点赞"],
  ["saves", "收藏"], ["comments", "评论"], ["shares", "分享"], ["profile_visits", "主页访问"],
  ["follows", "关注"],
] as const;

const businessReviewFields = [
  ["private_messages", "主动私信"], ["qualified_inquiries", "有效咨询"],
  ["diagnosis_199_entries", "199诊断进入"], ["diagnosis_199_sales", "199诊断成交"],
  ["deep_6999_qualified", "6999适配"], ["deep_6999_sales", "6999成交"],
] as const;

const numericReviewFields = [...contentReviewFields, ...businessReviewFields] as const;

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
  ["note_status", ""],
  ["promoted", "unknown"],
  ...numericReviewFields.map(([key]) => [key, ""]),
]) as Record<string, string | boolean>;

const emptyBackfill = (): BackfillForm => ({
  title: "",
  title_promise: "",
  published_at: asLocalDateTime(),
  method_id: "human_pain",
});

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
  form.note_status = review.metrics.note_status || "";
  form.promoted = review.metrics.promoted === undefined ? "unknown" : review.metrics.promoted ? "paid" : "organic";
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

function sourceHeatSummary(source: TopicSourceSnapshot) {
  const items = source.heat_snapshot.split("·").map((item) => item.trim()).filter(Boolean);
  return items.slice(0, 2).join(" · ") || source.heat_snapshot;
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

const workspaceKey = (businessLine: GrowthBusinessLine, persona: GrowthPersona) =>
  `${businessLine}:${persona}`;

export default function GrowthPage() {
  const [businessLine, setBusinessLine] = useState<GrowthBusinessLine>("overseas_student");
  const [persona, setPersona] = useState<GrowthPersona>("buyer");
  const [data, setData] = useState<BootstrapData | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyAccount);
  const [source, setSource] = useState<SourceForm>(emptySource);
  const [sourceEditorMethod, setSourceEditorMethod] = useState<TitleMethodId | null>(null);
  const [variants, setVariants] = useState<ContentDraft[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<{ run: GrowthRun; topic: TopicCandidate } | null>(null);
  const [activeTopic, setActiveTopic] = useState<{ run: GrowthRun; topic: TopicCandidate } | null>(null);
  const [chosen, setChosen] = useState<ContentDraft | null>(null);
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>({});
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const [exploreOpen, setExploreOpen] = useState<Record<TitleMethodGroup, boolean>>({ native: false, benchmark: false });
  const [busy, setBusy] = useState<string | null>("load");
  const [message, setMessage] = useState("");
  const [topicMessage, setTopicMessage] = useState("");
  const [reviewDraft, setReviewDraft] = useState<ContentDraft | null>(null);
  const [reviewWindow, setReviewWindow] = useState<GrowthReviewWindow>("content_24h");
  const [reviewTab, setReviewTab] = useState<"tasks" | "single" | "strategy">("tasks");
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfill, setBackfill] = useState<BackfillForm>(emptyBackfill());
  const [reviewValues, setReviewValues] = useState<Record<string, string | boolean>>(emptyReview());
  const [reviewBaseline, setReviewBaseline] = useState<Record<string, string | boolean>>(emptyReview());
  const [reviewExcel, setReviewExcel] = useState<ReviewExcelImport | null>(null);
  const [reviewExcelError, setReviewExcelError] = useState("");
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaEditing, setPersonaEditing] = useState(false);
  const [businessEditOpen, setBusinessEditOpen] = useState(false);
  const [visibleStep, setVisibleStep] = useState("0");
  const [businessPositionForm, setBusinessPositionForm] = useState<GrowthBusinessPosition>(
    DEFAULT_BUSINESS_POSITIONS.overseas_student,
  );
  const workspaceCache = useRef(new Map<string, BootstrapData>());
  const workspaceRequests = useRef(new Map<string, Promise<BootstrapData>>());
  const activeWorkspace = useRef(workspaceKey("overseas_student", "buyer"));
  const prefetchStarted = useRef(false);

  const applyWorkspaceData = useCallback((next: BootstrapData | null) => {
    setData(next);
    setForm(next?.account ? accountForm(next.account) : { ...emptyAccount });
    setVariants([]);
    setSelectedTopic(null);
    setActiveTopic(null);
    setChosen(next?.currentDrafts?.find((draft) => draft.status === "ready") || null);
    setTitleEdits({});
    setSavingTitleId(null);
    setExploreOpen({ native: false, benchmark: false });
    setSourceEditorMethod(null);
    setSource(emptySource);
    setTopicMessage("");
    setReviewDraft(null);
    setReviewWindow("content_24h");
    setReviewTab("tasks");
    setBackfillOpen(false);
    setBackfill(emptyBackfill());
    setReviewValues(emptyReview());
    setReviewBaseline(emptyReview());
    setReviewExcel(null);
    setReviewExcelError("");
    setPersonaOpen(false);
    setPersonaEditing(false);
    setBusinessEditOpen(false);
    setVisibleStep("0");
    if (next?.businessPosition) setBusinessPositionForm(next.businessPosition);
  }, []);

  const fetchWorkspace = useCallback((nextBusinessLine: GrowthBusinessLine, nextPersona: GrowthPersona) => {
    const key = workspaceKey(nextBusinessLine, nextPersona);
    const existing = workspaceRequests.current.get(key);
    if (existing) return existing;
    const request = requestJSON<BootstrapData>(
      `/api/growth/bootstrap?businessLine=${nextBusinessLine}&persona=${nextPersona}`,
    ).finally(() => workspaceRequests.current.delete(key));
    workspaceRequests.current.set(key, request);
    return request;
  }, []);

  const load = useCallback(async (
    nextBusinessLine: GrowthBusinessLine,
    nextPersona: GrowthPersona,
    force = false,
  ) => {
    const key = workspaceKey(nextBusinessLine, nextPersona);
    activeWorkspace.current = key;
    const cached = workspaceCache.current.get(key);
    if (cached && !force) {
      applyWorkspaceData(cached);
      setBusy(null);
      return;
    }
    if (!cached) applyWorkspaceData(null);
    setBusy("load");
    setMessage("");
    try {
      const next = await fetchWorkspace(nextBusinessLine, nextPersona);
      workspaceCache.current.set(key, next);
      if (activeWorkspace.current === key) applyWorkspaceData(next);

      if (!prefetchStarted.current) {
        prefetchStarted.current = true;
        const remaining = GROWTH_BUSINESS_LINES.flatMap((line) =>
          GROWTH_PERSONAS.map((view) => ({ line, view })))
          .filter((item) => workspaceKey(item.line, item.view) !== key);
        void (async () => {
          for (const item of remaining) {
            const backgroundKey = workspaceKey(item.line, item.view);
            if (workspaceCache.current.has(backgroundKey)) continue;
            try {
              const background = await fetchWorkspace(item.line, item.view);
              workspaceCache.current.set(backgroundKey, background);
            } catch {
              // 后台预取失败不影响当前页面；切换时会自动重试。
            }
          }
        })();
      }
    } catch (error) {
      if (activeWorkspace.current === key) setMessage((error as Error).message);
    } finally {
      if (activeWorkspace.current === key) setBusy(null);
    }
  }, [applyWorkspaceData, fetchWorkspace]);

  useEffect(() => {
    void load(businessLine, persona);
  }, [businessLine, persona, load]);

  useEffect(() => {
    if (data) workspaceCache.current.set(workspaceKey(businessLine, persona), data);
  }, [businessLine, data, persona]);

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("section[data-step]")];
    if (!sections.length) return;
    let frame = 0;
    const updateVisibleStep = () => {
      frame = 0;
      // 页面数据加载后，上方长正文会发生少量布局位移；以视口上方260px作为阅读锚点，
      // 避免用户已经看到下一步骤标题时仍高亮上一项。
      const anchorY = Math.min(260, window.innerHeight * 0.4);
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= anchorY) current = section;
        else break;
      }
      if (current.dataset.step) setVisibleStep(current.dataset.step);
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateVisibleStep);
    };
    updateVisibleStep();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [businessLine, data?.account?.id, persona]);

  const businessDefinition = GROWTH_BUSINESS_DEFINITIONS[businessLine];
  const businessPosition = data?.businessPosition ?? DEFAULT_BUSINESS_POSITIONS[businessLine];
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
  const backfillMethods = useMemo(
    () => [...defaultMethods, ...exploreMethods].sort((a, b) => a.order - b.order),
    [defaultMethods, exploreMethods],
  );
  const reviewDrafts = useMemo(
    () => (data?.currentDrafts || []).filter((draft) =>
      draft.schema_version !== "legacy_v1" && (draft.status === "published" || draft.status === "reviewed")),
    [data?.currentDrafts],
  );
  const reviewItems = useMemo(() => reviewDrafts.map((draft) => {
    const review = data?.reviews[draft.id];
    return { draft, review, progress: resolveReviewProgress(draft, review) };
  }), [data?.reviews, reviewDrafts]);
  const reviewTaskCounts = useMemo(() => {
    const counts: Record<ReviewTaskState, number> = {
      waiting_content: 0,
      content_due: 0,
      waiting_business: 0,
      business_due: 0,
      complete: 0,
    };
    for (const item of reviewItems) counts[item.progress.state] += 1;
    return counts;
  }, [reviewItems]);
  const workflowSteps = [
    ["0", "业务定位"], ["1", "三家视角"], ["2", "人设"], ["3", "选题"],
    ["4", "正文"], ["5", "三日复盘"],
  ] as const;

  function switchBusiness(next: GrowthBusinessLine) {
    if (next === businessLine) return;
    const key = workspaceKey(next, persona);
    activeWorkspace.current = key;
    setBusinessPositionForm(
      workspaceCache.current.get(key)?.businessPosition ?? DEFAULT_BUSINESS_POSITIONS[next],
    );
    applyWorkspaceData(workspaceCache.current.get(key) ?? null);
    setBusinessLine(next);
  }

  function switchPersona(next: GrowthPersona) {
    if (next === persona) return;
    const key = workspaceKey(businessLine, next);
    activeWorkspace.current = key;
    applyWorkspaceData(workspaceCache.current.get(key) ?? null);
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

  async function saveBusinessPosition() {
    setBusy("business-position");
    setMessage("");
    try {
      const result = await requestJSON<{ position: GrowthBusinessPosition }>(
        "/api/growth/business-position",
        {
          method: "PUT",
          body: JSON.stringify(businessPositionForm),
        },
      );
      const position = result.position;
      for (const [key, cached] of workspaceCache.current.entries()) {
        if (!key.startsWith(`${businessLine}:`)) continue;
        workspaceCache.current.set(key, {
          ...cached,
          businessPosition: position,
          businessPositions: { ...cached.businessPositions, [businessLine]: position },
        });
      }
      setData((current) => current ? {
        ...current,
        businessPosition: position,
        businessPositions: { ...current.businessPositions, [businessLine]: position },
      } : current);
      setBusinessPositionForm(position);
      setBusinessEditOpen(false);
      setMessage("业务定位已保存。三种视角下次生成或重新生成人设时会共同继承，另一条业务不受影响。");
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
      await load(businessLine, persona, true);
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
      await load(businessLine, persona, true);
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
    setTopicMessage("正在调用小红书职业榜API获取近期笔记，并生成标题…");
    if (group) setExploreOpen((current) => ({ ...current, [group]: true }));
    try {
      const result = await requestJSON<{
        run: GrowthRun;
        unavailableMethods: GrowthRun["unavailable_methods"];
        topicSources: TopicSourceSnapshot[];
        sourceRefresh: {
          status: "cached" | "refreshed" | "unavailable" | "failed";
          message: string;
        };
      }>(
        "/api/growth/topics",
        { method: "POST", body: JSON.stringify({ accountId: data.account.id, generationMode: mode }) },
      );
      setData((current) => current ? {
        ...current,
        account: current.account ? { ...current.account, topic_sources: result.topicSources } : current.account,
        runs: [result.run, ...current.runs.filter((run) => run.id !== result.run.id)],
      } : current);
      setVariants([]);
      setSelectedTopic(null);
      setActiveTopic(null);
      setChosen(null);
      setTitleEdits({});
      setTopicMessage(`${result.sourceRefresh.message} 已生成${result.run.topic_pool.length}个标题；${result.unavailableMethods?.length || 0}个方法因来源不足暂停。`);
    } catch (error) {
      setTopicMessage((error as Error).message);
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

  function selectTopic(run: GrowthRun, topic: TopicCandidate) {
    setSelectedTopic({ run, topic });
    setActiveTopic(null);
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
      setSelectedTopic(saved);
      setActiveTopic(saved);
      const result = await requestJSON<{ drafts: ContentDraft[] }>("/api/growth/drafts/variants", {
        method: "POST",
        body: JSON.stringify({ runId: saved.run.id, topicId: saved.topic.id }),
      });
      setVariants(result.drafts);
      const passedCount = result.drafts.filter(draftReadyForOperator).length;
      setMessage(passedCount
        ? `正文生成与校验完成：${passedCount}个版本通过并已呈现。`
        : "两个版本均未通过生成门禁，正文未呈现；可重新生成。"
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function chooseDraft(draft: ContentDraft) {
    const previousVariants = variants;
    const previousChosen = chosen;
    setBusy(`choose-${draft.id}`);
    setVariants([draft]);
    setChosen(draft);
    setMessage("已选定这个版本；未选版本已收起，复制按钮已显示。");
    window.setTimeout(() => {
      document.getElementById("selected-final-draft")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    try {
      const result = await requestJSON<{ draft: ContentDraft }>("/api/growth/drafts/choose", {
        method: "POST",
        body: JSON.stringify({ draft }),
      });
      setVariants([result.draft]);
      setChosen(result.draft);
      setData((current) => current ? {
        ...current,
        currentDrafts: [
          result.draft,
          ...current.currentDrafts.filter((item) => item.id !== result.draft.id),
        ],
        runs: current.runs.map((item) => item.id === result.draft.run_id
          ? { ...item, status: "ready", draft: result.draft }
          : item),
      } : current);
      setMessage("已选定这个版本；现在可以复制标题和复制正文＋话题。");
    } catch (error) {
      setVariants(previousVariants);
      setChosen(previousChosen);
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
      await load(businessLine, persona, true);
      setMessage("已记录实际发布时间；这篇内容会进入下一轮三日复盘的官方Excel匹配范围。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openReview(draft: ContentDraft, window: GrowthReviewWindow) {
    const values = reviewForm(data?.reviews[draft.id]);
    setReviewDraft(draft);
    setReviewWindow(window);
    setReviewValues(values);
    setReviewBaseline({ ...values });
    setReviewExcel(null);
    setReviewExcelError("");
  }

  async function importReviewExcel(file: File | null) {
    if (!file) return;
    setReviewExcelError("");
    setBusy("excel-import");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/growth/reviews/import-excel", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => ({})) as {
        prefill?: Record<string, number | string>;
        detected_fields?: string[];
        warnings?: string[];
        file_name?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.message || result.error || "Excel解析失败");
      const prefill = result.prefill ?? {};
      setReviewValues((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(prefill)
          .filter(([, value]) => typeof value === "number")
          .map(([key, value]) => [key, String(value)])),
      }));
      setReviewExcel({
        fileName: result.file_name || file.name,
        detectedFields: result.detected_fields ?? [],
        warnings: result.warnings ?? [],
      });
      setReviewExcelError("");
      setMessage("单篇笔记Excel已读取，可直接保存24小时内容复盘。");
    } catch (error) {
      setReviewExcel(null);
      const errorMessage = (error as Error).message;
      setReviewExcelError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  }

  async function submitReview() {
    if (!reviewDraft || !data) return;
    const existing = data.reviews[reviewDraft.id];
    const changed = changedKeys(reviewValues, reviewBaseline);
    const payload: Record<string, unknown> = {};
    const windowKeys: string[] = reviewWindow === "content_24h"
      ? contentReviewFields.map(([key]) => key)
      : businessReviewFields.map(([key]) => key);
    const baseKeys = existing ? changed : Object.keys(reviewValues);
    const keys = Array.from(new Set(
      reviewWindow === "content_24h" && reviewExcel
        ? [...baseKeys, ...reviewExcel.detectedFields]
        : baseKeys,
    )).filter((key) => windowKeys.includes(key));
    for (const key of keys) {
      const value = reviewValues[key];
      if (value === "") continue;
      if (key === "promoted") {
        if (value === "unknown") continue;
        payload.promoted = value === "paid";
      } else {
        payload[key] = numericReviewFields.some(([item]) => item === key) ? Number(value) : value;
      }
    }
    payload.review_window = reviewWindow;
    if (reviewWindow === "content_24h") payload.input_source = "excel";
    else if (!existing) payload.input_source = "manual";
    setBusy(`review-${reviewDraft.id}`);
    try {
      const result = await requestJSON<{ changedFields: string[] }>(
        `/api/growth/drafts/${reviewDraft.id}/review-snapshots`,
        { method: existing ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setReviewDraft(null);
      await load(businessLine, persona, true);
      setMessage(`${reviewWindow === "content_24h" ? "24小时内容复盘" : reviewWindow === "business_7d" ? "7天商业结果" : "30天成交归因"}已保存；本次更新：${result.changedFields.join("、") || "无指标变化"}。`);
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
      await requestJSON("/api/growth/cycle-reviews", {
        method: "POST",
        body: JSON.stringify({ accountId: data.account.id, snapshot: true }),
      });
      await load(businessLine, persona, true);
      setReviewTab("strategy");
      setMessage("已保存固定周期快照；实时汇总不会覆盖上一周期。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function resolveCycleExperiment(experimentId: string, status: "confirmed" | "rejected") {
    if (!data?.account) return;
    setBusy(`experiment-${experimentId}`);
    try {
      await requestJSON(`/api/growth/cycle-experiments/${experimentId}`, {
        method: "PATCH",
        body: JSON.stringify({ accountId: data.account.id, status }),
      });
      await load(businessLine, persona, true);
      setReviewTab("strategy");
      setMessage(status === "confirmed" ? "下一周期实验卡已确认，将作为下一轮选题生成依据。" : "实验卡已拒绝，不会影响下一轮选题。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openBackfill() {
    const firstMethod = backfillMethods[0]?.id ?? "human_pain";
    setBackfill({ ...emptyBackfill(), method_id: firstMethod });
    setBackfillOpen(true);
  }

  async function submitBackfill() {
    if (!data?.account) return;
    const method = backfillMethods.find((item) => item.id === backfill.method_id);
    if (!method) return;
    const generationMode: MethodGenerationMode = defaultMethods.some((item) => item.id === method.id)
      ? "default"
      : "explore";
    setBusy("backfill");
    try {
      const result = await requestJSON<{ message: string }>("/api/growth/drafts/backfill", {
        method: "POST",
        body: JSON.stringify({
          accountId: data.account.id,
          title: backfill.title.trim(),
          titlePromise: backfill.title_promise.trim(),
          publishedAt: new Date(backfill.published_at).toISOString(),
          methodId: method.id,
          generationMode,
        }),
      });
      setBackfillOpen(false);
      await load(businessLine, persona, true);
      setReviewTab("tasks");
      setMessage(result.message);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(null);
    }
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
              业务定位 → 三家视角 → 人设 → 选题 → 正文 → 三日复盘。人工确认后复制发布，系统不自动发帖。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm" href="/mianba">返回首页</a>
            <MianbaLogoutButton className="rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm disabled:opacity-50" />
            <span className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">就绪</span>
          </div>
        </header>

        <nav
          aria-label="内容生产流程"
          className="sticky top-3 z-20 mb-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur"
        >
          <div className="flex min-w-max gap-1">
            {workflowSteps.map(([number, label]) => (
              <a
                key={number}
                href={`#growth-step-${number}`}
                onClick={() => setVisibleStep(number)}
                aria-current={visibleStep === number ? "step" : undefined}
                className={`flex min-h-10 items-center rounded-xl px-3 text-sm font-medium transition ${
                  visibleStep === number
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {number} {label}
              </a>
            ))}
          </div>
        </nav>

        {message && (
          <div className="mb-6 rounded-2xl border border-[#ead7b5] bg-[#fffaf0] px-5 py-3 text-sm">{message}</div>
        )}

        <div className="space-y-6">
            <Section
              number="0"
              title="先选业务定位"
              subtitle="先决定服务哪条业务。切换后，人设、来源、标题、正文和复盘都会进入对应业务空间。"
            >
              <div className="grid gap-4 md:grid-cols-2">
                {GROWTH_BUSINESS_LINES.map((item) => {
                  const definition = GROWTH_BUSINESS_DEFINITIONS[item];
                  const position = data?.businessPositions?.[item] ?? DEFAULT_BUSINESS_POSITIONS[item];
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
                      <div className="mt-2 text-sm text-slate-600">{position.service_category}</div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">服务：{position.main_offer}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-slate-500">当前业务母定位</div>
                    <h3 className="mt-2 text-xl font-semibold">{businessDefinition.label}</h3>
                    <p className="mt-2 text-sm text-slate-600">{businessPosition.target_user}</p>
                  </div>
                  <SecondaryButton onClick={() => {
                    setBusinessPositionForm(businessPosition);
                    setBusinessEditOpen((open) => !open);
                  }}>
                    {businessEditOpen ? "收起设置" : "调整业务定位"}
                  </SecondaryButton>
                </div>
                {!businessEditOpen && (
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <MotherFact label="你是什么（品类）" value={businessPosition.service_category} />
                    <MotherFact label="有何不同" value={businessPosition.differentiation} />
                    <MotherFact label="何以见得（信任来源）" value={businessPosition.trust_source} />
                  </div>
                )}
                {businessEditOpen && (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <TextInput
                        label="你是什么（品类）"
                        value={businessPositionForm.service_category}
                        onChange={(value) => setBusinessPositionForm({ ...businessPositionForm, service_category: value })}
                      />
                      <TextInput
                        label="主营服务"
                        value={businessPositionForm.main_offer}
                        onChange={(value) => setBusinessPositionForm({ ...businessPositionForm, main_offer: value })}
                      />
                      <TextArea
                        label="目标用户"
                        value={businessPositionForm.target_user}
                        onChange={(value) => setBusinessPositionForm({ ...businessPositionForm, target_user: value })}
                      />
                      <TextArea
                        label="核心问题"
                        value={businessPositionForm.core_problem}
                        onChange={(value) => setBusinessPositionForm({ ...businessPositionForm, core_problem: value })}
                      />
                      <TextArea
                        label="有何不同"
                        value={businessPositionForm.differentiation}
                        onChange={(value) => setBusinessPositionForm({ ...businessPositionForm, differentiation: value })}
                      />
                      <TextArea
                        label="何以见得（信任来源）"
                        value={businessPositionForm.trust_source}
                        onChange={(value) => setBusinessPositionForm({ ...businessPositionForm, trust_source: value })}
                      />
                      <div className="md:col-span-2">
                        <TextArea
                          label="合规红线"
                          value={businessPositionForm.compliance_redline}
                          onChange={(value) => setBusinessPositionForm({ ...businessPositionForm, compliance_redline: value })}
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <PrimaryButton disabled={Boolean(busy)} onClick={saveBusinessPosition}>
                        {busy === "business-position" ? "保存中…" : "保存业务定位"}
                      </PrimaryButton>
                      <SecondaryButton onClick={() => {
                        setBusinessPositionForm(businessPosition);
                        setBusinessEditOpen(false);
                      }}>
                        取消
                      </SecondaryButton>
                      <span className="text-xs leading-5 text-slate-500">
                        保存后作为三种视角的共同生成依据；已有内容不覆盖，另一条业务不受影响。
                      </span>
                    </div>
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
                        {GROWTH_PERSONA_LABELS[item]}{active ? " · 已选择" : ""}
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
                <div className="mt-2 min-h-7 text-lg font-semibold">{form.one_liner || (busy === "load" ? "—" : "尚未生成")}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <SecondaryButton onClick={() => setPersonaOpen((open) => !open)}>
                    {personaOpen ? "收起人设" : "展开人设"}
                  </SecondaryButton>
                  <SecondaryButton onClick={() => { setPersonaOpen(true); setPersonaEditing(true); }}>编辑人设</SecondaryButton>
                  <PrimaryButton disabled={Boolean(busy)} onClick={createPersona}>系统生成人设</PrimaryButton>
                </div>
              </div>

              {personaOpen && data?.account && (
                <div className="mt-5">
                  {personaEditing ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <TextInput label="人设名称" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
                      <TextInput label="一句话人设" value={form.one_liner} onChange={(value) => setForm({ ...form, one_liner: value })} />
                      <TextArea label="目标人群" value={visibleBusinessText(form.target_user, businessLine)} onChange={(value) => setForm({ ...form, target_user: value })} />
                      <TextArea label="核心问题" value={visibleBusinessText(form.core_problem, businessLine)} onChange={(value) => setForm({ ...form, core_problem: value })} />
                      <TextArea label="持续提供的价值" value={visibleBusinessText(form.account_value, businessLine)} onChange={(value) => setForm({ ...form, account_value: value })} />
                      <TextArea label="信任来源" value={visibleBusinessText(form.trust_source, businessLine)} onChange={(value) => setForm({ ...form, trust_source: value })} />
                      <TextArea label="不做什么" value={form.not_doing} onChange={(value) => setForm({ ...form, not_doing: value })} />
                      <TextArea label="合规红线" value={form.compliance_redline} onChange={(value) => setForm({ ...form, compliance_redline: value })} />
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <PersonFact label="目标人群" value={visibleBusinessText(form.target_user, businessLine)} />
                      <PersonFact label="核心问题" value={visibleBusinessText(form.core_problem, businessLine)} />
                      <PersonFact label="持续提供的价值" value={visibleBusinessText(form.account_value, businessLine)} />
                      <PersonFact label="信任来源" value={visibleBusinessText(form.trust_source, businessLine)} />
                    </div>
                  )}

                  <h3 className="mt-6 font-semibold">{GROWTH_PERSONA_LABELS[persona]}视角专属字段</h3>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {PERSONA_SPECIFIC_FIELDS[persona].map((field) => personaEditing ? (
                      <TextArea
                        key={field.key}
                        label={field.label}
                        value={visibleBusinessText(form.persona_specific[field.key], businessLine)}
                        onChange={(value) => setForm({
                          ...form,
                          persona_specific: { ...form.persona_specific, [field.key]: value },
                        })}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <PersonFact
                        key={field.key}
                        label={field.label}
                        value={visibleBusinessText(form.persona_specific[field.key], businessLine) || "未填写"}
                      />
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

                  {personaEditing && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <PrimaryButton disabled={Boolean(busy)} onClick={savePersona}>保存人设</PrimaryButton>
                      <SecondaryButton onClick={() => { setForm(accountForm(data.account!)); setPersonaEditing(false); }}>取消编辑</SecondaryButton>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {data?.account && (
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

                  {topicMessage && (
                    <div className="mt-4 rounded-2xl border border-[#ead7b5] bg-[#fffaf0] px-4 py-3 text-sm leading-6">
                      {topicMessage}
                    </div>
                  )}

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
                        activeTopicId={selectedTopic?.topic.id}
                        titleEdits={titleEdits}
                        savingTitleId={savingTitleId}
                        onExploreOpen={(open) => setExploreOpen((current) => ({ ...current, [group]: open }))}
                        onExplore={() => generateTopics("explore", group)}
                        onSelectTopic={selectTopic}
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

                  <div className="sticky bottom-3 z-10 mt-6 rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-lg backdrop-blur">
                    {selectedTopic ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#9a6b24]">已选择标题</div>
                          <div className="mt-1 truncate font-semibold">
                            {titleEdits[selectedTopic.topic.id] ?? selectedTopic.topic.title}
                          </div>
                        </div>
                        <PrimaryButton
                          disabled={Boolean(busy)}
                          onClick={() => generateBodies(selectedTopic.run, selectedTopic.topic)}
                        >
                          {busy === `body-${selectedTopic.topic.id}` ? "正在生成正文…" : "下一步：生成正文"}
                        </PrimaryButton>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">请先在上方选择一个标题，再进入正文。</div>
                    )}
                  </div>
                </Section>

                <Section
                  number="4"
                  title="正文"
                  subtitle={(activeTopic || selectedTopic)
                    ? `已选标题：${titleEdits[(activeTopic || selectedTopic)!.topic.id] ?? (activeTopic || selectedTopic)!.topic.title}；标题承诺：${(activeTopic || selectedTopic)!.topic.title_promise}`
                    : "先在选题槽位中选择一个标题；短版和长版只有通过三项校验后才会呈现。"}
                >
                  {variants.length > 0 ? (
                    <div className={`grid gap-5 ${chosen ? "grid-cols-1" : "lg:grid-cols-2"}`}>
                      {variants.map((draft) => (
                        <DraftCard
                          key={draft.id}
                          draft={draft}
                          busy={busy}
                          selected={chosen?.id === draft.id}
                          onChoose={chooseDraft}
                          onPublish={markPublished}
                          onRetry={() => {
                            const current = activeTopic || selectedTopic;
                            if (current) void generateBodies(current.run, current.topic);
                          }}
                        />
                      ))}
                    </div>
                  ) : chosen ? (
                    <DraftCard
                      draft={chosen}
                      busy={busy}
                      selected
                      onChoose={chooseDraft}
                      onPublish={markPublished}
                      onRetry={() => {
                        const current = activeTopic || selectedTopic;
                        if (current) void generateBodies(current.run, current.topic);
                      }}
                    />
                  ) : selectedTopic ? (
                    busy === `body-${selectedTopic.topic.id}` ? (
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-slate-600">
                        <div className="font-semibold text-slate-900">正在生成并校验正文</div>
                        <p className="mt-2 leading-6">短版和长版正在依次完成身份、兑现和转化植入检查；未通过的版本会自动修正，合格后才呈现。</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                        <div className="font-medium text-slate-800">标题已选定，等待生成正文</div>
                        <p className="mt-2 leading-6">短版和长版将使用同一核心判断；正文不选择内容方向或正文阶段。</p>
                        <a className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 font-medium text-slate-700" href="#growth-step-3">返回选题</a>
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                      <div className="font-medium text-slate-800">待选择标题</div>
                      <p className="mt-2">先从原生法或对标法中选择一个标题。</p>
                      <a className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 font-medium text-slate-700" href="#growth-step-3">返回选题</a>
                    </div>
                  )}

                </Section>

                <Section
                  number="5"
                  title="三日复盘"
                  subtitle="每72小时集中上传一次小红书官方笔记列表明细表；前台只做周期决策，后台继续保留单篇数据证据。"
                >
                  <ThreeDayReviewPanel
                    account={data.account}
                    cycles={data.threeDayReviewCycles}
                    busy={busy}
                    onBusy={setBusy}
                    onMessage={setMessage}
                    onRefresh={() => load(businessLine, persona, true)}
                  />
                </Section>
              </>
            )}
        </div>
      </div>

      {reviewDraft && (
        <Modal title={`${reviewWindow === "content_24h" ? "24小时内容复盘" : reviewWindow === "business_7d" ? "7天商业结果" : "30天成交归因"}：${reviewDraft.title}`} onClose={() => setReviewDraft(null)}>
          <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            {reviewWindow === "content_24h"
              ? "上传Excel后，系统会保存新的24小时数据快照；缺失字段保持未检查，不会按0计算。"
              : `这篇笔记的已有数据会保留。本次变更：${changedKeys(reviewValues, reviewBaseline).join("、") || "尚未修改"}。未检查与确认0会分别保存。`}
          </div>
          {reviewWindow === "content_24h" ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4">
              <div className="text-sm font-medium">上传单篇笔记Excel</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">上传小红书导出的单篇笔记.xlsx文件，系统会直接读取内容表现数据；缺失字段保持未检查，不会按0计算。</p>
              <input
                className="mt-3 block w-full text-sm"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={Boolean(busy)}
                onChange={(event) => {
                  void importReviewExcel(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
              {reviewExcelError && <p className="mt-3 text-xs leading-5 text-red-700">{reviewExcelError}</p>}
              {reviewExcel && (
                <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
                  <div className="font-semibold">已读取：{reviewExcel.fileName}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {reviewExcel.detectedFields.map((field) => {
                      const label = contentReviewFields.find(([key]) => key === field)?.[1] || field;
                      return <span key={field} className="rounded-full bg-white px-2.5 py-1">{label} {String(reviewValues[field] ?? "")}</span>;
                    })}
                  </div>
                  {reviewExcel.warnings.map((warning) => <p key={warning} className="mt-2 leading-5 text-amber-800">{warning}</p>)}
                </div>
              )}
              <p className="mt-3 text-xs leading-5 text-amber-800">
                Excel未提供原帖链接、分发或投流信息时，本篇仍可完成内容复盘，但不会进入标题方法胜率。
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#ead7b5] bg-[#fffaf0] p-4 text-sm leading-6">
                <b>有效咨询口径：</b>用户符合目标人群，并主动说出具体处境、候选路径或决策冲突，愿意继续站内沟通或接受适配判断。确认没有时请填写0，留空代表尚未检查。
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {businessReviewFields.map(([key, label]) => (
                  <TextInput
                    key={key}
                    label={key === "qualified_inquiries" ? `${label}（必须确认）` : label}
                    type="number"
                    value={String(reviewValues[key])}
                    onChange={(value) => setReviewValues({ ...reviewValues, [key]: value })}
                  />
                ))}
              </div>
            </>
          )}
          <div className="mt-5">
            <PrimaryButton
              disabled={Boolean(busy)
                || (reviewWindow === "content_24h" && (!reviewExcel || reviewValues.impressions === "" || reviewValues.reads === ""))
                || (reviewWindow === "business_7d" && reviewValues.qualified_inquiries === "")
                || (Boolean(data?.reviews[reviewDraft.id])
                  && changedKeys(reviewValues, reviewBaseline).length === 0
                  && !(reviewWindow === "content_24h" && reviewExcel))}
              onClick={submitReview}
            >
              {reviewWindow === "content_24h" ? "保存24小时内容复盘" : reviewWindow === "business_7d" ? "确认7天商业结果" : "保存30天成交归因"}
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {backfillOpen && (
        <Modal title="补录已发布笔记" onClose={() => setBackfillOpen(false)}>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            只补录当前“{businessDefinition.label} · {GROWTH_PERSONA_LABELS[persona]}”空间。原帖正文不会被系统改写；后续数据仍按24小时内容结果和7天商业结果分开确认。
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextInput
              label="原帖标题（20字内）"
              value={backfill.title}
              onChange={(value) => setBackfill({ ...backfill, title: Array.from(value).slice(0, 20).join("") })}
            />
            <TextInput
              label="实际发布时间"
              type="datetime-local"
              value={backfill.published_at}
              onChange={(value) => setBackfill({ ...backfill, published_at: value })}
            />
            <Select
              label="人工确认标题方法"
              value={backfill.method_id}
              onChange={(value) => setBackfill({ ...backfill, method_id: value as TitleMethodId })}
              options={backfillMethods.map((method) => ({
                value: method.id,
                label: `${method.order}. ${method.label} · ${defaultMethods.some((item) => item.id === method.id) ? "默认" : "探索"}`,
              }))}
            />
          </div>
          <div className="mt-4">
            <TextArea
              label="标题承诺（用于后续判断正文是否兑现）"
              value={backfill.title_promise}
              onChange={(value) => setBackfill({ ...backfill, title_promise: value })}
              placeholder="例如：帮助正在转型的中高管自查离职前必须确认的3项变量"
            />
          </div>
          {TITLE_METHOD_BY_ID[backfill.method_id]?.group === "benchmark" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              对标法补录没有原始母题链接时，只进入历史统计，不进入方法胜率；不会反推或虚构来源。
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <PrimaryButton
              disabled={Boolean(busy) || !backfill.title.trim() || !backfill.title_promise.trim() || !backfill.published_at}
              onClick={submitBackfill}
            >
              保存并生成复盘待办
            </PrimaryButton>
            <SecondaryButton disabled={Boolean(busy)} onClick={() => setBackfillOpen(false)}>取消</SecondaryButton>
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
  onSelectTopic,
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
  onSelectTopic: (run: GrowthRun, topic: TopicCandidate) => void;
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
            onSelectTopic={onSelectTopic}
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
                  onSelectTopic={onSelectTopic}
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
  onSelectTopic,
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
  onSelectTopic: (run: GrowthRun, topic: TopicCandidate) => void;
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
                <div className="min-w-0 text-sm font-medium leading-6 text-slate-700">{source.author}｜{source.original_title}</div>
                <SourceStatus status={source.link_status} verified={source.verified_by_operator} />
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                {new Date(source.published_at).toLocaleDateString("zh-CN")} · {sourceAge(source)} · {sourceHeatSummary(source)}
              </div>
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer py-1 font-medium text-slate-600">查看完整来源数据</summary>
                <div className="mt-1 leading-5">
                  {source.source_provider === "redfox_daily"
                    ? `真实热榜API · ${source.rank_date || "当日"}榜${source.rank_position ? `第${source.rank_position}` : ""}`
                    : source.platform}
                  {" · "}{source.heat_snapshot}
                </div>
              </details>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <a className="inline-flex min-h-11 items-center rounded-xl border border-[#ead7b5] bg-white px-3 font-medium text-[#9a6b24]" href={source.original_url} target="_blank" rel="noreferrer">打开原链接</a>
                <button className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-medium text-slate-700" onClick={() => onRefreshSource(source.id, source.link_status === "restricted")}>
                  {busy === `source-${source.id}` ? "检测中…" : "刷新校验"}
                </button>
                <button className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-medium text-slate-700" onClick={() => onOpenSource(method.id)}>补充来源</button>
              </div>
              {!usableSource && <div className="mt-2 text-xs text-amber-700">该来源当前不能生成标题，请补充7天内可用来源。</div>}
            </>
          ) : (
            <button className="min-h-11 rounded-xl border border-[#ead7b5] bg-white px-3 text-sm font-medium text-[#9a6b24]" onClick={() => onOpenSource(method.id)}>补充近期来源</button>
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
                <span>{Array.from(currentTitle).length}字 / 建议不超过20字{savingTitle ? " · 保存中…" : currentTitle !== topic.title ? " · 已修改" : ""}</span>
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
              {active ? (
                <div className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">已选择</div>
              ) : (
                <SecondaryButton disabled={Boolean(busy) || !currentTitle.trim()} onClick={() => onSelectTopic(run, topic)}>选择此标题</SecondaryButton>
              )}
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

const BODY_VALIDATION_KEYS = ["identity", "fulfillment", "conversion"] as const;

const BODY_VALIDATION_META = {
  identity: { label: "身份", active: "border-sky-300 bg-sky-50 text-sky-800", mark: "bg-sky-100 decoration-sky-500" },
  fulfillment: { label: "兑现", active: "border-emerald-300 bg-emerald-50 text-emerald-800", mark: "bg-emerald-100 decoration-emerald-500" },
  conversion: { label: "转化植入", active: "border-amber-300 bg-amber-50 text-amber-800", mark: "bg-amber-100 decoration-amber-500" },
} as const;

function draftReadyForOperator(draft: ContentDraft) {
  return draft.validation_report?.status === "passed"
    && BODY_VALIDATION_KEYS.every((key) =>
      draft.validation_checks.some((check) => check.key === key && check.status === "passed")
      && draft.validation_report?.annotations.some((item) => item.key === key));
}

function annotationSegments(draft: ContentDraft) {
  const annotations = (draft.validation_report?.annotations ?? []).filter((item) =>
    item.start >= 0
    && item.end > item.start
    && item.end <= draft.body.length
    && draft.body.slice(item.start, item.end) === item.quote);
  const boundaries = [...new Set([0, draft.body.length, ...annotations.flatMap((item) => [item.start, item.end])])]
    .sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    return {
      start,
      end,
      text: draft.body.slice(start, end),
      annotations: annotations.filter((item) => item.start <= start && item.end >= end),
    };
  }).filter((item) => item.text);
}

function OperatorAnnotatedBody({
  draft,
  maxHeightClass,
}: {
  draft: ContentDraft;
  maxHeightClass: string;
}) {
  const [visible, setVisible] = useState(true);
  const [activeKey, setActiveKey] = useState<(typeof BODY_VALIDATION_KEYS)[number] | null>(null);
  const segments = useMemo(() => annotationSegments(draft), [draft]);
  const annotations = draft.validation_report?.annotations ?? [];
  const activeAnnotation = activeKey ? annotations.find((item) => item.key === activeKey) : undefined;

  function focusEvidence(key: (typeof BODY_VALIDATION_KEYS)[number]) {
    setVisible(true);
    setActiveKey(key);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-validation-draft="${draft.id}"][data-validation-keys~="${key}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  return (
    <div className="mt-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-800">操作者校验层</div>
            <div className="mt-0.5 text-[11px] text-slate-500">标注只在系统内显示，不进入复制内容</div>
          </div>
          <button
            type="button"
            aria-pressed={visible}
            className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? "隐藏标注" : "显示标注"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BODY_VALIDATION_KEYS.map((key) => {
            const meta = BODY_VALIDATION_META[key];
            const count = annotations.filter((item) => item.key === key).length;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={activeKey === key}
                className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${activeKey === key ? meta.active : "border-slate-200 bg-white text-slate-700"}`}
                onClick={() => focusEvidence(key)}
              >
                {meta.label} · {count}处
              </button>
            );
          })}
        </div>
        {activeAnnotation && (
          <div className="mt-2 text-xs leading-5 text-slate-600">
            {BODY_VALIDATION_META[activeAnnotation.key].label}依据：{activeAnnotation.reason}
          </div>
        )}
      </div>
      <pre className={`mt-3 overflow-auto whitespace-pre-wrap font-sans text-sm leading-7 text-slate-700 ${maxHeightClass}`}>
        {visible ? segments.map((segment) => {
          const keys = [...new Set(segment.annotations.map((item) => item.key))];
          if (!keys.length) return <span key={`${segment.start}-${segment.end}`}>{segment.text}</span>;
          const primaryKey = activeKey && keys.includes(activeKey) ? activeKey : keys[0];
          const reasons = segment.annotations.map((item) => item.reason).join("；");
          return (
            <mark
              key={`${segment.start}-${segment.end}`}
              data-validation-draft={draft.id}
              data-validation-keys={keys.join(" ")}
              title={reasons}
              className={`rounded-sm text-inherit underline decoration-2 underline-offset-2 ${BODY_VALIDATION_META[primaryKey].mark} ${activeKey && !keys.includes(activeKey) ? "opacity-45" : ""}`}
            >
              {segment.text}
            </mark>
          );
        }) : draft.body}
      </pre>
    </div>
  );
}

function DraftCard({
  draft,
  busy,
  selected = false,
  onChoose,
  onPublish,
  onRetry,
}: {
  draft: ContentDraft;
  busy: string | null;
  selected?: boolean;
  onChoose: (draft: ContentDraft) => void;
  onPublish?: (draft: ContentDraft, publishedAt: string) => void;
  onRetry: () => void;
}) {
  const readyForOperator = draftReadyForOperator(draft);
  if (!readyForOperator) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{draft.selected_body_version === "long" ? "长版" : "短版"}</Badge>
          <Badge>校验未通过</Badge>
        </div>
        <h3 className="mt-4 text-lg font-semibold">正文暂不呈现</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          系统已自动修正{draft.validation_report?.attempts ?? 0}轮，仍有项目未通过。为避免操作者误选或误复制，正文内容已隐藏。
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {draft.validation_checks.map((check) => <Check key={check.key} check={check} />)}
        </div>
        <div className="mt-4">
          <PrimaryButton disabled={Boolean(busy)} onClick={onRetry}>重新生成两个版本</PrimaryButton>
        </div>
      </div>
    );
  }

  if (selected && onPublish) {
    return (
      <div id="selected-final-draft" className="scroll-mt-24">
        <FinalDraft draft={draft} busy={busy} onPublish={onPublish} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <div className="flex gap-2">
        <Badge>{draft.selected_body_version === "long" ? "长版" : "短版"}</Badge>
        <Badge>同一核心判断</Badge>
      </div>
      <h3 className="mt-3 text-lg font-semibold">{draft.title}</h3>
      <OperatorAnnotatedBody draft={draft} maxHeightClass="max-h-[430px]" />
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
  const hashtagsText = draft.hashtags.join(" ");
  const bodyWithHashtags = hashtagsText ? `${draft.body}\n\n${hashtagsText}` : draft.body;
  const packageText = `${draft.title}\n\n${bodyWithHashtags}`;
  const feedback = `标题：${draft.title}\n方法：${draft.method_label}\n承诺：${draft.title_promise}\n复盘重点：${draft.review_points.join("、")}`;
  const publishable = draftReadyForOperator(draft);
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
          <OperatorAnnotatedBody draft={draft} maxHeightClass="max-h-[520px]" />
          <div className="mt-3 text-sm text-[#9a6b24]">{draft.hashtags.join(" ")}</div>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-[#ead7b5] bg-[#fffaf1] p-4">
        <div className="font-semibold text-slate-900">最终正文已选定，复制到小红书</div>
        <p className="mt-1 text-xs leading-5 text-slate-600">复制只读取纯净标题、正文和话题；系统内的彩色校验标注不会进入剪贴板。</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <CopyButton
            text={draft.title}
            label="复制标题"
            copiedLabel="标题已复制"
            primary
          />
          <CopyButton
            text={bodyWithHashtags}
            label="复制正文＋话题"
            copiedLabel="正文已复制"
            primary
          />
        </div>
        <details className="mt-3 border-t border-[#ead7b5] pt-3 text-sm text-slate-600">
          <summary className="cursor-pointer py-1 font-medium">更多复制选项</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {hashtagsText && <CopyButton text={hashtagsText} label="单独复制话题" copiedLabel="话题已复制" />}
            <CopyButton text={draft.cover_text} label="复制封面句" copiedLabel="封面句已复制" />
            <CopyButton text={packageText} label="复制完整发布包" copiedLabel="发布包已复制" />
          </div>
        </details>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>内部复盘：</span>
        <CopyButton text={feedback} label="复制反馈" copiedLabel="反馈已复制" compact />
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

function reviewTaskPriority(state: ReviewTaskState) {
  return ({ content_due: 0, business_due: 1, waiting_content: 2, waiting_business: 3, complete: 4 } as Record<ReviewTaskState, number>)[state];
}

function ReviewTabButton({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-20 rounded-2xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300"}`}
    >
      <div className="font-semibold">{title}</div>
      <div className={`mt-1 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{detail}</div>
    </button>
  );
}

function ThreeDayReviewPanel({
  account,
  cycles,
  busy,
  onBusy,
  onMessage,
  onRefresh,
}: {
  account: GrowthAccount;
  cycles: ThreeDayReviewCycle[];
  busy: string | null;
  onBusy: (value: string | null) => void;
  onMessage: (value: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const active = [...cycles].reverse().find((cycle) => cycle.status === "draft");
  const completed = [...cycles]
    .filter((cycle) => cycle.status === "completed")
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
  const latest = completed[0];
  const dueAt = latest?.next_due_at || new Date().toISOString();
  const due = Date.now() >= Date.parse(dueAt);
  const [trafficConfirmed, setTrafficConfirmed] = useState(false);
  const [trafficExceptions, setTrafficExceptions] = useState<Record<string, ThreeDayTrafficStatus>>({});
  const [confirmedSuggested, setConfirmedSuggested] = useState<Record<string, boolean>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [qualifiedInquiries, setQualifiedInquiries] = useState("");
  const [diagnosis199Entries, setDiagnosis199Entries] = useState("");
  const [diagnosis199Sales, setDiagnosis199Sales] = useState("");
  const [deep6999Qualified, setDeep6999Qualified] = useState("");
  const [deep6999Sales, setDeep6999Sales] = useState("");
  const [attributions, setAttributions] = useState<Record<string, string>>({});

  useEffect(() => {
    setTrafficConfirmed(active?.traffic_confirmed ?? false);
    setTrafficExceptions({});
    setConfirmedSuggested({});
    setExcluded({});
    setQualifiedInquiries("");
    setDiagnosis199Entries("");
    setDiagnosis199Sales("");
    setDeep6999Qualified("");
    setDeep6999Sales("");
    setAttributions({});
  }, [active?.id, active?.traffic_confirmed]);

  async function importOfficialExcel(file: File | null) {
    if (!file) return;
    onBusy("three-day-import");
    try {
      const form = new FormData();
      form.append("accountId", account.id);
      form.append("file", file);
      const response = await fetch("/api/growth/review-cycles/import", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { message?: string; error?: string; counts?: Record<string, number> };
      if (!response.ok) throw new Error(result.message || result.error || "官方Excel导入失败");
      await onRefresh();
      onMessage(`官方Excel已导入：自动匹配${result.counts?.matched || 0}篇，建议确认${result.counts?.suggested || 0}篇，未匹配${result.counts?.unmatched || 0}篇。`);
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      onBusy(null);
    }
  }

  async function completeCycle() {
    if (!active || qualifiedInquiries === "") return;
    onBusy("three-day-complete");
    try {
      const payload = {
        accountId: account.id,
        trafficConfirmed,
        trafficExceptions,
        confirmedSuggested: Object.entries(confirmedSuggested).filter(([, value]) => value).map(([key]) => key),
        excludedSourceKeys: Object.entries(excluded).filter(([, value]) => value).map(([key]) => key),
        qualifiedInquiries: Number(qualifiedInquiries),
        attributions: Object.fromEntries(Object.entries(attributions)
          .filter(([, value]) => value !== "")
          .map(([key, value]) => [key, Number(value)])),
        diagnosis199Entries: diagnosis199Entries === "" ? undefined : Number(diagnosis199Entries),
        diagnosis199Sales: diagnosis199Sales === "" ? undefined : Number(diagnosis199Sales),
        deep6999Qualified: deep6999Qualified === "" ? undefined : Number(deep6999Qualified),
        deep6999Sales: deep6999Sales === "" ? undefined : Number(deep6999Sales),
      };
      await requestJSON(`/api/growth/review-cycles/${active.id}/complete`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await onRefresh();
      onMessage("本轮三日复盘已完成；下一轮将在72小时后开放。");
    } catch (error) {
      onMessage((error as Error).message);
    } finally {
      onBusy(null);
    }
  }

  const matchedCount = active?.notes.filter((note) => note.match_status === "matched").length ?? 0;
  const suggestedCount = active?.notes.filter((note) => note.match_status === "suggested").length ?? 0;
  const unmatchedCount = active?.notes.filter((note) => note.match_status === "unmatched").length ?? 0;
  const attributionTotal = Object.values(attributions).reduce((sum, value) => sum + (value === "" ? 0 : Number(value)), 0);
  const eligibleHistoryCount = new Set(completed
    .flatMap((cycle) => cycle.notes)
    .filter((note) => note.commercial_eligible)
    .map((note) => note.draft_id || note.source_key)).size;

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${due || active ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-[#9a6b24]">{active ? `第${active.cycle_number}轮 · 数据待确认` : due ? "本轮已到期" : "等待下一轮"}</div>
            <div className="mt-1 text-lg font-semibold">{active ? "完成这一次三日复盘" : due ? "上传官方笔记列表明细表" : `下次开放：${formatDateTime(dueAt)}`}</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">一次上传、一轮决策；不再逐篇填写24小时、7天或30天复盘。</p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 text-sm">
            <div className="text-xs text-slate-500">新机制商业有效样本</div>
            <div className="mt-1 text-xl font-semibold">{eligibleHistoryCount}/30</div>
          </div>
        </div>
      </div>

      {!active && due && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-5">
          <div className="font-semibold">1. 上传小红书官方Excel</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">只接受“笔记列表明细表.xlsx”，系统严格读取官方13列表头，不要求你补改Excel。</p>
          <input
            className="mt-4 block w-full text-sm"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={Boolean(busy)}
            onChange={(event) => {
              void importOfficialExcel(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </div>
      )}

      {active && (
        <>
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-semibold">1. 官方Excel已读取</div>
                <p className="mt-1 text-sm text-slate-600">{active.source_file_name} · {active.source_row_count}条 · 上传于{formatDateTime(active.imported_at)}</p>
              </div>
              <label className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium">
                重新上传
                <input
                  className="hidden"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => void importOfficialExcel(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ReviewCount label="自动匹配" value={matchedCount} />
              <ReviewCount label="建议确认" value={suggestedCount} emphasize={suggestedCount > 0} />
              <ReviewCount label="未匹配" value={unmatchedCount} emphasize={unmatchedCount > 0} />
            </div>
            <details className="mt-4 rounded-xl border border-slate-200">
              <summary className="cursor-pointer p-4 text-sm font-medium">查看全部{active.notes.length}条匹配结果</summary>
              <div className="max-h-96 space-y-2 overflow-y-auto px-4 pb-4">
                {active.notes.map((note) => (
                  <div key={note.source_key} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{note.source_title || "标题为空"}</div>
                        <div className="mt-1 text-xs text-slate-500">{note.content_format} · {formatDateTime(note.published_at)} · {note.match_reason}</div>
                      </div>
                      <Badge>{note.match_status === "matched" ? "已匹配" : note.match_status === "suggested" ? "待确认" : "未匹配"}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">曝光 {note.metrics.impressions.toLocaleString()} · 观看 {note.metrics.views.toLocaleString()} · 封面点击率 {formatPercent(note.metrics.cover_ctr)}</div>
                    {note.match_status === "suggested" && (
                      <label className="mt-3 flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={Boolean(confirmedSuggested[note.source_key])} onChange={(event) => setConfirmedSuggested({ ...confirmedSuggested, [note.source_key]: event.target.checked })} />
                        确认绑定这篇系统笔记
                      </label>
                    )}
                    {note.match_status !== "matched" && note.match_status !== "suggested" && (
                      <label className="mt-3 flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={Boolean(excluded[note.source_key])} onChange={(event) => setExcluded({ ...excluded, [note.source_key]: event.target.checked })} />
                        本轮排除，不进入方法学习
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="font-semibold">2. 批次流量确认</div>
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6">
              <input className="mt-1" type="checkbox" checked={trafficConfirmed} onChange={(event) => setTrafficConfirmed(event.target.checked)} />
              <span><b>本批次默认均为自然流量且正常分发。</b><br /><span className="text-slate-500">不确认也能完成描述性复盘，但所有笔记不会进入13种方法胜率。</span></span>
            </label>
            {trafficConfirmed && active.notes.some((note) => note.match_status === "matched") && (
              <details className="mt-3 rounded-xl border border-slate-200">
                <summary className="cursor-pointer p-4 text-sm font-medium">标记投流、限流或其他例外笔记</summary>
                <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
                  {active.notes.filter((note) => note.match_status === "matched").map((note) => (
                    <Select
                      key={note.source_key}
                      label={note.source_title || "未命名笔记"}
                      value={trafficExceptions[note.source_key] || "organic_normal"}
                      onChange={(value) => setTrafficExceptions({ ...trafficExceptions, [note.source_key]: value as ThreeDayTrafficStatus })}
                      options={[
                        { value: "organic_normal", label: "自然流量·正常分发" },
                        { value: "paid", label: "包含投流" },
                        { value: "limited", label: "限流" },
                        { value: "violation", label: "违规" },
                        { value: "deleted", label: "已删除" },
                        { value: "unknown", label: "无法确认" },
                      ]}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="font-semibold">3. 有效咨询与归因</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">填写过去72小时新增结果。确认没有时填0；暂时不知道来自哪篇，可以保留为未归因。</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextInput label="新增有效咨询（必填）" type="number" value={qualifiedInquiries} onChange={setQualifiedInquiries} />
              <TextInput label="199诊断进入" type="number" value={diagnosis199Entries} onChange={setDiagnosis199Entries} />
              <TextInput label="199诊断成交" type="number" value={diagnosis199Sales} onChange={setDiagnosis199Sales} />
              <TextInput label="6999服务适配" type="number" value={deep6999Qualified} onChange={setDeep6999Qualified} />
              <TextInput label="6999成交" type="number" value={deep6999Sales} onChange={setDeep6999Sales} />
            </div>
            {Number(qualifiedInquiries) > 0 && active.notes.some((note) => note.match_status === "matched") && (
              <details className="mt-4 rounded-xl border border-slate-200">
                <summary className="cursor-pointer p-4 text-sm font-medium">可选：把有效咨询归因到具体笔记</summary>
                <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
                  {active.notes.filter((note) => note.match_status === "matched").map((note) => (
                    <TextInput
                      key={note.source_key}
                      label={note.source_title || "未命名笔记"}
                      type="number"
                      value={attributions[note.source_key] || ""}
                      onChange={(value) => setAttributions({ ...attributions, [note.source_key]: value })}
                    />
                  ))}
                </div>
                <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">已归因 {attributionTotal} · 暂未归因 {Math.max(0, Number(qualifiedInquiries) - attributionTotal)}</div>
              </details>
            )}
            <div className="mt-5">
              <PrimaryButton disabled={Boolean(busy) || qualifiedInquiries === "" || attributionTotal > Number(qualifiedInquiries)} onClick={completeCycle}>
                {busy === "three-day-complete" ? "正在生成…" : "确认并生成本轮复盘"}
              </PrimaryButton>
            </div>
          </div>
        </>
      )}

      {latest?.decision && (
        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold text-[#9a6b24]">最近完成 · 第{latest.cycle_number}轮</div>
              <div className="mt-1 font-semibold">{latest.decision.summary}</div>
            </div>
            <div className="text-xs text-slate-500">完成于 {formatDateTime(latest.completed_at)}</div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <CycleDecisionCard title="本轮继续" items={latest.decision.keep.length ? latest.decision.keep : ["样本不足，暂不放大任何方法。"]} tone="green" />
            <CycleDecisionCard title="本轮复测或暂停" items={latest.decision.retest_or_pause} tone="amber" />
            <CycleDecisionCard title="下一周期唯一变量" items={[experimentVariableLabel(latest.decision.next_variable), latest.decision.next_variable_reason]} tone="slate" />
          </div>
          <details className="mt-4 rounded-xl border border-slate-200">
            <summary className="cursor-pointer p-4 text-sm font-medium">查看本轮单篇数据证据</summary>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="min-w-[760px] w-full text-left text-xs">
                <thead className="text-slate-500"><tr><th className="py-2">笔记</th><th>方法</th><th>曝光</th><th>观看</th><th>封面点击率</th><th>收藏率</th><th>分享率</th><th>学习状态</th></tr></thead>
                <tbody>
                  {latest.notes.map((note) => (
                    <tr key={note.source_key} className="border-t border-slate-100">
                      <td className="max-w-56 py-3 pr-3">{note.source_title || "标题为空"}</td>
                      <td>{note.method_label || "未确认"}</td>
                      <td>{note.metrics.impressions.toLocaleString()}</td>
                      <td>{note.metrics.views.toLocaleString()}</td>
                      <td>{formatPercent(note.metrics.cover_ctr)}</td>
                      <td>{formatOptionalPercent(note.derived.save_rate)}</td>
                      <td>{formatOptionalPercent(note.derived.share_rate)}</td>
                      <td>{note.commercial_eligible ? "商业有效" : note.content_eligible ? "内容有效" : note.eligibility_reasons.join("；") || "只展示"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {completed.length > 1 && (
        <details className="rounded-2xl border border-slate-200">
          <summary className="cursor-pointer p-5 font-semibold">历史三日复盘（{completed.length}轮）</summary>
          <div className="space-y-3 px-5 pb-5">
            {completed.map((cycle) => (
              <div key={cycle.id} className="rounded-xl bg-slate-50 p-4 text-sm">
                第{cycle.cycle_number}轮 · {formatDateTime(cycle.completed_at)} · {cycle.source_row_count}条平台数据 · 有效咨询 {cycle.qualified_inquiries ?? "未确认"}
              </div>
            ))}
          </div>
        </details>
      )}

      {!active && !due && !latest && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">当前没有可展示的三日复盘。</div>
      )}
    </div>
  );
}

function CycleDecisionCard({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" | "slate" }) {
  const className = tone === "green"
    ? "border-emerald-200 bg-emerald-50"
    : tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-slate-200 bg-slate-50";
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <div className="text-sm font-semibold">{title}</div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
        {items.map((item) => <li key={item}>· {item}</li>)}
      </ul>
    </div>
  );
}

function ReviewCount({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasize && value > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ReviewEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      暂无新流程已发布内容。请先在正文中填写实际发布时间并标记发布。
      <div><a className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 font-medium text-slate-700" href="#growth-step-4">返回正文与发布</a></div>
    </div>
  );
}

function ReviewTaskCard({
  draft,
  progress,
  onOpen,
}: {
  draft: ContentDraft;
  progress: ReturnType<typeof resolveReviewProgress>;
  onOpen: (window: GrowthReviewWindow) => void;
}) {
  const stateCopy: Record<ReviewTaskState, { title: string; detail: string }> = {
    waiting_content: { title: "等待24小时", detail: `可复盘时间：${formatDateTime(progress.content_available_at)}` },
    content_due: { title: "今日可做内容复盘", detail: "录入平台数据，诊断标题入口和正文兑现。" },
    waiting_business: { title: "等待7天商业结果", detail: `可确认时间：${formatDateTime(progress.business_available_at)}` },
    business_due: { title: "待补7天商业结果", detail: "确认有效咨询；没有时明确填写0，不能留空。" },
    complete: { title: "数据已完成", detail: "这篇内容已进入方法学习和周期策略证据池。" },
  };
  const copy = stateCopy[progress.state];
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge>{draft.method_group === "native" ? "原生法" : "对标法"}</Badge>
          <Badge>{draft.generation_mode === "default" ? "默认" : "探索"}</Badge>
          <Badge>{copy.title}</Badge>
        </div>
        <div className="mt-2 font-semibold">{draft.title}</div>
        <div className="mt-1 text-xs text-slate-500">{draft.method_label} · 发布于 {formatDateTime(progress.published_at)}</div>
        <div className="mt-2 text-xs text-slate-600">{copy.detail}</div>
      </div>
      <div className="shrink-0">
        {progress.state === "content_due" && <PrimaryButton onClick={() => onOpen("content_24h")}>开始24小时复盘</PrimaryButton>}
        {progress.state === "business_due" && <PrimaryButton onClick={() => onOpen("business_7d")}>补充7天结果</PrimaryButton>}
        {progress.state === "complete" && <span className="inline-flex min-h-11 items-center rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">已完成</span>}
        {(progress.state === "waiting_content" || progress.state === "waiting_business") && <span className="text-xs text-slate-400">尚未到期</span>}
      </div>
    </div>
  );
}

function SingleReviewCard({
  draft,
  review,
  progress,
  onOpen,
}: {
  draft: ContentDraft;
  review?: GrowthReview;
  progress: ReturnType<typeof resolveReviewProgress>;
  onOpen: (window: GrowthReviewWindow) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{draft.method_group === "native" ? "原生法" : "对标法"}</Badge>
            <Badge>{draft.method_label}</Badge>
            <Badge>{draft.generation_mode === "default" ? "默认" : "探索"}</Badge>
          </div>
          <h3 className="mt-3 font-semibold">{draft.title}</h3>
          <p className="mt-1 text-xs text-slate-500">发布于 {formatDateTime(progress.published_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {progress.content_complete
            ? <SecondaryButton onClick={() => onOpen("content_24h")}>更新24小时数据</SecondaryButton>
            : progress.state === "content_due" && <PrimaryButton onClick={() => onOpen("content_24h")}>开始复盘</PrimaryButton>}
          {progress.content_complete && (progress.state === "business_due" || progress.business_complete) && (
            <SecondaryButton onClick={() => onOpen("business_7d")}>{progress.business_complete ? "更新7天结果" : "补充7天结果"}</SecondaryButton>
          )}
          {progress.business_complete && progress.attribution_ready && (
            <SecondaryButton onClick={() => onOpen("attribution_30d")}>
              {progress.attribution_complete ? "更新30天归因" : "补充30天归因"}
            </SecondaryButton>
          )}
        </div>
      </div>
      {review ? <SingleReviewResult review={review} /> : (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">尚未形成单篇诊断。</div>
      )}
    </div>
  );
}

function SingleReviewResult({ review }: { review: GrowthReview }) {
  const metrics = review.metrics;
  const sampleText = ({
    valid: "有效样本",
    low_sample: "低样本",
    paid: "投流样本",
    limited: "限流样本",
    violation: "违规样本",
    deleted: "已删除",
    historical_unknown: "数据不完整",
    not_ready: "尚未到期",
  } as Record<string, string>)[review.sample?.status || "historical_unknown"];
  const commercialComplete = review.business_metrics_status && review.business_metrics_status !== "unknown";
  const qualificationRate = inquiryQualificationRate(metrics);
  const qualificationRateText = metrics.private_messages === undefined || metrics.qualified_inquiries === undefined
    ? "待7天确认"
    : metrics.private_messages === 0
      ? "无私信，无法计算"
      : formatOptionalPercent(qualificationRate);
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">{sampleText}</span>
        <span className="text-xs text-slate-500">{review.sample?.reasons?.join("；") || "数据条件完整"}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="阅读率" value={formatPercent(review.derived_metrics?.ctr)} />
        <MetricCard label="阅读→有效咨询率" value={commercialComplete ? formatPercent(review.derived_metrics?.inquiry_rate) : "待7天确认"} />
        <MetricCard label="每千曝光有效咨询" value={formatOptionalNumber(perThousandImpressions(metrics))} />
        <MetricCard label="私信→有效咨询率" value={qualificationRateText} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ReviewJudgement label="入口判断" value={review.entry_judgement} />
        <ReviewJudgement label="正文兑现" value={review.body_judgement || review.value_judgement} />
        <ReviewJudgement label="人群判断" value={review.audience_judgement} />
        <ReviewJudgement label="商业承接" value={review.conversion_judgement || review.follow_judgement} />
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <b>下一篇只改一个变量：</b>{review.next_variable}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}

function ReviewJudgement({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 p-3"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-2 text-sm leading-6 text-slate-700">{value}</div></div>;
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "时间缺失";
}

function formatOptionalNumber(value?: number) {
  return value === undefined ? "待确认" : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatOptionalPercent(value?: number) {
  return value === undefined ? "待确认" : `${(value * 100).toFixed(2)}%`;
}

function WeeklyReview({
  review,
  onResolveExperiment,
  busy,
}: {
  review: WeeklyReviewResult;
  onResolveExperiment: (experimentId: string, status: "confirmed" | "rejected") => void;
  busy: string | null;
}) {
  if (!Array.isArray(review.by_method) || !review.decision) return null;
  const promotionSuggestions = Array.isArray(review.promotion_suggestions)
    ? review.promotion_suggestions
    : [];
  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="发布内容" value={String(review.note_total || 0)} />
        <MetricCard label="28天已复盘" value={String(review.reviewed_total || 0)} />
        <MetricCard label="新有效样本" value={`${review.eligible_total || 0}/30`} />
      </div>
      <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm leading-7">
        <div><b>本周期结论：</b>{review.decision.summary}</div>
        <div><b>证据规则：</b>{(review.eligible_total || 0) < 30 ? "只展示描述性数据，不推荐最佳方法。" : review.decision.scale_direction}</div>
      </div>

      {(["native", "benchmark"] as TitleMethodGroup[]).map((group) => {
        const rows = review.by_method.filter((item) =>
          item.method_id !== "legacy" && TITLE_METHOD_BY_ID[item.method_id]?.group === group);
        return (
          <div key={group} className="mt-5">
            <h3 className="font-semibold">{group === "native" ? "原生法" : "对标法"}</h3>
            {rows.length ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {rows.map((item) => <WeeklyMethodCard key={`${item.method_id}-${item.generation_mode}`} item={item} />)}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-400">本周期暂无该类方法样本。</div>
            )}
          </div>
        );
      })}

      {promotionSuggestions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <b>探索晋升建议（需人工确认）</b>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {promotionSuggestions.map((item) => <li key={item.method_id}>{item.method_label}：{item.reason}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-[#ead7b5] bg-[#fffaf0] p-4 text-sm leading-7">
        <div><b>下一周期唯一假设：</b>{review.decision.strategic_hypothesis || "继续积累有效样本后再确定。"}</div>
        <div><b>下一步：</b>{review.decision.next_focus}</div>
        <p className="mt-2 text-xs text-slate-500">周期策略只提出继续、复测或暂缓建议；方法状态仍需运营人工确认。</p>
      </div>
      {review.experiment_card && (
        <div className="mt-5 rounded-2xl border border-slate-900 bg-slate-900 p-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-wider text-amber-200">下一周期实验卡</div>
              <h3 className="mt-2 text-lg font-semibold">{review.experiment_card.hypothesis}</h3>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
              {review.experiment_card.status === "pending" ? "待人工确认" : review.experiment_card.status === "confirmed" ? "已确认" : review.experiment_card.status === "rejected" ? "已拒绝" : "已应用"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-400">方法：</span>{review.experiment_card.method_label || "继续积累方法证据"}</div>
            <div><span className="text-slate-400">唯一变量：</span>{experimentVariableLabel(review.experiment_card.experiment_variable)}</div>
            <div><span className="text-slate-400">预期信号：</span>{review.experiment_card.expected_signal}</div>
            <div><span className="text-slate-400">停止条件：</span>{review.experiment_card.stop_condition}</div>
          </div>
          {review.experiment_card.status === "pending" && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => onResolveExperiment(review.experiment_card!.id, "confirmed")}
                className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
              >确认并带入下一轮选题</button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => onResolveExperiment(review.experiment_card!.id, "rejected")}
                className="min-h-11 rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >拒绝本次实验卡</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function experimentVariableLabel(value: string) {
  return ({
    title_cover: "标题与封面",
    opening: "开头",
    audience_expression: "人群表达",
    body_structure: "正文结构",
    evidence: "证据",
    closing: "结尾承接",
    length: "篇幅",
  } as Record<string, string>)[value] || value;
}

function WeeklyMethodCard({ item }: { item: MethodAggregate }) {
  const confidence = item.confidence === "decision_ready" ? "可进入复测判断" : item.confidence === "trend" ? "仅描述趋势" : "样本不足，只展示";
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-semibold">{item.method_label}</div>
        <Badge>{item.generation_mode === "default" ? "默认" : "探索"}</Badge>
      </div>
      <div className="mt-2 text-xs text-slate-500">有效/复盘 {item.valid_count}/{item.reviewed_count} · {confidence}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MetricCard label="有效咨询率" value={formatPercent(item.median_inquiry_rate)} />
        <MetricCard label="阅读率" value={formatPercent(item.median_ctr)} />
        <MetricCard label="收藏 / 分享" value={`${formatNumber(item.median_saves)} / ${formatNumber(item.median_shares)}`} />
        <MetricCard label="主页 / 成交" value={`${formatNumber(item.median_profile_visits)} / ${formatNumber(item.median_sales)}`} />
      </div>
    </div>
  );
}

const formatPercent = (value?: number) => `${((value || 0) * 100).toFixed(2)}%`;
const formatNumber = (value?: number) => Math.round(value || 0).toLocaleString("zh-CN");

function Check({ check }: { check: ContentDraft["validation_checks"][number] }) {
  const label = ({ source: "来源", identity: "身份", fulfillment: "兑现", compliance: "合规", conversion: "转化植入" } as Record<string, string>)[check.key];
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
    <section id={`growth-step-${number}`} data-step={number} className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500" />
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
  return <button type="button" disabled={disabled} onClick={onClick} className="min-h-11 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{children}</button>;
}

function SecondaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-40">{children}</button>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{children}</span>;
}

function CopyButton({
  text,
  label,
  copiedLabel = "已复制",
  primary = false,
  compact = false,
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  primary?: boolean;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyText() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy_failed");
      }
      setState("copied");
      window.setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <button
      type="button"
      disabled={!text}
      onClick={copyText}
      className={`${compact ? "min-h-9 px-3 py-1.5 text-xs" : "min-h-11 px-4 py-2.5 text-sm"} rounded-xl border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800" : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"}`}
    >
      {state === "copied" ? copiedLabel : state === "failed" ? "复制失败，请重试" : label}
    </button>
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
