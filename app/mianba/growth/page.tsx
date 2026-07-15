"use client";

import { useCallback, useEffect, useState } from "react";
import NextImage from "next/image";
import type {
  ContentDraft,
  DirectionAggregate,
  GrowthAccount,
  GrowthBusinessPosition,
  GrowthBusinessTrack,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthRun,
  WeeklyReviewResult,
  TopicCandidate,
} from "@/lib/growth/types";
import {
  GROWTH_BUSINESS_TRACKS,
  GROWTH_PERSONA_LABELS,
  GROWTH_PERSONAS,
  personaSpecificFields,
} from "@/lib/growth/types";
import {
  DEFAULT_BUSINESS_POSITIONS,
  isInternationalStudentTrack,
  resolveAccountBusinessTrack,
} from "@/lib/growth/businessPosition";
import {
  buyerCaseMaterial,
  buyerCaseMode,
  buyerCNeedsMaterial,
  isBuyerCWeeklyFocusActive,
} from "@/lib/growth/buyerCStrategy";
import {
  buildBuyerCCoverOverlay,
  type BuyerCCoverOverlay,
} from "@/lib/growth/coverComposition";
import { scanDraftCompliance } from "@/lib/growth/validation";

interface WorkspaceState {
  account: GrowthAccount | null;
  plan: GrowthPlan | null;
  run: GrowthRun | null;
  drafts: ContentDraft[];
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
  content_directions: string;
  tone_style: string;
  filter_words: string;
  avoid_expressions: string;
  compliance_redline: string;
  private_domain: string;
  hypotheses: string;
  persona_specific: Record<string, string>;
}

type BusinessPositionForm = Pick<
  GrowthBusinessPosition,
  | "service_category"
  | "target_user"
  | "core_problem"
  | "main_offer"
  | "differentiation"
  | "trust_source"
  | "compliance_redline"
>;

interface ReviewFormState {
  note_status: "normal" | "limited" | "violation" | "deleted";
  promoted: boolean;
  impressions: string;
  reads: string;
  average_view_seconds: string;
  likes: string;
  saves: string;
  comments: string;
  shares: string;
  follows: string;
  qualified_inquiries: string;
  note_url: string;
  target_customer_quote: string;
  search_keywords: string;
  traffic_sources?: GrowthReviewMetrics["traffic_sources"];
  audience?: GrowthReviewMetrics["audience"];
  input_source: "manual" | "screenshot" | "mixed";
}

interface ScreenshotExtractionState {
  confidence: Record<string, number>;
  warnings: string[];
}

interface GeneratedCover {
  variant: "招聘现场版" | "结果对照版";
  brief: {
    coverText: string;
    overlayGuidance: string;
    overlay?: BuyerCCoverOverlay;
  };
  imageDataUrl?: string;
  imageError?: string;
}

function resolveCoverOverlay(
  cover: GeneratedCover,
  draft: ContentDraft,
  account: GrowthAccount | null,
) {
  return (
    cover.brief.overlay ||
    buildBuyerCCoverOverlay({
      title: draft.title,
      coverText: draft.cover_text,
      caseMode: account ? buyerCaseMode(account) : draft.case_mode,
      caseMaterial: account ? buyerCaseMaterial(account) : "",
      body: draft.body,
    })
  );
}

function fillRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
}

function drawBuyerCCoverOverlay(
  context: CanvasRenderingContext2D,
  overlay: BuyerCCoverOverlay,
) {
  context.textBaseline = "middle";

  context.save();
  context.shadowColor = "rgba(0,0,0,0.28)";
  context.shadowBlur = 18;
  fillRoundRect(context, 132, 138, 760, 86, 8, overlay.accentColor);
  context.restore();
  context.fillStyle = "#FFFFFF";
  context.font = "800 34px sans-serif";
  context.textAlign = "center";
  context.fillText(overlay.venueBanner, 512, 181, 700);

  context.save();
  context.translate(92, 400);
  context.rotate(-0.065);
  context.shadowColor = "rgba(0,0,0,0.34)";
  context.shadowBlur = 30;
  fillRoundRect(context, 0, 0, 710, 405, 18, "#FFFFFF");
  context.shadowBlur = 0;
  fillRoundRect(context, 0, 0, 710, 16, 8, overlay.accentColor);
  context.textAlign = "left";
  context.fillStyle = "#1F2937";
  context.font = "800 31px sans-serif";
  context.fillText(overlay.emailSender, 42, 65, 620);
  context.fillStyle = "#6B7280";
  context.font = "500 22px sans-serif";
  context.fillText("recruiting@••••••.com", 42, 105);
  context.fillStyle = overlay.accentColor;
  context.font = "800 34px sans-serif";
  context.fillText(overlay.emailSubject, 42, 164, 620);
  context.strokeStyle = "#E5E7EB";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(42, 198);
  context.lineTo(668, 198);
  context.stroke();
  context.fillStyle = "#374151";
  context.font = "600 24px sans-serif";
  overlay.emailRows.slice(0, 4).forEach((row, index) => {
    context.fillText(row, 42, 238 + index * 40, 610);
  });
  fillRoundRect(context, 510, 338, 155, 42, 8, "#F3F4F6");
  context.fillStyle = "#6B7280";
  context.font = "700 19px sans-serif";
  context.textAlign = "center";
  context.fillText("关键内容已隐去", 587, 359, 145);
  context.restore();

  const gradient = context.createLinearGradient(0, 850, 0, 1536);
  gradient.addColorStop(0, "rgba(10, 12, 16, 0)");
  gradient.addColorStop(1, "rgba(10, 12, 16, 0.66)");
  context.fillStyle = gradient;
  context.fillRect(0, 780, 1024, 756);

  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = "900 72px sans-serif";
  overlay.headlineLines.slice(0, 2).forEach((line, index) => {
    const y = 1160 + index * 104;
    const width = Math.min(880, context.measureText(line).width);
    fillRoundRect(context, 62, y + 36, width + 42, 54, 10, "#f7ef48");
    context.lineJoin = "round";
    context.lineWidth = 14;
    context.strokeStyle = "#FFFFFF";
    context.strokeText(line, 78, y, 850);
    context.fillStyle = "#f04a23";
    context.fillText(line, 78, y, 850);
  });

  fillRoundRect(context, 58, 54, 400, 58, 10, "rgba(20,20,20,0.76)");
  context.fillStyle = "#FFFFFF";
  context.font = "700 25px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(overlay.disclosure, 258, 83, 370);
}

interface ImportPublishedFormState {
  title: string;
  body: string;
  direction: "A" | "B" | "C";
  contentType: "diagnostic" | "tool" | "story";
  publishedAt: string;
}

const DIRECTION_LABELS: Record<string, string> = {
  A: "痛点诊断",
  B: "工具清单",
  C: "故事过程",
};

const BUYER_DIRECTION_LABELS: Record<string, string> = {
  A: "求助/情绪",
  B: "成长/复盘",
  C: "留学生家长Offer转折",
};

const EXECUTIVE_BUYER_DIRECTION_LABELS: Record<string, string> = {
  A: "求助/情绪",
  B: "成长/复盘",
  C: "方向转折/桥接",
};

function directionLabel(
  persona: GrowthPersona,
  direction: string,
  businessTrack: GrowthBusinessTrack,
) {
  const labels =
    persona === "buyer"
      ? businessTrack === "international-student-career"
        ? BUYER_DIRECTION_LABELS
        : EXECUTIVE_BUYER_DIRECTION_LABELS
      : DIRECTION_LABELS;
  return labels[direction] ?? "";
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  diagnostic: "诊断型",
  tool: "工具型",
  story: "故事型",
};

const DRAFT_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  ready: "已选定",
  published: "已发布",
  reviewed: "已复盘",
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  scale: "本篇模式可复用",
  retest: "值得二测",
  weak_entry: "入口弱",
  weak_conversion: "承接弱",
  wrong_audience: "人群跑偏",
  pause: "本篇模式不建议复用",
};

const SAMPLE_STATUS_LABELS: Record<string, string> = {
  valid: "有效样本",
  low_sample: "低样本，仅观察",
  paid: "投流样本，单独记录",
  limited: "限流，只进入合规学习",
  violation: "违规，只进入合规学习",
  deleted: "已删除",
  historical_unknown: "历史数据，口径未知",
  not_ready: "尚未满24小时",
};

const WEEKLY_ACTION_LABELS: Record<string, string> = {
  scale: "放大",
  retest: "二测",
  explore: "探索",
  pause: "暂停",
};

const emptyReviewForm: ReviewFormState = {
  note_status: "normal",
  promoted: false,
  impressions: "",
  reads: "",
  average_view_seconds: "",
  likes: "",
  saves: "",
  comments: "",
  shares: "",
  follows: "",
  qualified_inquiries: "",
  note_url: "",
  target_customer_quote: "",
  search_keywords: "",
  input_source: "manual",
};

