import { assertCloudDatabaseConfigured, isDBConfigured, supabaseServer } from "@/lib/db/supabase";
import type {
  BusinessSettings,
  ContentDraft,
  GrowthAccount,
  GrowthBusinessLine,
  GrowthPersona,
  GrowthPlan,
  GrowthReview,
  GrowthRun,
  UsageEvent,
} from "./types";
import { DEFAULT_BUSINESS_SETTINGS } from "./types";
import {
  assertGrowthPreviewIsSafe,
  createGrowthPreviewFixture,
  growthPreviewEnabled,
} from "./previewFixture";
import { resolveAccountBusinessLine } from "./businessCompatibility";

export interface GrowthStore {
  saveAccount(account: GrowthAccount): Promise<void>;
  getAccount(id: string): Promise<GrowthAccount | null>;
  /**
   * 取该租户下最新账号。
   * ownerUserId 传入时只返回本人账号；未归属历史账号仅管理员可见。
   * 不传则不限归属（管理员视角）。
   */
  getLatestAccount(tenantId: string, ownerUserId?: string): Promise<GrowthAccount | null>;
  /**
   * 取指定视角下最新的账号。
   * ownerUserId 传入时只返回本人账号；未归属历史账号仅管理员可见。
   * 不传则不限归属（管理员视角）。
   */
  getLatestAccountByPersona(
    tenantId: string,
    persona: GrowthPersona,
    ownerUserId?: string,
    businessLine?: GrowthBusinessLine,
  ): Promise<GrowthAccount | null>;
  listAccounts(
    tenantId: string,
    ownerUserId?: string,
    businessLine?: GrowthBusinessLine,
  ): Promise<GrowthAccount[]>;
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
  listReviewsByAccount(accountId: string, knownDraftIds?: string[]): Promise<GrowthReview[]>;
  saveUsage(event: Omit<UsageEvent, "id" | "created_at">): Promise<void>;
  getBusinessSettings(tenantId: string): Promise<BusinessSettings>;
  saveBusinessSettings(settings: BusinessSettings): Promise<void>;
}

function matchesOwner(account: GrowthAccount, ownerUserId?: string) {
  if (!ownerUserId) return true;
  return account.owner_user_id === ownerUserId;
}

export function inferGrowthBusinessLine(account: GrowthAccount): GrowthBusinessLine {
  return resolveAccountBusinessLine(account);
}

export function isGrowthSchemaCompatibilityError(error: { code?: string | null }) {
  return new Set(["23502", "42703", "PGRST204"]).has(error.code ?? "");
}

