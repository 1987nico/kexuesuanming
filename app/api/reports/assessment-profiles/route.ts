import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/auth/activity";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { mianbaAuthStore } from "@/lib/auth/mianbaStore";
import { appendPublicAccessToken } from "@/lib/auth/publicAccess";
import { canSeeOwnedRecord, toReportAuthContext } from "@/lib/auth/tenant";
import { growthStore } from "@/lib/growth/store";
import { ensureInitialDiagnosis } from "@/lib/reports/initialDiagnosis";
import { generateTalentProfileWithFallback } from "@/lib/reports/principlesyouSync";
import { reportStore } from "@/lib/reports/store";
import type { AssessmentProfile } from "@/lib/reports/assessmentProfile";
import type { ReportOrder } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_TENANT_ID = "mianbajun";

const valueProfileSchema = z.object({
  liked_values: z.array(z.string()).min(1),
  excluded_values: z.array(z.string()).min(1),
  like_summary: z.string().min(1),
  exclude_summary: z.string().min(1),
  filter_sentence: z.string().min(1),
});

const bodySchema = z.object({
  customer_name: z.string().min(1).max(80),
  customer_contact: z.string().max(120).optional(),
  survey_answers: z.record(z.unknown()).default({}),
  value_profile: valueProfileSchema,
  talent_answers: z.record(z.coerce.number().int().min(1).max(7)),
});

function numericAnswers(answers: Record<string, number>) {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(answers)) {
    out[Number(key)] = value;
  }
  return out;
}