function num(value?: number) {
  return typeof value === "number" ? String(value) : "";
}

function metricsToForm(metrics?: GrowthReviewMetrics): ReviewFormState {
  if (!metrics) return { ...emptyReviewForm };
  return {
    note_status: metrics.note_status ?? "normal",
    promoted: metrics.promoted ?? false,
    impressions: num(metrics.impressions),
    reads: num(metrics.reads),
    average_view_seconds: num(metrics.average_view_seconds),
    likes: num(metrics.likes),
    saves: num(metrics.saves),
    comments: num(metrics.comments),
    shares: num(metrics.shares),
    follows: num(metrics.follows),
    qualified_inquiries: num(metrics.qualified_inquiries),
    note_url: metrics.note_url ?? "",
    target_customer_quote: metrics.target_customer_quote ?? "",
    search_keywords: (metrics.search_keywords ?? []).join("，"),
    traffic_sources: metrics.traffic_sources,
    audience: metrics.audience,
    input_source: metrics.input_source ?? "manual",
  };
}

function formToMetricsPayload(form: ReviewFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    note_status: form.note_status,
    promoted: form.promoted,
    input_source: form.input_source,
  };
  const numericKeys = [
    "impressions",
    "reads",
    "average_view_seconds",
    "likes",
    "saves",
    "comments",
    "shares",
    "follows",
    "qualified_inquiries",
  ] as const;
  for (const key of numericKeys) {
    if (form[key].trim()) payload[key] = Number(form[key]);
  }
  if (form.note_url.trim()) payload.note_url = form.note_url.trim();
  if (form.target_customer_quote.trim()) payload.target_customer_quote = form.target_customer_quote.trim();
  const keywords = form.search_keywords.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean).slice(0, 5);
  if (keywords.length) payload.search_keywords = keywords;
  if (form.traffic_sources) payload.traffic_sources = form.traffic_sources;
  if (form.audience) payload.audience = form.audience;
  return payload;
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function newImportPublishedForm(): ImportPublishedFormState {
  return {
    title: "",
    body: "",
    direction: "C",
    contentType: "story",
    publishedAt: localDateTimeValue(),
  };
}

