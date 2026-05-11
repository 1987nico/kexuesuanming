/**
 * 工作流编排 —— 把 LLMRouter + Tavily + Store 编排成业务能力
 *
 * 每个 step 都是幂等的：重复调用会覆盖。
 */

import { llmJSON } from "@/lib/llm/router";
import { step1Prompt, type Step1Output } from "@/lib/llm/prompts/step1";
import { step2Prompt, type Step2Output, type Step2Opportunity } from "@/lib/llm/prompts/step2";
import { step4Prompt, type Step4Output } from "@/lib/llm/prompts/step4";
import { step5Prompt, type Step5Output } from "@/lib/llm/prompts/step5";
import { step6Prompt, type Step6Output } from "@/lib/llm/prompts/step6";
import { tavilyMulti } from "@/lib/search/tavily";
import { store } from "@/lib/db/store";

async function getSurvey(runId: string) {
  const snap = await store().getSnapshot(runId);
  if (!snap?.survey) throw new Error("survey not found");
  return { survey: snap.survey, principlesYou: snap.principlesYouSummary, snap };
}

export async function runStep1(runId: string): Promise<Step1Output> {
  const { survey, principlesYou } = await getSurvey(runId);
  const { system, user } = step1Prompt(survey, principlesYou);
  const { data } = await llmJSON<Step1Output>({ system, user, maxTokens: 3000 });
  await store().saveStep1(runId, data);
  await store().updateStatus(runId, "step2");
  return data;
}

export async function runStep2(runId: string): Promise<Step2Output> {
  const { survey, snap } = await getSurvey(runId);
  if (!snap.step1) throw new Error("step1 not done");
  // 联网检索：基于 Step1 主题做 2-3 个 query
  const queries: string[] = [
    `2026 ${survey.transferableSkills.slice(0, 2).join(" ")} 职业转型 机会`,
    ...snap.step1.themes.slice(0, 3).map((t) => `${t.title} 2026 中国 行业趋势`),
  ];
  const searches = await tavilyMulti(queries.slice(0, 4), { maxResults: 4 });
  const snippets = searches
    .flatMap((s) => s.results)
    .slice(0, 12)
    .map((r) => `${r.title} (${r.url}): ${r.content?.slice(0, 200) || ""}`);

  const { system, user } = step2Prompt(survey, snap.step1, snippets);
  const { data } = await llmJSON<Step2Output>({ system, user, maxTokens: 12000, temperature: 0.85 });
  // 兜底：补齐缺失字段
  data.opportunities = (data.opportunities ?? []).map((o: Step2Opportunity, i: number) => ({
    idx: o.idx ?? i + 1,
    category: o.category ?? "未分类",
    title: o.title ?? `机会 #${i + 1}`,
    oneLiner: o.oneLiner ?? "",
    dayInLife: o.dayInLife ?? "",
    workContent: o.workContent ?? "",
    workMethods: o.workMethods ?? "",
    imagePrompt: o.imagePrompt ?? "",
    evidence: o.evidence ?? [],
  }));
  await store().saveStep2(runId, data);
  await store().updateStatus(runId, "step3");
  return data;
}

export async function runStep4(runId: string): Promise<Step4Output> {
  const snap = await store().getSnapshot(runId);
  if (!snap?.survey || !snap.step2 || !snap.step3Scores) throw new Error("upstream missing");
  const qualified = snap.step3Scores
    .filter((s) => s.score >= 7)
    .map((s) => {
      const opp = snap.step2!.opportunities.find((o) => o.idx === s.opp_idx);
      return opp ? { opp, userScore: s.score, userReason: s.reason } : null;
    })
    .filter((x): x is { opp: Step2Opportunity; userScore: number; userReason: string } => !!x);

  if (qualified.length === 0) throw new Error("no opportunity scored >= 7");

  const queries = qualified.slice(0, 6).map(
    (q) => `${q.opp.title} 2026 中国 市场规模 竞争格局 PEST 政策 趋势`
  );
  const searches = await tavilyMulti(queries, { maxResults: 3 });
  const snippets = searches
    .flatMap((s) => s.results)
    .slice(0, 18)
    .map((r) => `${r.title} (${r.url}): ${r.content?.slice(0, 220) || ""}`);

  const { system, user } = step4Prompt(snap.survey, qualified, snippets);
  const { data } = await llmJSON<Step4Output>({ system, user, maxTokens: 12000 });
  await store().saveStep4(runId, data);
  await store().updateStatus(runId, "step5");
  return data;
}

export async function runStep5(runId: string): Promise<Step5Output> {
  const snap = await store().getSnapshot(runId);
  if (!snap?.survey || !snap.step2 || !snap.step4) throw new Error("upstream missing");
  const shortlist = snap.step4.shortlist
    .map((idx) => {
      const opp = snap.step2!.opportunities.find((o) => o.idx === idx);
      const analysis = snap.step4!.analyses.find((a) => a.idx === idx);
      return opp && analysis ? { opp, analysis } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const { system, user } = step5Prompt(snap.survey, snap.principlesYouSummary, shortlist);
  const { data } = await llmJSON<Step5Output>({ system, user, maxTokens: 8000 });
  await store().saveStep5(runId, data);
  await store().updateStatus(runId, "step6");
  return data;
}

export async function runStep6(runId: string): Promise<Step6Output> {
  const snap = await store().getSnapshot(runId);
  if (!snap?.survey || !snap.step2 || !snap.step4 || !snap.step5) throw new Error("upstream missing");
  const top3 = snap.step5.top3
    .map((idx) => {
      const opp = snap.step2!.opportunities.find((o) => o.idx === idx);
      const analysis = snap.step4!.analyses.find((a) => a.idx === idx);
      const vrin = snap.step5!.vrins.find((v) => v.idx === idx);
      const score = snap.step3Scores?.find((s) => s.opp_idx === idx);
      if (!opp || !analysis || !vrin || !score) return null;
      return { opp, analysis, vrin, userScore: score.score, userReason: score.reason };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const { system, user } = step6Prompt(snap.survey, snap.principlesYouSummary, top3);
  const { data } = await llmJSON<Step6Output>({ system, user, maxTokens: 10000 });
  await store().saveStep6(runId, data);
  await store().updateStatus(runId, "done");
  return data;
}
