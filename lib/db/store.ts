/**
 * Store —— 数据持久化抽象层
 *
 * 价值验证阶段：默认走 MemoryStore（无需配置即可起跑，方便闭环 demo）
 * 生产/真实用户：通过 SUPABASE_SERVICE_ROLE_KEY 自动切到 SupabaseStore
 *
 * 任何业务代码都通过 store() 拿实例，不直接调 Supabase。
 */

import { isDBConfigured, supabaseServer } from "./supabase";
import type { Step1Output } from "@/lib/llm/prompts/step1";
import type { Step2Output, Step2Opportunity } from "@/lib/llm/prompts/step2";
import type { Step4Output } from "@/lib/llm/prompts/step4";
import type { Step5Output } from "@/lib/llm/prompts/step5";
import type { Step6Output } from "@/lib/llm/prompts/step6";
import type { SurveyData } from "@/lib/survey/schema";
import type { QuickItem, QuickRespondent, QuickScore } from "@/lib/quickScore/types";

export type RunStatus =
  | "survey"
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "step5"
  | "step6"
  | "done";

export interface RunRecord {
  id: string;
  user_id?: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
}

export interface RunSnapshot {
  run: RunRecord;
  survey?: SurveyData;
  principlesYouSummary?: string;
  step1?: Step1Output;
  step2?: Step2Output;
  step3Scores?: { opp_idx: number; score: number; reason: string }[];
  step4?: Step4Output;
  step5?: Step5Output;
  step6?: Step6Output;
}

export interface Store {
  createRun(): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  updateStatus(id: string, status: RunStatus): Promise<void>;
  saveSurvey(runId: string, data: SurveyData, principlesYouSummary?: string): Promise<void>;
  saveStep1(runId: string, data: Step1Output): Promise<void>;
  saveStep2(runId: string, data: Step2Output): Promise<void>;
  saveStep3Score(runId: string, opp_idx: number, score: number, reason: string): Promise<void>;
  getStep3Scores(runId: string): Promise<{ opp_idx: number; score: number; reason: string }[]>;
  saveStep4(runId: string, data: Step4Output): Promise<void>;
  saveStep5(runId: string, data: Step5Output): Promise<void>;
  saveStep6(runId: string, data: Step6Output): Promise<void>;
  getSnapshot(runId: string): Promise<RunSnapshot | null>;
  saveMetrics(runId: string, metrics: Record<string, unknown>): Promise<void>;

  // ====== Quick Score（轻量打分分享，跟 runs 解耦）======
  ensureQuickPanel(panelId: string, title: string, items: QuickItem[]): Promise<void>;
  getQuickPanel(panelId: string): Promise<{ id: string; title: string; items: QuickItem[] } | null>;
  createQuickRespondent(panelId: string, name: string): Promise<QuickRespondent>;
  getQuickRespondent(respondentId: string): Promise<QuickRespondent | null>;
  upsertQuickScore(respondentId: string, oppIdx: number, score: number, reason?: string): Promise<void>;
  getQuickScoresByRespondent(respondentId: string): Promise<QuickScore[]>;
  getQuickPanelAggregate(panelId: string): Promise<{ respondents: QuickRespondent[]; scores: QuickScore[] }>;
}

// =============== MemoryStore ===============

class MemoryStore implements Store {
  private runs = new Map<string, RunRecord>();
  private snapshots = new Map<string, RunSnapshot>();
  private quickPanels = new Map<string, { id: string; title: string; items: QuickItem[] }>();
  private quickRespondents = new Map<string, QuickRespondent>();
  private quickScores = new Map<string, QuickScore>(); // key = `${respondent_id}:${opp_idx}`

