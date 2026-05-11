"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, FieldLabel, Hint, Input, Section, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ACHIEVEMENT_SOURCE,
  CAREER_STATUS,
  EXPECTED_OUTCOMES,
  FAMILY_STATUS,
  FAMILY_SUPPORT,
  INCOME_DOWN_TOLERANCE,
  INCOME_RANGE,
  INCOME_RANGE_FLEX,
  INCOME_RESPONSIBILITY,
  ROLE_TYPE,
  TRANSFERABLE_SKILLS,
  TRIGGER_REASON,
  VALUE_OPTIONS,
  type SurveyData,
  surveySchema,
} from "@/lib/survey/schema";

export default function SurveyPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [s, setS] = useState<Partial<SurveyData>>({
    careerStatus: undefined,
    roleType: undefined,
    triggerReasons: [],
    achievementSources: [],
    transferableSkills: [],
    topValues: [],
    bottomValues: [],
    expectedOutcomes: [],
  });
  const [principlesYouSummary, setPrinciplesYouSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof SurveyData>(k: K, v: SurveyData[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }
  function toggleArr<K extends "triggerReasons" | "achievementSources" | "transferableSkills" | "topValues" | "bottomValues" | "expectedOutcomes">(
    key: K,
    val: string,
    max?: number
  ) {
    setS((prev) => {
      const list = ((prev[key] as unknown as string[]) || []).slice();
      const idx = list.indexOf(val);
      if (idx >= 0) list.splice(idx, 1);
      else {
        if (max && list.length >= max) return prev;
        list.push(val);
      }
      return { ...prev, [key]: list as never };
    });
  }

  const valueOverlap = useMemo(() => {
    const top = s.topValues ?? [];
    const bottom = s.bottomValues ?? [];
    return top.filter((v) => bottom.includes(v));
  }, [s.topValues, s.bottomValues]);

  async function submit() {
    setErrors({});
    const parse = surveySchema.safeParse(s);
    if (!parse.success) {
      const fe = parse.error.flatten();
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe.fieldErrors)) {
        if (v && v.length) out[k] = v[0];
      }
      setErrors(out);
      // 滚动到第一个错误
      const firstKey = Object.keys(out)[0];
      if (firstKey) {
        document.getElementById(`f-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/runs/${params.id}/survey`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey: parse.data, principlesYouSummary }),
      });
      if (!r.ok) throw new Error("提交失败");
      router.push(`/run/${params.id}/step1`);
    } finally {
      setSubmitting(false);
    }
  }

  function Err({ k }: { k: string }) {
    if (!errors[k]) return null;
    return <p className="text-xs text-danger-500 mt-1.5">{errors[k]}</p>;
  }

  return (
    <main>
      <PageHeader step="Step 0 · 问卷" title="把你自己说清楚" subtitle="约 8-12 分钟。AI 后续所有推理都基于此。" />
      <div className="px-5 pt-6 pb-32">
        {/* 基础画像 */}
        <Section title="基础画像">
          <div id="f-name">
            <FieldLabel required>姓名</FieldLabel>
            <Input value={s.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="" />
            <Err k="name" />
          </div>
          <div id="f-city">
            <FieldLabel required>所在城市</FieldLabel>
            <Input value={s.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            <Err k="city" />
          </div>
          <div id="f-careerStatus">
            <FieldLabel required>当前职业状态</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {CAREER_STATUS.map((v) => (
                <Chip key={v} selected={s.careerStatus === v} onClick={() => set("careerStatus", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="careerStatus" />
          </div>
          <div id="f-roleType">
            <FieldLabel required>当前/最近一份工作的身份</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {ROLE_TYPE.map((v) => (
                <Chip key={v} selected={s.roleType === v} onClick={() => set("roleType", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="roleType" />
          </div>
        </Section>

        {/* 核心问题 */}
        <Section title="此次想解决的问题">
          <div id="f-coreQuestion">
            <FieldLabel required>你最想解决的一个职业/事业选择</FieldLabel>
            <Textarea
              rows={2}
              placeholder="例：要不要创业，要不要留在当前行业"
              value={s.coreQuestion ?? ""}
              onChange={(e) => set("coreQuestion", e.target.value)}
            />
            <Err k="coreQuestion" />
          </div>
          <div id="f-pathsConsidered">
            <FieldLabel required>你正在考虑的几个路径</FieldLabel>
            <Textarea
              rows={3}
              placeholder="例：1. 继续找工作  2. 自媒体创业  3. 加入一家创业公司"
              value={s.pathsConsidered ?? ""}
              onChange={(e) => set("pathsConsidered", e.target.value)}
            />
            <Err k="pathsConsidered" />
          </div>
          <div id="f-triggerReasons">
            <FieldLabel required>为什么是现在开始考虑这个问题</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {TRIGGER_REASON.map((v) => (
                <Chip key={v} selected={(s.triggerReasons ?? []).includes(v)} onClick={() => toggleArr("triggerReasons", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="triggerReasons" />
          </div>
        </Section>

        {/* 履历 */}
        <Section title="过往主线" hint="AI 会基于此判断你的能力射程，越具体越好">
          <div id="f-recentExperience">
            <FieldLabel required>最近 1-3 段主要职业经历</FieldLabel>
            <Textarea
              rows={4}
              placeholder="例：&#10;1. 公司 A · 业务负责人 · 2023.4–2025.3 · 业务从亏到盈&#10;2. 公司 B · COO · 2025.4–2025.11 · 两个独立业务的经营结果"
              value={s.recentExperience ?? ""}
              onChange={(e) => set("recentExperience", e.target.value)}
            />
            <Err k="recentExperience" />
          </div>
          <div id="f-keyAchievements">
            <FieldLabel required>过去最重要的 2-3 个职业战绩</FieldLabel>
            <Textarea
              rows={4}
              placeholder="例：&#10;1. 武汉开城，0→1 → 1600 人 教学服务中台&#10;2. 核桃科学扭亏为盈"
              value={s.keyAchievements ?? ""}
              onChange={(e) => set("keyAchievements", e.target.value)}
            />
            <Err k="keyAchievements" />
          </div>
          <div id="f-achievementSources">
            <FieldLabel required>这些战绩主要来自什么</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {ACHIEVEMENT_SOURCE.map((v) => (
                <Chip key={v} selected={(s.achievementSources ?? []).includes(v)} onClick={() => toggleArr("achievementSources", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="achievementSources" />
          </div>
          <div id="f-achievementMainSource">
            <FieldLabel required>如果只能选一个最主要的来源</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(s.achievementSources ?? []).map((v) => (
                <Chip
                  key={v}
                  selected={s.achievementMainSource === v}
                  onClick={() => set("achievementMainSource", v)}
                >
                  {v}
                </Chip>
              ))}
            </div>
            <Hint>从上面已选项里挑一个</Hint>
            <Err k="achievementMainSource" />
          </div>
          <div id="f-transferableSkills">
            <FieldLabel required>你认为自己最可迁移的能力</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {TRANSFERABLE_SKILLS.map((v) => (
                <Chip key={v} selected={(s.transferableSkills ?? []).includes(v)} onClick={() => toggleArr("transferableSkills", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="transferableSkills" />
          </div>
          <div>
            <FieldLabel>如果离开原平台，最担心哪部分价值不能迁移</FieldLabel>
            <Textarea
              rows={2}
              placeholder="例：行业红利不能迁移 / 团队不能带走"
              value={s.worryValue ?? ""}
              onChange={(e) => set("worryValue", e.target.value)}
            />
          </div>
        </Section>

        {/* 经济 / 家庭 */}
        <Section title="经济与家庭约束">
          <div id="f-currentIncome">
            <FieldLabel required>当前/最近一份工作年收入</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {INCOME_RANGE.map((v) => (
                <Chip key={v} selected={s.currentIncome === v} onClick={() => set("currentIncome", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="currentIncome" />
          </div>
          <div id="f-peakIncome">
            <FieldLabel required>职业生涯最高年收入</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {INCOME_RANGE.map((v) => (
                <Chip key={v} selected={s.peakIncome === v} onClick={() => set("peakIncome", v)}>
                  {v}
                </Chip>
              ))}
            </div>
          </div>
          <div id="f-minNextIncome">
            <FieldLabel required>下一阶段最低可接受年收入</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {INCOME_RANGE_FLEX.map((v) => (
                <Chip key={v} selected={s.minNextIncome === v} onClick={() => set("minNextIncome", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="minNextIncome" />
          </div>
          <div id="f-incomeDownTolerance">
            <FieldLabel required>短期收入下降最多能接受多久</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {INCOME_DOWN_TOLERANCE.map((v) => (
                <Chip key={v} selected={s.incomeDownTolerance === v} onClick={() => set("incomeDownTolerance", v)}>
                  {v}
                </Chip>
              ))}
            </div>
          </div>
          <div id="f-familyStatus">
            <FieldLabel required>家庭状态</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {FAMILY_STATUS.map((v) => (
                <Chip key={v} selected={s.familyStatus === v} onClick={() => set("familyStatus", v)}>
                  {v}
                </Chip>
              ))}
            </div>
          </div>
          <div id="f-incomeResponsibility">
            <FieldLabel required>主要家庭收入责任</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {INCOME_RESPONSIBILITY.map((v) => (
                <Chip key={v} selected={s.incomeResponsibility === v} onClick={() => set("incomeResponsibility", v)}>
                  {v}
                </Chip>
              ))}
            </div>
          </div>
          <div id="f-familySupport">
            <FieldLabel required>家庭对转型的支持度</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {FAMILY_SUPPORT.map((v) => (
                <Chip key={v} selected={s.familySupport === v} onClick={() => set("familySupport", v)}>
                  {v}
                </Chip>
              ))}
            </div>
          </div>
          <div id="f-biggestConstraint">
            <FieldLabel required>当前最大的现实约束</FieldLabel>
            <Input
              placeholder="例：孩子教育 / 现金流 / 配偶工作所在城市"
              value={s.biggestConstraint ?? ""}
              onChange={(e) => set("biggestConstraint", e.target.value)}
            />
            <Err k="biggestConstraint" />
          </div>
        </Section>

        {/* 价值观 */}
        <Section title="价值观双三圈" hint="选 3 个最重要 + 3 个最不重要；两边不能重叠">
          <div id="f-topValues">
            <FieldLabel required>最重要的 3 个价值观（Top 3）</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {VALUE_OPTIONS.map((v) => (
                <Chip
                  key={v}
                  selected={(s.topValues ?? []).includes(v)}
                  disabled={(s.bottomValues ?? []).includes(v) || ((s.topValues ?? []).length >= 3 && !(s.topValues ?? []).includes(v))}
                  onClick={() => toggleArr("topValues", v, 3)}
                >
                  {v}
                </Chip>
              ))}
            </div>
            <Hint>已选 {(s.topValues ?? []).length}/3</Hint>
            <Err k="topValues" />
          </div>
          <div id="f-bottomValues">
            <FieldLabel required>最不重要的 3 个价值观（Bottom 3）</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {VALUE_OPTIONS.map((v) => (
                <Chip
                  key={v}
                  selected={(s.bottomValues ?? []).includes(v)}
                  disabled={(s.topValues ?? []).includes(v) || ((s.bottomValues ?? []).length >= 3 && !(s.bottomValues ?? []).includes(v))}
                  onClick={() => toggleArr("bottomValues", v, 3)}
                >
                  {v}
                </Chip>
              ))}
            </div>
            <Hint>已选 {(s.bottomValues ?? []).length}/3</Hint>
            {valueOverlap.length > 0 && <p className="text-xs text-danger-500 mt-1.5">重叠：{valueOverlap.join("、")}</p>}
            <Err k="bottomValues" />
          </div>
          <div id="f-conflictPriority">
            <FieldLabel required>价值观冲突时优先保哪一个</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(s.topValues ?? []).map((v) => (
                <Chip key={v} selected={s.conflictPriority === v} onClick={() => set("conflictPriority", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Hint>从 Top 3 里挑一个</Hint>
            <Err k="conflictPriority" />
          </div>
        </Section>

        {/* PrinciplesYou */}
        <Section title="PrinciplesYou 特质（强烈建议）" hint="访问 principlesyou.com 测完后，把你的关键特质粘贴在这里">
          <div>
            <FieldLabel>关键特质摘要</FieldLabel>
            <Textarea
              rows={6}
              placeholder={`例：&#10;主原型: The Shaper&#10;副原型: The Commander + The Quiet Leader&#10;强信号(≥60%): Adaptable 80, Confident 78, Demanding 73, Persistent 73…&#10;反向信号(≤30%): Helpful 6, Status-Seeking 7, Empathetic 15…`}
              value={principlesYouSummary}
              onChange={(e) => setPrinciplesYouSummary(e.target.value)}
            />
            <Hint>没做过测试也可以跳过，但 AI 的人格匹配判断会弱很多</Hint>
          </div>
        </Section>

        {/* 期望产出 */}
        <Section title="期望产出">
          <div id="f-expectedOutcomes">
            <FieldLabel required>这次聊完，你最希望得到什么</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {EXPECTED_OUTCOMES.map((v) => (
                <Chip key={v} selected={(s.expectedOutcomes ?? []).includes(v)} onClick={() => toggleArr("expectedOutcomes", v)}>
                  {v}
                </Chip>
              ))}
            </div>
            <Err k="expectedOutcomes" />
          </div>
          <div>
            <FieldLabel>还有什么希望我提前了解的</FieldLabel>
            <Textarea
              rows={3}
              placeholder="任何背景、约束、偏好…"
              value={s.additionalInfo ?? ""}
              onChange={(e) => set("additionalInfo", e.target.value)}
            />
          </div>
        </Section>
      </div>

      {/* 底栏 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-5 bg-gradient-to-t from-ink-50 via-ink-50/95 to-transparent">
        <Button size="lg" className="w-full" onClick={submit} disabled={submitting}>
          {submitting ? "提交中…" : "进入 Step 1 · 圈定边界"}
        </Button>
      </div>
    </main>
  );
}