function effectivePublishedAt(note: ContentDraft) {
  return note.published_at || note.updated_at || note.created_at;
}

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}小时${minutes}分钟`;
}

async function compressReviewScreenshot(file: File) {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("截图读取失败")));
    reader.onerror = () => reject(reader.error || new Error("截图读取失败"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`${file.name} 不是可识别的图片`));
    element.src = source;
  });
  let scale = Math.min(1, 1000 / image.width, 2200 / image.height);
  const canvas = document.createElement("canvas");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理这张截图");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", Math.max(0.5, 0.72 - attempt * 0.04));
    if (dataUrl.length <= 600_000) return { name: file.name, dataUrl };
    scale *= 0.82;
  }
  throw new Error(`${file.name} 压缩后仍过大，请先裁掉无关区域再上传`);
}

function toAccountForm(account: GrowthAccount): AccountForm {
  const personaSpecific: Record<string, string> = {};
  for (const field of personaSpecificFields(
    account.persona,
    resolveAccountBusinessTrack(account),
  )) {
    personaSpecific[field.key] =
      field.key === "case_mode" ? buyerCaseMode(account) : account.persona_specific?.[field.key] ?? "";
  }
  return {
    name: account.name,
    one_liner: account.one_liner ?? "",
    target_user: account.target_user,
    core_problem: account.core_problem,
    account_value: account.account_value,
    follow_reason: account.follow_reason ?? "",
    trust_source: account.trust_source,
    not_doing: account.not_doing,
    content_directions: (account.content_directions ?? []).join("\n"),
    tone_style: account.tone_style ?? "",
    filter_words: (account.filter_words ?? []).join("、"),
    avoid_expressions: (account.avoid_expressions ?? []).join("、"),
    compliance_redline: account.compliance_redline ?? "",
    private_domain: account.private_domain ?? "",
    hypotheses: account.hypotheses.join("\n"),
    persona_specific: personaSpecific,
  };
}

function toBusinessPositionForm(position: GrowthBusinessPosition): BusinessPositionForm {
  return {
    service_category: position.service_category,
    target_user: position.target_user,
    core_problem: position.core_problem,
    main_offer: position.main_offer,
    differentiation: position.differentiation,
    trust_source: position.trust_source,
    compliance_redline: position.compliance_redline,
  };
}

function splitList(value: string, sep: RegExp) {
  return value.split(sep).map((s) => s.trim()).filter(Boolean);
}

function complianceView(draft: ContentDraft) {
  const scannedIssues = scanDraftCompliance(draft).map((issue) => issue.message);
  const issues = draft.compliance?.issues ?? [...new Set(scannedIssues)];
  return {
    status: draft.compliance?.status ?? (scannedIssues.length > 0 ? "blocked" : "passed"),
    issues,
  } as const;
}

function draftIsBlocked(draft: ContentDraft) {
  return complianceView(draft).status === "blocked";
}

export default function XiaohongshuNotesPage() {
  const [businessTrack, setBusinessTrack] = useState<GrowthBusinessTrack>(
    "international-student-career",
  );
  const [persona, setPersona] = useState<GrowthPersona>("merchant");
  const [businessPosition, setBusinessPosition] =
    useState<GrowthBusinessPosition>(
      DEFAULT_BUSINESS_POSITIONS["international-student-career"],
    );
  const [businessPositions, setBusinessPositions] = useState<
    Record<GrowthBusinessTrack, GrowthBusinessPosition>
  >(DEFAULT_BUSINESS_POSITIONS);
  const [positionEditing, setPositionEditing] = useState(false);
  const [positionForm, setPositionForm] = useState<BusinessPositionForm>(
    toBusinessPositionForm(DEFAULT_BUSINESS_POSITIONS["international-student-career"]),
  );
  const [state, setState] = useState<WorkspaceState>({ account: null, plan: null, run: null, drafts: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const [editing, setEditing] = useState(false);
  const [accountCardOpen, setAccountCardOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm | null>(null);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [variants, setVariants] = useState<ContentDraft[]>([]);
  const [chosenDraft, setChosenDraft] = useState<ContentDraft | null>(null);
  const [generatedCovers, setGeneratedCovers] = useState<GeneratedCover[]>([]);

  // 以笔记为单元：每篇笔记各自的复盘结果与回填表单
  const [reviews, setReviews] = useState<Record<string, GrowthReview>>({});
  const [metricsByDraft, setMetricsByDraft] = useState<Record<string, ReviewFormState>>({});
  const [weeklyResult, setWeeklyResult] = useState<WeeklyReviewResult | null>(null);
  const [screenshotEnabled, setScreenshotEnabled] = useState(false);
  const [screenshotExtractions, setScreenshotExtractions] = useState<Record<string, ScreenshotExtractionState>>({});
  const [importPublishedOpen, setImportPublishedOpen] = useState(false);
  const [importPublishedForm, setImportPublishedForm] = useState<ImportPublishedFormState>(() => newImportPublishedForm());

  const applyReviews = useCallback((reviewMap: Record<string, GrowthReview>, drafts: ContentDraft[]) => {
    setReviews(reviewMap);
    const forms: Record<string, ReviewFormState> = {};
    for (const draft of drafts) {
      forms[draft.id] = metricsToForm(reviewMap[draft.id]?.metrics);
    }
    setMetricsByDraft(forms);
  }, []);

  const loadWorkspace = useCallback(
    async (p: GrowthPersona, track: GrowthBusinessTrack) => {
      const res = await fetch(
        `/api/growth/bootstrap?persona=${p}&track=${encodeURIComponent(track)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = `/mianba/login?next=${encodeURIComponent("/mianba/growth")}`;
        return;
      }
      const run: GrowthRun | null = (data.runs && data.runs[0]) || null;
      const drafts: ContentDraft[] = data.drafts ?? [];
      const nextPosition =
        data.businessPosition ?? DEFAULT_BUSINESS_POSITIONS[track];
      setBusinessPosition(nextPosition);
      if (data.businessPositions) setBusinessPositions(data.businessPositions);
      setPositionForm(toBusinessPositionForm(nextPosition));
      setPositionEditing(false);
      setState({ account: data.account ?? null, plan: data.plan ?? null, run, drafts });
      setAccountForm(data.account ? toAccountForm(data.account) : null);
      setEditing(false);
      setAccountCardOpen(false);
      setChosenDraft(drafts[0] || run?.draft || null);
      setVariants([]);
      setGeneratedCovers([]);
      setSelectedTopicId(run?.selected_topic?.id ?? null);
      applyReviews((data.reviews ?? {}) as Record<string, GrowthReview>, drafts);
      setWeeklyResult(
        (data.weeklyReview ?? data.stageReview ?? data.account?.weekly_review ?? data.account?.stage_review ?? null) as WeeklyReviewResult | null,
      );
      setScreenshotEnabled(Boolean(data.capabilities?.reviewScreenshot));
    },
    [applyReviews]
  );

  useEffect(() => {
    setMessage("");
    loadWorkspace(persona, businessTrack).catch((error) =>
      setMessage((error as Error).message),
    );
  }, [persona, businessTrack, loadWorkspace]);

  const showCopyMessage = useCallback((label: string) => {
    setMessage(`${label}已复制`);
  }, []);

  const showCopyError = useCallback((label: string) => {
    setMessage(`${label}复制失败，请手动选择文本`);
  }, []);

  async function run(label: string, action: () => Promise<void>, target = label) {
    setBusy(target);
    setMessage(`${label}中...`);
    try {
      await action();
      setMessage(`${label}完成`);
    } catch (error) {
      setMessage((error as Error).message || `${label}失败`);
    } finally {
      setBusy("");
    }
  }

  async function createAccount(regenerate = false) {
    await run(regenerate ? "系统生成定位卡" : "创建账号定位卡", async () => {
      const res = await fetch("/api/growth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona,
          businessTrack,
          accountName:
            state.account?.name || businessPosition.persona_profiles[persona].account_name,
          ...(regenerate && state.account ? { regenerateAccountId: state.account.id } : {}),
        }),
      });
      if (!res.ok) throw new Error("生成定位卡失败");
      await loadWorkspace(persona, businessTrack);
    });
  }

  async function saveBusinessPosition() {
    await run("保存业务定位", async () => {
      const res = await fetch("/api/growth/business-position", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track: businessTrack, ...positionForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "保存业务定位失败");
      const position = data.position as GrowthBusinessPosition;
      setBusinessPosition(position);
      setBusinessPositions((current) => ({ ...current, [businessTrack]: position }));
      setPositionEditing(false);
    });
  }

  async function saveAccount() {
    if (!state.account || !accountForm) return;
    await run("保存定位卡", async () => {
      const res = await fetch("/api/growth/account", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: state.account!.id,
          name: accountForm.name,
          one_liner: accountForm.one_liner,
          target_user: accountForm.target_user,
          core_problem: accountForm.core_problem,
          account_value: accountForm.account_value,
          follow_reason: accountForm.follow_reason,
          trust_source: accountForm.trust_source,
          not_doing: accountForm.not_doing,
          content_directions: splitList(accountForm.content_directions, /\n/),
          tone_style: accountForm.tone_style,
          filter_words: splitList(accountForm.filter_words, /[,，、\n]/),
          avoid_expressions: splitList(accountForm.avoid_expressions, /[,，、\n]/),
          compliance_redline: accountForm.compliance_redline,
          private_domain: accountForm.private_domain,
          hypotheses: splitList(accountForm.hypotheses, /\n/),
          persona_specific: accountForm.persona_specific,
        }),
      });
      if (!res.ok) throw new Error("保存定位卡失败");
      await loadWorkspace(persona, businessTrack);
    });
  }

  async function addTopics() {
    if (!state.account) return;
    await run("生成 2 个选题", async () => {
      const res = await fetch("/api/growth/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: state.account!.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成选题失败");
      setState((current) => ({ ...current, run: data.run }));
    });
  }

  async function generateVariants(topic: TopicCandidate) {
    if (!state.run) return;
    setSelectedTopicId(topic.id);
    await run("生成 2 篇正文", async () => {
      const res = await fetch("/api/growth/drafts/variants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: state.run!.id,
          topicId: topic.id,
          excludeBodies: variants.map((v) => v.body),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成正文失败");
      setVariants(data.drafts || []);
      setChosenDraft(null);
      setGeneratedCovers([]);
    }, `生成正文:${topic.id}`);
  }

  async function chooseDraft(draft: ContentDraft) {
    await run("选定这篇正文", async () => {
      const res = await fetch("/api/growth/drafts/choose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "选定失败");
      setChosenDraft(data.draft);
      setVariants([]);
      setGeneratedCovers([]);
      await loadWorkspaceKeepChosen(data.draft);
    }, `选正文:${draft.id}`);
  }

  async function loadWorkspaceKeepChosen(draft: ContentDraft) {
    const res = await fetch(
      `/api/growth/bootstrap?persona=${persona}&track=${encodeURIComponent(businessTrack)}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    const run2: GrowthRun | null = (data.runs && data.runs[0]) || null;
    const drafts: ContentDraft[] = data.drafts ?? [];
    setState({ account: data.account ?? null, plan: data.plan ?? null, run: run2, drafts });
    setChosenDraft(draft);
    applyReviews((data.reviews ?? {}) as Record<string, GrowthReview>, drafts);
    setWeeklyResult(
      (data.weeklyReview ?? data.stageReview ?? data.account?.weekly_review ?? data.account?.stage_review ?? null) as WeeklyReviewResult | null,
    );
    setScreenshotEnabled(Boolean(data.capabilities?.reviewScreenshot));
  }

  async function generateBuyerCCovers(draft: ContentDraft) {
    if (
      !state.account ||
      !isInternationalStudentTrack(state.account) ||
      state.account.persona !== "buyer" ||
      draft.direction !== "C"
    ) {
      return;
    }
    await run("生成 2 张封面", async () => {
      const res = await fetch("/api/growth/covers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          body: draft.body,
          coverText: draft.cover_text,
          targetUser: draft.target_user,
          contentType: draft.content_type,
          testVariable: draft.test_variable,
          buyerC: true,
          caseMode: buyerCaseMode(state.account!),
          caseMaterial: buyerCaseMaterial(state.account!),
          count: 2,
          withImage: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "生成封面失败");
      setGeneratedCovers((data.covers ?? []) as GeneratedCover[]);
    });
  }

  async function saveCoverChoice(
    draft: ContentDraft,
    source: "ai" | "manual",
    variant?: "招聘现场版" | "结果对照版",
  ) {
    await run(source === "ai" ? "选定封面" : "记录手工封面", async () => {
      const nextDraft: ContentDraft = {
        ...draft,
        cover_source: source,
        cover_variant: source === "ai" ? variant : undefined,
      };
      const res = await fetch("/api/growth/drafts/choose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: nextDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "保存封面选择失败");
      setChosenDraft(data.draft);
      setState((current) => ({
        ...current,
        drafts: current.drafts.map((item) => (item.id === data.draft.id ? data.draft : item)),
      }));
    }, `选封面:${source}:${variant ?? "manual"}`);
  }

  async function downloadComposedCover(cover: GeneratedCover, draft: ContentDraft) {
    if (!cover.imageDataUrl) throw new Error("这张封面没有可下载的图片");
    await run("下载封面", async () => {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new window.Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("封面图片读取失败"));
        element.src = cover.imageDataUrl!;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1536;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法合成封面");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawBuyerCCoverOverlay(context, resolveCoverOverlay(cover, draft, state.account));

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${draft.title}-${cover.variant}.png`;
      link.click();
    }, `下载封面:${cover.variant}`);
  }

  async function markPublishedNote(draft: ContentDraft, publishedAt: string) {
    await run("标记已发布", async () => {
      const parsedPublishedAt = new Date(publishedAt);
      if (!Number.isFinite(parsedPublishedAt.getTime())) throw new Error("请填写正确的实际发布时间");
      const res = await fetch(`/api/growth/drafts/${draft.id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published_at: parsedPublishedAt.toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "标记发布失败");
      await loadWorkspaceKeepChosen(chosenDraft ?? draft);
    }, `发布:${draft.id}`);
  }

  async function importPublishedNote() {
    if (!state.account || !state.run) return;
    await run("补录已发布笔记", async () => {
      const parsedPublishedAt = new Date(importPublishedForm.publishedAt);
      if (!Number.isFinite(parsedPublishedAt.getTime())) throw new Error("请填写正确的实际发布时间");
      const res = await fetch("/api/growth/drafts/import-published", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: state.account!.id,
          runId: state.run!.id,
          title: importPublishedForm.title,
          body: importPublishedForm.body,
          direction: importPublishedForm.direction,
          contentType: importPublishedForm.contentType,
          published_at: parsedPublishedAt.toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "补录失败");
      setImportPublishedOpen(false);
      setImportPublishedForm(newImportPublishedForm());
      await loadWorkspaceKeepChosen(data.draft);
    });
  }

  async function submitReviewNote(draft: ContentDraft) {
    await run("提交复盘", async () => {
      const payload = formToMetricsPayload(metricsByDraft[draft.id] ?? emptyReviewForm);
      const res = await fetch(`/api/growth/drafts/${draft.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "提交复盘失败");
      setReviews((prev) => ({ ...prev, [draft.id]: data.review }));
      if (data.weeklyReview) setWeeklyResult(data.weeklyReview);
      await loadWorkspaceKeepChosen(chosenDraft ?? draft);
    }, `复盘:${draft.id}`);
  }

  function updateReviewForm(draftId: string, patch: Partial<ReviewFormState>) {
    setMetricsByDraft((prev) => ({
      ...prev,
      [draftId]: { ...(prev[draftId] ?? emptyReviewForm), ...patch },
    }));
  }

  async function extractReviewScreenshots(draft: ContentDraft, files: File[]) {
    await run("识别数据截图", async () => {
      if (files.length < 1 || files.length > 6) throw new Error("请选择1到6张截图");
      const images = await Promise.all(files.map(compressReviewScreenshot));
      const res = await fetch("/api/growth/reviews/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "截图识别失败");
      const prefill = data.prefill as Partial<GrowthReviewMetrics>;
      updateReviewForm(draft.id, {
        impressions: num(prefill.impressions) || metricsByDraft[draft.id]?.impressions || "",
        reads: num(prefill.reads) || metricsByDraft[draft.id]?.reads || "",
        average_view_seconds:
          num(prefill.average_view_seconds) || metricsByDraft[draft.id]?.average_view_seconds || "",
        likes: num(prefill.likes) || metricsByDraft[draft.id]?.likes || "",
        saves: num(prefill.saves) || metricsByDraft[draft.id]?.saves || "",
        comments: num(prefill.comments) || metricsByDraft[draft.id]?.comments || "",
        shares: num(prefill.shares) || metricsByDraft[draft.id]?.shares || "",
        follows: num(prefill.follows) || metricsByDraft[draft.id]?.follows || "",
        search_keywords: (prefill.search_keywords ?? []).join("，") || metricsByDraft[draft.id]?.search_keywords || "",
        traffic_sources: prefill.traffic_sources || metricsByDraft[draft.id]?.traffic_sources,
        audience: prefill.audience || metricsByDraft[draft.id]?.audience,
        input_source: "mixed",
      });
      setScreenshotExtractions((current) => ({
        ...current,
        [draft.id]: { confidence: data.confidence ?? {}, warnings: data.warnings ?? [] },
      }));
    }, `截图:${draft.id}`);
  }

  async function generateWeeklyReview() {
    if (!account) return;
    await run("生成周复盘", async () => {
      const res = await fetch("/api/growth/weekly-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成周复盘失败");
      setWeeklyResult(data.result);
      setState((current) => ({
        ...current,
        account: current.account
          ? { ...current.account, weekly_review: data.result, stage_review: data.result }
          : current.account,
      }));
    });
  }

  const account = state.account;
  const topicPool = state.run?.topic_pool ?? [];

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">小红书内容工厂</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">小红书笔记</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            账号定位卡 → 选题 → 正文 → 24小时单篇复盘 → 周复盘。人工确认后复制发布，系统不自动发帖。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">
            返回首页
          </a>
          <button
            className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm"
            onClick={async () => {
              await fetch("/api/mianba/auth/logout", { method: "POST" });
              window.location.href = "/mianba/login";
            }}
          >
            退出登录
          </button>
          <div className="rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-sm">
            {message || "就绪"}
          </div>
        </div>
      </header>

      <StepCard
        step="0"
        title="先选业务定位"
        desc="业务定位在三个内容视角之上。切换后，账号定位卡、选题、正文和复盘数据都会进入对应业务空间。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {GROWTH_BUSINESS_TRACKS.map((track) => {
            const position = businessPositions[track] ?? DEFAULT_BUSINESS_POSITIONS[track];
            const active = businessTrack === track;
            return (
              <button
                key={track}
                type="button"
                onClick={() => {
                  setBusinessTrack(track);
                  setBusinessPosition(position);
                  setPositionEditing(false);
                  setPositionForm(toBusinessPositionForm(position));
                }}
                className={
                  "rounded-2xl border p-4 text-left transition " +
                  (active
                    ? "border-gold-400 bg-gold-50/60 shadow-sm"
                    : "border-ink-100 bg-ink-50/60 hover:border-ink-200")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-ink-900">{position.label}</div>
                  {active && (
                    <span className="rounded-full bg-ink-900 px-3 py-1 text-[11px] font-semibold text-white">
                      当前业务
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-500">{position.service_category}</p>
                <p className="mt-1 text-xs leading-5 text-ink-400">服务：{position.main_offer}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-ink-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-gold-700">当前业务母定位</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">{businessPosition.label}</div>
              <p className="mt-1 text-sm leading-6 text-ink-600">{businessPosition.target_user}</p>
            </div>
            <button
              className="rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700"
              onClick={() => {
                setPositionForm(toBusinessPositionForm(businessPosition));
                setPositionEditing((value) => !value);
              }}
            >
              {positionEditing ? "收起设置" : "调整业务定位"}
            </button>
          </div>

          {positionEditing ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <EditField
                label="你是什么（品类）"
                value={positionForm.service_category}
                onChange={(value) => setPositionForm({ ...positionForm, service_category: value })}
              />
              <EditField
                label="主营服务"
                value={positionForm.main_offer}
                onChange={(value) => setPositionForm({ ...positionForm, main_offer: value })}
              />
              <EditArea
                label="目标用户"
                value={positionForm.target_user}
                onChange={(value) => setPositionForm({ ...positionForm, target_user: value })}
              />
              <EditArea
                label="核心问题"
                value={positionForm.core_problem}
                onChange={(value) => setPositionForm({ ...positionForm, core_problem: value })}
              />
              <EditArea
                label="有何不同"
                value={positionForm.differentiation}
                onChange={(value) => setPositionForm({ ...positionForm, differentiation: value })}
              />
              <EditArea
                label="何以见得（信任来源）"
                value={positionForm.trust_source}
                onChange={(value) => setPositionForm({ ...positionForm, trust_source: value })}
              />
              <div className="md:col-span-2">
                <EditArea
                  label="合规红线"
                  value={positionForm.compliance_redline}
                  onChange={(value) => setPositionForm({ ...positionForm, compliance_redline: value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                <button className="btn-primary" disabled={!!busy} onClick={saveBusinessPosition}>
                  {busy === "保存业务定位" ? "保存中..." : "保存业务定位"}
                </button>
                <span className="text-xs leading-5 text-ink-500">
                  保存后作为三种视角的共同生成依据；已有账号卡不会被强制覆盖。
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 text-sm leading-6 text-ink-700 md:grid-cols-3">
              <Field label="你是什么（品类）" value={businessPosition.service_category} />
              <Field label="有何不同" value={businessPosition.differentiation} />
              <Field label="何以见得（信任来源）" value={businessPosition.trust_source} />
            </div>
          )}

          <div className="mt-4 border-t border-ink-100 pt-4">
            <div className="mb-3 text-xs font-semibold text-ink-500">再选择这个业务下的内容视角</div>
            <div className="grid gap-2 md:grid-cols-3">
              {GROWTH_PERSONAS.map((p) => {
                const profile = businessPosition.persona_profiles[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPersona(p)}
                    className={
                      "rounded-2xl px-4 py-3 text-left transition " +
                      (persona === p
                        ? "bg-ink-900 text-white"
                        : "bg-ink-50 text-ink-700 hover:bg-ink-100")
                    }
                  >
                    <div className="text-xs opacity-65">{GROWTH_PERSONA_LABELS[p]}</div>
                    <div className="mt-1 text-sm font-semibold">{profile.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-70">{profile.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </StepCard>

      {/* Step 1 账号定位卡 */}
      <StepCard
        step="1"
        title={`${businessPosition.persona_profiles[persona].label}账号定位卡`}
        desc={`继承「${businessPosition.label}」母定位，可继续调整这个视角的目标用户、核心问题和账号价值。`}
      >
        {!account ? (
          <div>
            <p className="text-sm leading-6 text-ink-600">
              当前业务「{businessPosition.label}」下的「{businessPosition.persona_profiles[persona].label}」还没有定位卡。
            </p>
            <button className="btn-primary mt-4" disabled={!!busy} onClick={() => createAccount()}>
              {busy === "创建账号定位卡" ? "生成中..." : "生成账号定位卡"}
            </button>
          </div>
        ) : editing && accountForm ? (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-gold-700">基础定位</div>
            <EditField label="账号名称" value={accountForm.name} onChange={(v) => setAccountForm({ ...accountForm, name: v })} />
            <EditField label="一句话定位（10-20 字）" value={accountForm.one_liner} onChange={(v) => setAccountForm({ ...accountForm, one_liner: v })} />

            <div className="pt-2 text-xs font-semibold text-gold-700">用户与价值</div>
            <EditArea label="目标用户" value={accountForm.target_user} onChange={(v) => setAccountForm({ ...accountForm, target_user: v })} />
            <EditArea label="最痛的问题 / 在为什么付代价" value={accountForm.core_problem} onChange={(v) => setAccountForm({ ...accountForm, core_problem: v })} />
            <EditArea label="账号价值" value={accountForm.account_value} onChange={(v) => setAccountForm({ ...accountForm, account_value: v })} />
            <EditArea label="关注理由" value={accountForm.follow_reason} onChange={(v) => setAccountForm({ ...accountForm, follow_reason: v })} />

            <div className="pt-2 text-xs font-semibold text-gold-700">信任与边界</div>
            <EditArea label="信任来源（创始人凭什么讲）" value={accountForm.trust_source} onChange={(v) => setAccountForm({ ...accountForm, trust_source: v })} />
            <EditArea label="不做什么（排除带）" value={accountForm.not_doing} onChange={(v) => setAccountForm({ ...accountForm, not_doing: v })} />
            <EditArea label="合规红线" value={accountForm.compliance_redline} onChange={(v) => setAccountForm({ ...accountForm, compliance_redline: v })} />

            <div className="pt-2 text-xs font-semibold text-gold-700">内容策略</div>
            <EditArea label="3 个内容方向（每行一个）" value={accountForm.content_directions} onChange={(v) => setAccountForm({ ...accountForm, content_directions: v })} />
            <EditField label="语气与风格" value={accountForm.tone_style} onChange={(v) => setAccountForm({ ...accountForm, tone_style: v })} />
            <EditField label="必须出现的筛选词（顿号/逗号分隔）" value={accountForm.filter_words} onChange={(v) => setAccountForm({ ...accountForm, filter_words: v })} />
            <EditField label="要避免的表达（顿号/逗号分隔）" value={accountForm.avoid_expressions} onChange={(v) => setAccountForm({ ...accountForm, avoid_expressions: v })} />

            <div className="pt-2 text-xs font-semibold text-gold-700">{GROWTH_PERSONA_LABELS[persona]}视角专属</div>
            {personaSpecificFields(persona, businessTrack).map((field) =>
              field.key === "case_mode" ? (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-ink-500">{field.label}</label>
                  <select
                    value={accountForm.persona_specific[field.key] ?? ""}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        persona_specific: {
                          ...accountForm.persona_specific,
                          [field.key]: event.target.value,
                        },
                      })
                    }
                    className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">请选择案例模式</option>
                    <option value="情景演绎">情景演绎（允许虚构，自动公开标注）</option>
                    <option value="真实案例">真实案例（正文只使用下方素材）</option>
                  </select>
                </div>
              ) : field.key === "case_material" ? (
                <EditArea
                  key={field.key}
                  label={field.label}
                  value={accountForm.persona_specific[field.key] ?? ""}
                  onChange={(v) =>
                    setAccountForm({
                      ...accountForm,
                      persona_specific: { ...accountForm.persona_specific, [field.key]: v },
                    })
                  }
                />
              ) : (
                <EditField
                  key={field.key}
                  label={field.label}
                  value={accountForm.persona_specific[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(v) =>
                    setAccountForm({
                      ...accountForm,
                      persona_specific: { ...accountForm.persona_specific, [field.key]: v },
                    })
                  }
                />
              ),
            )}

            <div className="pt-2 text-xs font-semibold text-gold-700">实验管理</div>
            <EditArea label="30 天待验证假设（每行一个）" value={accountForm.hypotheses} onChange={(v) => setAccountForm({ ...accountForm, hypotheses: v })} />
            <EditArea label="私域承接方式（可选）" value={accountForm.private_domain} onChange={(v) => setAccountForm({ ...accountForm, private_domain: v })} />

            <div className="flex gap-3 pt-2">
              <button className="btn-primary" disabled={!!busy} onClick={saveAccount}>
                {busy === "保存定位卡" ? "保存中..." : "保存"}
              </button>
              <button className="rounded-full bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700" onClick={() => { setEditing(false); setAccountForm(toAccountForm(account)); }}>取消</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm leading-6 text-ink-700">
            {account.one_liner && <Field label="一句话定位" value={account.one_liner} />}
            {!account.one_liner && <Field label="账号名称" value={account.name} />}
            <div className="rounded-2xl bg-ink-50 p-3 text-xs leading-5 text-ink-600">
              定位卡平时默认收起，需要调整定位、查看三问或专属字段时再展开。
            </div>
            {accountCardOpen && (
              <>
                <Field label="目标用户" value={account.target_user} />
                <Field label="最痛的问题" value={account.core_problem} />
                <Field label="账号价值" value={account.account_value} />
                {account.follow_reason && <Field label="关注理由" value={account.follow_reason} />}
                <Field label="信任来源" value={account.trust_source} />
                <Field label="不做什么" value={account.not_doing} />
                {account.content_directions && account.content_directions.length > 0 && (
                  <Field label="内容方向" value={account.content_directions.join(" / ")} />
                )}
                {account.tone_style && <Field label="语气风格" value={account.tone_style} />}
                {account.persona_specific &&
                  personaSpecificFields(persona, businessTrack).map((field) =>
                    account.persona_specific?.[field.key] ? (
                      <Field key={field.key} label={field.label} value={account.persona_specific[field.key]} />
                    ) : null
                  )}
              </>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                className="rounded-full bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700"
                onClick={() => setAccountCardOpen((v) => !v)}
              >
                {accountCardOpen ? "收起定位卡" : "展开定位卡"}
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setAccountForm(toAccountForm(account));
                  setAccountCardOpen(true);
                  setEditing(true);
                }}
              >
                编辑定位卡
              </button>
              <button className="rounded-full bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700" disabled={!!busy} onClick={() => createAccount(true)}>
                {busy === "系统生成定位卡" ? "生成中..." : "系统生成"}
              </button>
            </div>
          </div>
        )}
      </StepCard>

      {/* Step 2 选题 */}
      <StepCard step="2" title="选题">
        <button className="btn-primary" disabled={!!busy || !account} onClick={addTopics}>
          {busy === "生成 2 个选题" ? "生成中..." : "生成 2 个选题"}
        </button>
        {topicPool.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {topicPool.map((topic) => {
              const isBuyerOfferFocus =
                businessTrack === "international-student-career" &&
                persona === "buyer" &&
                topic.direction === "C";
              const needsCaseMaterial = Boolean(isBuyerOfferFocus && account && buyerCNeedsMaterial(account));
              const isFictionalCase = Boolean(
                isBuyerOfferFocus && account && buyerCaseMode(account) === "情景演绎",
              );
              const isWeeklyFocus = isBuyerOfferFocus && isBuyerCWeeklyFocusActive() && topic.priority === "S";
              return (
                <div
                  key={topic.id}
                  className={
                    "rounded-2xl border p-4 " +
                    (selectedTopicId === topic.id ? "border-gold-400 bg-gold-50/50" : "border-ink-100")
                  }
                >
                  {isWeeklyFocus && (
                    <div className="mb-2 inline-flex rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-gold-800">
                      {isFictionalCase
                        ? "本周高优 · 留学生家长情景演绎"
                        : "本周高优 · 留学生家长真实Offer现场"}
                    </div>
                  )}
                  <div className="mb-2 flex items-center gap-2 text-xs text-ink-500">
                    <span>
                      方向 {topic.direction} · {directionLabel(persona, topic.direction, businessTrack)}
                    </span>
                    <span>·</span>
                    <span>{CONTENT_TYPE_LABELS[topic.content_type] ?? topic.content_type}</span>
                    {topic.weekly_action && <span>· {WEEKLY_ACTION_LABELS[topic.weekly_action]}</span>}
                  </div>
                  <div className="font-medium leading-6">{topic.title}</div>
                  <p className="mt-1 text-xs leading-5 text-ink-500">验证变量：{topic.test_variable}</p>
                  {topic.evidence && <p className="mt-1 text-xs leading-5 text-ink-500">生成依据：{topic.evidence}</p>}
                  {isFictionalCase && (
                    <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
                      当前为情景演绎：可虚构公司、Offer和招聘现场；正文首行与封面会自动添加公开标识。
                    </p>
                  )}
                  {needsCaseMaterial && (
                    <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      当前选择真实案例，请先在定位卡填写「案例素材」；正文只使用你填写的内容。
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-primary" disabled={!!busy || needsCaseMaterial} onClick={() => generateVariants(topic)}>
                      {busy === `生成正文:${topic.id}` ? "生成中..." : needsCaseMaterial ? "补充案例素材后再写" : "用这个选题写正文"}
                    </button>
                    <CopyButton text={topic.title} label="复制标题" onCopied={showCopyMessage} onCopyFailed={showCopyError} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </StepCard>

      {/* Step 3 正文 */}
      <StepCard step="3" title="正文">
        {variants.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {variants.map((draft, index) => (
              <div key={draft.id} className="rounded-2xl border border-ink-100 p-4">
                <div className="mb-2 text-xs text-gold-700">
                  方案 {index + 1} · {index % 2 === 0 ? "精简版" : "深度版"}（{draft.word_count.total} 字）
                </div>
                <div className="font-medium leading-6">{draft.title}</div>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-3 text-xs leading-6 text-ink-700">{draft.body}</pre>
                <div className="mt-2 text-xs text-ink-500">字数：{draft.word_count.total} / {draft.word_count.within_limit ? "≤1000 通过" : "超限"}</div>
                <ComplianceStatus draft={draft} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={!!busy || draftIsBlocked(draft)} onClick={() => chooseDraft(draft)}>
                    {busy === `选正文:${draft.id}` ? "选定中..." : "选这篇"}
                  </button>
                  <span className="self-center text-xs leading-5 text-ink-500">先选定入库，随后才能复制发布并进入复盘。</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {selectedTopicId && (
          <button
            className="rounded-full bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700 mt-4"
            disabled={!!busy}
            onClick={() => {
              const topic = topicPool.find((t) => t.id === selectedTopicId);
              if (topic) generateVariants(topic);
            }}
          >
            {busy === `生成正文:${selectedTopicId}` ? "生成中..." : "再生成 2 篇新的"}
          </button>
        )}
        {chosenDraft && variants.length === 0 && (
          <div className="rounded-2xl border border-gold-300 bg-gold-50/40 p-4">
            <div className="mb-2 text-xs text-gold-700">已选定正文（状态：{DRAFT_STATUS_LABELS[chosenDraft.status] ?? chosenDraft.status}）</div>
            <div className="font-medium leading-6">{chosenDraft.title}</div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-7 text-ink-800">{chosenDraft.body}{"\n\n"}{chosenDraft.hashtags.join(" ")}</pre>
            <ComplianceStatus draft={chosenDraft} />
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={chosenDraft.title} label="复制标题" disabled={draftIsBlocked(chosenDraft)} onCopied={showCopyMessage} onCopyFailed={showCopyError} />
              <CopyButton
                text={`${chosenDraft.body}\n\n${chosenDraft.hashtags.join(" ")}`}
                label="复制正文+话题"
                disabled={draftIsBlocked(chosenDraft)}
                onCopied={showCopyMessage}
                onCopyFailed={showCopyError}
              />
              <CopyButton text={chosenDraft.hashtags.join(" ")} label="复制话题" disabled={draftIsBlocked(chosenDraft)} onCopied={showCopyMessage} onCopyFailed={showCopyError} />
            </div>
            {(chosenDraft.cover_text || chosenDraft.cover_suggestion) && (
              <div className="mt-4 rounded-xl bg-white/70 p-3 text-sm leading-6 text-ink-700">
                <div className="mb-1 text-xs font-medium text-gold-700">封面文案（自己做图时参考）</div>
                {chosenDraft.cover_text && <div>封面句：{chosenDraft.cover_text}</div>}
                {chosenDraft.cover_suggestion && <div className="mt-1 text-xs text-ink-500">画面建议：{chosenDraft.cover_suggestion}</div>}
                {chosenDraft.cover_text && (
                  <div className="mt-2">
                    <CopyButton text={chosenDraft.cover_text} label="复制封面句" disabled={draftIsBlocked(chosenDraft)} onCopied={showCopyMessage} onCopyFailed={showCopyError} />
                  </div>
                )}
              </div>
            )}
            {businessTrack === "international-student-career" &&
              persona === "buyer" &&
              chosenDraft.direction === "C" && (
              <div className="mt-4 rounded-2xl border border-gold-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-900">买家 C 专属 AI 封面</div>
                    <div className="mt-1 text-xs leading-5 text-ink-500">
                      仅此方向开放。系统生成野生招聘现场底图，再稳定叠加企业招牌、脱敏Offer邮件卡片和橙红描边黄底大字。
                    </div>
                    <div className="mt-1 text-xs leading-5 text-ink-400">
                      真实案例会读取「案例素材」里的中国石油、中国石化、阿里巴巴、腾讯等企业名；情景演绎保留求职情景标识。
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-primary"
                      disabled={!!busy || draftIsBlocked(chosenDraft)}
                      onClick={() => generateBuyerCCovers(chosenDraft)}
                    >
                      {busy === "生成 2 张封面" ? "生成中..." : generatedCovers.length ? "重新生成 2 张" : "生成 2 张封面"}
                    </button>
                    <button
                      className="rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 disabled:opacity-40"
                      disabled={!!busy}
                      onClick={() => saveCoverChoice(chosenDraft, "manual")}
                    >
                      使用手工封面
                    </button>
                  </div>
                </div>

                {chosenDraft.cover_source && (
                  <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
                    当前封面：{chosenDraft.cover_source === "ai" ? `AI · ${chosenDraft.cover_variant ?? "已选择"}` : "手工封面"}
                  </div>
                )}

                {generatedCovers.length > 0 && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {generatedCovers.map((cover) => (
                      <div key={cover.variant} className="rounded-2xl border border-ink-100 p-3">
                        <div className="mb-2 text-xs font-semibold text-gold-700">{cover.variant}</div>
                        {cover.imageDataUrl ? (
                          <BuyerCCoverPreview cover={cover} draft={chosenDraft} account={account} />
                        ) : (
                          <div className="flex aspect-[2/3] items-center justify-center rounded-xl bg-ink-50 p-4 text-center text-xs leading-5 text-ink-500">
                            {cover.imageError || "当前图片服务未配置，可先使用封面文案与画面建议。"}
                          </div>
                        )}
                        <div className="mt-3 text-xs leading-5 text-ink-500">{cover.brief.overlayGuidance}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className="btn-primary"
                            disabled={!!busy || !cover.imageDataUrl}
                            onClick={() => saveCoverChoice(chosenDraft, "ai", cover.variant)}
                          >
                            选这张
                          </button>
                          <button
                            className="rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 disabled:opacity-40"
                            disabled={!!busy || !cover.imageDataUrl}
                            onClick={() => downloadComposedCover(cover, chosenDraft)}
                          >
                            下载成品图
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {variants.length === 0 && !chosenDraft && (
          <p className="text-sm leading-6 text-ink-600">先在第 2 步选一个题，点「用这个选题写正文」。</p>
        )}
      </StepCard>

      {/* Step 4 单篇复盘（以笔记为基本单元） */}
      <StepCard step="4" title="单篇复盘 · 分析标题与正文" desc="记录发布24小时后的固定快照，拆解标题入口、正文质量和商业承接。单篇只决定怎么写，不直接决定方向。">
        <div className="mb-4">
          <button
            className="rounded-full border border-gold-400 px-4 py-2 text-sm font-semibold text-gold-800 disabled:opacity-40"
            disabled={!!busy || !state.account || !state.run}
            onClick={() => setImportPublishedOpen((value) => !value)}
          >
            {importPublishedOpen ? "取消补录" : "补录已发布笔记"}
          </button>
          <span className="ml-3 text-xs leading-5 text-ink-500">用于已经复制发布、但没有出现在复盘清单里的笔记。</span>
        </div>
        {importPublishedOpen && (
          <div className="mb-5 rounded-2xl border border-gold-200 bg-gold-50/40 p-4">
            <div className="mb-3 text-sm font-semibold text-ink-800">恢复一篇已发布笔记</div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={importPublishedForm.title}
                onChange={(event) => setImportPublishedForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm md:col-span-2"
                placeholder="笔记标题"
              />
              <textarea
                value={importPublishedForm.body}
                onChange={(event) => setImportPublishedForm((current) => ({ ...current, body: event.target.value }))}
                className="min-h-40 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm leading-6 md:col-span-2"
                placeholder="粘贴已发布的完整正文，后续才能准确判断正文质量"
              />
              <select
                value={importPublishedForm.direction}
                onChange={(event) => setImportPublishedForm((current) => ({ ...current, direction: event.target.value as ImportPublishedFormState["direction"] }))}
                className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                aria-label="内容方向"
              >
                <option value="A">方向 A · 痛点诊断</option>
                <option value="B">方向 B · 工具清单</option>
                <option value="C">方向 C · 故事过程</option>
              </select>
              <select
                value={importPublishedForm.contentType}
                onChange={(event) => setImportPublishedForm((current) => ({ ...current, contentType: event.target.value as ImportPublishedFormState["contentType"] }))}
                className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                aria-label="内容类型"
              >
                <option value="diagnostic">诊断型</option>
                <option value="tool">工具型</option>
                <option value="story">故事型</option>
              </select>
              <label className="text-xs font-medium text-ink-500 md:col-span-2">
                实际发布时间
                <input
                  type="datetime-local"
                  value={importPublishedForm.publishedAt}
                  max={localDateTimeValue()}
                  onChange={(event) => setImportPublishedForm((current) => ({ ...current, publishedAt: event.target.value }))}
                  className="mt-2 block w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm text-ink-800 md:w-auto"
                />
              </label>
            </div>
            <button
              className="btn-primary mt-4"
              disabled={!!busy || !importPublishedForm.title.trim() || importPublishedForm.body.trim().length < 20}
              onClick={importPublishedNote}
            >
              {busy === "补录已发布笔记" ? "补录中..." : "确认补录并进入复盘清单"}
            </button>
          </div>
        )}
        {state.drafts.length === 0 ? (
          <p className="text-sm leading-6 text-ink-600">还没有笔记。先在第 2、3 步选题并选定一篇正文，它就会作为一篇笔记出现在这里。</p>
        ) : (
          <div className="grid gap-4">
            {state.drafts.map((note) => (
              <NoteReviewCard
                key={note.id}
                note={note}
                review={reviews[note.id]}
                form={metricsByDraft[note.id] ?? emptyReviewForm}
                busyKey={busy}
                screenshotEnabled={screenshotEnabled}
                screenshotExtraction={screenshotExtractions[note.id]}
                onFormChange={(patch) => updateReviewForm(note.id, patch)}
                onPublish={(publishedAt) => markPublishedNote(note, publishedAt)}
                onScreenshots={(files) => extractReviewScreenshots(note, files)}
                onSubmit={() => submitReviewNote(note)}
              />
            ))}
          </div>
        )}
      </StepCard>

      {/* Step 5 周复盘（跨笔记做方向决策） */}
      <StepCard step="5" title="周复盘 · 判断方向与下周策略" desc="近7天看变化，近28天看稳定性。周复盘决定写什么和内容占比，单篇复盘决定标题与正文怎么写。">
        <button className="btn-primary" disabled={!!busy || !account} onClick={generateWeeklyReview}>
          {busy === "生成周复盘" ? "生成中..." : "更新周复盘 / 方向决策"}
        </button>
        {weeklyResult && (
          <div className="mt-5 space-y-4">
            <div className="text-xs text-ink-500">
              共 {weeklyResult.note_total} 篇笔记，已复盘 {weeklyResult.reviewed_total} 篇，近28天有效样本 {weeklyResult.eligible_total ?? 0} 篇。
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {weeklyResult.by_direction.map((agg) => (
                <DirectionAggregateCard key={agg.direction} agg={agg} />
              ))}
            </div>
            <div className="grid gap-3 rounded-2xl bg-gold-50/50 p-4 text-sm leading-6 text-ink-700 md:grid-cols-2">
              <Field label="方向动作建议" value={weeklyResult.decision.scale_direction} />
              <Field label="建议暂停/降权的方向" value={weeklyResult.decision.pause_direction} />
              <Field label="下周主攻" value={weeklyResult.decision.next_focus} />
              <Field label="可复用标题/正文模式" value={weeklyResult.decision.reusable_pattern} />
              <Field label="下周唯一战略假设" value={weeklyResult.decision.strategic_hypothesis || "样本不足，先继续探索。"} />
              <Field
                label="下周内容比例"
                value={(weeklyResult.decision.content_allocation ?? [])
                  .map((item) => `${item.direction} ${item.percentage}%（${WEEKLY_ACTION_LABELS[item.action] ?? item.action}）`)
                  .join("；") || "等待有效样本"}
              />
              <div className="md:col-span-2">
                <Field label="周结论" value={weeklyResult.decision.summary} />
              </div>
            </div>
          </div>
        )}
      </StepCard>
    </main>
  );
}

function NoteReviewCard({
  note,
  review,
  form,
  busyKey,
  screenshotEnabled,
  screenshotExtraction,
  onFormChange,
  onPublish,
  onScreenshots,
  onSubmit,
}: {
  note: ContentDraft;
  review?: GrowthReview;
  form: ReviewFormState;
  busyKey: string;
  screenshotEnabled: boolean;
  screenshotExtraction?: ScreenshotExtractionState;
  onFormChange: (patch: Partial<ReviewFormState>) => void;
  onPublish: (publishedAt: string) => void;
  onScreenshots: (files: File[]) => void;
  onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [publishedAtInput, setPublishedAtInput] = useState(() =>
    localDateTimeValue(
      note.status === "published" || note.status === "reviewed" ? new Date(effectivePublishedAt(note)) : new Date(),
    ),
  );
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const published = note.status === "published" || note.status === "reviewed";
  const reviewed = note.status === "reviewed" && !!review;
  const publishing = busyKey === `发布:${note.id}`;
  const reviewing = busyKey === `复盘:${note.id}`;
  const extracting = busyKey === `截图:${note.id}`;
  const availableAt = Date.parse(effectivePublishedAt(note)) + 24 * 60 * 60 * 1000;
  const reviewReady = reviewed || (published && Number.isFinite(availableAt) && clock >= availableAt);
  const manualChange = (patch: Partial<ReviewFormState>) =>
    onFormChange({ ...patch, input_source: form.input_source === "manual" ? "manual" : "mixed" });

  return (
    <div className="rounded-2xl border border-ink-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-gold-700">
            <span>{DIRECTION_LABELS[note.direction] ?? note.direction}</span>
            <span>· {CONTENT_TYPE_LABELS[note.content_type] ?? note.content_type}</span>
            <span>· {DRAFT_STATUS_LABELS[note.status] ?? note.status}</span>
          </div>
          <div className="mt-1 font-medium leading-6">{note.title}</div>
          <div className="mt-1 text-xs text-ink-400">验证变量：{note.test_variable}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="datetime-local"
            value={publishedAtInput}
            max={localDateTimeValue()}
            onChange={(event) => setPublishedAtInput(event.target.value)}
            disabled={reviewed}
            className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
            aria-label="实际发布时间"
          />
          <button
            className="rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-200 disabled:opacity-40"
            disabled={!!busyKey || reviewed}
            onClick={() => onPublish(publishedAtInput)}
          >
            {publishing ? "保存中..." : reviewed ? "发布时间已锁定" : published ? "修正发布时间" : "标记实际发布"}
          </button>
          <button
            className="rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-200"
            disabled={!published}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起数据" : reviewed ? "查看/修改复盘" : reviewReady ? "录入24小时数据" : "等待24小时"}
          </button>
        </div>
      </div>

      {published && (
        <div className="mt-3 border-t border-ink-100 pt-3 text-xs leading-5 text-ink-500">
          实际发布：{new Date(effectivePublishedAt(note)).toLocaleString("zh-CN")}
          {!reviewReady && <span className="ml-3 text-gold-700">距离正式复盘还有 {formatRemaining(availableAt - clock)}</span>}
        </div>
      )}

      {reviewed && review && (
        <div className="mt-3 grid gap-2 border-t border-ink-100 pt-3 text-xs leading-5 text-ink-700 md:grid-cols-3">
          <Field label="结果分类" value={CLASSIFICATION_LABELS[review.classification] ?? review.classification} />
          <Field label="样本状态" value={SAMPLE_STATUS_LABELS[review.sample?.status || "historical_unknown"]} />
          <Field label="下一篇只改一个变量" value={review.next_variable} />
        </div>
      )}

      {open && (
        <div className="mt-4 border-t border-ink-100 pt-4">
          {!reviewReady && (
            <div className="text-sm leading-6 text-ink-600">
              24小时数据口径还没到。到时系统会开放正式录入，避免用过早数据误判标题和方向。
            </div>
          )}
          {reviewReady && screenshotEnabled && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-full border border-gold-400 px-4 py-2 text-sm font-semibold text-gold-800">
                {extracting ? "识别中..." : "上传数据截图预填"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  disabled={!!busyKey}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []).slice(0, 6);
                    if (files.length) onScreenshots(files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <span className="text-xs text-ink-500">支持1–6张，识别结果只预填，确认后才保存。</span>
            </div>
          )}
          {reviewReady && screenshotExtraction && (
            <div className="mb-4 text-xs leading-5 text-ink-600">
              已识别 {Object.values(screenshotExtraction.confidence).filter((value) => value >= 0.72).length} 个高置信字段。
              {screenshotExtraction.warnings.length > 0 && ` 提醒：${screenshotExtraction.warnings.join("；")}`}
            </div>
          )}
          {reviewReady && (
            <>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-medium text-ink-500">笔记状态</label>
              <select
                value={form.note_status}
                onChange={(event) => manualChange({ note_status: event.target.value as ReviewFormState["note_status"] })}
                className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              >
                <option value="normal">正常</option>
                <option value="limited">限流</option>
                <option value="violation">违规</option>
                <option value="deleted">已删除</option>
              </select>
            </div>
            <label className="flex min-h-10 items-center gap-3 text-sm text-ink-700 md:self-end">
              <input
                type="checkbox"
                checked={form.promoted}
                onChange={(event) => manualChange({ promoted: event.target.checked })}
              />
              这篇使用过投流
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <NoteMetricInput label="曝光" name="impressions" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="观看" name="reads" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="平均观看时长（秒）" name="average_view_seconds" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="点赞" name="likes" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="收藏" name="saves" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="评论" name="comments" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="分享" name="shares" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="新增关注" name="follows" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <NoteMetricInput label="有效咨询（选填）" name="qualified_inquiries" form={form} onMetric={(name, value) => manualChange({ [name]: value })} />
            <div>
              <label className="mb-2 block text-xs font-medium text-ink-500">搜索词TOP5（截图选填）</label>
              <input
                value={form.search_keywords}
                onChange={(event) => manualChange({ search_keywords: event.target.value })}
                className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                placeholder="逗号分隔"
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              value={form.note_url}
              onChange={(event) => manualChange({ note_url: event.target.value })}
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              placeholder="笔记链接（选填）"
            />
            <input
              value={form.target_customer_quote}
              onChange={(event) => manualChange({ target_customer_quote: event.target.value })}
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              placeholder="目标客户原话或主要问题（选填）"
            />
          </div>
          {(form.traffic_sources || form.audience) && (
            <div className="mt-3 text-xs leading-5 text-ink-500">
              {form.traffic_sources && `流量来源：${Object.entries(form.traffic_sources).map(([key, value]) => `${key} ${value}%`).join("，")}`}
              {form.audience && <div>已确认受众截图数据，将用于判断目标人群匹配，不要求手工录入完整分布。</div>}
            </div>
          )}
          <button className="btn-primary mt-4" disabled={!!busyKey} onClick={onSubmit}>
            {reviewing ? "提交中..." : reviewed ? "更新复盘" : "提交复盘"}
          </button>
            </>
          )}
        </div>
      )}

      {reviewed && review && (
        <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 text-sm leading-6 text-ink-700 md:grid-cols-2">
          <Field label="标题与入口" value={review.entry_judgement} />
          <Field label="正文质量" value={review.body_judgement || review.value_judgement} />
          <Field label="转化与承接" value={review.conversion_judgement || review.follow_judgement} />
          <Field label="人群判断" value={review.audience_judgement} />
          <Field label="标题结构" value={review.entry_diagnosis?.title_pattern || "历史复盘未记录"} />
          <Field label="合规判断" value={review.compliance_judgement || "以发布前合规扫描为准"} />
        </div>
      )}
    </div>
  );
}

type NumericReviewField =
  | "impressions"
  | "reads"
  | "average_view_seconds"
  | "likes"
  | "saves"
  | "comments"
  | "shares"
  | "follows"
  | "qualified_inquiries";

function NoteMetricInput({
  label,
  name,
  form,
  onMetric,
}: {
  label: string;
  name: NumericReviewField;
  form: ReviewFormState;
  onMetric: (name: NumericReviewField, value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-ink-500">{label}</label>
      <input
        value={form[name]}
        onChange={(e) => onMetric(name, e.target.value)}
        inputMode={name === "average_view_seconds" ? "decimal" : "numeric"}
        className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
        placeholder="0"
      />
    </div>
  );
}

function DirectionAggregateCard({ agg }: { agg: DirectionAggregate }) {
  return (
    <div className="rounded-2xl border border-ink-100 p-4 text-sm leading-6 text-ink-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-semibold text-ink-900">{agg.label || DIRECTION_LABELS[agg.direction] || agg.direction}</div>
        <span className="text-xs font-semibold text-gold-700">{WEEKLY_ACTION_LABELS[agg.action || "explore"]}</span>
      </div>
      <div className="text-xs text-ink-500">
        近7天 {agg.recent_7d_count ?? 0} 篇 · 近28天有效 {agg.valid_count ?? 0} 篇
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
        <div>点击率中位数：{((agg.median_ctr ?? 0) * 100).toFixed(1)}%</div>
        <div>观看时长：{(agg.median_average_view_seconds ?? 0).toFixed(1)}秒</div>
        <div>收藏率：{((agg.median_save_rate ?? agg.avg_save_rate) * 100).toFixed(1)}%</div>
        <div>分享率：{((agg.median_share_rate ?? 0) * 100).toFixed(1)}%</div>
        <div>涨粉率：{((agg.median_follow_rate ?? 0) * 100).toFixed(1)}%</div>
        <div>咨询率：{((agg.median_inquiry_rate ?? 0) * 100).toFixed(1)}%</div>
      </div>
    </div>
  );
}

function CopyButton({
  text,
  label = "一键复制",
  className = "",
  disabled = false,
  onCopied,
  onCopyFailed,
}: {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  onCopied?: (label: string) => void;
  onCopyFailed?: (label: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      onCopied?.(label);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      onCopyFailed?.(label);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled}
      className={"rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-40 " + className}
    >
      {copied ? "已复制 ✓" : label}
    </button>
  );
}

function ComplianceStatus({ draft }: { draft: ContentDraft }) {
  const compliance = complianceView(draft);
  if (compliance.status === "passed") {
    return <div className="mt-2 text-xs font-medium text-emerald-700">互动合规检查通过</div>;
  }
  if (compliance.status === "rewritten") {
    return (
      <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        已自动移除诱导互动表达，当前复制内容已更新。
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
      <div className="font-semibold">互动合规未通过，已禁止选定和复制。</div>
      {compliance.issues.slice(0, 2).map((issue) => (
        <div key={issue}>· {issue}</div>
      ))}
    </div>
  );
}

function BuyerCCoverPreview({
  cover,
  draft,
  account,
}: {
  cover: GeneratedCover;
  draft: ContentDraft;
  account: GrowthAccount | null;
}) {
  const overlay = resolveCoverOverlay(cover, draft, account);
  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-100">
      <NextImage
        src={cover.imageDataUrl!}
        alt={`${draft.title}-${cover.variant}`}
        fill
        unoptimized
        className="object-cover"
      />

      <div
        className="absolute left-[13%] right-[13%] top-[9%] rounded-sm px-2 py-1.5 text-center text-[9px] font-extrabold tracking-wide text-white shadow-lg md:text-xs"
        style={{ backgroundColor: overlay.accentColor }}
      >
        {overlay.venueBanner}
      </div>
      <div className="absolute right-[6%] top-[17%] max-w-[44%] rounded-sm bg-white/90 px-2 py-1 text-right text-[8px] font-black leading-tight shadow md:text-[10px]" style={{ color: overlay.accentColor }}>
        {overlay.companyLine}
      </div>

      <div className="absolute left-[7%] top-[27%] w-[72%] -rotate-[4deg] overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="h-1.5" style={{ backgroundColor: overlay.accentColor }} />
        <div className="p-2.5 md:p-3">
          <div className="text-[9px] font-extrabold text-slate-800 md:text-xs">{overlay.emailSender}</div>
          <div className="text-[7px] text-slate-400 md:text-[9px]">recruiting@••••••.com</div>
          <div className="mt-1.5 border-b border-slate-200 pb-1.5 text-[10px] font-black md:text-sm" style={{ color: overlay.accentColor }}>
            {overlay.emailSubject}
          </div>
          <div className="mt-1.5 space-y-0.5 text-[7px] leading-tight text-slate-600 md:text-[9px]">
            {overlay.emailRows.map((row) => <div key={row}>{row}</div>)}
          </div>
          <div className="mt-1.5 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[6px] font-bold text-slate-500 md:text-[8px]">
            关键内容已隐去
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65" />
      <div className="absolute left-3 top-3 rounded bg-black/75 px-2 py-1 text-[8px] font-bold text-white md:text-[10px]">
        {overlay.disclosure}
      </div>
      <div className="absolute inset-x-[6%] bottom-[7%] space-y-1.5">
        {overlay.headlineLines.map((line) => (
          <div key={line} className="w-fit max-w-full">
            <span
              className="box-decoration-clone px-1 text-2xl font-black leading-tight md:text-3xl"
              style={{
                color: "#f04a23",
                background: "linear-gradient(to bottom, transparent 0 55%, #fde047 55% 100%)",
                WebkitTextStroke: "2px white",
                paintOrder: "stroke fill",
                textShadow: "0 2px 3px rgba(0,0,0,0.55)",
              }}
            >
              {line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({
  step,
  title,
  desc,
  children,
}: {
  step: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-white">{step}</div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="mt-1 text-xs leading-5 text-ink-500">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-400">{label}</div>
      <div className="mt-1 leading-6 text-ink-800">{value}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}

function EditArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm leading-6" />
    </div>
  );
}
