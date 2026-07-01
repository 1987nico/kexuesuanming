"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CoverBrief } from "@/lib/growth/coverBrief";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthRun,
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

interface CoverResult {
  variant: string;
  brief: CoverBrief;
  imageDataUrl?: string;
  imageError?: string;
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
  const [accountForm, setAccountForm] = useState<AccountForm | null>(null);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [variants, setVariants] = useState<ContentDraft[]>([]);
  const [chosenDraft, setChosenDraft] = useState<ContentDraft | null>(null);

  const [covers, setCovers] = useState<CoverResult[]>([]);
  const [coverNote, setCoverNote] = useState("");

  const [reviewForm, setReviewForm] = useState<ReviewFormState>(emptyReviewForm);
  const [latestReview, setLatestReview] = useState<GrowthReview | null>(null);

  const loadWorkspace = useCallback(async (p: GrowthPersona) => {
    const res = await fetch(`/api/growth/bootstrap?persona=${p}`, { cache: "no-store" });
    const data = await res.json();
    const run: GrowthRun | null = (data.runs && data.runs[0]) || null;
    setState({ account: data.account ?? null, plan: data.plan ?? null, run, drafts: data.drafts ?? [] });
    setAccountForm(data.account ? toAccountForm(data.account) : null);
    setEditing(false);
    setChosenDraft((data.drafts && data.drafts[0]) || run?.draft || null);
    setVariants([]);
    setSelectedTopicId(run?.selected_topic?.id ?? null);
    setCovers([]);
    setLatestReview(run?.review ?? null);
  }, []);

