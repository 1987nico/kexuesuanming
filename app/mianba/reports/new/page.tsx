"use client";

import { useEffect, useMemo, useState } from "react";
import { talentModeLabel, type AssessmentProfile } from "@/lib/reports/assessmentProfile";
import type { TalentQuestionForClient } from "@/lib/reports/principlesyouQuestions";
import type { ReportOrder, ReportType } from "@/lib/reports/store";

const QUESTIONS_PER_PAGE = 4;
const STORAGE_KEY = "mianba.report-intake.v1";

const defaultValueProfile = {
  liked_values: ["学习/进化", "了解世界", "被爱"],
  excluded_values: ["安稳度日", "优哉游哉", "创新"],
  like_summary: "持续学习升级，看见更大的世界，并获得真实认可。",
  exclude_summary: "只求安稳舒适，停在小圈安全感，或为新奇而创新。",
  filter_sentence: "能持续学习、连接更大的世界、让个人判断被看见。",
};

export default function NewReportProfilePage() {
  const [questions, setQuestions] = useState<TalentQuestionForClient[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [neutralAnswers, setNeutralAnswers] = useState<Record<number, number>>({});
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [page, setPage] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [surveyAnswers, setSurveyAnswers] = useState("{}");
  const [valueProfile, setValueProfile] = useState(JSON.stringify(defaultValueProfile, null, 2));
  const [profile, setProfile] = useState<AssessmentProfile | null>(null);
  const [latestOrder, setLatestOrder] = useState<ReportOrder | null>(null);
  const [message, setMessage] = useState("加载 252 题模板中...");
  const [orderMessage, setOrderMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState<ReportType | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as {
          customerName?: string;
          customerContact?: string;
          surveyAnswers?: string;
          valueProfile?: string;
          answers?: Record<number, number>;
          page?: number;
        };
        setCustomerName(draft.customerName || "");
        setCustomerContact(draft.customerContact || "");
        setSurveyAnswers(draft.surveyAnswers || "{}");
        setValueProfile(draft.valueProfile || JSON.stringify(defaultValueProfile, null, 2));
        setAnswers(draft.answers || {});
        setPage(typeof draft.page === "number" ? draft.page : 0);
        setMessage("已恢复本地未完成草稿。");
      }
    } catch {
      setMessage("本地草稿读取失败，已从空白状态开始。");
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/reports/talent-template")
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data.questions || []);
        setLabels(data.labels || []);
        setNeutralAnswers(data.neutral_answers || {});
        setMessage((current) => (current.includes("草稿") ? current : `已加载 ${data.count || 0} 题。`));
      })
      .catch(() => setMessage("题库加载失败，请刷新重试。"));
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        customerName,
        customerContact,
        surveyAnswers,
        valueProfile,
        answers,
        page,
      })
    );
  }, [answers, customerContact, customerName, draftLoaded, page, surveyAnswers, valueProfile]);

  const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
  const currentQuestions = useMemo(
    () => questions.slice(page * QUESTIONS_PER_PAGE, page * QUESTIONS_PER_PAGE + QUESTIONS_PER_PAGE),
    [page, questions]
  );
  const answeredCount = questions.filter((question) => answers[question.number]).length;
  const currentPageComplete = currentQuestions.every((question) => answers[question.number]);
  const allComplete = questions.length === 252 && answeredCount === questions.length;

  function setAnswer(questionNumber: number, value: number) {
    setAnswers((current) => ({ ...current, [questionNumber]: value }));
  }

  function clearLocalDraft() {
    localStorage.removeItem(STORAGE_KEY);
    setCustomerName("");
    setCustomerContact("");
    setSurveyAnswers("{}");
    setValueProfile(JSON.stringify(defaultValueProfile, null, 2));
    setAnswers({});
    setPage(0);
    setProfile(null);
    setMessage("本地草稿已清空。");
  }

  function fillNeutralAnswersForSmoke() {
    setAnswers(neutralAnswers);
    setPage(Math.max(0, totalPages - 1));
    setMessage("已填充中性 4 分答案，仅用于开发验证和快速预览流程。真实交付请让客户逐题作答。");
  }

  async function submitProfile() {
    if (!allComplete) {
      setMessage("请先完成 252 题。");
      return;
    }
    setLoading(true);
    setMessage("生成 assessment_profile 中...");
    try {
      const res = await fetch("/api/reports/assessment-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName || "未命名客户",
          customer_contact: customerContact || undefined,
          survey_answers: JSON.parse(surveyAnswers),
          value_profile: JSON.parse(valueProfile),
          talent_answers: answers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成底稿失败");
      setProfile(data.profile);
      setLatestOrder(null);
      setOrderMessage("");
      setMessage(`底稿生成成功，天赋数据来源：${talentModeLabel(data.profile.talent_profile.mode)}`);
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
          <div className="mb-3 text-xs tracking-[0.35em] text-gold-700">客户测评</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">新建测评底稿</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            客户在站内完成 252 题后，系统生成统一 assessment_profile；大小报告都从这份底稿派生。
          </p>
        </div>
        <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba/reports">
          返回报告工作台
        </a>
      </header>

      <section className="grid gap-4 md:grid-cols-[360px_1fr]">
        <aside className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">客户与底稿</h2>
          <label className="mb-2 block text-xs font-medium text-ink-500">客户姓名</label>
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
          />
          <label className="mb-2 block text-xs font-medium text-ink-500">联系方式</label>
          <input
            value={customerContact}
            onChange={(event) => setCustomerContact(event.target.value)}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
          />
          <label className="mb-2 block text-xs font-medium text-ink-500">问卷答案 JSON</label>
          <textarea
            value={surveyAnswers}
            onChange={(event) => setSurveyAnswers(event.target.value)}
            rows={5}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 font-mono text-xs"
          />
          <label className="mb-2 block text-xs font-medium text-ink-500">价值观双三圈 JSON</label>
          <textarea
            value={valueProfile}
            onChange={(event) => setValueProfile(event.target.value)}
            rows={10}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 font-mono text-xs"
          />
          <div className="rounded-2xl bg-ink-50 p-4 text-sm leading-6 text-ink-600">
            进度：{answeredCount} / {questions.length || 252}
            <br />
            当前页：{page + 1} / {totalPages || 1}
          </div>
          <button
            className="mt-4 w-full rounded-full bg-gold-50 px-4 py-3 text-sm font-semibold text-gold-700"
            type="button"
            disabled={!questions.length}
            onClick={fillNeutralAnswersForSmoke}
          >
            开发验证：一键填充中性答案
          </button>
          <button className="btn-primary mt-4 w-full" disabled={loading || !allComplete} onClick={submitProfile}>
            {loading ? "生成中..." : "完成并生成底稿"}
          </button>
          <button
            className="mt-3 w-full rounded-full bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700"
            type="button"
            onClick={clearLocalDraft}
          >
            清空本地草稿
          </button>
          {message && <p className="mt-3 text-sm leading-6 text-ink-600">{message}</p>}
        </aside>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">天赋测评 252 题</h2>
              <p className="mt-1 text-xs text-ink-500">每页 4 题，当前页答完后才能进入下一页。</p>
            </div>
            <div className="text-sm text-ink-500">{answeredCount} / {questions.length}</div>
          </div>

          <div className="grid gap-5">
            {currentQuestions.map((question) => (
              <div key={question.number} className="rounded-2xl border border-ink-100 p-4">
                <div className="mb-3 text-xs text-gold-700">
                  #{question.order} / 题号 {question.number}
                </div>
                <div className="mb-4 text-base leading-7 text-ink-900">{question.text}</div>
                <div className="grid gap-2 md:grid-cols-7">
                  {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAnswer(question.number, value)}
                      className={
                        "rounded-xl border px-2 py-3 text-xs leading-5 transition " +
                        (answers[question.number] === value
                          ? "border-ink-900 bg-ink-900 text-white"
                          : "border-ink-100 bg-white text-ink-600")
                      }
                    >
                      <div className="font-semibold">{value}</div>
                      <div>{labels[value - 1] || value}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between gap-3">
            <button className="btn-primary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
              上一页
            </button>
            <button
              className="btn-primary"
              disabled={!currentPageComplete || page >= totalPages - 1}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
            </button>
          </div>
        </section>
      </section>

      {profile && (
        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 font-semibold">底稿已生成</h2>
          <p className="text-sm leading-6 text-ink-600">底稿编号：{profile.id}；天赋数据来源：{talentModeLabel(profile.talent_profile.mode)}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="btn-primary" href={`/reports/lite/${profile.id}`} target="_blank">
              打开小报告
            </a>
            <a className="btn-primary" href={`/reports/deep/${profile.id}`} target="_blank">
              打开大报告
            </a>
            <button className="btn-primary" disabled={!!orderLoading} onClick={() => createReportOrder("lite")}>
              {orderLoading === "lite" ? "创建中..." : "创建小报告订单"}
            </button>
            <button className="btn-primary" disabled={!!orderLoading} onClick={() => createReportOrder("deep")}>
              {orderLoading === "deep" ? "创建中..." : "创建大报告订单"}
            </button>
            <a className="btn-primary" href="/mianba/orders" target="_blank">
              打开订单后台
            </a>
          </div>
          {orderMessage && <p className="mt-3 text-sm text-ink-600">{orderMessage}</p>}
          {latestOrder && (
            <p className="mt-2 text-xs leading-5 text-ink-500">
              订单状态：{latestOrder.status} / 类型：{latestOrder.report_type} / 金额：
              {typeof latestOrder.price_cents === "number" ? `¥${(latestOrder.price_cents / 100).toFixed(2)}` : "未填"}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
