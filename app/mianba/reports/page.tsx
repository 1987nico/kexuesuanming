"use client";

import { useEffect, useState } from "react";
import type { AssessmentProfile } from "@/lib/reports/assessmentProfile";

const defaultValueProfile = {
  liked_values: ["学习/进化", "了解世界", "被爱"],
  excluded_values: ["安稳度日", "优哉游哉", "创新"],
  like_summary: "持续学习升级，看见更大的世界，并获得真实认可。",
  exclude_summary: "只求安稳舒适，停在小圈安全感，或为新奇而创新。",
  filter_sentence: "能持续学习、连接更大的世界、让个人判断被看见。",
};

export default function MianbaReportsPage() {
  const [customerName, setCustomerName] = useState("测试用户");
  const [customerContact, setCustomerContact] = useState("");
  const [surveyAnswers, setSurveyAnswers] = useState("{}");
  const [valueProfile, setValueProfile] = useState(JSON.stringify(defaultValueProfile, null, 2));
  const [talentAnswers, setTalentAnswers] = useState("{}");
  const [profile, setProfile] = useState<AssessmentProfile | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/reports/talent-template")
      .then((res) => res.json())
      .then((data) => {
        setTalentAnswers(JSON.stringify(data.neutral_answers || {}, null, 2));
      })
      .catch(() => {
        setMessage("未能加载 252 题模板，请手动粘贴答案 JSON。");
      });
  }, []);

  async function createProfile() {
    setLoading(true);
    setMessage("生成 assessment_profile 中...");
    setProfile(null);
    try {
      const body = {
        customer_name: customerName,
        customer_contact: customerContact || undefined,
        survey_answers: JSON.parse(surveyAnswers),
        value_profile: JSON.parse(valueProfile),
        talent_answers: JSON.parse(talentAnswers),
      };
      const res = await fetch("/api/reports/assessment-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "创建底稿失败");
      setProfile(data.profile);
      setMessage(`已生成底稿，天赋数据模式：${data.profile.talent_profile.mode}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mianba-workspace min-h-screen px-5 py-8 text-ink-900 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs uppercase tracking-[0.35em] text-gold-700">Reports</div>
          <h1 className="serif text-4xl leading-tight md:text-5xl">报告交付工作台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
            生成同一用户唯一 `assessment_profile`，小报告和大报告都从这份底稿派生，保证价值观与天赋信号一致。
          </p>
        </div>
        <a className="rounded-full bg-white px-4 py-2 text-sm text-ink-600 shadow-sm" href="/mianba">
          返回增长工作台
        </a>
      </header>

      <section className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">客户信息</h2>
          <label className="mb-2 block text-xs font-medium text-ink-500">客户姓名</label>
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
          />
          <label className="mb-2 block text-xs font-medium text-ink-500">联系方式（可选）</label>
          <input
            value={customerContact}
            onChange={(event) => setCustomerContact(event.target.value)}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm"
            placeholder="微信/手机号/邮箱"
          />
          <label className="mb-2 block text-xs font-medium text-ink-500">问卷答案 JSON</label>
          <textarea
            value={surveyAnswers}
            onChange={(event) => setSurveyAnswers(event.target.value)}
            rows={8}
            className="mb-4 w-full rounded-xl border border-ink-100 bg-white px-3 py-2 font-mono text-xs"
          />
          <button className="btn-primary w-full" disabled={loading} onClick={createProfile}>
            生成统一测评底稿
          </button>
          {message && <p className="mt-3 text-sm text-ink-600">{message}</p>}
        </div>

        <div className="grid gap-4">
          <JsonCard title="价值观双三圈 JSON" value={valueProfile} onChange={setValueProfile} rows={12} />
          <JsonCard
            title="252 题答案 JSON"
            value={talentAnswers}
            onChange={setTalentAnswers}
            rows={14}
            hint="键为题号，值为 1-7。这里默认填中性 4 仅用于开发验证，真实交付必须替换为用户完整作答。"
          />
        </div>
      </section>

      {profile && (
        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <div className="mb-4 text-xs uppercase tracking-[0.25em] text-gold-700">Generated</div>
          <h2 className="mb-2 font-semibold">底稿已生成</h2>
          <p className="text-sm leading-6 text-ink-600">
            ID：{profile.id}
            <br />
            天赋来源：{profile.talent_profile.mode}
            <br />
            同步证据：{JSON.stringify(profile.talent_profile.evidence || {})}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="btn-primary" href={`/reports/lite/${profile.id}`} target="_blank">
              打开小报告预览
            </a>
            <a className="btn-primary" href={`/reports/deep/${profile.id}`} target="_blank">
              打开大报告预览
            </a>
          </div>
        </section>
      )}
    </main>
  );
}

function JsonCard({
  title,
  value,
  onChange,
  rows,
  hint,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-xs leading-5 text-ink-500">{hint}</p>}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full rounded-xl border border-ink-100 bg-white px-3 py-2 font-mono text-xs"
      />
    </div>
  );
}