function priceTextToCents(value: string | undefined) {
  const match = (value ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  if (!match) return null;
  return Math.round(Number(match[0]) * 100);
}

function publicReportLinks(profileId: string) {
  return {
    initial_report_url: appendPublicAccessToken(`/reports/initial/${profileId}`, "initial-report", profileId),
    lite_report_url: appendPublicAccessToken(`/reports/lite/${profileId}`, "initial-report", profileId),
    initial_pdf_url: appendPublicAccessToken(`/api/reports/initial/${profileId}/pdf`, "initial-report", profileId),
    deep_report_url: appendPublicAccessToken(`/reports/deep/${profileId}`, "deep-report", profileId),
    deep_pdf_url: appendPublicAccessToken(`/api/reports/deep/${profileId}/pdf`, "deep-report", profileId),
    direction_survey_url: appendPublicAccessToken(`/survey/directions/${profileId}`, "direction-session", profileId),
  };
}

/** 每份底稿自动登记一条初步诊断报告订单，让交付后台看到所有进来的测评 */
async function createDeliveryOrder(profile: AssessmentProfile): Promise<ReportOrder | null> {
  try {
    const settings = await growthStore().getBusinessSettings(profile.tenant_id);
    return await reportStore().createReportOrder({
      tenant_id: profile.tenant_id,
      assessment_profile_id: profile.id,
      report_type: "lite",
      price_cents: priceTextToCents(settings?.report_lite_price),
      customer_name: profile.customer_name,
      customer_contact: profile.customer_contact,
      status: "delivering",
    });
  } catch (error) {
    console.warn("[assessment-profiles] 自动创建交付订单失败：", (error as Error)?.message);
    return null;
  }
}

export async function GET(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);

  // 提交列表视图：给交付后台用，只返回摘要字段
  if (url.searchParams.get("view") === "list") {
    const auth = toReportAuthContext({
      tenantId: guard.auth.tenantId,
      role: guard.auth.role,
      userId: guard.auth.user.id,
    });
    const store = reportStore();
    const [allProfiles, orders, tenantUsers] = await Promise.all([
      store.listAssessmentProfiles(DEFAULT_TENANT_ID),
      store.listReportOrders(DEFAULT_TENANT_ID),
      mianbaAuthStore().listUsers(DEFAULT_TENANT_ID),
    ]);
    // 操作者只看自己负责的 + 未认领客户；管理员看全部
    const profiles = allProfiles.filter((profile) => canSeeOwnedRecord(auth, profile.owner_user_id));
    const members = tenantUsers.map((user) => ({
      id: user.id,
      display_name: user.display_name,
      role: user.role,
      disabled: user.disabled,
    }));
    const memberNameById = new Map(members.map((member) => [member.id, member.display_name]));
    const latestOrders = new Map<string, { lite?: ReportOrder; deep?: ReportOrder }>();
    for (const order of orders) {
      if (!order.assessment_profile_id) continue;
      const group = latestOrders.get(order.assessment_profile_id) ?? {};
      if (!group[order.report_type]) {
        group[order.report_type] = order;
      }
      latestOrders.set(order.assessment_profile_id, group);
    }

    return NextResponse.json({
      viewer: { user_id: auth.userId, role: auth.role },
      members,
      submissions: profiles.map((profile) => {
        const session = profile.direction_session;
        const orderGroup = latestOrders.get(profile.id);
        const directionStatus = !session ? "none" : session.status === "completed" ? "completed" : "active";
        const directionLikes = session?.swipes.filter((s) => s.liked).length ?? 0;
        let deepReportStatus: "none" | "generating" | "ready" = "none";
        if (profile.deep_report) {
          deepReportStatus = "ready";
        } else if (directionStatus === "completed") {
          deepReportStatus = "generating";
        }
        return {
          id: profile.id,
          owner_user_id: profile.owner_user_id ?? null,
          owner_display_name: profile.owner_user_id
            ? (memberNameById.get(profile.owner_user_id) ?? "未知成员")
            : null,
          customer_name: profile.customer_name,
          customer_contact: profile.customer_contact ?? null,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          talent_mode: profile.talent_profile.mode,
          talent_answer_count: Object.keys(profile.talent_answers ?? {}).length,
          report_status: profile.initial_diagnosis ? "ready" : "generating",
          report_copy_source: profile.initial_diagnosis
            ? profile.initial_diagnosis.llm_generated
              ? "llm"
              : "fallback"
            : null,
          direction_status: directionStatus,
          direction_likes: directionLikes,
          direction_rounds_generated: session?.rounds_generated ?? 0,
          lite_order_status: orderGroup?.lite?.status ?? null,
          deep_order_status: orderGroup?.deep?.status ?? null,
          deep_report_status: deepReportStatus,
          links: publicReportLinks(profile.id),
        };
      }),
    });
  }

  const contact = url.searchParams.get("customer_contact") || undefined;
  const profile = await reportStore().getLatestAssessmentProfile(DEFAULT_TENANT_ID, contact);
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data.talent_answers).length < 252) {
    return NextResponse.json(
      { error: "incomplete_talent_answers", message: "需要完整提交 252 题天赋测评答案。" },
      { status: 400 }
    );
  }

  const timestamp = new Date().toISOString();
  const talentAnswers = numericAnswers(parsed.data.talent_answers);
  const talentResult = await generateTalentProfileWithFallback(talentAnswers, {
    retries: 1,
    timeoutMs: 90000,
  });
  const profile: AssessmentProfile = {
    id: crypto.randomUUID(),
    tenant_id: DEFAULT_TENANT_ID,
    customer_name: parsed.data.customer_name,
    customer_contact: parsed.data.customer_contact,
    survey_answers: parsed.data.survey_answers,
    value_profile: parsed.data.value_profile,
    talent_answers: talentAnswers,
    talent_profile: talentResult.profile,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await reportStore().saveAssessmentProfile(profile);

  // 交付模块登记：每份底稿自动生成一条初步诊断订单（状态：交付中）
  const order = await createDeliveryOrder(profile);
  await logActivity({
    tenantId: profile.tenant_id,
    userId: null,
    action: "profile_submitted",
    entityType: "assessment_profile",
    entityId: profile.id,
    metadata: { customer_name: profile.customer_name },
  });

  // 异步预生成初步诊断文案（不阻塞提交响应）。
  // Serverless 环境下若被提前回收，报告页首次访问时会兜底生成。
  const warmup = ensureInitialDiagnosis(profile, (p) => reportStore().saveAssessmentProfile(p)).catch((error) =>
    console.warn("[assessment-profiles] 初步诊断预生成失败：", (error as Error)?.message)
  );
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(warmup);
  } catch {
    void warmup;
  }

  const links = publicReportLinks(profile.id);

  return NextResponse.json({
    profile,
    order,
    talent_source: talentResult.source,
    attempts: talentResult.attempts,
    initial_report_url: links.initial_report_url,
    links,
  });
}