  async createRun(): Promise<RunRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const r: RunRecord = { id, status: "survey", created_at: now, updated_at: now };
    this.runs.set(id, r);
    this.snapshots.set(id, { run: r });
    return r;
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }
  async updateStatus(id: string, status: RunStatus) {
    const r = this.runs.get(id);
    if (!r) return;
    r.status = status;
    r.updated_at = new Date().toISOString();
    const snap = this.snapshots.get(id);
    if (snap) snap.run = r;
  }
  private snap(id: string): RunSnapshot {
    let s = this.snapshots.get(id);
    if (!s) {
      const r = this.runs.get(id)!;
      s = { run: r };
      this.snapshots.set(id, s);
    }
    return s;
  }
  async saveSurvey(runId: string, data: SurveyData, principlesYouSummary?: string) {
    const s = this.snap(runId);
    s.survey = data;
    s.principlesYouSummary = principlesYouSummary;
  }
  async saveStep1(runId: string, data: Step1Output) {
    this.snap(runId).step1 = data;
  }
  async saveStep2(runId: string, data: Step2Output) {
    this.snap(runId).step2 = data;
  }
  async saveStep3Score(runId: string, opp_idx: number, score: number, reason: string) {
    const s = this.snap(runId);
    if (!s.step3Scores) s.step3Scores = [];
    const idx = s.step3Scores.findIndex((x) => x.opp_idx === opp_idx);
    const rec = { opp_idx, score, reason };
    if (idx >= 0) s.step3Scores[idx] = rec;
    else s.step3Scores.push(rec);
  }
  async getStep3Scores(runId: string) {
    return this.snap(runId).step3Scores ?? [];
  }
  async saveStep4(runId: string, data: Step4Output) {
    this.snap(runId).step4 = data;
  }
  async saveStep5(runId: string, data: Step5Output) {
    this.snap(runId).step5 = data;
  }
  async saveStep6(runId: string, data: Step6Output) {
    this.snap(runId).step6 = data;
  }
  async getSnapshot(runId: string) {
    return this.snapshots.get(runId) ?? null;
  }
  async saveMetrics(_runId: string, _metrics: Record<string, unknown>) {
    // MemoryStore 暂不存储指标
  }

  // ====== Quick Score（轻量打分） ======
  async ensureQuickPanel(panelId: string, title: string, items: QuickItem[]) {
    if (!this.quickPanels.has(panelId)) {
      this.quickPanels.set(panelId, { id: panelId, title, items });
    }
  }
  async getQuickPanel(panelId: string) {
    return this.quickPanels.get(panelId) ?? null;
  }
  async createQuickRespondent(panelId: string, name: string): Promise<QuickRespondent> {
    const now = new Date().toISOString();
    const r: QuickRespondent = {
      id: crypto.randomUUID(),
      panel_id: panelId,
      name,
      created_at: now,
      updated_at: now,
    };
    this.quickRespondents.set(r.id, r);
    return r;
  }
  async getQuickRespondent(respondentId: string): Promise<QuickRespondent | null> {
    return this.quickRespondents.get(respondentId) ?? null;
  }
  async upsertQuickScore(respondentId: string, oppIdx: number, score: number, reason?: string) {
    const key = `${respondentId}:${oppIdx}`;
    this.quickScores.set(key, {
      respondent_id: respondentId,
      opp_idx: oppIdx,
      score,
      reason,
      scored_at: new Date().toISOString(),
    });
    const r = this.quickRespondents.get(respondentId);
    if (r) {
      r.updated_at = new Date().toISOString();
    }
  }
  async getQuickScoresByRespondent(respondentId: string): Promise<QuickScore[]> {
    const out: QuickScore[] = [];
    for (const s of this.quickScores.values()) {
      if (s.respondent_id === respondentId) out.push(s);
    }
    return out;
  }
  async getQuickPanelAggregate(panelId: string) {
    const respondents: QuickRespondent[] = [];
    for (const r of this.quickRespondents.values()) {
      if (r.panel_id === panelId) respondents.push(r);
    }
    const respondentIds = new Set(respondents.map((r) => r.id));
    const scores: QuickScore[] = [];
    for (const s of this.quickScores.values()) {
      if (respondentIds.has(s.respondent_id)) scores.push(s);
    }
    return { respondents, scores };
  }
}

// =============== SupabaseStore ===============