  useEffect(() => {
    loadWorkspace(persona).catch((error) => setMessage((error as Error).message));
  }, [persona, loadWorkspace]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
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

  async function createAccount() {
    await run("创建账号定位卡", async () => {
      const res = await fetch("/api/growth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona, accountName: `面霸君 · ${GROWTH_PERSONA_LABELS[persona]}` }),
      });
      if (!res.ok) throw new Error("创建账号定位卡失败");
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
      setCovers([]);
    });
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
    });
  }

  async function loadWorkspaceKeepChosen(draft: ContentDraft) {
    const res = await fetch(`/api/growth/bootstrap?persona=${persona}`, { cache: "no-store" });
    const data = await res.json();
    const run2: GrowthRun | null = (data.runs && data.runs[0]) || null;
    setState({ account: data.account ?? null, plan: data.plan ?? null, run: run2, drafts: data.drafts ?? [] });
    setChosenDraft(draft);
  }

  async function generateCovers() {
    if (!chosenDraft) return;
    await run("生成 2 幅封面", async () => {
      const res = await fetch("/api/growth/covers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: chosenDraft.title,
          body: chosenDraft.body,
          coverText: chosenDraft.cover_text,
          targetUser: chosenDraft.target_user,
          contentType: chosenDraft.content_type,
          testVariable: chosenDraft.test_variable,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成封面失败");
      setCovers(data.covers || []);
      setCoverNote(data.imageProviderConfigured ? "" : "未配置 OPENAI_API_KEY，当前仅生成封面文案与文生图 Prompt。");
    });
  }

  async function markPublished() {
    if (!chosenDraft) return;
    await run("标记已发布", async () => {
      const res = await fetch(`/api/growth/drafts/${chosenDraft.id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error("标记发布失败");
      await loadWorkspaceKeepChosen({ ...chosenDraft, status: "published" });
    });
  }

  async function submitReview() {
    if (!chosenDraft) return;
    await run("提交复盘", async () => {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(reviewForm)) {
        if (!value.trim()) continue;
        if (key === "comment_keywords") {
          payload[key] = value.split(/[,，\n]/).map((s: string) => s.trim()).filter(Boolean);
        } else {
          payload[key] = Number(value);
        }
      }
      const res = await fetch(`/api/growth/drafts/${chosenDraft.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "提交复盘失败");
      setLatestReview(data.review);
    });
  }

  const account = state.account;
  const topicPool = state.run?.topic_pool ?? [];

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs uppercase tracking-[0.35em] text-gold-700">Xiaohongshu Notes</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">小红书笔记</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            账号定位卡 → 选题 → 正文 → 封面 → 复盘。人工确认后复制发布，系统不自动发帖。
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
            <button className="btn-primary mt-4" disabled={!!busy} onClick={createAccount}>
              生成账号定位卡
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
              <button className="btn-primary" disabled={!!busy} onClick={saveAccount}>保存</button>
              <button className="rounded-full bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700" onClick={() => { setEditing(false); setAccountForm(toAccountForm(account)); }}>取消</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm leading-6 text-ink-700">
            {account.one_liner && <Field label="一句话定位" value={account.one_liner} />}
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
            <div className="flex flex-wrap gap-3 pt-2">
              <button className="btn-primary" onClick={() => { setAccountForm(toAccountForm(account)); setEditing(true); }}>编辑定位卡</button>
              <button className="rounded-full bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700" disabled={!!busy} onClick={createAccount}>AI 重新生成</button>
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
                  <span>方向 {topic.direction}</span>
                  <span>{topic.content_type}</span>
                </div>
                <div className="font-medium leading-6">{topic.title}</div>
                <p className="mt-1 text-xs leading-5 text-ink-500">验证变量：{topic.test_variable}</p>
                <button
                  className="btn-primary mt-3"
                  disabled={!!busy}
                  onClick={() => generateVariants(topic)}
                >
                  用这个选题写正文
                </button>
              </div>
            ))}
          </div>
        )}
      </StepCard>

      {/* Step 3 正文 */}
      <StepCard step="3" title="正文" desc="按选题生成 2 篇，二选一；每点一次生成 2 篇新的、不重复。">
        {variants.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {variants.map((draft, index) => (
              <div key={draft.id} className="rounded-2xl border border-ink-100 p-4">
                <div className="mb-2 text-xs text-gold-700">方案 {index + 1}</div>
                <div className="font-medium leading-6">{draft.title}</div>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-3 text-xs leading-6 text-ink-700">{draft.body}</pre>
                <div className="mt-2 text-xs text-ink-500">字数：{draft.word_count.total} / {draft.word_count.within_limit ? "≤1000 通过" : "超限"}</div>
                <button className="btn-primary mt-3" disabled={!!busy} onClick={() => chooseDraft(draft)}>选这篇</button>
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
            再生成 2 篇新的
          </button>
        )}
        {chosenDraft && variants.length === 0 && (
          <div className="rounded-2xl border border-gold-300 bg-gold-50/40 p-4">
            <div className="mb-2 text-xs text-gold-700">已选定正文（状态：{chosenDraft.status}）</div>
            <div className="font-medium leading-6">{chosenDraft.title}</div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-7 text-ink-800">{chosenDraft.body}{"\n\n"}{chosenDraft.hashtags.join(" ")}</pre>
          </div>
        )}
        {variants.length === 0 && !chosenDraft && (
          <p className="text-sm leading-6 text-ink-600">先在第 2 步选一个题，点「用这个选题写正文」。</p>
        )}
      </StepCard>

      {/* Step 4 封面 */}
      <StepCard step="4" title="封面" desc="根据选定标题和正文生成 2 幅封面；每点一次生成 2 幅新的。">
        <button className="btn-primary" disabled={!!busy || !chosenDraft} onClick={generateCovers}>
          {busy === "生成 2 幅封面" ? "生成中..." : "生成 2 幅封面"}
        </button>
        {coverNote && <p className="mt-3 text-xs leading-5 text-gold-700">{coverNote}</p>}
        {covers.length > 0 && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {covers.map((cover, index) => (
              <div key={index} className="rounded-2xl border border-ink-100 p-4">
                <div className="mb-2 text-xs text-gold-700">封面 {index + 1} · {cover.variant}</div>
                {cover.imageDataUrl ? (
                  <div
                    aria-label="AI 封面"
                    className="aspect-[2/3] w-full rounded-xl bg-cover bg-center"
                    style={{ backgroundImage: `url(${cover.imageDataUrl})` }}
                  />
                ) : (
                  <div className="rounded-xl bg-ink-50 p-4 text-sm leading-6 text-ink-700">
                    <div className="font-medium text-ink-900">封面句：{cover.brief.coverText}</div>
                    <p className="mt-2 text-xs text-ink-500">{cover.brief.scene}</p>
                    <p className="mt-2 text-xs text-ink-500">Prompt：{cover.brief.imagePrompt}</p>
                    {cover.imageError && <p className="mt-2 text-xs text-red-500">生图失败：{cover.imageError}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </StepCard>

      {/* Step 5 复盘 */}
      <StepCard step="5" title="复盘" desc="人工发布后回填数据，系统生成分类和下一步建议。">
        <div className="mb-4 rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-600">
          扫码登录网页版小红书 + 后台自动抓数据：即将上线。当前先手动/截图回填下面的数据。
          {chosenDraft && (
            <button className="btn-primary mt-3" disabled={!!busy || chosenDraft.status === "published" || chosenDraft.status === "reviewed"} onClick={markPublished}>
              {chosenDraft.status === "published" || chosenDraft.status === "reviewed" ? "已标记发布" : "标记为已发布"}
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <MetricInput label="曝光" name="impressions" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="阅读" name="reads" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="点赞" name="likes" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="收藏" name="saves" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="评论" name="comments" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="分享" name="shares" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="主页访问" name="profile_visits" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="新增关注" name="follows" form={reviewForm} setForm={setReviewForm} />
          <MetricInput label="私信线索" name="private_messages" form={reviewForm} setForm={setReviewForm} />
          <div>
            <label className="mb-2 block text-xs font-medium text-ink-500">评论关键词</label>
            <input
              value={reviewForm.comment_keywords}
              onChange={(e) => setReviewForm((c) => ({ ...c, comment_keywords: e.target.value }))}
              className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
              placeholder="逗号分隔"
            />
          </div>
        </div>
        <button className="btn-primary mt-4" disabled={!!busy || !chosenDraft} onClick={submitReview}>提交复盘</button>
        {latestReview && (
          <div className="mt-5 grid gap-3 rounded-2xl bg-ink-50 p-4 text-sm leading-6 text-ink-700 md:grid-cols-2">
            <Field label="结果分类" value={latestReview.classification} />
            <Field label="下一篇只改一个变量" value={latestReview.next_variable} />
            <Field label="入口判断" value={latestReview.entry_judgement} />
            <Field label="价值判断" value={latestReview.value_judgement} />
            <Field label="关注判断" value={latestReview.follow_judgement} />
            <Field label="人群判断" value={latestReview.audience_judgement} />
          </div>
        )}
      </StepCard>
    </main>
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

function MetricInput({
  label,
  name,
  form,
  setForm,
}: {
  label: string;
  name: keyof ReviewFormState;
  form: ReviewFormState;
  setForm: Dispatch<SetStateAction<ReviewFormState>>;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-ink-500">{label}</label>
      <input
        type="number"
        min="0"
        value={form[name] || ""}
        onChange={(e) => setForm((c) => ({ ...c, [name]: e.target.value }))}
        className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}
