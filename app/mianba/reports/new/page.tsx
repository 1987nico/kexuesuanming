"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { talentModeLabel, type AssessmentProfile } from "@/lib/reports/assessmentProfile";
import type { TalentQuestionForClient } from "@/lib/reports/principlesyouQuestions";
import type { ReportOrder, ReportType } from "@/lib/reports/store";

const QUESTIONS_PER_PAGE = 4;
const STORAGE_KEY = "mianba.report-intake.v1";

const VALUE_OPTIONS = [
  "被爱",
  "品行端正",
  "创新",
  "助人为乐",
  "学习/进化",
  "影响世界",
  "实现职业目标",
  "安稳度日，优哉游哉",
  "家财万贯",
  "了解世界",
  "拥有充满乐趣和冒险的生活",
  "有知己好友",
  "家庭和美",
];

const defaultValueProfile = {
  liked_values: ["学习/进化", "了解世界", "被爱"],
  excluded_values: ["安稳度日", "优哉游哉", "创新"],
  like_summary: "持续学习升级，看见更大的世界，并获得真实认可。",
  exclude_summary: "只求安稳舒适，停在小圈安全感，或为新奇而创新。",
  filter_sentence: "能持续学习、连接更大的世界、让个人判断被看见。",
};

const intakeQuestions: Array<{
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
  options?: string[];
}> = [
  {
    key: "decision_type",
    label: "你现在最想判断的是什么？",
    options: ["跳槽", "转型", "创业", "合伙", "副业", "继续主业但换打法"],
  },
  {
    key: "decision_timing",
    label: "这个决定离你有多近？",
    options: ["1个月内必须决定", "3个月内大概率要动", "半年内想看清楚", "还在模糊酝酿"],
  },
  {
    key: "stuck_point",
    label: "你现在最卡住的点是什么？",
    options: ["不知道自己适合什么", "机会很多但不敢选", "现状太消耗想逃离", "怕选错后成本太高", "家人/合伙人意见不一致"],
  },
  {
    key: "energy_source",
    label: "哪类事情最容易让你重新有能量？",
    options: ["做判断和决策", "解决复杂问题", "带团队拿结果", "创造产品/内容", "经营客户和资源", "研究趋势和机会"],
  },
  {
    key: "avoid_state",
    label: "你最不想再进入哪种状态？",
    options: ["无意义加班", "被组织内耗", "收入不稳定", "长期单打独斗", "只做执行没有决策权", "做看起来体面但没复利的事"],
  },
  {
    key: "transferable_asset",
    label: "你现在最可迁移的资产是什么？",
    options: ["行业经验", "管理经验", "客户资源", "产品/技术能力", "内容表达能力", "资金和人脉"],
  },
  {
    key: "interested_direction",
    label: "你感兴趣的方向、领域或项目是什么？",
    help: "不用写完整方案，写关键词就可以。这里会用于后面的方向假设。",
    placeholder: "比如：AI 教育、线下社群、个人 IP 咨询、出海项目、组织发展...",
  },
  {
    key: "excluded_direction",
    label: "你一定不碰的方向、领域或项目是什么？",
    help: "写下你明确不想投入的方向。这里会作为后面筛选方向时的排除条件。",
    placeholder: "比如：纯销售、重运营、低价内卷、强合伙绑定、长期出差...",
  },
];

function createEmptyIntakeAnswers() {
  return Object.fromEntries(intakeQuestions.map((question) => [question.key, ""])) as Record<string, string>;
}

