import { isDBConfigured, supabaseServer } from "@/lib/db/supabase";
import type { AssessmentProfile } from "./assessmentProfile";

export interface ReportStore {
  saveAssessmentProfile(profile: AssessmentProfile): Promise<void>;
  getAssessmentProfile(id: string): Promise<AssessmentProfile | null>;
  getLatestAssessmentProfile(tenantId: string, customerContact?: string): Promise<AssessmentProfile | null>;
}

class MemoryReportStore implements ReportStore {
  private profiles = new Map<string, AssessmentProfile>();

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
