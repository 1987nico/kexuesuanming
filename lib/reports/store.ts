import { isDBConfigured, supabaseServer } from "@/lib/db/supabase";
import type { AssessmentProfile } from "./assessmentProfile";

export const REPORT_ORDER_STATUSES = ["unpaid", "paid", "delivering", "delivered", "refunded"] as const;

export type ReportOrderStatus = (typeof REPORT_ORDER_STATUSES)[number];
export type ReportType = "lite" | "deep";

export interface ReportOrder {
  id: string;
  tenant_id: string;
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
  createReportOrder(input: CreateReportOrderInput): Promise<ReportOrder>;
  listReportOrders(tenantId: string): Promise<ReportOrder[]>;
  getReportOrder(id: string): Promise<ReportOrder | null>;
  updateReportOrderStatus(id: string, status: ReportOrderStatus): Promise<ReportOrder | null>;
}

export class MemoryReportStore implements ReportStore {
  private profiles = new Map<string, AssessmentProfile>();
  private orders = new Map<string, ReportOrder>();

  async saveAssessmentProfile(profile: AssessmentProfile) {
    this.profiles.set(profile.id, profile);
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

  async createReportOrder(input: CreateReportOrderInput) {
    const timestamp = new Date().toISOString();
    const order: ReportOrder = {
      id: crypto.randomUUID(),
      tenant_id: input.tenant_id,
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
}

class SupabaseReportStore implements ReportStore {
  private get db() {
    return supabaseServer();
  }

  async saveAssessmentProfile(profile: AssessmentProfile) {
    const { error } = await this.db.from("assessment_profiles").upsert({
      id: profile.id,
      tenant_id: profile.tenant_id,
      customer_name: profile.customer_name,
      customer_contact: profile.customer_contact,
      value_profile: profile.value_profile,
      talent_mode: profile.talent_profile.mode,
      talent_answers: profile.talent_answers,
      talent_profile: profile.talent_profile,
      survey_answers: profile.survey_answers,
      payload: profile,
      updated_at: profile.updated_at,
    });
    if (error) throw error;
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

  async createReportOrder(input: CreateReportOrderInput) {
    const { data, error } = await this.db
      .from("report_orders")
      .insert({
        tenant_id: input.tenant_id,
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
}

declare global {
  // eslint-disable-next-line no-var
  var __REPORT_STORE__: ReportStore | undefined;
}

export function reportStore(): ReportStore {
  if (!globalThis.__REPORT_STORE__) {
    globalThis.__REPORT_STORE__ = isDBConfigured() ? new SupabaseReportStore() : new MemoryReportStore();
    if (!isDBConfigured()) {
      console.warn("[reportStore] 未配置 Supabase，已启用报告模块内存存储。");
    }
  }
  return globalThis.__REPORT_STORE__;
}