function matchesBusinessLine(account: GrowthAccount, businessLine?: GrowthBusinessLine) {
  if (!businessLine) return true;
  return inferGrowthBusinessLine(account) === businessLine;
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

  constructor(seedPreview = false) {
    if (!seedPreview) return;
    const fixture = createGrowthPreviewFixture();
    for (const account of fixture.accounts) this.accounts.set(account.id, account);
    for (const plan of fixture.plans) this.plans.set(plan.id, plan);
    for (const run of fixture.runs) this.runs.set(run.id, run);
    for (const draft of fixture.drafts) this.drafts.set(draft.id, draft);
    for (const review of fixture.reviews) this.reviews.set(review.id, review);
  }

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

  async getLatestAccountByPersona(tenantId: string, persona: GrowthPersona, ownerUserId?: string, businessLine?: GrowthBusinessLine) {
    return (
      [...this.accounts.values()]
        .filter((account) => account.tenant_id === tenantId && account.persona === persona)
        .filter((account) => matchesOwner(account, ownerUserId))
        .filter((account) => matchesBusinessLine(account, businessLine))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }

  async listAccounts(tenantId: string, ownerUserId?: string, businessLine?: GrowthBusinessLine) {
    return [...this.accounts.values()]
      .filter((account) => account.tenant_id === tenantId)
      .filter((account) => matchesOwner(account, ownerUserId))
      .filter((account) => matchesBusinessLine(account, businessLine))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
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

  async listReviewsByAccount(accountId: string, knownDraftIds?: string[]) {
    const draftIds = new Set(knownDraftIds ?? (
      [...this.drafts.values()].filter((d) => d.account_id === accountId).map((d) => d.id)
    ));
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
  private supportsAccountProfileColumns: boolean | null = null;
  private supportsV32DraftColumns: boolean | null = null;

  private get db() {
    return supabaseServer();
  }

  async saveAccount(account: GrowthAccount) {
    const baseRow = {
      id: account.id,
      tenant_id: account.tenant_id,
      owner_user_id: account.owner_user_id ?? null,
      name: account.name,
      target_user: account.target_user,
      core_problem: account.core_problem,
      payload: account,
      updated_at: account.updated_at,
    };

    // 零停机兼容：生产库尚未执行多账号迁移时，完整账号人设仍保存在
    // payload 中，旧版必需列照常写入。迁移完成后自动启用索引列。
    if (this.supportsAccountProfileColumns !== false) {
      const { error } = await this.db.from("growth_accounts").upsert({
        ...baseRow,
        business_line: account.business_line ?? inferGrowthBusinessLine(account),
        persona: account.persona,
        profile_name: account.profile_name ?? account.one_liner ?? account.name,
        profile_status: account.profile_status ?? "active",
        is_default_profile: account.is_default_profile ?? false,
        display_order: account.display_order ?? 0,
        last_used_at: account.last_used_at ?? account.updated_at,
        platform: account.platform_binding?.platform ?? null,
        platform_account_name: account.platform_binding?.account_name || null,
        platform_account_uid: account.platform_binding?.account_uid || null,
        profile_creation_request_id: account.profile_creation_request_id ?? null,
      });
      if (!error) {
        this.supportsAccountProfileColumns = true;
        return;
      }
      if (!isGrowthSchemaCompatibilityError(error)) throw error;
      this.supportsAccountProfileColumns = false;
    }

    const { error } = await this.db.from("growth_accounts").upsert(baseRow);
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
    let query = this.db
      .from("growth_accounts")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (ownerUserId) query = query.eq("owner_user_id", ownerUserId);
    const { data, error } = await query.limit(50);
    if (error) throw error;
    const accounts = (data ?? []).map((row) => row.payload as GrowthAccount);
    return accounts.find((account) => matchesOwner(account, ownerUserId)) ?? null;
  }

  async getLatestAccountByPersona(tenantId: string, persona: GrowthPersona, ownerUserId?: string, businessLine?: GrowthBusinessLine) {
    let query = this.db
      .from("growth_accounts")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (ownerUserId) query = query.eq("owner_user_id", ownerUserId);
    const { data, error } = await query.limit(50);
    if (error) throw error;
    const accounts = (data ?? []).map((row) => row.payload as GrowthAccount);
    return accounts.find((account) => account.persona === persona && matchesOwner(account, ownerUserId) && matchesBusinessLine(account, businessLine)) ?? null;
  }

  async listAccounts(tenantId: string, ownerUserId?: string, businessLine?: GrowthBusinessLine) {
    let query = this.db
      .from("growth_accounts")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (ownerUserId) query = query.eq("owner_user_id", ownerUserId);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return (data ?? [])
      .map((row) => row.payload as GrowthAccount)
      .filter((account) => matchesOwner(account, ownerUserId))
      .filter((account) => matchesBusinessLine(account, businessLine));
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
    const isLegacy = draft.schema_version === "legacy_v1" || !draft.schema_version;
    const baseRow = {
      id: draft.id,
      tenant_id: draft.tenant_id,
      owner_user_id: draft.owner_user_id ?? null,
      account_id: draft.account_id,
      run_id: draft.run_id,
      status: draft.status,
      title: draft.title,
      payload: draft,
      updated_at: draft.updated_at,
    };

    if (this.supportsV32DraftColumns !== false) {
      const { error } = await this.db.from("content_drafts").upsert({
        ...baseRow,
        // 完成兼容迁移后，新流程不再伪造 A 方向/诊断型。
        direction: isLegacy ? draft.legacy_direction ?? draft.direction ?? null : null,
        content_type: isLegacy ? draft.legacy_content_type ?? draft.content_type ?? null : null,
        schema_version: draft.schema_version ?? "legacy_v1",
        method_attribution_status:
          draft.method_attribution_status ?? (isLegacy ? "missing" : "confirmed"),
        method_group: isLegacy ? null : draft.method_group,
        method_id: isLegacy ? null : draft.method_id,
        generation_mode: isLegacy ? null : draft.generation_mode,
        legacy_direction: draft.legacy_direction ?? null,
        legacy_content_type: draft.legacy_content_type ?? null,
        eligible_for_method_learning:
          isLegacy ? false : draft.eligible_for_method_learning !== false,
      });

      if (!error) {
        this.supportsV32DraftColumns = true;
        return;
      }

      if (!isGrowthSchemaCompatibilityError(error)) throw error;
      this.supportsV32DraftColumns = false;
    }

    // 迁移前的旧表仍要求这两列非空；完整 v3.2 数据始终保存在 payload 中。
    const { error } = await this.db.from("content_drafts").upsert({
      ...baseRow,
      direction: draft.legacy_direction ?? draft.direction ?? "A",
      content_type: draft.legacy_content_type ?? draft.content_type ?? "diagnostic",
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

  async listReviewsByAccount(accountId: string, knownDraftIds?: string[]) {
    const draftIds = knownDraftIds ?? (await this.listDrafts(accountId)).map((d) => d.id);
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
    assertGrowthPreviewIsSafe();
    if (growthPreviewEnabled()) {
      globalThis.__GROWTH_STORE__ = new MemoryGrowthStore(true);
      console.warn("[growthStore] 本地脱敏预览已启用；不会读取或写入 Supabase。");
      return globalThis.__GROWTH_STORE__;
    }
    assertCloudDatabaseConfigured("growthStore");
    globalThis.__GROWTH_STORE__ = isDBConfigured() ? new SupabaseGrowthStore() : new MemoryGrowthStore(false);
    if (!isDBConfigured()) {
      console.warn("[growthStore] 未配置 Supabase，已启用增长模块内存存储。");
    }
  }
  return globalThis.__GROWTH_STORE__;
}

/** 仅供自动化测试重建进程内预览数据。 */
export function resetGrowthStoreForTests() {
  globalThis.__GROWTH_STORE__ = undefined;
}