export default function NewReportProfilePage() {
  const [questions, setQuestions] = useState<TalentQuestionForClient[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [neutralAnswers, setNeutralAnswers] = useState<Record<number, number>>({});
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [page, setPage] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>(() => createEmptyIntakeAnswers());
  const [topValues, setTopValues] = useState<string[]>([]);
  const [bottomValues, setBottomValues] = useState<string[]>([]);
  const [valueProfile, setValueProfile] = useState(JSON.stringify(defaultValueProfile, null, 2));
  const [profile, setProfile] = useState<AssessmentProfile | null>(null);
  const [latestOrder, setLatestOrder] = useState<ReportOrder | null>(null);
  const [message, setMessage] = useState("加载 252 题模板中...");
  const [orderMessage, setOrderMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState<ReportType | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [phase, setPhase] = useState<"intake" | "talent">("intake");
  const talentSectionRef = useRef<HTMLDivElement>(null);

  function enterTalentPhase() {
    setPhase("talent");
    requestAnimationFrame(() => {
      talentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goToPage(updater: (current: number) => number) {
    setPage(updater);
    requestAnimationFrame(() => {
      talentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as {
          customerName?: string;
          customerPhone?: string;
          customerEmail?: string;
          customerContact?: string;
          intakeAnswers?: Record<string, string>;
          topValues?: string[];
          bottomValues?: string[];
          surveyAnswers?: string;
          valueProfile?: string;
          answers?: Record<number, number>;
          page?: number;
        };
        setCustomerName(draft.customerName || "");
        setCustomerPhone(draft.customerPhone || "");
        setCustomerEmail(draft.customerEmail || "");
        setIntakeAnswers({ ...createEmptyIntakeAnswers(), ...(draft.intakeAnswers || {}) });
        setTopValues(draft.topValues || []);
        setBottomValues(draft.bottomValues || []);
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
    setDebugMode(new URLSearchParams(window.location.search).get("debug") === "1");
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
        customerPhone,
        customerEmail,
        intakeAnswers,
        topValues,
        bottomValues,
        valueProfile,
        answers,
        page,
      })
    );
  }, [answers, bottomValues, customerEmail, customerName, customerPhone, draftLoaded, intakeAnswers, page, topValues, valueProfile]);

  const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
  const currentQuestions = useMemo(
    () => questions.slice(page * QUESTIONS_PER_PAGE, page * QUESTIONS_PER_PAGE + QUESTIONS_PER_PAGE),
    [page, questions]
  );
  const answeredCount = questions.filter((question) => answers[question.number]).length;
  const currentPageComplete = currentQuestions.every((question) => answers[question.number]);
  const allComplete = questions.length === 252 && answeredCount === questions.length;
  const intakeComplete = Boolean(customerName.trim()) && intakeQuestions.every((question) => intakeAnswers[question.key]?.trim());
  const valuesComplete = topValues.length === 3 && bottomValues.length === 3;

  function setAnswer(questionNumber: number, value: number) {
    setAnswers((current) => ({ ...current, [questionNumber]: value }));
  }

  function setIntakeAnswer(key: string, value: string) {
    setIntakeAnswers((current) => ({ ...current, [key]: value }));
  }

  function toggleValue(kind: "top" | "bottom", value: string) {
    const selected = kind === "top" ? topValues : bottomValues;
    const blocked = kind === "top" ? bottomValues.includes(value) : topValues.includes(value);
    if (blocked) return;

    const next = selected.includes(value) ? selected.filter((item) => item !== value) : selected.length < 3 ? [...selected, value] : selected;
    if (kind === "top") {
      setTopValues(next);
    } else {
      setBottomValues(next);
    }
  }

  function buildValueProfile() {
    return {
      liked_values: topValues,
      excluded_values: bottomValues,
      like_summary: `对你来说最重要的价值观是：${topValues.join("、")}。`,
      exclude_summary: `对你来说重要程度最低的价值观是：${bottomValues.join("、")}。`,
      filter_sentence: `优先选择能满足「${topValues.join("、")}」的方向，同时避开「${bottomValues.join("、")}」。`,
    };
  }

  function clearLocalDraft() {
    localStorage.removeItem(STORAGE_KEY);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setIntakeAnswers(createEmptyIntakeAnswers());
    setTopValues([]);
    setBottomValues([]);
    setValueProfile(JSON.stringify(defaultValueProfile, null, 2));
    setAnswers({});
    setPage(0);
    setPhase("intake");
    setProfile(null);
    setMessage("本地草稿已清空。");
  }

  function fillNeutralAnswersForSmoke() {
    setAnswers(neutralAnswers);
    setPage(Math.max(0, totalPages - 1));
    setPhase("talent");
    setMessage("已填充中性 4 分答案，仅用于开发验证和快速预览流程。真实交付请让客户逐题作答。");
  }

  async function submitProfile() {
    if (!intakeComplete) {
      setMessage("请先填写客户姓名和 8 个关键问题。");
      return;
    }
    if (!valuesComplete) {
      setMessage("请先完成价值观测试：喜欢区 3 个、排除带 3 个。");
      return;
    }
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
          customer_contact:
            [customerPhone.trim() && `手机：${customerPhone.trim()}`, customerEmail.trim() && `邮箱：${customerEmail.trim()}`]
              .filter(Boolean)
              .join(" / ") || undefined,
          survey_answers: intakeAnswers,
          value_profile: buildValueProfile(),
          talent_answers: answers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "生成底稿失败");
      setProfile(data.profile);
      setLatestOrder(data.order ?? null);
      setOrderMessage(data.order ? `已自动登记初步诊断报告订单：${data.order.id}` : "");
      setMessage(
        `测评提交成功，报告正在生成中（约 1 分钟后可查看）。天赋数据来源：${talentModeLabel(data.profile.talent_profile.mode)}`
      );
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
    <main className="mianba-workspace mianba-public-entry min-h-screen bg-[#09090b] text-[#f4efe6]">
      <section id="start" className="w-full border-b border-[#22201c] bg-[#0c0c0d] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 grid gap-8 md:grid-cols-[320px_1fr]">
            <div>
              <div className="mb-4 text-xs tracking-[0.32em] text-[#f4efe6]/45">测评入口</div>
              <h2 className="serif text-3xl text-[#b9a36b] md:text-4xl">开始测评</h2>
              <p className="mt-6 text-sm leading-7 text-[#f4efe6]/55">
                先回答 8 个关键问题，再完成价值观测试和 252 题测评。请尽量用真实经历回答，模糊、讨好、过度包装都会降低报告判断质量。
              </p>
              <div className="mt-8 rounded-sm border border-[#22201c] bg-[#111111] p-5 text-sm leading-7 text-[#f4efe6]/60">
                <div>关键问题：{intakeQuestions.filter((question) => intakeAnswers[question.key]?.trim()).length} / {intakeQuestions.length}</div>
                <div>价值观测试：喜欢区 {topValues.length}/3 · 排除带 {bottomValues.length}/3</div>
                <div>天赋测评：{answeredCount} / {questions.length || 252}</div>
                <div>当前页：{page + 1} / {totalPages || 1}</div>
              </div>
              <button
                className="mt-5 w-full rounded-none bg-[#b9a36b] px-5 py-4 text-sm font-semibold text-[#09090b] transition hover:opacity-90 disabled:opacity-40"
                disabled={loading || !allComplete || !intakeComplete || !valuesComplete}
                onClick={submitProfile}
              >
                {loading ? "生成中..." : "完成并生成底稿"}
              </button>
              <button
                className="mt-3 w-full rounded-none border border-[#22201c] px-5 py-4 text-sm font-semibold text-[#f4efe6]/75"
                type="button"
                onClick={clearLocalDraft}
              >
                重新填写
              </button>
              {debugMode && (
                <details className="mt-4 border border-[#22201c] bg-[#111111] p-4 text-sm text-[#f4efe6]/65">
                  <summary className="cursor-pointer font-semibold">内部调试</summary>
                  <button
                    className="mt-4 w-full rounded-none bg-[#b9a36b] px-4 py-3 text-sm font-semibold text-[#09090b]"
                    type="button"
                    disabled={!questions.length}
                    onClick={fillNeutralAnswersForSmoke}
                  >
                    一键填充中性答案
                  </button>
                  <label className="mt-4 mb-2 block text-xs font-medium text-[#f4efe6]/45">价值观双三圈 JSON</label>
                  <textarea
                    value={valueProfile}
                    onChange={(event) => setValueProfile(event.target.value)}
                    rows={8}
                    className="w-full border border-[#22201c] bg-black px-3 py-2 font-mono text-xs text-[#f4efe6]/75"
                  />
                </details>
              )}
              {message && <p className="mt-4 text-sm leading-6 text-[#f4efe6]/55">{message}</p>}
            </div>

            <div className="grid gap-5">
              {phase === "intake" ? (
              <>
              <section className="border border-[#22201c] bg-[#111111] p-5 md:p-8">
                <div className="mb-8">
                  <div className="mb-3 text-xs tracking-[0.24em] text-[#b9a36b]">01 / 关键问题</div>
                  <h3 className="serif text-2xl text-[#f4efe6]">先完成 8 个关键判断</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-[#f4efe6]/45">姓名</label>
                    <input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      className="w-full border border-[#22201c] bg-[#09090b] px-3 py-3 text-sm text-[#f4efe6]"
                      placeholder="请输入你的姓名或昵称"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-[#f4efe6]/45">手机号</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      className="w-full border border-[#22201c] bg-[#09090b] px-3 py-3 text-sm text-[#f4efe6]"
                      placeholder="请输入手机号"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-[#f4efe6]/45">电子邮箱</label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      className="w-full border border-[#22201c] bg-[#09090b] px-3 py-3 text-sm text-[#f4efe6]"
                      placeholder="请输入电子邮箱"
                    />
                  </div>
                </div>
                <div className="mt-5 grid gap-4">
                  {intakeQuestions.map((question, index) => (
                    <div key={question.key} className="border border-[#22201c] bg-[#0c0c0d] p-4">
                      <label className="mb-2 block text-sm font-semibold text-[#f4efe6]">
                        {String(index + 1).padStart(2, "0")} · {question.label}
                      </label>
                      {question.help && <p className="mb-3 text-xs leading-5 text-[#f4efe6]/45">{question.help}</p>}
                      {question.options ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {question.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setIntakeAnswer(question.key, option)}
                              className={
                                "border px-4 py-3 text-left text-sm transition " +
                                (intakeAnswers[question.key] === option
                                  ? "border-[#b9a36b] bg-[#b9a36b] text-[#09090b]"
                                  : "border-[#22201c] bg-black text-[#f4efe6]/65 hover:border-[#b9a36b]/60")
                              }
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          value={intakeAnswers[question.key] || ""}
                          onChange={(event) => setIntakeAnswer(question.key, event.target.value)}
                          rows={5}
                          className="w-full border border-[#22201c] bg-black px-3 py-3 text-sm leading-6 text-[#f4efe6]"
                          placeholder={question.placeholder}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="border border-[#22201c] bg-[#111111] p-5 md:p-8">
                <div className="mb-8">
                  <div className="mb-3 text-xs tracking-[0.24em] text-[#b9a36b]">02 / 价值观</div>
                  <h3 className="serif text-2xl text-[#f4efe6]">对你来说最重要的价值观是什么？</h3>
                  <p className="mt-2 text-sm leading-6 text-[#f4efe6]/50">必须选择三个。少一个不行，多一个也不行。</p>
                </div>

                <ValuePicker
                  selected={topValues}
                  blocked={bottomValues}
                  onToggle={(value) => toggleValue("top", value)}
                />

                <div className="mt-8 mb-4">
                  <h3 className="serif text-2xl text-[#f4efe6]">现在想想，对你来说重要程度最低的价值观是什么？</h3>
                  <p className="mt-2 text-sm leading-6 text-[#f4efe6]/50">不是说不重要，只是重要程度最低。必须选择三个，少一个不行，多一个也不行。</p>
                </div>

                <ValuePicker
                  selected={bottomValues}
                  blocked={topValues}
                  onToggle={(value) => toggleValue("bottom", value)}
                />

                <button
                  type="button"
                  className="mt-8 w-full rounded-none bg-[#b9a36b] px-5 py-4 text-sm font-semibold text-[#09090b] transition hover:opacity-90 disabled:opacity-40"
                  disabled={!intakeComplete || !valuesComplete}
                  onClick={enterTalentPhase}
                >
                  {!intakeComplete ? "请先完成 8 个关键问题" : !valuesComplete ? "请先完成价值观测试" : "进入天赋测评"}
                </button>
              </section>
              </>
              ) : (
              <section ref={talentSectionRef} className="border border-[#22201c] bg-[#111111] p-5 md:p-8">
                <div className="mb-6">
                  <div className="mb-3 text-xs tracking-[0.24em] text-[#b9a36b]">03 / 天赋测评</div>
                  <h3 className="serif text-2xl text-[#f4efe6]">天赋测评</h3>
                  <p className="mt-2 text-sm leading-6 text-[#f4efe6]/50">根据你的真实状态作答，预计需要 15-20 分钟。完成后会生成站内天赋基因测评报告。</p>
                </div>
                <div className="mb-8 flex items-center justify-between gap-4 text-xs tracking-widest text-[#f4efe6]/55">
                  <span>第 {page + 1} 页 / 共 {totalPages || 63} 页</span>
                  <span>{answeredCount} / {questions.length || 252}</span>
                </div>

                <div className="grid gap-5">
                  {currentQuestions.map((question, index) => (
                    <div key={question.number} className="border border-[#22201c] bg-[#0c0c0d] p-4">
                      <div className="mb-3 text-xs text-[#b9a36b]">第 {page * QUESTIONS_PER_PAGE + index + 1} 题 / 共 {questions.length || 252} 题</div>
                      <div className="mb-4 text-base leading-7 text-[#f4efe6]">{question.text}</div>
                      <div className="grid grid-cols-7 gap-1 md:gap-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setAnswer(question.number, value)}
                            className={
                              "flex flex-col items-center justify-center border px-1 py-2 text-center leading-tight transition md:py-3 " +
                              (answers[question.number] === value
                                ? "border-[#b9a36b] bg-[#b9a36b] text-[#09090b]"
                                : "border-[#22201c] bg-black text-[#f4efe6]/60")
                            }
                          >
                            <span className="text-sm font-semibold md:text-base">{value}</span>
                            <span className="mt-1 text-[10px] leading-tight md:text-xs">{labels[value - 1] || value}</span>
                          </button>
                        ))}
                      </div>
                      {!answers[question.number] && <p className="mt-3 text-xs text-[#f4efe6]/40">请选择一个分值</p>}
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-between gap-3">
                  <button
                    className="rounded-none border border-[#22201c] px-5 py-3 text-sm font-semibold text-[#f4efe6]/70"
                    onClick={() => {
                      if (page === 0) {
                        setPhase("intake");
                        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
                      } else {
                        goToPage((current) => current - 1);
                      }
                    }}
                  >
                    上一步
                  </button>
                  <button
                    className="rounded-none bg-[#b9a36b] px-5 py-3 text-sm font-semibold text-[#09090b] disabled:opacity-40"
                    disabled={!currentPageComplete || page >= totalPages - 1}
                    onClick={() => goToPage((current) => current + 1)}
                  >
                    下一页
                  </button>
                </div>
              </section>
              )}
            </div>
          </div>
        </div>
      </section>

      {profile && (
        <section className="mx-auto mt-16 w-full max-w-6xl border border-[#22201c] bg-[#111111] p-6 text-[#f4efe6] md:p-8">
          <h2 className="serif mb-2 text-2xl text-[#b9a36b]">底稿已生成</h2>
          <p className="text-sm leading-6 text-[#f4efe6]/55">底稿编号：{profile.id}；天赋数据来源：{talentModeLabel(profile.talent_profile.mode)}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="rounded-none bg-[#b9a36b] px-5 py-3 text-sm font-semibold text-[#09090b]" href={`/reports/initial/${profile.id}`} target="_blank">
              查看初步诊断报告
            </a>
            <a className="rounded-none border border-[#b9a36b] px-5 py-3 text-sm font-semibold text-[#b9a36b]" href={`/api/reports/initial/${profile.id}/pdf`} target="_blank">
              下载报告 PDF
            </a>
            <a className="rounded-none bg-[#b9a36b] px-5 py-3 text-sm font-semibold text-[#09090b]" href={`/reports/lite/${profile.id}`} target="_blank">
              打开小报告
            </a>
            <a className="rounded-none bg-[#b9a36b] px-5 py-3 text-sm font-semibold text-[#09090b]" href={`/reports/deep/${profile.id}`} target="_blank">
              打开大报告
            </a>
            <button className="rounded-none border border-[#22201c] px-5 py-3 text-sm font-semibold text-[#f4efe6]/75 disabled:opacity-40" disabled={!!orderLoading} onClick={() => createReportOrder("lite")}>
              {orderLoading === "lite" ? "创建中..." : "创建小报告订单"}
            </button>
            <button className="rounded-none border border-[#22201c] px-5 py-3 text-sm font-semibold text-[#f4efe6]/75 disabled:opacity-40" disabled={!!orderLoading} onClick={() => createReportOrder("deep")}>
              {orderLoading === "deep" ? "创建中..." : "创建大报告订单"}
            </button>
            <a className="rounded-none border border-[#22201c] px-5 py-3 text-sm font-semibold text-[#f4efe6]/75" href="/mianba/orders" target="_blank">
              打开订单后台
            </a>
          </div>
          {orderMessage && <p className="mt-3 text-sm text-[#f4efe6]/55">{orderMessage}</p>}
          {latestOrder && (
            <p className="mt-2 text-xs leading-5 text-[#f4efe6]/45">
              订单状态：{latestOrder.status} / 类型：{latestOrder.report_type} / 金额：
              {typeof latestOrder.price_cents === "number" ? `¥${(latestOrder.price_cents / 100).toFixed(2)}` : "未填"}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function ValuePicker({
  selected,
  blocked,
  onToggle,
}: {
  selected: string[];
  blocked: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {VALUE_OPTIONS.map((value) => {
        const isSelected = selected.includes(value);
        const isBlocked = blocked.includes(value);
        const isDisabled = isBlocked || (!isSelected && selected.length >= 3);
        return (
          <button
            key={value}
            type="button"
            disabled={isDisabled}
            onClick={() => onToggle(value)}
            className={
              "border px-4 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-30 " +
              (isSelected
                ? "border-[#b9a36b] bg-[#b9a36b] text-[#09090b]"
                : "border-[#22201c] bg-black text-[#f4efe6]/65 hover:border-[#b9a36b]/60")
            }
          >
            <span className="mr-2">{isSelected ? "✓" : "〇"}</span>
            {value}
          </button>
        );
      })}
    </div>
  );
}
