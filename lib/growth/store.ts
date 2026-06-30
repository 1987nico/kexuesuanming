import { isDBConfigured, supabaseServer } from "@/lib/db/supabase";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthPlan,
  GrowthReview,
  GrowthRun,
  UsageEvent,
} from "./types";

export interface GrowthStore {
  saveAccount(account: GrowthAccount): Promise<void>;
  getAccount(id: string): Promise<GrowthAccount | null>;
  getLatestAccount(tenantId: string): Promise<GrowthAccount | null>;
  savePlan(plan: GrowthPlan): Promise<void>;
  getPlan(id: string): Promise<GrowthPlan | null>;
  getLatestPlan(accountId: string): Promise<GrowthPlan | null>;
  saveRun(run: GrowthRun): Promise<void>;
  getRun(id: string): Promise<GrowthRun | null>;
  listRuns(accountId: string): Promise<GrowthRun[]>;
  saveDraft(draft: ContentDraft): Promise<void>;
  getDraft(id: string): Promise<ContentDraft | null>;
  listDrafts(accountId: string): Promise<ContentDraft[]>;
  saveReview(review: GrowthReview): Promise<void>;
  saveUsage(event: Omit<UsageEvent, "id" | "created_at">): Promise<void>;
}

class MemoryGrowthStore implements GrowthStore {
  private accounts = new Map<string, GrowthAccount>();
  private plans = new Map<string, GrowthPlan>();
  private runs = new Map<string, GrowthRun>();
  private drafts = new Map<string, ContentDraft>();
  private reviews = new Map<string, GrowthReview>();
  private usage: UsageEvent[] = [];

  async saveAccount(account: GrowthAccount) {
    this.accounts.set(account.id, account);
  }

  async getAccount(id: string) {
    return this.accounts.get(id) ?? null;
  }

  async getLatestAccount(tenantId: string) {
    return (
      [...this.accounts.values()]
        .filter((account) => account.tenant_id === tenantId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }

  async savePlan(plan: GrowthPlan) {
    this.plans.set(plan.id, plan);
  }

  async getPlan(id: string) {
    return this.plans.get(id) ?? null;
  }

  async getLatestPlan(accountId: string) {
    return (
      [...this.plans.values()]
        .filter((plan) => plan.account_id === accountId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }

  async saveRun(run: GrowthRun) {
    this.runs.set(run.id, run);
    if (run.draft) this.drafts.set(run.draft.id, run.draft);
    if (run.review) this.reviews.set(run.review.id, run.review);
  }

  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }

  async listRuns(accountId: string) {
    return [...this.runs.values()]
      .filter((run) => run.account_id === accountId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async saveDraft(draft: ContentDraft) {
    this.drafts.set(draft.id, draft);
  }

  async getDraft(id: string) {
    return this.drafts.get(id) ?? null;
  }

  async listDrafts(accountId: string) {
    return [...this.drafts.values()]
      .filter((draft) => draft.account_id === accountId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async saveReview(review: GrowthReview) {
    this.reviews.set(review.id, review);
  }

  async saveUsage(event: Omit<UsageEvent, "id" | "created_at">) {
    this.usage.push({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...event,
    });
  }
}

class SupabaseGrowthStore implements GrowthStore {
  private get db() {
    return supabaseServer();
  }

  async saveAccount(account: GrowthAccount) {
    const { error } = await this.db.from("growth_accounts").upsert({
      id: account.id,
      tenant_id: account.tenant_id,
      name: account.name,
      target_user: account.target_user,
      core_problem: account.core_problem,
      payload: account,
      updated_at: account.updated_at,
    });
    if (error) throw error;
  }

  async getAccount(id: string) {
    const { data, error } = await this.db
      .from("growth_accounts")
      .select("payload")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as GrowthAccount) ?? null;
  }

  async getLatestAccount(tenantId: string) {
    const { data, error } = await this.db
      .from("growth_accounts")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as GrowthAccount) ?? null;
  }

  async savePlan(plan: GrowthPlan) {
    const { error } = await this.db.from("growth_plans").upsert({
      id: plan.id,
      tenant_id: plan.tenant_id,
      account_id: plan.account_id,
      title: plan.title,
      payload: plan,
      updated_at: plan.updated_at,
    });
    if (error) throw error;
  }

  async getPlan(id: string) {
    const { data, error } = await this.db.from("growth_plans").select("payload").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data?.payload as GrowthPlan) ?? null;
  }

  async getLatestPlan(accountId: string) {
    const { data, error } = await this.db
      .from("growth_plans")
      .select("payload")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as GrowthPlan) ?? null;
  }

  async saveRun(run: GrowthRun) {
    const { error } = await this.db.from("growth_runs").upsert({
      id: run.id,
      tenant_id: run.tenant_id,
      account_id: run.account_id,
      plan_id: run.plan_id,
      status: run.status,
      week: run.week,
      objective: run.objective,
      payload: run,
      updated_at: run.updated_at,
    });
    if (error) throw error;
    if (run.draft) await this.saveDraft(run.draft);
    if (run.review) await this.saveReview(run.review);
  }

  async getRun(id: string) {
    const { data, error } = await this.db.from("growth_runs").select("payload").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data?.payload as GrowthRun) ?? null;
  }

  async listRuns(accountId: string) {
    const { data, error } = await this.db
      .from("growth_runs")
      .select("payload")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => row.payload as GrowthRun);
  }

  async saveDraft(draft: ContentDraft) {
    const { error } = await this.db.from("content_drafts").upsert({
      id: draft.id,
      tenant_id: draft.tenant_id,
      account_id: draft.account_id,
      run_id: draft.run_id,
      status: draft.status,
      title: draft.title,
      direction: draft.direction,
      content_type: draft.content_type,
      payload: draft,
      updated_at: draft.updated_at,
    });
    if (error) throw error;
  }

  async getDraft(id: string) {
    const { data, error } = await this.db.from("content_drafts").select("payload").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data?.payload as ContentDraft) ?? null;
  }

  async listDrafts(accountId: string) {
    const { data, error } = await this.db
      .from("content_drafts")
      .select("payload")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => row.payload as ContentDraft);
  }

  async saveReview(review: GrowthReview) {
    const { error } = await this.db.from("growth_reviews").upsert({
      id: review.id,
      tenant_id: review.tenant_id,
      draft_id: review.draft_id,
      classification: review.classification,
      payload: review,
    });
    if (error) throw error;
  }

  async saveUsage(event: Omit<UsageEvent, "id" | "created_at">) {
    const { error } = await this.db.from("usage_events").insert({
      tenant_id: event.tenant_id,
      feature: event.feature,
      provider: event.provider,
      model: event.model,
      input_tokens: event.input_tokens,
      output_tokens: event.output_tokens,
      units: event.units,
      cost_cents: event.cost_cents,
      metadata: event.metadata ?? {},
    });
    if (error) throw error;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __GROWTH_STORE__: GrowthStore | undefined;
}

export function growthStore(): GrowthStore {
  if (!globalThis.__GROWTH_STORE__) {
    globalThis.__GROWTH_STORE__ = isDBConfigured() ? new SupabaseGrowthStore() : new MemoryGrowthStore();
    if (!isDBConfigured()) {
      console.warn("[growthStore] 未配置 Supabase，已启用增长模块内存存储。");
    }
  }
  return globalThis.__GROWTH_STORE__;
}
