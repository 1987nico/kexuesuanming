import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { generateAccountAndPlan } from "@/lib/growth/runner";
import { growthStore } from "@/lib/growth/store";
import {
  GROWTH_BUSINESS_LINES,
  GROWTH_PERSONAS,
  type GrowthBusinessLine,
  type GrowthPersona,
} from "@/lib/growth/types";
import { isVisionConfigured } from "@/lib/llm/router";
import { growthPreviewEnabled } from "@/lib/growth/previewFixture";
import { methodsForPersona } from "@/lib/growth/methods";
import { sourceIsUsable } from "@/lib/growth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const personaSchema = z.enum(["merchant", "buyer", "expert"]);

const bodySchema = z.object({
  persona: personaSchema.default("expert"),
  businessLine: z.enum(["executive", "overseas_student"]).default("executive"),
  accountName: z.string().min(1).max(80).default("面霸君"),
  targetUser: z.string().max(500).optional(),
  coreProblem: z.string().max(500).optional(),
  trustSource: z.string().max(500).optional(),
  regenerateAccountId: z.string().min(1).optional(),
});

function resolvePersona(value: string | null): GrowthPersona {
  return (GROWTH_PERSONAS as string[]).includes(value ?? "") ? (value as GrowthPersona) : "expert";
}

function resolveBusinessLine(value: string | null): GrowthBusinessLine {
  return (GROWTH_BUSINESS_LINES as string[]).includes(value ?? "")
    ? (value as GrowthBusinessLine)
    : "executive";
}

export async function GET(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const persona = resolvePersona(url.searchParams.get("persona"));
  const businessLine = resolveBusinessLine(url.searchParams.get("businessLine"));
  const store = growthStore();
  // 工作台隔离：操作者只取「自己的或未归属」账号；管理员不限
  const ownerScope = guard.auth.role === "admin" ? undefined : guard.auth.user.id;
  const account = await store.getLatestAccountByPersona(DEFAULT_TENANT_ID, persona, ownerScope, businessLine);
  const plan = account ? await store.getLatestPlan(account.id) : null;
  const runs = account ? await store.listRuns(account.id) : [];
  const drafts = account ? await store.listDrafts(account.id) : [];
  // 以笔记为单元：返回每篇笔记对应的复盘（draftId -> review），供历史查看
  const reviewList = account ? await store.listReviewsByAccount(account.id) : [];
  const reviews: Record<string, (typeof reviewList)[number]> = {};
  for (const review of reviewList) {
    if (!reviews[review.draft_id]) reviews[review.draft_id] = review;
  }
  const weeklyReview = account?.weekly_review ?? account?.stage_review ?? null;
  const historicalDrafts = drafts.filter((draft) => draft.schema_version === "legacy_v1" || !draft.schema_version);
  const currentDrafts = drafts.filter((draft) => draft.schema_version === "method_v3_2");
  const validReviewDraftIds = new Set(reviewList.filter((review) => review.sample?.strategy_eligible).map((review) => review.draft_id));
  const historicalEffectiveSamples = historicalDrafts.filter((draft) => validReviewDraftIds.has(draft.id)).length;
  const newLearningSamples = currentDrafts.filter((draft) => draft.eligible_for_method_learning !== false && validReviewDraftIds.has(draft.id)).length;
  const sourceCounts = account ? Object.fromEntries((["default", "explore"] as const).map((mode) => {
    const methods = methodsForPersona(persona, mode, account.method_overrides);
    const generatable = methods.filter((method) => !method.sourceRequired || (account.topic_sources ?? []).some((item) => item.method_id === method.id && sourceIsUsable(item))).length;
    return [mode, { configured: methods.length, generatable, blockedBySource: methods.length - generatable }];
  })) : { default: { configured: 0, generatable: 0, blockedBySource: 0 }, explore: { configured: 0, generatable: 0, blockedBySource: 0 } };
  return NextResponse.json({
    persona,
    businessLine,
    account,
    plan,
    runs,
    drafts,
    currentDrafts,
    historicalDrafts,
    reviews,
    weeklyReview,
    stageReview: weeklyReview,
    capabilities: { reviewScreenshot: isVisionConfigured() },
    preview: growthPreviewEnabled() ? {
      enabled: true,
      banner: "本地脱敏预览，不连接生产数据",
      productionDataConnected: false,
    } : { enabled: false },
    sourceCounts,
    learningSummary: {
      historicalEffectiveSamples,
      newLearningSamples,
      explanation: "旧版有效样本只展示为历史证据；v3.2方法学习从0重新累计。",
    },
  });
}

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  // 原地重生成：保留 id 和 created_at，避免每次点新增账号、并让选题等关联数据不丢。
  let createdAt: string | undefined;
  let existingOwner: string | null = null;
  let existingAccount: Awaited<ReturnType<ReturnType<typeof growthStore>["getAccount"]>> = null;
  if (parsed.data.regenerateAccountId) {
    const existing = await store.getAccount(parsed.data.regenerateAccountId);
    if (existing) {
      existingAccount = existing;
      createdAt = existing.created_at;
      existingOwner = existing.owner_user_id ?? null;
    }
  }

  const settings = await store.getBusinessSettings(DEFAULT_TENANT_ID);
  const { account, plan, usage } = await generateAccountAndPlan({
    tenantId: DEFAULT_TENANT_ID,
    ...parsed.data,
    createdAt,
    reportPrices: { lite: settings.report_lite_price, deep: settings.report_deep_price },
  });

  // 数据归属：新账号归创建者；重生成保留原归属
  account.owner_user_id = existingOwner ?? guard.auth.user.id;
  if (existingAccount) {
    // 生成只更新定位判断；所有历史字段、专属业务事实与高级事实都必须合并保留。
    account.content_directions = existingAccount.content_directions;
    account.filter_words = existingAccount.filter_words ?? account.filter_words;
    account.avoid_expressions = existingAccount.avoid_expressions ?? account.avoid_expressions;
    account.private_domain = existingAccount.private_domain ?? account.private_domain;
    account.hypotheses = existingAccount.hypotheses?.length ? existingAccount.hypotheses : account.hypotheses;
    account.persona_specific = existingAccount.persona_specific ?? account.persona_specific;
    account.topic_sources = existingAccount.topic_sources;
    account.method_overrides = existingAccount.method_overrides;
    account.canonical_body_tags = existingAccount.canonical_body_tags;
    account.tag_merge_suggestions = existingAccount.tag_merge_suggestions;
    account.weekly_review = existingAccount.weekly_review;
    account.weekly_review_snapshots = existingAccount.weekly_review_snapshots;
    account.stage_review = existingAccount.stage_review;
  }
  plan.owner_user_id = account.owner_user_id;

  await store.saveAccount(account);
  if (!parsed.data.regenerateAccountId) await store.savePlan(plan);
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: "bootstrap", persona: parsed.data.persona },
    });
  }

  return NextResponse.json({ account, plan });
}
