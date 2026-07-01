"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ContentDraft,
  DirectionAggregate,
  GrowthAccount,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthReviewMetrics,
  GrowthRun,
  StageReviewResult,
  TopicCandidate,
} from "@/lib/growth/types";
import { GROWTH_PERSONA_LABELS, GROWTH_PERSONAS, PERSONA_SPECIFIC_FIELDS } from "@/lib/growth/types";

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

interface ReviewFormState {
  impressions: string;
  reads: string;
  likes: string;
  saves: string;
  comments: string;
  shares: string;
  profile_visits: string;
  follows: string;
  private_messages: string;
  comment_keywords: string;
}

const DIRECTION_LABELS: Record<string, string> = {
  A: "痛点诊断",
  B: "工具清单",
  C: "故事过程",
};

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
  scale: "明确放大",
  retest: "值得二测",
  weak_entry: "入口弱",
  weak_conversion: "承接弱",
  wrong_audience: "人群跑偏",
  pause: "暂停",
};

const emptyReviewForm: ReviewFormState = {
  impressions: "",
  reads: "",
  likes: "",
  saves: "",
  comments: "",
  shares: "",
  profile_visits: "",
  follows: "",
  private_messages: "",
  comment_keywords: "",
};

function num(value?: number) {
  return typeof value === "number" ? String(value) : "";
}

function metricsToForm(metrics?: GrowthReviewMetrics): ReviewFormState {
  if (!metrics) return { ...emptyReviewForm };
  return {
    impressions: num(metrics.impressions),
    reads: num(metrics.reads),
    likes: num(metrics.likes),
    saves: num(metrics.saves),
    comments: num(metrics.comments),
    shares: num(metrics.shares),
    profile_visits: num(metrics.profile_visits),
    follows: num(metrics.follows),
    private_messages: num(metrics.private_messages),
    comment_keywords: (metrics.comment_keywords ?? []).join("，"),
  };
}

function formToMetricsPayload(form: ReviewFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form) as [keyof ReviewFormState, string][]) {
    if (!value.trim()) continue;
    if (key === "comment_keywords") {
      payload[key] = value.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    } else {
      payload[key] = Number(value);
    }
  }
  return payload;
}

