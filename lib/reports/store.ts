import { assertCloudDatabaseConfigured, isDBConfigured, supabaseServer } from "@/lib/db/supabase";
import type { AssessmentProfile } from "./assessmentProfile";
import { mergeDirectionSessions } from "./directionSession";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const REPORT_ORDER_STATUSES = ["unpaid", "paid", "delivering", "delivered", "refunded"] as const;

export type ReportOrderStatus = (typeof REPORT_ORDER_STATUSES)[number];
export type ReportType = "lite" | "deep";

export interface ReportOrder {
  id: string;
  tenant_id: string;
  owner_user_id?: string | null;
  assessment_profile_id?: string | null;
  report_type: ReportType;
  price_cents?: number | null;
  customer_name?: string | null;
  customer_contact?: string | null;
  status: ReportOrderStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateReportOrderInput {
  tenant_id: string;
  owner_user_id?: string | null;
  assessment_profile_id: string;
  report_type: ReportType;
  price_cents?: number | null;
  customer_name?: string | null;
  customer_contact?: string | null;
  status?: ReportOrderStatus;
}

export function isReportOrderStatus(status: string): status is ReportOrderStatus {
  return REPORT_ORDER_STATUSES.includes(status as ReportOrderStatus);
}

export interface ReportStore {
  saveAssessmentProfile(profile: AssessmentProfile): Promise<void>;
  getAssessmentProfile(id: string): Promise<AssessmentProfile | null>;
  getLatestAssessmentProfile(tenantId: string, customerContact?: string): Promise<AssessmentProfile | null>;
  listAssessmentProfiles(tenantId: string, limit?: number): Promise<AssessmentProfile[]>;
  createReportOrder(input: CreateReportOrderInput): Promise<ReportOrder>;
  listReportOrders(tenantId: string): Promise<ReportOrder[]>;
  getReportOrder(id: string): Promise<ReportOrder | null>;
  updateReportOrderStatus(id: string, status: ReportOrderStatus): Promise<ReportOrder | null>;
  updateReportOrderOwner(id: string, ownerUserId: string | null): Promise<ReportOrder | null>;
}

interface FileReportStoreState {
  profiles: AssessmentProfile[];
  orders: ReportOrder[];
}

type AssessmentProfilePayload = AssessmentProfile & Record<string, unknown>;

export function mergeAssessmentProfileForSave(
  existing: AssessmentProfile | null | undefined,
  incoming: AssessmentProfile
): AssessmentProfile {
  if (!existing) return incoming;
  const next: AssessmentProfilePayload = {
    ...(existing as AssessmentProfilePayload),
    ...(incoming as AssessmentProfilePayload),
  };

  const mergedDirectionSession = mergeDirectionSessions(existing.direction_session, incoming.direction_session, {
    preferIncomingGenerationState: true,
  });
  if (mergedDirectionSession) next.direction_session = mergedDirectionSession;

  if (existing.initial_diagnosis && !incoming.initial_diagnosis) {
    next.initial_diagnosis = existing.initial_diagnosis;
  }
  if (existing.deep_report && !incoming.deep_report) {
    next.deep_report = existing.deep_report;
  }

  return next;
}

function assessmentProfileRow(profile: AssessmentProfile) {
  return {
    id: profile.id,
    tenant_id: profile.tenant_id,
    owner_user_id: profile.owner_user_id ?? null,
    customer_name: profile.customer_name,
    customer_contact: profile.customer_contact,
    value_profile: profile.value_profile,
    talent_mode: profile.talent_profile.mode,
    talent_answers: profile.talent_answers,
    talent_profile: profile.talent_profile,
    survey_answers: profile.survey_answers,
    payload: profile,
    updated_at: profile.updated_at,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function profileSaveRetryDelayMs(attempt: number) {
  return Math.min(1200, 80 * attempt + Math.floor(Math.random() * 120));
}

function reportStoreFilePath() {
  return path.join(process.cwd(), ".data", "report-store.json");
}

function readFileState(): FileReportStoreState {
  const filePath = reportStoreFilePath();
  if (!existsSync(filePath)) return { profiles: [], orders: [] };
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as FileReportStoreState;
  } catch {
    return { profiles: [], orders: [] };
  }
}

function writeFileState(state: FileReportStoreState) {
  const filePath = reportStoreFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export class MemoryReportStore implements ReportStore {
  private profiles = new Map<string, AssessmentProfile>();
  private orders = new Map<string, ReportOrder>();

  async saveAssessmentProfile(profile: AssessmentProfile) {
    this.profiles.set(profile.id, mergeAssessmentProfileForSave(this.profiles.get(profile.id), profile));
  }

  async getAssessmentProfile(id: string) {
    return this.profiles.get(id) ?? null;
  }

  async getLatestAssessmentProfile(tenantId: string, customerContact?: string) {
    return (
      [...this.profiles.values()]
        .filter((profile) => {
          if (profile.tenant_id !== tenantId) return false;
          if (customerContact && profile.customer_contact !== customerContact) return false;
          return true;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }

  async listAssessmentProfiles(tenantId: string, limit = 100) {
    return [...this.profiles.values()]
      .filter((profile) => profile.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async createReportOrder(input: CreateReportOrderInput) {
    const timestamp = new Date().toISOString();
    const order: ReportOrder = {
      id: crypto.randomUUID(),
      tenant_id: input.tenant_id,
      owner_user_id: input.owner_user_id ?? null,
      assessment_profile_id: input.assessment_profile_id,
      report_type: input.report_type,
      price_cents: input.price_cents ?? null,
      customer_name: input.customer_name ?? null,
      customer_contact: input.customer_contact ?? null,
      status: input.status ?? "unpaid",
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async listReportOrders(tenantId: string) {
    return [...this.orders.values()]
      .filter((order) => order.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getReportOrder(id: string) {
    return this.orders.get(id) ?? null;
  }

  async updateReportOrderStatus(id: string, status: ReportOrderStatus) {
    const existing = this.orders.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      status,
      updated_at: new Date().toISOString(),
    };
    this.orders.set(id, updated);
    return updated;
  }

  async updateReportOrderOwner(id: string, ownerUserId: string | null) {
    const existing = this.orders.get(id);
    if (!existing) return null;
    const updated = { ...existing, owner_user_id: ownerUserId, updated_at: new Date().toISOString() };
    this.orders.set(id, updated);
    return updated;
  }
}

export class FileReportStore implements ReportStore {
  private state: FileReportStoreState;

  constructor() {
    this.state = readFileState();
  }

  private persist() {
    writeFileState(this.state);
  }

  async saveAssessmentProfile(profile: AssessmentProfile) {
    const index = this.state.profiles.findIndex((item) => item.id === profile.id);
    const merged = mergeAssessmentProfileForSave(index >= 0 ? this.state.profiles[index] : null, profile);
    if (index >= 0) this.state.profiles[index] = merged;
    else this.state.profiles.push(merged);
    this.persist();
  }

  async getAssessmentProfile(id: string) {
    return this.state.profiles.find((profile) => profile.id === id) ?? null;
  }

  async getLatestAssessmentProfile(tenantId: string, customerContact?: string) {
    return (
      [...this.state.profiles]
        .filter((profile) => {
          if (profile.tenant_id !== tenantId) return false;
          if (customerContact && profile.customer_contact !== customerContact) return false;
          return true;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    );
  }

  async listAssessmentProfiles(tenantId: string, limit = 100) {
    return [...this.state.profiles]
      .filter((profile) => profile.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async createReportOrder(input: CreateReportOrderInput) {
    const timestamp = new Date().toISOString();
    const order: ReportOrder = {
      id: crypto.randomUUID(),
      tenant_id: input.tenant_id,
      owner_user_id: input.owner_user_id ?? null,
      assessment_profile_id: input.assessment_profile_id,
      report_type: input.report_type,
      price_cents: input.price_cents ?? null,
      customer_name: input.customer_name ?? null,
      customer_contact: input.customer_contact ?? null,
      status: input.status ?? "unpaid",
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.state.orders.push(order);
    this.persist();
    return order;
  }

  async listReportOrders(tenantId: string) {
    return [...this.state.orders]
      .filter((order) => order.tenant_id === tenantId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getReportOrder(id: string) {
    return this.state.orders.find((order) => order.id === id) ?? null;
  }

  async updateReportOrderStatus(id: string, status: ReportOrderStatus) {
    const existing = this.state.orders.find((order) => order.id === id);
    if (!existing) return null;
    const updated = { ...existing, status, updated_at: new Date().toISOString() };
    this.state.orders = this.state.orders.map((order) => (order.id === id ? updated : order));
    this.persist();
    return updated;
  }

  async updateReportOrderOwner(id: string, ownerUserId: string | null) {
    const existing = this.state.orders.find((order) => order.id === id);
    if (!existing) return null;
    const updated = { ...existing, owner_user_id: ownerUserId, updated_at: new Date().toISOString() };
    this.state.orders = this.state.orders.map((order) => (order.id === id ? updated : order));
    this.persist();
    return updated;
  }
}

class SupabaseReportStore implements ReportStore {
  private get db() {
    return supabaseServer();
  }

  async saveAssessmentProfile(profile: AssessmentProfile) {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const { data: existingData, error: existingError } = await this.db
        .from("assessment_profiles")
        .select("updated_at,payload")
        .eq("id", profile.id)
        .maybeSingle();
      if (existingError) throw existingError;

      const existingProfile = (existingData?.payload as AssessmentProfile | null) ?? null;
      const mergedProfile = mergeAssessmentProfileForSave(existingProfile, profile);
      const row = assessmentProfileRow(mergedProfile);

      if (!existingData) {
        const { error: insertError } = await this.db.from("assessment_profiles").insert(row);
        if (!insertError) return;
        if (attempt === 20 || insertError.code !== "23505") throw insertError;
        await wait(profileSaveRetryDelayMs(attempt));
        continue;
      }

      const { data: updatedRow, error: updateError } = await this.db
        .from("assessment_profiles")
        .update(row)
        .eq("id", profile.id)
        .eq("updated_at", existingData.updated_at)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (updatedRow) return;
      await wait(profileSaveRetryDelayMs(attempt));
    }

    throw new Error(`[reportStore] assessment profile ${profile.id} 保存冲突过多，请重试。`);
  }

  async getAssessmentProfile(id: string) {
    const { data, error } = await this.db
      .from("assessment_profiles")
      .select("payload")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data?.payload as AssessmentProfile) ?? null;
  }

  async getLatestAssessmentProfile(tenantId: string, customerContact?: string) {
    let query = this.db
      .from("assessment_profiles")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (customerContact) query = query.eq("customer_contact", customerContact);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data?.payload as AssessmentProfile) ?? null;
  }

  async listAssessmentProfiles(tenantId: string, limit = 100) {
    const { data, error } = await this.db
      .from("assessment_profiles")
      .select("payload")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => row.payload as AssessmentProfile);
  }

  async createReportOrder(input: CreateReportOrderInput) {
    const { data, error } = await this.db
      .from("report_orders")
      .insert({
        tenant_id: input.tenant_id,
        owner_user_id: input.owner_user_id ?? null,
        assessment_profile_id: input.assessment_profile_id,
        report_type: input.report_type,
        price_cents: input.price_cents ?? null,
        customer_name: input.customer_name ?? null,
        customer_contact: input.customer_contact ?? null,
        status: input.status ?? "unpaid",
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as ReportOrder;
  }

  async listReportOrders(tenantId: string) {
    const { data, error } = await this.db
      .from("report_orders")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReportOrder[];
  }

  async getReportOrder(id: string) {
    const { data, error } = await this.db.from("report_orders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as ReportOrder | null) ?? null;
  }

  async updateReportOrderStatus(id: string, status: ReportOrderStatus) {
    const { data, error } = await this.db
      .from("report_orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return (data as ReportOrder | null) ?? null;
  }

  async updateReportOrderOwner(id: string, ownerUserId: string | null) {
    const { data, error } = await this.db
      .from("report_orders")
      .update({ owner_user_id: ownerUserId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return (data as ReportOrder | null) ?? null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __REPORT_STORE__: ReportStore | undefined;
}

export function reportStore(): ReportStore {
  if (!globalThis.__REPORT_STORE__) {
    assertCloudDatabaseConfigured("reportStore");
    globalThis.__REPORT_STORE__ = isDBConfigured() ? new SupabaseReportStore() : new FileReportStore();
    if (!isDBConfigured()) {
      console.warn("[reportStore] 未配置 Supabase，已启用报告模块本地文件存储。");
    }
  }
  return globalThis.__REPORT_STORE__;
}
