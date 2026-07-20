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
  GrowthRun,
  MethodAggregate,
  MethodGenerationMode,
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
  const [reviewValues, setReviewValues] = useState<Record<string, string | boolean>>(emptyReview());
  const [reviewBaseline, setReviewBaseline] = useState<Record<string, string | boolean>>(emptyReview());
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
    setReviewValues(emptyReview());
    setReviewBaseline(emptyReview());
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
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];
      const step = (visible?.target as HTMLElement | undefined)?.dataset.step;
      if (step) setVisibleStep(step);
    }, { rootMargin: "-90px 0px -65% 0px", threshold: 0 });
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
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
  const reviewDrafts = useMemo(
    () => (data?.currentDrafts || []).filter((draft) =>
      draft.schema_version !== "legacy_v1" && (draft.status === "published" || draft.status === "reviewed")),
    [data?.currentDrafts],
  );
  const workflowSteps = [
    ["0", "业务定位"], ["1", "三家视角"], ["2", "人设"], ["3", "选题"],
    ["4", "正文"], ["5", "单篇复盘"], ["6", "周复盘"],
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
      await load(businessLine, persona, true);
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
      await load(businessLine, persona, true);
      setMessage("已保存固定周期快照；实时汇总不会覆盖上一周期。");
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
              业务定位 → 三家视角 → 人设 → 选题 → 正文 → 24小时单篇复盘 → 周复盘。人工确认后复制发布，系统不自动发帖。
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
                    <PrimaryButton disabled={Boolean(busy) || reviewDrafts.length === 0} onClick={runWeeklyReview}>
                      {reviewDrafts.length === 0 ? "有发布内容后可保存" : "保存固定周期快照"}
                    </PrimaryButton>
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
  if (!Array.isArray(review.by_method) || !review.decision) return null;
  const promotionSuggestions = Array.isArray(review.promotion_suggestions)
    ? review.promotion_suggestions
    : [];
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

      {promotionSuggestions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <b>探索晋升建议（需人工确认）</b>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {promotionSuggestions.map((item) => <li key={item.method_id}>{item.method_label}：{item.reason}</li>)}
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