function toAccountForm(account: GrowthAccount): AccountForm {
  const personaSpecific: Record<string, string> = {};
  for (const field of PERSONA_SPECIFIC_FIELDS[account.persona]) {
    personaSpecific[field.key] = account.persona_specific?.[field.key] ?? "";
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

function splitList(value: string, sep: RegExp) {
  return value.split(sep).map((s) => s.trim()).filter(Boolean);
}

export default function XiaohongshuNotesPage() {
  const [persona, setPersona] = useState<GrowthPersona>("merchant");
  const [state, setState] = useState<WorkspaceState>({ account: null, plan: null, run: null, drafts: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const [editing, setEditing] = useState(false);
  const [accountCardOpen, setAccountCardOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm | null>(null);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [variants, setVariants] = useState<ContentDraft[]>([]);
  const [chosenDraft, setChosenDraft] = useState<ContentDraft | null>(null);

  // 以笔记为单元：每篇笔记各自的复盘结果与回填表单
  const [reviews, setReviews] = useState<Record<string, GrowthReview>>({});
  const [metricsByDraft, setMetricsByDraft] = useState<Record<string, ReviewFormState>>({});
  const [stageResult, setStageResult] = useState<StageReviewResult | null>(null);

  const applyReviews = useCallback((reviewMap: Record<string, GrowthReview>, drafts: ContentDraft[]) => {
    setReviews(reviewMap);
    const forms: Record<string, ReviewFormState> = {};
    for (const draft of drafts) {
      forms[draft.id] = metricsToForm(reviewMap[draft.id]?.metrics);
    }
    setMetricsByDraft(forms);
  }, []);

  const loadWorkspace = useCallback(
    async (p: GrowthPersona) => {
      const res = await fetch(`/api/growth/bootstrap?persona=${p}`, { cache: "no-store" });
      const data = await res.json();
      const run: GrowthRun | null = (data.runs && data.runs[0]) || null;
      const drafts: ContentDraft[] = data.drafts ?? [];
      setState({ account: data.account ?? null, plan: data.plan ?? null, run, drafts });
      setAccountForm(data.account ? toAccountForm(data.account) : null);
      setEditing(false);
      setAccountCardOpen(false);
      setChosenDraft(drafts[0] || run?.draft || null);
      setVariants([]);
      setSelectedTopicId(run?.selected_topic?.id ?? null);
      applyReviews((data.reviews ?? {}) as Record<string, GrowthReview>, drafts);
      setStageResult(null);
    },
    [applyReviews]
  );

  useEffect(() => {
    loadWorkspace(persona).catch((error) => setMessage((error as Error).message));
  }, [persona, loadWorkspace]);

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
          accountName: state.account?.name || `面霸君 · ${GROWTH_PERSONA_LABELS[persona]}`,
          ...(regenerate && state.account ? { regenerateAccountId: state.account.id } : {}),
        }),
      });
      if (!res.ok) throw new Error("生成定位卡失败");
      await loadWorkspace(persona);
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
      await loadWorkspace(persona);
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
      await loadWorkspaceKeepChosen(data.draft);
    }, `选正文:${draft.id}`);
  }

  async function loadWorkspaceKeepChosen(draft: ContentDraft) {
    const res = await fetch(`/api/growth/bootstrap?persona=${persona}`, { cache: "no-store" });
    const data = await res.json();
    const run2: GrowthRun | null = (data.runs && data.runs[0]) || null;
    const drafts: ContentDraft[] = data.drafts ?? [];
    setState({ account: data.account ?? null, plan: data.plan ?? null, run: run2, drafts });
    setChosenDraft(draft);
    applyReviews((data.reviews ?? {}) as Record<string, GrowthReview>, drafts);
  }

  async function markPublishedNote(draft: ContentDraft) {
    await run("标记已发布", async () => {
      const res = await fetch(`/api/growth/drafts/${draft.id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error("标记发布失败");
      await loadWorkspaceKeepChosen(chosenDraft ?? draft);
    }, `发布:${draft.id}`);
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
      await loadWorkspaceKeepChosen(chosenDraft ?? draft);
    }, `复盘:${draft.id}`);
  }

  function setNoteMetric(draftId: string, name: keyof ReviewFormState, value: string) {
    setMetricsByDraft((prev) => ({
      ...prev,
      [draftId]: { ...(prev[draftId] ?? emptyReviewForm), [name]: value },
    }));
  }

  async function generateStageReview() {
    if (!account) return;
    await run("生成阶段复盘", async () => {
      const res = await fetch("/api/growth/stage-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成阶段复盘失败");
      setStageResult(data.result);
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
            账号定位卡 → 选题 → 正文 → 单篇复盘 → 阶段复盘。人工确认后复制发布，系统不自动发帖。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">
            返回首页
          </a>
          <div className="rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-sm">
            {message || "就绪"}
          </div>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {GROWTH_PERSONAS.map((p) => (
          <button
            key={p}
            onClick={() => setPersona(p)}
            className={
              "rounded-full px-5 py-2 text-sm font-semibold transition " +
              (persona === p ? "bg-ink-900 text-white" : "bg-white text-ink-600 shadow-sm")
            }
          >
            {GROWTH_PERSONA_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Step 1 账号定位卡 */}
      <StepCard step="1" title="账号定位卡" desc="可编辑，随时调整目标用户、核心问题和账号价值。">
        {!account ? (
          <div>
            <p className="text-sm leading-6 text-ink-600">
              当前视角「{GROWTH_PERSONA_LABELS[persona]}」还没有定位卡。
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
            {PERSONA_SPECIFIC_FIELDS[persona].map((field) => (
              <EditField
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
            ))}

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
                  PERSONA_SPECIFIC_FIELDS[persona].map((field) =>
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
      <StepCard step="2" title="选题" desc="每点一次换成 2 个新选题（不与历史重复）；选一个进入正文。">
        <button className="btn-primary" disabled={!!busy || !account} onClick={addTopics}>
          {busy === "生成 2 个选题" ? "生成中..." : "生成 2 个选题"}
        </button>
        {topicPool.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {topicPool.map((topic) => (
              <div
                key={topic.id}
                className={
                  "rounded-2xl border p-4 " +
                  (selectedTopicId === topic.id ? "border-gold-400 bg-gold-50/50" : "border-ink-100")
                }
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-ink-500">
                  <span>方向 {topic.direction} · {DIRECTION_LABELS[topic.direction] ?? ""}</span>
                  <span>·</span>
                  <span>{CONTENT_TYPE_LABELS[topic.content_type] ?? topic.content_type}</span>
                </div>
                <div className="font-medium leading-6">{topic.title}</div>
                <p className="mt-1 text-xs leading-5 text-ink-500">验证变量：{topic.test_variable}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={!!busy} onClick={() => generateVariants(topic)}>
                    {busy === `生成正文:${topic.id}` ? "生成中..." : "用这个选题写正文"}
                  </button>
                  <CopyButton text={topic.title} label="复制标题" />
                </div>
              </div>
            ))}
          </div>
        )}
      </StepCard>

      {/* Step 3 正文 */}
      <StepCard step="3" title="正文" desc="按选题生成一短一长两篇，二选一；每点一次生成 2 篇新的、不重复。">
        {variants.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {variants.map((draft, index) => (
              <div key={draft.id} className="rounded-2xl border border-ink-100 p-4">
                <div className="mb-2 text-xs text-gold-700">方案 {index + 1} · {index === 0 ? "精简版" : "深度长文"}（{draft.word_count.total} 字）</div>
                <div className="font-medium leading-6">{draft.title}</div>
                {(persona === "buyer" || draft.story_mode || draft.pictorial_rate) && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                      模式：{draft.story_mode || "本批未返回，请重新生成正文"}
                    </span>
                    <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                      画面率：{draft.pictorial_rate || "本批未返回"}
                    </span>
                  </div>
                )}
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-3 text-xs leading-6 text-ink-700">{draft.body}</pre>
                <div className="mt-2 text-xs text-ink-500">字数：{draft.word_count.total} / {draft.word_count.within_limit ? "≤1000 通过" : "超限"}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={!!busy} onClick={() => chooseDraft(draft)}>
                    {busy === `选正文:${draft.id}` ? "选定中..." : "选这篇"}
                  </button>
                  <CopyButton text={draft.title} label="复制标题" />
                  <CopyButton text={`${draft.body}\n\n${draft.hashtags.join(" ")}`} label="复制正文+话题" />
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
            {(persona === "buyer" || chosenDraft.story_mode || chosenDraft.pictorial_rate) && (
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                  模式：{chosenDraft.story_mode || "本批未返回，请重新生成正文"}
                </span>
                <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                  画面率：{chosenDraft.pictorial_rate || "本批未返回"}
                </span>
              </div>
            )}
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-7 text-ink-800">{chosenDraft.body}{"\n\n"}{chosenDraft.hashtags.join(" ")}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={chosenDraft.title} label="复制标题" />
              <CopyButton text={`${chosenDraft.body}\n\n${chosenDraft.hashtags.join(" ")}`} label="复制正文+话题" />
              <CopyButton text={chosenDraft.hashtags.join(" ")} label="复制话题" />
            </div>
            {(chosenDraft.cover_text || chosenDraft.cover_suggestion) && (
              <div className="mt-4 rounded-xl bg-white/70 p-3 text-sm leading-6 text-ink-700">
                <div className="mb-1 text-xs font-medium text-gold-700">封面文案（自己做图时参考）</div>
                {chosenDraft.cover_text && <div>封面句：{chosenDraft.cover_text}</div>}
                {chosenDraft.cover_suggestion && <div className="mt-1 text-xs text-ink-500">画面建议：{chosenDraft.cover_suggestion}</div>}
                {chosenDraft.cover_text && (
                  <div className="mt-2">
                    <CopyButton text={chosenDraft.cover_text} label="复制封面句" />
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
      <StepCard step="4" title="单篇复盘" desc="每篇笔记都是一个独立单元：逐篇标记发布、回填数据、生成单篇结论。下面列出这个账号的所有笔记。">
        <div className="mb-4 rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-4 text-xs leading-6 text-ink-600">
          扫码登录网页版小红书 + 后台自动抓数据：属于后续增强，且需账号主本人扫码授权、有平台风险。当前先按笔记手动/截图回填。
        </div>
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
                onMetric={(name, value) => setNoteMetric(note.id, name, value)}
                onPublish={() => markPublishedNote(note)}
                onSubmit={() => submitReviewNote(note)}
              />
            ))}
          </div>
        )}
      </StepCard>

      {/* Step 5 阶段复盘（跨笔记做方向决策） */}
      <StepCard step="5" title="阶段复盘" desc="把多篇笔记按方向汇总，判断哪个方向值得放大、哪个该暂停。不靠单篇爆款下结论。">
        <button className="btn-primary" disabled={!!busy || !account} onClick={generateStageReview}>
          {busy === "生成阶段复盘" ? "生成中..." : "生成阶段复盘 / 方向决策"}
        </button>
        {stageResult && (
          <div className="mt-5 space-y-4">
            <div className="text-xs text-ink-500">
              共 {stageResult.note_total} 篇笔记，已复盘 {stageResult.reviewed_total} 篇。
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {stageResult.by_direction.map((agg) => (
                <DirectionAggregateCard key={agg.direction} agg={agg} />
              ))}
            </div>
            <div className="grid gap-3 rounded-2xl bg-gold-50/50 p-4 text-sm leading-6 text-ink-700 md:grid-cols-2">
              <Field label="建议放大的方向" value={stageResult.decision.scale_direction} />
              <Field label="建议暂停/降权的方向" value={stageResult.decision.pause_direction} />
              <Field label="下一阶段主攻" value={stageResult.decision.next_focus} />
              <Field label="可复用模板" value={stageResult.decision.reusable_pattern} />
              <div className="md:col-span-2">
                <Field label="阶段结论" value={stageResult.decision.summary} />
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
  onMetric,
  onPublish,
  onSubmit,
}: {
  note: ContentDraft;
  review?: GrowthReview;
  form: ReviewFormState;
  busyKey: string;
  onMetric: (name: keyof ReviewFormState, value: string) => void;
  onPublish: () => void;
  onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const published = note.status === "published" || note.status === "reviewed";
  const reviewed = note.status === "reviewed" && !!review;
  const publishing = busyKey === `发布:${note.id}`;
  const reviewing = busyKey === `复盘:${note.id}`;

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
          <button
            className="rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-200 disabled:opacity-40"
            disabled={!!busyKey || published}
            onClick={onPublish}
          >
            {publishing ? "标记中..." : published ? "已发布" : "标记为已发布"}
          </button>
          <button
            className="rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-200"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起数据" : reviewed ? "查看/修改数据" : "回填数据"}
          </button>
        </div>
      </div>

      {reviewed && review && (
        <div className="mt-3 grid gap-2 rounded-xl bg-ink-50 p-3 text-xs leading-5 text-ink-700 md:grid-cols-2">
          <Field label="结果分类" value={CLASSIFICATION_LABELS[review.classification] ?? review.classification} />
          <Field label="下一篇只改一个变量" value={review.next_variable} />
        </div>
      )}

      {open && (
        <div className="mt-4">
          <div className="grid gap-3 md:grid-cols-5">
            <NoteMetricInput label="曝光" name="impressions" form={form} onMetric={onMetric} />
            <NoteMetricInput label="阅读" name="reads" form={form} onMetric={onMetric} />
            <NoteMetricInput label="点赞" name="likes" form={form} onMetric={onMetric} />
            <NoteMetricInput label="收藏" name="saves" form={form} onMetric={onMetric} />
            <NoteMetricInput label="评论" name="comments" form={form} onMetric={onMetric} />
            <NoteMetricInput label="分享" name="shares" form={form} onMetric={onMetric} />
            <NoteMetricInput label="主页访问" name="profile_visits" form={form} onMetric={onMetric} />
            <NoteMetricInput label="新增关注" name="follows" form={form} onMetric={onMetric} />
            <NoteMetricInput label="私信线索" name="private_messages" form={form} onMetric={onMetric} />
            <div>
              <label className="mb-2 block text-xs font-medium text-ink-500">评论关键词</label>
              <input
                value={form.comment_keywords}
                onChange={(e) => onMetric("comment_keywords", e.target.value)}
                className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                placeholder="逗号分隔"
              />
            </div>
          </div>
          <button className="btn-primary mt-4" disabled={!!busyKey} onClick={onSubmit}>
            {reviewing ? "提交中..." : reviewed ? "更新复盘" : "提交复盘"}
          </button>
        </div>
      )}

      {reviewed && review && (
        <div className="mt-4 grid gap-2 rounded-2xl bg-ink-50 p-4 text-sm leading-6 text-ink-700 md:grid-cols-2">
          <Field label="入口判断" value={review.entry_judgement} />
          <Field label="价值判断" value={review.value_judgement} />
          <Field label="关注判断" value={review.follow_judgement} />
          <Field label="人群判断" value={review.audience_judgement} />
        </div>
      )}
    </div>
  );
}

function NoteMetricInput({
  label,
  name,
  form,
  onMetric,
}: {
  label: string;
  name: keyof ReviewFormState;
  form: ReviewFormState;
  onMetric: (name: keyof ReviewFormState, value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-ink-500">{label}</label>
      <input
        value={form[name]}
        onChange={(e) => onMetric(name, e.target.value)}
        inputMode="numeric"
        className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
        placeholder="0"
      />
    </div>
  );
}

function DirectionAggregateCard({ agg }: { agg: DirectionAggregate }) {
  return (
    <div className="rounded-2xl border border-ink-100 p-4 text-sm leading-6 text-ink-700">
      <div className="mb-2 font-semibold text-ink-900">{DIRECTION_LABELS[agg.direction] ?? agg.direction}</div>
      <div className="text-xs text-ink-500">发布 {agg.note_count} 篇 · 已复盘 {agg.reviewed_count} 篇</div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
        <div>收藏率：{(agg.avg_save_rate * 100).toFixed(1)}%</div>
        <div>评论率：{(agg.avg_comment_rate * 100).toFixed(1)}%</div>
        <div>累计收藏：{agg.total_saves}</div>
        <div>累计关注：{agg.total_follows}</div>
      </div>
    </div>
  );
}

function CopyButton({ text, label = "一键复制", className = "" }: { text: string; label?: string; className?: string }) {
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
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={"rounded-full bg-ink-100 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-200 " + className}
    >
      {copied ? "已复制 ✓" : label}
    </button>
  );
}

function StepCard({ step, title, desc, children }: { step: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-white">{step}</div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-ink-500">{desc}</p>
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

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm" />
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

