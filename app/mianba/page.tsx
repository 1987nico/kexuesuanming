"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { CoverBrief } from "@/lib/growth/coverBrief";
import type { ContentDraft, GrowthAccount, GrowthPlan, GrowthReview, GrowthRun } from "@/lib/growth/types";
import type { TitleScoreResult } from "@/lib/growth/titleScore";

interface BootstrapState {
  account: GrowthAccount | null;
  plan: GrowthPlan | null;
  runs: GrowthRun[];
  drafts: ContentDraft[];
}

const emptyState: BootstrapState = {
  account: null,
  plan: null,
  runs: [],
  drafts: [],
};

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

export default function MianbaWorkspacePage() {
  const [state, setState] = useState<BootstrapState>(emptyState);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [week, setWeek] = useState(1);
  const [recentSignals, setRecentSignals] = useState("");
  const [titleScore, setTitleScore] = useState<TitleScoreResult | null>(null);
  const [scoringTitle, setScoringTitle] = useState(false);
  const [coverBrief, setCoverBrief] = useState<CoverBrief | null>(null);
  const [buildingCoverBrief, setBuildingCoverBrief] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [generatingCoverImage, setGeneratingCoverImage] = useState(false);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
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
  });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [latestReview, setLatestReview] = useState<GrowthReview | null>(null);

  const latestRun = state.runs[0] ?? null;
  const latestDraft = state.drafts[0] ?? latestRun?.draft ?? null;
  const selectedTopic = useMemo(() => latestRun?.selected_topic ?? latestRun?.topic_pool?.[0], [latestRun]);

  async function refresh() {
    const res = await fetch("/api/growth/bootstrap", { cache: "no-store" });
    const data = await res.json();
    setState({
      account: data.account ?? null,
      plan: data.plan ?? null,
      runs: data.runs ?? [],
      drafts: data.drafts ?? [],
    });
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    setTitleScore(null);
    setCoverBrief(null);
    setCoverImageUrl(null);
    setLatestReview(null);
  }, [latestDraft?.id]);

  async function runAction(label: string, action: () => Promise<void>) {
    setLoading(true);
    setMessage(`${label}中...`);
    try {
      await action();
      await refresh();
      setMessage(`${label}完成`);
    } catch (error) {
      setMessage((error as Error).message || `${label}失败`);
    } finally {
      setLoading(false);
    }
  }

  async function bootstrap() {
    await runAction("创建账号定位卡", async () => {
      const res = await fetch("/api/growth/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountName: "面霸君",
          targetUser: "准备面试、转岗、跳槽、升职或重新判断职业方向的职场人",
          coreProblem: "如何用结构化测评报告和内容信任，把职场困惑用户转成咨询/报告客户",
          trustSource: "来自职业测评、报告交付、小红书内容增长和真实咨询案例。",
        }),
      });
      if (!res.ok) throw new Error("创建账号定位卡失败");
    });
  }

  async function createRun() {
    await runAction("生成今日题池", async () => {
      const res = await fetch("/api/growth/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: state.account?.id,
          planId: state.plan?.id,
          week,
          recentSignals: recentSignals.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("生成题池失败，请先创建账号定位卡");
    });
  }

  async function createDraft(topicId?: string) {
    if (!latestRun) return;
    await runAction("生成发布包", async () => {
      const res = await fetch(`/api/growth/runs/${latestRun.id}/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedTopicId: topicId }),
      });
      if (!res.ok) throw new Error("生成发布包失败");
    });
  }

  async function markPublished() {
    if (!latestDraft) return;
    await runAction("标记已发布", async () => {
      const res = await fetch(`/api/growth/drafts/${latestDraft.id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error("标记发布失败");
    });
  }

  async function scoreLatestTitle() {
    if (!latestDraft) return;
    setScoringTitle(true);
    setMessage("标题打分中...");
    try {
      const res = await fetch("/api/growth/title-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: latestDraft.title,
          targetUser: latestDraft.target_user,
          coreProblem: state.account?.core_problem,
          topic: latestRun?.selected_topic?.title ?? latestDraft.test_variable,
        }),
      });
      if (!res.ok) throw new Error("标题打分失败");
      const data = (await res.json()) as { score: TitleScoreResult };
      setTitleScore(data.score);
      setMessage("标题打分完成");
    } catch (error) {
      setMessage((error as Error).message || "标题打分失败");
    } finally {
      setScoringTitle(false);
    }
  }

  async function buildLatestCoverBrief() {
    if (!latestDraft) return;
    setBuildingCoverBrief(true);
    setMessage("生成封面 brief 中...");
    try {
      const res = await fetch("/api/growth/cover-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: latestDraft.title,
          coverText: latestDraft.cover_text,
          targetUser: latestDraft.target_user,
          contentType: latestDraft.content_type,
          testVariable: latestDraft.test_variable,
        }),
      });
      if (!res.ok) throw new Error("封面 brief 生成失败");
      const data = (await res.json()) as { brief: CoverBrief };
      setCoverBrief(data.brief);
      setMessage("封面 brief 生成完成");
    } catch (error) {
      setMessage((error as Error).message || "封面 brief 生成失败");
    } finally {
      setBuildingCoverBrief(false);
    }
  }

  async function generateCoverImage() {
    if (!coverBrief) return;
    setGeneratingCoverImage(true);
    setMessage("生成 AI 封面图中...");
    try {
      const res = await fetch("/api/growth/cover-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: coverBrief.imagePrompt,
          negativePrompt: coverBrief.negativePrompt,
          size: "1024x1536",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "AI 封面图生成失败");
      setCoverImageUrl(data.image?.imageDataUrl || null);
      setMessage("AI 封面图生成完成");
    } catch (error) {
      setMessage((error as Error).message || "AI 封面图生成失败");
    } finally {
      setGeneratingCoverImage(false);
    }
  }

  async function submitReview() {
    if (!latestDraft) return;
    setSubmittingReview(true);
    setMessage("提交复盘数据中...");
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(reviewForm)) {
        if (!value.trim()) continue;
        if (key === "comment_keywords") {
          payload[key] = value
            .split(/[,，\n]/)
            .map((item: string) => item.trim())
            .filter(Boolean);
        } else {
          payload[key] = Number(value);
        }
      }
      const res = await fetch(`/api/growth/drafts/${latestDraft.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("提交复盘失败");
      const data = (await res.json()) as { review: GrowthReview };
      setLatestReview(data.review);
      await refresh();
      setMessage("复盘完成");
    } catch (error) {
      setMessage((error as Error).message || "提交复盘失败");
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs uppercase tracking-[0.35em] text-gold-700">Mianba Growth OS</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">面霸君系统</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            小红书 V3 起号实验后台。先跑账号定位卡和 30 天计划，再每天生成题池、发布包、人工发布并回填复盘。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports/new">
            新建测评
          </a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports">
            报告工作台
          </a>
          <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/orders">
            订单后台
          </a>
          <div className="rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-sm">
            {message || (state.account ? "系统已就绪" : "等待初始化")}
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card title="1. 账号定位卡" eyebrow="Foundation">
          {state.account ? (
            <div className="space-y-3 text-sm leading-6 text-ink-700">
              <Field label="目标用户" value={state.account.target_user} />
              <Field label="核心问题" value={state.account.core_problem} />
              <Field label="账号价值" value={state.account.account_value} />
            </div>
          ) : (
            <p className="text-sm leading-6 text-ink-600">首次启动会生成面霸君账号定位卡和 30 天实验计划。</p>
          )}
          <button className="btn-primary mt-5 w-full" disabled={loading} onClick={bootstrap}>
            {state.account ? "重新生成定位卡" : "创建定位卡"}
          </button>
        </Card>

        <Card title="2. 今日实验" eyebrow="Daily Run">
          <label className="mb-2 block text-xs font-medium text-ink-500">当前周</label>
          <select
            value={week}
            onChange={(event) => setWeek(Number(event.target.value))}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
          >
            <option value={1}>第 1 周：定位基线</option>
            <option value={2}>第 2 周：方向二测</option>
            <option value={3}>第 3 周：模板沉淀</option>
            <option value={4}>第 4 周：放大决策</option>
          </select>
          <label className="mb-2 block text-xs font-medium text-ink-500">最近复盘信号（可选）</label>
          <textarea
            value={recentSignals}
            onChange={(event) => setRecentSignals(event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
            placeholder="例如：工具型收藏高，但关注低；评论里出现中高层、第二曲线..."
          />
          <button className="btn-primary mt-5 w-full" disabled={loading || !state.account} onClick={createRun}>
            生成今日题池
          </button>
        </Card>

        <Card title="3. 发布包" eyebrow="Publish Pack">
          {selectedTopic ? (
            <div className="space-y-3 text-sm leading-6 text-ink-700">
              <Field label="推荐选题" value={selectedTopic.title} />
              <Field label="验证变量" value={selectedTopic.test_variable} />
              <Field label="预期信号" value={selectedTopic.expected_signal} />
            </div>
          ) : (
            <p className="text-sm leading-6 text-ink-600">生成题池后，选择 S 级候选题生成发布包。</p>
          )}
          <button className="btn-primary mt-5 w-full" disabled={loading || !latestRun} onClick={() => createDraft()}>
            生成发布包
          </button>
        </Card>
      </section>

      {state.plan && (
        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">30 天实验计划</h2>
          <div className="grid gap-3 md:grid-cols-4">
            {state.plan.weeks.map((item) => (
              <div key={item.week} className="rounded-2xl bg-ink-50 p-4">
                <div className="text-xs text-gold-700">Week {item.week}</div>
                <div className="mt-1 font-medium">{item.theme}</div>
                <p className="mt-2 text-xs leading-5 text-ink-600">{item.goal}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {latestRun && (
        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">候选题池</h2>
              <p className="mt-1 text-xs text-ink-500">{latestRun.objective}</p>
            </div>
            <span className="rounded-full bg-gold-50 px-3 py-1 text-xs text-gold-700">
              {latestRun.topic_pool.length} 个候选题
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {latestRun.topic_pool.slice(0, 9).map((topic) => (
              <button
                key={topic.id}
                onClick={() => createDraft(topic.id)}
                disabled={loading}
                className="rounded-2xl border border-ink-100 p-4 text-left transition hover:border-gold-300 hover:bg-gold-50/40"
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-ink-500">
                  <span>方向 {topic.direction}</span>
                  <span>{topic.content_type}</span>
                  <span className="text-gold-700">{topic.priority}</span>
                </div>
                <div className="font-medium leading-6">{topic.title}</div>
                <p className="mt-2 text-xs leading-5 text-ink-500">{topic.test_variable}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {latestDraft && (
        <section className="mt-6 grid gap-4 pb-10 md:grid-cols-[1fr_1.1fr]">
          <Card title="发布包预览" eyebrow={latestDraft.status}>
            <Field label="标题" value={latestDraft.title} />
            <Field label="封面句" value={latestDraft.cover_text} />
            <Field label="评论区引导" value={latestDraft.comment_prompt} />
            <Field label="字数自检" value={`${latestDraft.word_count.total} 字 / ${latestDraft.word_count.within_limit ? "通过" : "超限"}`} />
            <button className="btn-primary mt-5 w-full" disabled={loading || scoringTitle} onClick={scoreLatestTitle}>
              {scoringTitle ? "标题打分中..." : "标题打分"}
            </button>
            {titleScore && (
              <div className="mt-4 rounded-2xl bg-ink-50 p-4 text-sm leading-6 text-ink-700">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium text-ink-900">标题总分 {titleScore.totalScore}</span>
                  <span className="rounded-full bg-gold-50 px-3 py-1 text-xs text-gold-700">Grade {titleScore.grade}</span>
                </div>
                <div className="grid gap-2 text-xs">
                  <ScoreLine label="主题匹配" value={titleScore.topicMatch.score} />
                  <ScoreLine label="利益清晰" value={titleScore.benefitClarity.score} />
                  <ScoreLine label="情绪唤醒" value={titleScore.emotionalActivation.score} />
                  <ScoreLine label="合规风险" value={`${titleScore.complianceRisk.level} / ${titleScore.complianceRisk.score}`} />
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-ink-600">
                  {titleScore.suggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
            <button className="btn-primary mt-5 w-full" disabled={loading || buildingCoverBrief} onClick={buildLatestCoverBrief}>
              {buildingCoverBrief ? "生成封面 brief 中..." : "生成封面 brief"}
            </button>
            {coverBrief && (
              <div className="mt-4 rounded-2xl bg-ink-50 p-4 text-xs leading-6 text-ink-700">
                <ScoreLine label="封面句" value={coverBrief.coverText} />
                <ScoreLine label="场景" value={coverBrief.scene} />
                <div className="mt-3 text-ink-500">文生图 Prompt</div>
                <p className="mt-1 whitespace-pre-wrap text-ink-800">{coverBrief.imagePrompt}</p>
                <div className="mt-3 text-ink-500">负向 Prompt</div>
                <p className="mt-1 whitespace-pre-wrap text-ink-800">{coverBrief.negativePrompt}</p>
                <button className="btn-primary mt-4 w-full" disabled={generatingCoverImage} onClick={generateCoverImage}>
                  {generatingCoverImage ? "AI 封面生成中..." : "生成 AI 封面图"}
                </button>
                {coverImageUrl && (
                  <div
                    aria-label="AI 生成封面"
                    className="mt-4 aspect-[2/3] w-full rounded-2xl bg-cover bg-center"
                    style={{ backgroundImage: `url(${coverImageUrl})` }}
                  />
                )}
              </div>
            )}
            <button className="btn-primary mt-5 w-full" disabled={loading} onClick={markPublished}>
              标记为已发布
            </button>
          </Card>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-gold-700">Copy</div>
            <h2 className="mb-4 font-semibold">正文和话题一键复制</h2>
            <pre className="max-h-[520px] whitespace-pre-wrap rounded-2xl bg-ink-50 p-4 text-sm leading-7 text-ink-800">
              {latestDraft.body}
              {"\n\n"}
              {latestDraft.hashtags.join(" ")}
            </pre>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm md:col-span-2">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-gold-700">Review</div>
            <h2 className="mb-4 font-semibold">发布后复盘回填</h2>
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
                  onChange={(event) => setReviewForm((current) => ({ ...current, comment_keywords: event.target.value }))}
                  className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
                  placeholder="逗号分隔"
                />
              </div>
            </div>
            <button className="btn-primary mt-5" disabled={submittingReview} onClick={submitReview}>
              {submittingReview ? "复盘中..." : "提交复盘"}
            </button>
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
          </div>
        </section>
      )}
    </main>
  );
}

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="mb-3 text-xs uppercase tracking-[0.25em] text-gold-700">{eyebrow}</div>
      <h2 className="mb-4 font-semibold">{title}</h2>
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

function ScoreLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-ink-800">{value}</span>
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
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
        className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}