class SupabaseStore implements Store {
  private get db() {
    return supabaseServer();
  }
  async createRun(): Promise<RunRecord> {
    const { data, error } = await this.db.from("runs").insert({}).select().single();
    if (error || !data) throw error || new Error("createRun failed");
    return data as RunRecord;
  }
  async getRun(id: string) {
    const { data } = await this.db.from("runs").select().eq("id", id).maybeSingle();
    return (data as RunRecord) ?? null;
  }
  async updateStatus(id: string, status: RunStatus) {
    await this.db.from("runs").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async saveSurvey(runId: string, data: SurveyData, principlesYouSummary?: string) {
    await this.db.from("survey_answers").upsert({
      run_id: runId,
      payload: data,
      principles_you_summary: principlesYouSummary,
      updated_at: new Date().toISOString(),
    });
  }
  async saveStep1(runId: string, data: Step1Output) {
    await this.db.from("step1_output").upsert({
      run_id: runId,
      like_profile: data.likeProfile,
      dislike_profile: data.dislikeProfile,
      themes: data.themes,
      principles_cross_check: data.principlesCrossCheck,
      conflict_note: data.conflictNote,
    });
  }
  async saveStep2(runId: string, data: Step2Output) {
    await this.db.from("step2_opportunities").delete().eq("run_id", runId);
    await this.db.from("step2_opportunities").insert(
      data.opportunities.map((o: Step2Opportunity) => ({
        run_id: runId,
        idx: o.idx,
        category: o.category,
        title: o.title,
        one_liner: o.oneLiner,
        day_in_life: o.dayInLife,
        work_content: o.workContent,
        work_methods: o.workMethods,
        image_prompt: o.imagePrompt,
        evidence: o.evidence,
      }))
    );
  }
  async saveStep3Score(runId: string, opp_idx: number, score: number, reason: string) {
    await this.db.from("step3_scores").upsert({
      run_id: runId,
      opp_idx,
      score,
      reason,
      scored_at: new Date().toISOString(),
    });
  }
  async getStep3Scores(runId: string) {
    const { data } = await this.db.from("step3_scores").select("opp_idx,score,reason").eq("run_id", runId);
    return (data as any[]) ?? [];
  }
  async saveStep4(runId: string, data: Step4Output) {
    await this.db.from("step4_analysis").delete().eq("run_id", runId);
    await this.db.from("step4_analysis").insert(
      data.analyses.map((a) => ({
        run_id: runId,
        opp_idx: a.idx,
        pest: a.pest,
        five_forces_now: a.fiveForcesNow,
        five_forces_future: a.fiveForcesFuture,
        score_now: a.scoreNow,
        score_future: a.scoreFuture,
        conclusion: a.conclusion,
        in_shortlist: data.shortlist.includes(a.idx),
      }))
    );
  }
  async saveStep5(runId: string, data: Step5Output) {
    await this.db.from("step5_vrin").delete().eq("run_id", runId);
    const rankMap = new Map(data.decisionMatrix.map((d) => [d.idx, d.rank]));
    await this.db.from("step5_vrin").insert(
      data.vrins.map((v) => ({
        run_id: runId,
        opp_idx: v.idx,
        v: v.v,
        r: v.r,
        i: v.i,
        n: v.n,
        total: v.total,
        evidence: v.evidence,
        ninety_day_actions: v.ninetyDayActions,
        is_top3: data.top3.includes(v.idx),
        rank: rankMap.get(v.idx),
      }))
    );
  }
  async saveStep6(runId: string, data: Step6Output) {
    await this.db.from("step6_premortem").delete().eq("run_id", runId);
    await this.db.from("step6_narrative").delete().eq("run_id", runId);
    await this.db.from("step6_action_links").delete().eq("run_id", runId);
    for (const pm of data.premortems) {
      await this.db.from("step6_narrative").insert({
        run_id: runId,
        opp_idx: pm.idx,
        story_text: pm.narrative,
      });
      await this.db.from("step6_premortem").insert(
        pm.findings.map((f) => ({
          run_id: runId,
          opp_idx: pm.idx,
          layer: f.layer,
          failure_reason: f.failureReason,
          early_signal_30d: f.earlySignal30d,
          early_signal_90d: f.earlySignal90d,
          early_signal_6m: f.earlySignal6m,
          exit_condition: f.exitCondition,
          mitigation: f.mitigation,
        }))
      );
      await this.db.from("step6_action_links").insert(
        pm.actionLinks.map((al) => ({
          run_id: runId,
          opp_idx: pm.idx,
          action_day: al.actionDay,
          failure_layer: al.failureLayer,
        }))
      );
    }
  }
  async getSnapshot(runId: string): Promise<RunSnapshot | null> {
    const run = await this.getRun(runId);
    if (!run) return null;
    const [survey, step1, step2, step3, step4, step5, step6Findings, step6Narratives] =
      await Promise.all([
        this.db.from("survey_answers").select().eq("run_id", runId).maybeSingle(),
        this.db.from("step1_output").select().eq("run_id", runId).maybeSingle(),
        this.db.from("step2_opportunities").select().eq("run_id", runId).order("idx"),
        this.db.from("step3_scores").select().eq("run_id", runId),
        this.db.from("step4_analysis").select().eq("run_id", runId),
        this.db.from("step5_vrin").select().eq("run_id", runId),
        this.db.from("step6_premortem").select().eq("run_id", runId),
        this.db.from("step6_narrative").select().eq("run_id", runId),
      ]);
    const snap: RunSnapshot = { run };
    if (survey.data) {
      snap.survey = survey.data.payload as SurveyData;
      snap.principlesYouSummary = survey.data.principles_you_summary;
    }
    if (step1.data) {
      const d: any = step1.data;
      snap.step1 = {
        likeProfile: d.like_profile,
        dislikeProfile: d.dislike_profile,
        themes: d.themes,
        principlesCrossCheck: d.principles_cross_check,
        conflictNote: d.conflict_note,
      };
    }
    if (step2.data?.length) {
      snap.step2 = {
        opportunities: step2.data.map((o: any) => ({
          idx: o.idx,
          category: o.category,
          title: o.title,
          oneLiner: o.one_liner,
          dayInLife: o.day_in_life,
          workContent: o.work_content,
          workMethods: o.work_methods,
          imagePrompt: o.image_prompt,
          evidence: o.evidence,
        })),
      };
    }
    if (step3.data?.length) {
      snap.step3Scores = step3.data.map((s: any) => ({
        opp_idx: s.opp_idx,
        score: s.score,
        reason: s.reason,
      }));
    }
    if (step4.data?.length) {
      snap.step4 = {
        analyses: step4.data.map((a: any) => ({
          idx: a.opp_idx,
          title: a.title ?? "",
          pest: a.pest,
          fiveForcesNow: a.five_forces_now,
          fiveForcesFuture: a.five_forces_future,
          scoreNow: a.score_now,
          scoreFuture: a.score_future,
          conclusion: a.conclusion,
        })),
        shortlist: step4.data.filter((a: any) => a.in_shortlist).map((a: any) => a.opp_idx),
      };
    }
    if (step5.data?.length) {
      const rankList = step5.data
        .filter((v: any) => v.rank)
        .sort((a: any, b: any) => a.rank - b.rank);
      snap.step5 = {
        vrins: step5.data.map((v: any) => ({
          idx: v.opp_idx,
          title: v.title ?? "",
          v: v.v,
          r: v.r,
          i: v.i,
          n: v.n,
          total: v.total,
          evidence: v.evidence,
          ninetyDayActions: v.ninety_day_actions,
        })),
        top3: step5.data.filter((v: any) => v.is_top3).map((v: any) => v.opp_idx),
        decisionMatrix: rankList.map((v: any, idx: number) => ({
          idx: v.opp_idx,
          title: v.title ?? "",
          opportunitySize: 0,
          personalEdge: v.total,
          composite: 0,
          rank: v.rank ?? idx + 1,
        })),
      };
    }
    if (step6Findings.data?.length || step6Narratives.data?.length) {
      const byOpp = new Map<number, any>();
      for (const n of step6Narratives.data || []) {
        byOpp.set(n.opp_idx, { idx: n.opp_idx, narrative: n.story_text, findings: [], actionLinks: [] });
      }
      for (const f of step6Findings.data || []) {
        const k = byOpp.get(f.opp_idx) ?? { idx: f.opp_idx, narrative: "", findings: [], actionLinks: [] };
        k.findings.push({
          layer: f.layer,
          failureReason: f.failure_reason,
          earlySignal30d: f.early_signal_30d,
          earlySignal90d: f.early_signal_90d,
          earlySignal6m: f.early_signal_6m,
          exitCondition: f.exit_condition,
          mitigation: f.mitigation,
        });
        byOpp.set(f.opp_idx, k);
      }
      snap.step6 = { premortems: Array.from(byOpp.values()) };
    }
    return snap;
  }
  async saveMetrics(runId: string, metrics: Record<string, unknown>) {
    await this.db.from("run_metrics").upsert({
      run_id: runId,
      ...metrics,
      recorded_at: new Date().toISOString(),
    });
  }

  // ====== Quick Score ======
  async ensureQuickPanel(panelId: string, title: string, items: QuickItem[]) {
    const { data } = await this.db.from("quick_panels").select("id").eq("id", panelId).maybeSingle();
    if (data) return;
    await this.db.from("quick_panels").insert({ id: panelId, title, items });
  }
  async getQuickPanel(panelId: string) {
    const { data } = await this.db
      .from("quick_panels")
      .select("id,title,items")
      .eq("id", panelId)
      .maybeSingle();
    if (!data) return null;
    return { id: data.id as string, title: data.title as string, items: data.items as QuickItem[] };
  }
  async createQuickRespondent(panelId: string, name: string): Promise<QuickRespondent> {
    const { data, error } = await this.db
      .from("quick_respondents")
      .insert({ panel_id: panelId, name })
      .select()
      .single();
    if (error || !data) throw error || new Error("createQuickRespondent failed");
    return data as QuickRespondent;
  }
  async getQuickRespondent(respondentId: string): Promise<QuickRespondent | null> {
    const { data } = await this.db
      .from("quick_respondents")
      .select()
      .eq("id", respondentId)
      .maybeSingle();
    return (data as QuickRespondent) ?? null;
  }
  async upsertQuickScore(respondentId: string, oppIdx: number, score: number, reason?: string) {
    const now = new Date().toISOString();
    await this.db.from("quick_scores").upsert({
      respondent_id: respondentId,
      opp_idx: oppIdx,
      score,
      reason: reason ?? null,
      scored_at: now,
    });
    await this.db.from("quick_respondents").update({ updated_at: now }).eq("id", respondentId);
  }
  async getQuickScoresByRespondent(respondentId: string): Promise<QuickScore[]> {
    const { data } = await this.db
      .from("quick_scores")
      .select()
      .eq("respondent_id", respondentId);
    return ((data as QuickScore[]) ?? []);
  }
  async getQuickPanelAggregate(panelId: string) {
    const { data: respondents } = await this.db
      .from("quick_respondents")
      .select()
      .eq("panel_id", panelId)
      .order("created_at", { ascending: true });
    const list = (respondents as QuickRespondent[]) ?? [];
    if (list.length === 0) return { respondents: [], scores: [] };
    const ids = list.map((r) => r.id);
    const { data: scores } = await this.db
      .from("quick_scores")
      .select()
      .in("respondent_id", ids);
    return { respondents: list, scores: (scores as QuickScore[]) ?? [] };
  }
}

// =============== Singleton ===============

declare global {
  // eslint-disable-next-line no-var
  var __KXSM_STORE__: Store | undefined;
}

export function store(): Store {
  if (!globalThis.__KXSM_STORE__) {
    globalThis.__KXSM_STORE__ = isDBConfigured() ? new SupabaseStore() : new MemoryStore();
    if (!isDBConfigured()) {
      // 仅在 dev 提示一次
      console.warn("[store] 未配置 Supabase，已启用内存存储（重启即丢，仅用于价值验证 demo）");
    }
  }
  return globalThis.__KXSM_STORE__;
}
