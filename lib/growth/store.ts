import { assertCloudDatabaseConfigured, isDBConfigured, supabaseServer } from "@/lib/db/supabase";
import type {
  BusinessSettings,
  ContentDraft,
  GrowthAccount,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthRun,
  UsageEvent,
} from "./types";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";

export interface GrowthStore {
  saveAccount(account: GrowthAccount): Promise<void>;
  getAccount(id: string): Promise<GrowthAccount | null>;
  /**
   * 取该租户下最新账号。
   * ownerUserId 传入时只返回「自己的或未归属（历史共享）」账号——操作者工作台隔离用；
   * 不传则不限归属（管理员视角）。
   */
  getLatestAccount(tenantId: string, ownerUserId?: string): Promise<GrowthAccount | null>;
  /**
   * 取指定视角下最新的账号。
   * ownerUserId 传入时只返回「自己的或未归属（历史共享）」账号——操作者工作台隔离用；
   * 不传则不限归属（管理员视角）。
   */
  getLatestAccountByPersona(
    tenantId: string,
    persona: GrowthPersona,
    ownerUserId?: string,
  ): Promise<GrowthAccount | null>;
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
  getReviewByDraft(draftId: string): Promise<GrowthReview | null>;
  listReviewsByAccount(accountId: string): Promise<GrowthReview[]>;
  saveUsage(event: Omit<UsageEvent, "id" | "created_at">): Promise<void>;
  getBusinessSettings(tenantId: string): Promise<BusinessSettings>;
  saveBusinessSettings(settings: BusinessSettings): Promise<void>;
}

function matchesOwner(account: GrowthAccount, ownerUserId?: string) {
  if (!ownerUserId) return true;
  return account.owner_user_id === ownerUserId || account.owner_user_id == null;
}

function defaultBusinessSettings(tenantId: string): BusinessSettings {
  return {
    tenant_id: tenantId,
    ...DEFAULT_BUSINESS_SETTINGS,
    updated_at: new Date().toISOString(),
  };
}

function canonicalReviews(reviews: GrowthReview[]) {
  const byDraft = new Map<string, GrowthReview>();
  for (const review of reviews) {
    const existing = byDraft.get(review.draft_id);
    const timestamp = review.updated_at || review.metrics.snapshot_at || review.created_at;
    const existingTimestamp = existing
      ? existing.updated_at || existing.metrics.snapshot_at || existing.created_at
      : "";
    if (!existing || timestamp.localeCompare(existingTimestamp) > 0) byDraft.set(review.draft_id, review);
  }
  return [...byDraft.values()].sort((a, b) =>
    (b.updated_at || b.metrics.snapshot_at || b.created_at).localeCompare(
      a.updated_at || a.metrics.snapshot_at || a.created_at,
    ),
  );
}

class MemoryGrowthStore implements GrowthStore {
  private accounts = new Map<string, GrowthAccount>();
  private plans = new Map<string, GrowthPlan>();
  private runs = new Map<string, GrowthRun>();
  private drafts = new Map<string, ContentDraft>();
  private reviews = new Map<string, GrowthReview>();
  private usage: UsageEvent[] = [];
  private settings = new Map<string, BusinessSettings>();

  async saveAccount(account: GrowthAccount) {
    this.accounts.set(account.id, account);
  }

  async getAccount(id: string) {
    return this.accounts.get(id) ?? null;
  }

  async getLatestAccount(tenantId: string, ownerUserId?: string) {
    return (
      [...this.accounts.values()]
        .filter((account) => account.tenant_id === tenantId)
        .filter((account) => matchesOwner(account, ownerUserId))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }

  async getLatestAccountByPersona(tenantId: string, persona: GrowthPersona, ownerUserId?: string) {
    return (
      [...this.accounts.values()]
        .filter((account) => account.tenant_id === tenantId && account.persona === persona)
        .filter((account) => matchesOwner(account, ownerUserId))
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
    for (const [reviewId, existing] of this.reviews) {
      if (existing.draft_id === review.draft_id && reviewId !== review.id) this.reviews.delete(reviewId);
    }
    this.reviews.set(review.id, review);
  }

  async getReviewByDraft(draftId: string) {
    return (
      [...this.reviews.values()]
        .filter((review) => review.draft_id === draftId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }

  async listReviewsByAccount(accountId: string) {
    const draftIds = new Set(
      [...this.drafts.values()].filter((d) => d.account_id === accountId).map((d) => d.id)
    );
    return canonicalReviews([...this.reviews.values()].filter((review) => draftIds.has(review.draft_id)));
  }

  async saveUsage(event: Omit<UsageEvent, "id" | "created_at">) {
    this.usage.push({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...event,
    });
  }

  async getBusinessSettings(tenantId: string) {
    return this.settings.get(tenantId) ?? defaultBusinessSettings(tenantId);
  }

  async saveBusinessSettings(settings: BusinessSettings) {
    this.settings.set(settings.tenant_id, settings);
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
      owner_user_id: account.owner_user_id ?? null,
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

  async getLatestAccount(tenantId: string, ownerUserId?: string) {
    // owner_user_id 存在 payload 里，无法用 SQL 直接过滤，取近 50 条后在内存里按归属挑选
    const { data, error } = await this.db
      .from("growth_accounts")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const accounts = (data ?? []).map((row) => row.payload as GrowthAccount);
    return accounts.find((account) => matchesOwner(account, ownerUserId)) ?? null;
  }

  async getLatestAccountByPersona(tenantId: string, persona: GrowthPersona, ownerUserId?: string) {
    const { data, error } = await this.db
      .from("growth_accounts")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const accounts = (data ?? []).map((row) => row.payload as GrowthAccount);
    return accounts.find((account) => account.persona === persona && matchesOwner(account, ownerUserId)) ?? null;
  }

  async savePlan(plan: GrowthPlan) {
    const { error } = await this.db.from("growth_plans").upsert({
      id: plan.id,
      tenant_id: plan.tenant_id,
      owner_user_id: plan.owner_user_id ?? null,
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
      owner_user_id: run.owner_user_id ?? null,
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
      owner_user_id: draft.owner_user_id ?? null,
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
    const { error: cleanupError } = await this.db
      .from("growth_reviews")
      .delete()
      .eq("draft_id", review.draft_id)
      .neq("id", review.id);
    if (cleanupError) throw cleanupError;
    const { error } = await this.db.from("growth_reviews").upsert({
      id: review.id,
      tenant_id: review.tenant_id,
      owner_user_id: review.owner_user_id ?? null,
      draft_id: review.draft_id,
      classification: review.classification,
      payload: review,
    });
    if (error) throw error;
  }

  async getReviewByDraft(draftId: string) {
    const { data, error } = await this.db
      .from("growth_reviews")
      .select("payload")
      .eq("draft_id", draftId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as GrowthReview) ?? null;
  }

  async listReviewsByAccount(accountId: string) {
    const drafts = await this.listDrafts(accountId);
    const draftIds = drafts.map((d) => d.id);
    if (draftIds.length === 0) return [];
    const { data, error } = await this.db
      .from("growth_reviews")
      .select("payload")
      .in("draft_id", draftIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return canonicalReviews((data ?? []).map((row) => row.payload as GrowthReview));
  }

  async saveUsage(event: Omit<UsageEvent, "id" | "created_at">) {
    const { error } = await this.db.from("usage_events").insert({
      tenant_id: event.tenant_id,
      user_id: event.user_id ?? null,
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

  async getBusinessSettings(tenantId: string) {
    const { data, error } = await this.db
      .from("growth_business_settings")
      .select("payload")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as BusinessSettings) ?? defaultBusinessSettings(tenantId);
  }

  async saveBusinessSettings(settings: BusinessSettings) {
    const { error } = await this.db.from("growth_business_settings").upsert({
      tenant_id: settings.tenant_id,
      payload: settings,
      updated_at: settings.updated_at,
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
    assertCloudDatabaseConfigured("growthStore");
    globalThis.__GROWTH_STORE__ = isDBConfigured() ? new SupabaseGrowthStore() : new MemoryGrowthStore();
    if (!isDBConfigured()) {
      console.warn("[growthStore] 未配置 Supabase，已启用增长模块内存存储。");
    }
  }
  return globalThis.__GROWTH_STORE__;
}
