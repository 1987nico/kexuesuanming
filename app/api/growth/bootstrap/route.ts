import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import {
  bodyProfileIdentityProblem,
  generateAccountAndPlan,
  titlePersonaProblems,
} from "@/lib/growth/runner";
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
import { sourceIsUsable, withDraftValidation } from "@/lib/growth/validation";
import { isMethodWeeklyReview } from "@/lib/growth/reviewLearning";
import {
  businessPositionsFromSettings,
  resolveBusinessPosition,
} from "@/lib/growth/businessPosition";
import { accountForBusinessGeneration } from "@/lib/growth/businessCompatibility";
import { mergeThreeDayReviewCycles } from "@/lib/growth/reviewCycleWorkspace";
import { withHistoricalBenchmarkSourceUsage } from "@/lib/growth/sourceRotation";
import {
  accountBelongsToProfileWorkspace,
  chooseAccountProfile,
  partitionAccountProfiles,
  toAccountSummary,
} from "@/lib/growth/accountProfiles";
import { isProfileTitleCompatible } from "@/lib/growth/accountIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";
const multiAccountPersonaEnabled = () => process.env.GROWTH_MULTI_ACCOUNT_PERSONA_ENABLED !== "false";
const WORKSPACE_SCOPES = ["core", "content", "review", "full"] as const;
type WorkspaceScope = (typeof WORKSPACE_SCOPES)[number];

const personaSchema = z.enum(["merchant", "buyer", "expert"]);

const bodySchema = z.object({
  persona: personaSchema.default("expert"),
  businessLine: z.enum(["executive", "overseas_student"]).default("executive"),
  accountName: z.string().min(1).max(80).default("面霸君"),
  targetUser: z.string().max(500).optional(),
  coreProblem: z.string().max(500).optional(),
  trustSource: z.string().max(500).optional(),
  regenerateAccountId: z.string().min(1).optional(),
  previewOnly: z.boolean().optional(),
  mode: z.enum(["regenerate_or_create", "create"]).default("regenerate_or_create"),
  profileName: z.string().trim().min(1).max(80).optional(),
  requestId: z.string().min(8).max(120).optional(),
  platformBinding: z.object({
    platform: z.literal("xiaohongshu").default("xiaohongshu"),
    account_name: z.string().trim().min(1).max(100),
    account_uid: z.string().trim().max(120).optional(),
    profile_url: z.string().trim().url().max(500).optional(),
  }).optional(),
  profileDetails: z.object({
    one_liner: z.string().trim().max(200).optional(),
    account_value: z.string().trim().max(1000).optional(),
    follow_reason: z.string().trim().max(500).optional(),
    not_doing: z.string().trim().max(1000).optional(),
    tone_style: z.string().trim().max(300).optional(),
    compliance_redline: z.string().trim().max(500).optional(),
    hypotheses: z.array(z.string().trim().max(300)).max(8).optional(),
    filter_words: z.array(z.string().trim().max(40)).max(12).optional(),
    avoid_expressions: z.array(z.string().trim().max(40)).max(12).optional(),
    private_domain: z.string().trim().max(500).optional(),
    persona_specific: z.record(z.string().trim().max(500)).optional(),
  }).optional(),
  profileIdentity: z.enum([
    "overseas_student_self",
    "overseas_student_parent",
    "executive_self",
    "service_operator",
    "professional_expert",
  ]).optional(),
});

function resolvePersona(value: string | null): GrowthPersona {
  return (GROWTH_PERSONAS as string[]).includes(value ?? "") ? (value as GrowthPersona) : "expert";
}

function resolveBusinessLine(value: string | null): GrowthBusinessLine {
  return (GROWTH_BUSINESS_LINES as string[]).includes(value ?? "")
    ? (value as GrowthBusinessLine)
    : "executive";
}

function resolveWorkspaceScope(value: string | null): WorkspaceScope {
  return (WORKSPACE_SCOPES as readonly string[]).includes(value ?? "")
    ? value as WorkspaceScope
    : "full";
}

export async function GET(req: Request) {
  const requestStartedAt = Date.now();
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const persona = resolvePersona(url.searchParams.get("persona"));
  const businessLine = resolveBusinessLine(url.searchParams.get("businessLine"));
  const requestedAccountId = url.searchParams.get("accountId");
  const requestedScope = resolveWorkspaceScope(url.searchParams.get("scope"));
  const scope = process.env.GROWTH_LIGHT_BOOTSTRAP === "false" ? "full" : requestedScope;
  const store = growthStore();
  // 增长工作台始终按当前登录人隔离。管理员若要处理历史未归属数据，应走
  // 独立管理入口，不能让后台权限把其他操作者的人设混进日常生成页面。
  const ownerScope = growthPreviewEnabled() ? undefined : guard.auth.user.id;
  const [allAccounts, settings] = await Promise.all([
    store.listAccounts(DEFAULT_TENANT_ID, ownerScope),
    store.getBusinessSettings(DEFAULT_TENANT_ID),
  ]);
  const profilePartition = partitionAccountProfiles(allAccounts, {
    tenantId: DEFAULT_TENANT_ID,
    ownerUserId: ownerScope,
    businessLine,
    persona,
  });
  const profileAccounts = profilePartition.visible.filter((candidate) =>
    accountBelongsToProfileWorkspace(candidate, {
      tenantId: DEFAULT_TENANT_ID,
      ownerUserId: ownerScope,
      businessLine,
      persona,
    }));
  const account = multiAccountPersonaEnabled()
    ? chooseAccountProfile(profileAccounts, requestedAccountId)
    : profileAccounts.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  if (requestedAccountId && !account) {
    return NextResponse.json({
      error: "account_profile_not_found",
      message: "这个账号人设不存在、已归档，或不属于当前业务与视角。",
    }, { status: 404 });
  }
  const businessPositions = businessPositionsFromSettings(settings);
  // 人设确定后，计划、选题、正文和复盘彼此独立，并行读取以缩短切换等待。
  // 旧账号没有 business_line；响应给工作台前先补齐并清洗生成上下文，
  // 但不回写历史原始载荷。
  const workspaceAccount = account ? accountForBusinessGeneration(account) : null;
  let plan: Awaited<ReturnType<typeof store.getLatestPlan>> = null;
  let runs: Awaited<ReturnType<typeof store.listRuns>> = [];
  let drafts: Awaited<ReturnType<typeof store.listDrafts>> = [];
  let reviewList: Awaited<ReturnType<typeof store.listReviewsByAccount>> = [];
  let threeDayReviewCycles: Awaited<ReturnType<typeof mergeThreeDayReviewCycles>> = [];

  if (workspaceAccount) {
    const includeContent = scope === "content" || scope === "full";
    const includeReview = scope === "review" || scope === "full";
    const includePlan = scope === "core" || includeContent;
    const [nextPlan, nextRuns, nextDrafts, nextCycles] = await Promise.all([
      includePlan ? store.getLatestPlan(workspaceAccount.id) : Promise.resolve(null),
      includeContent ? store.listRuns(workspaceAccount.id) : Promise.resolve([]),
      includeContent || includeReview ? store.listDrafts(workspaceAccount.id) : Promise.resolve([]),
      includeReview
        ? Promise.resolve(mergeThreeDayReviewCycles([workspaceAccount]))
        : Promise.resolve([]),
    ]);
    plan = nextPlan;
    runs = nextRuns;
    drafts = nextDrafts;
    threeDayReviewCycles = nextCycles;
    if (includeReview && drafts.length) {
      // 正文已经读取过，复盘查询直接复用其 ID，避免 Supabase 再读取同一批正文。
      reviewList = await store.listReviewsByAccount(
        workspaceAccount.id,
        drafts.map((draft) => draft.id),
      );
    }
  }
  const responseAccount = workspaceAccount
    ? withHistoricalBenchmarkSourceUsage(workspaceAccount, [...runs])
    : null;
  const visibleRuns = workspaceAccount
    ? runs.map((run) => ({
      ...run,
      topic_pool: run.topic_pool.filter((topic) =>
        isProfileTitleCompatible(topic.title, workspaceAccount)
        && titlePersonaProblems(topic, workspaceAccount).length === 0),
    }))
    : runs;
  // 以笔记为单元：返回每篇笔记对应的复盘（draftId -> review），供历史查看
  const reviews: Record<string, (typeof reviewList)[number]> = {};
  for (const review of reviewList) {
    if (!reviews[review.draft_id]) reviews[review.draft_id] = review;
  }
  const storedWeeklyReview = responseAccount?.weekly_review ?? responseAccount?.stage_review;
  // 旧版按 A/B/C 方向生成的周复盘仅保留在历史数据中，不能交给 v3.2 方法表渲染。
  const weeklyReview = isMethodWeeklyReview(storedWeeklyReview) ? storedWeeklyReview : null;
  const historicalDrafts = drafts.filter((draft) => draft.schema_version === "legacy_v1" || !draft.schema_version);
  const currentDrafts = drafts
    .filter((draft) => draft.schema_version === "method_v3_2")
    .filter((draft) => !workspaceAccount || (
      isProfileTitleCompatible(draft.title, workspaceAccount)
      && !bodyProfileIdentityProblem(draft.body, workspaceAccount)
    ))
    .map((draft) => withDraftValidation(
      draft,
      persona,
      // 兼容旧草稿：读取时按当前三项规则重算展示，不回写、不覆盖历史原始数据。
      draft.validation_report?.attempts ?? 0,
    ));
  const validReviewDraftIds = new Set(reviewList.filter((review) => review.sample?.strategy_eligible).map((review) => review.draft_id));
  const historicalEffectiveSamples = historicalDrafts.filter((draft) => validReviewDraftIds.has(draft.id)).length;
  const newLearningSamples = currentDrafts.filter((draft) => draft.eligible_for_method_learning !== false && validReviewDraftIds.has(draft.id)).length;
  const sourceCounts = responseAccount ? Object.fromEntries((["default", "explore"] as const).map((mode) => {
    const methods = methodsForPersona(persona, mode, responseAccount.method_overrides);
    const generatable = methods.filter((method) => !method.sourceRequired || (responseAccount.topic_sources ?? []).some((item) => item.method_id === method.id && sourceIsUsable(item))).length;
    return [mode, { configured: methods.length, generatable, blockedBySource: methods.length - generatable }];
  })) : { default: { configured: 0, generatable: 0, blockedBySource: 0 }, explore: { configured: 0, generatable: 0, blockedBySource: 0 } };
  const response = NextResponse.json({
    persona,
    businessLine,
    loadedScopes: scope === "full" ? ["core", "content", "review"] : [scope],
    businessPosition: businessPositions[businessLine],
    businessPositions,
    account: responseAccount,
    accountProfiles: (multiAccountPersonaEnabled() ? profileAccounts : account ? [account] : [])
      .map(toAccountSummary)
      .sort((a, b) => a.display_order - b.display_order || b.last_used_at.localeCompare(a.last_used_at)),
    accountProfileReview: {
      pendingCount: profilePartition.pending.length,
      duplicateCount: profilePartition.duplicates.length,
    },
    selectedAccountId: responseAccount?.id ?? null,
    plan,
    runs: visibleRuns,
    drafts,
    currentDrafts,
    historicalDrafts,
    reviews,
    threeDayReviewCycles,
    weeklyReview,
    stageReview: weeklyReview,
    capabilities: {
      reviewScreenshot: isVisionConfigured(),
      multiAccountPersona: multiAccountPersonaEnabled(),
    },
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
  response.headers.set("Server-Timing", `growth-bootstrap;dur=${Date.now() - requestStartedAt}`);
  response.headers.set("X-Growth-Workspace-Scope", scope);
  return response;
}

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.mode === "create" && !multiAccountPersonaEnabled()) {
    return NextResponse.json({
      error: "feature_disabled",
      message: "多账号人设功能当前已关闭。",
    }, { status: 409 });
  }

  const store = growthStore();
  // 原地重生成：保留 id 和 created_at，避免每次点新增账号、并让选题等关联数据不丢。
  let createdAt: string | undefined;
  let existingOwner: string | null = null;
  let existingAccount: Awaited<ReturnType<ReturnType<typeof growthStore>["getAccount"]>> = null;
  const ownedProfiles = await store.listAccounts(
    DEFAULT_TENANT_ID,
    growthPreviewEnabled() ? undefined : guard.auth.user.id,
    parsed.data.businessLine,
  );
  const idempotentCreated = parsed.data.mode === "create" && parsed.data.requestId
    ? ownedProfiles.find((candidate) =>
      candidate.owner_user_id === guard.auth.user.id
      && candidate.persona === parsed.data.persona
      && candidate.profile_creation_request_id === parsed.data.requestId)
    : null;
  if (idempotentCreated) {
    return NextResponse.json({
      account: idempotentCreated,
      plan: await store.getLatestPlan(idempotentCreated.id),
      previewOnly: false,
      idempotent: true,
    });
  }
  const existing = parsed.data.regenerateAccountId
    ? await store.getAccount(parsed.data.regenerateAccountId)
    : parsed.data.mode !== "create" && !parsed.data.previewOnly
      ? await store.getLatestAccountByPersona(
        DEFAULT_TENANT_ID,
        parsed.data.persona,
        guard.auth.user.id,
        parsed.data.businessLine,
      )
      : null;
  if (existing) {
    // 首次创建请求如果因断网被重试，按“用户 × 业务 × 视角”复用刚创建的
    // 人设，避免同一个工作空间产生两条账号记录。
    if (parsed.data.regenerateAccountId) {
      if (guard.auth.role !== "admin" && existing.owner_user_id !== guard.auth.user.id) {
        return NextResponse.json({ error: "forbidden", message: "不能修改其他用户或未归属的历史人设。" }, { status: 403 });
      }
      if (existing.tenant_id !== DEFAULT_TENANT_ID
        || existing.persona !== parsed.data.persona
        || accountForBusinessGeneration(existing).business_line !== parsed.data.businessLine) {
        return NextResponse.json({ error: "account_context_mismatch", message: "待更新人设与当前业务或视角不一致。" }, { status: 409 });
      }
    }
    existingAccount = existing;
    createdAt = existing.created_at;
    existingOwner = existing.owner_user_id ?? null;
  }
  const effectiveRegenerateAccountId = existingAccount?.id ?? parsed.data.regenerateAccountId;
  const storedPlanForRetry = existingAccount
    && !parsed.data.regenerateAccountId
    && !parsed.data.previewOnly
    ? await store.getLatestPlan(existingAccount.id)
    : null;

  const settings = await store.getBusinessSettings(DEFAULT_TENANT_ID);
  const businessPosition = resolveBusinessPosition(settings, parsed.data.businessLine);
  const { account, plan: generatedPlan, usage } = await generateAccountAndPlan({
    tenantId: DEFAULT_TENANT_ID,
    ...parsed.data,
    targetUser: parsed.data.targetUser || businessPosition.target_user,
    coreProblem: parsed.data.coreProblem || businessPosition.core_problem,
    trustSource: parsed.data.trustSource || businessPosition.trust_source,
    businessPosition,
    regenerateAccountId: effectiveRegenerateAccountId,
    createdAt,
    reportPrices: { lite: settings.report_lite_price, deep: settings.report_deep_price },
  });
  const plan = storedPlanForRetry ?? generatedPlan;

  // 数据归属：新账号归创建者；重生成保留原归属
  account.owner_user_id = existingAccount ? existingOwner : guard.auth.user.id;
  if (!existingAccount) {
    const existingActiveProfiles = ownedProfiles.filter((candidate) =>
      candidate.owner_user_id === guard.auth.user.id
      && candidate.persona === parsed.data.persona
      && candidate.profile_status !== "archived");
    account.profile_name = parsed.data.profileName || account.one_liner || account.name;
    account.profile_status = "active";
    account.is_default_profile = existingActiveProfiles.length === 0;
    account.display_order = existingActiveProfiles.length;
    account.last_used_at = new Date().toISOString();
    account.profile_creation_request_id = parsed.data.requestId;
    account.platform_binding = parsed.data.platformBinding ? {
      ...parsed.data.platformBinding,
      binding_status: "bound",
      bound_at: new Date().toISOString(),
    } : {
      platform: "xiaohongshu",
      account_name: "",
      binding_status: "unbound",
    };
    if (parsed.data.mode === "create") {
      const details = parsed.data.profileDetails;
      // 新建页与编辑页使用同一组槽位。操作者明确填写的事实优先于模型补全，
      // 未填写的槽位继续保留系统生成结果。
      account.name = parsed.data.accountName;
      account.target_user = parsed.data.targetUser?.trim() || account.target_user;
      account.core_problem = parsed.data.coreProblem?.trim() || account.core_problem;
      account.trust_source = parsed.data.trustSource?.trim() || account.trust_source;
      account.one_liner = details?.one_liner || account.one_liner;
      account.account_value = details?.account_value || account.account_value;
      account.follow_reason = details?.follow_reason || account.follow_reason;
      account.not_doing = details?.not_doing || account.not_doing;
      account.tone_style = details?.tone_style || account.tone_style;
      account.compliance_redline = details?.compliance_redline || account.compliance_redline;
      account.private_domain = details?.private_domain || account.private_domain;
      if (details?.hypotheses?.length) account.hypotheses = details.hypotheses;
      if (details?.filter_words?.length) account.filter_words = details.filter_words;
      if (details?.avoid_expressions?.length) account.avoid_expressions = details.avoid_expressions;
      if (details?.persona_specific) {
        account.persona_specific = {
          ...(account.persona_specific ?? {}),
          ...Object.fromEntries(
            Object.entries(details.persona_specific).filter(([, value]) => value.trim()),
          ),
        };
      }
    }
  }
  if (existingAccount) {
    // 生成只更新定位判断；所有历史字段、专属业务事实与高级事实都必须合并保留。
    account.content_directions = existingAccount.content_directions;
    account.filter_words = existingAccount.filter_words ?? account.filter_words;
    account.avoid_expressions = existingAccount.avoid_expressions ?? account.avoid_expressions;
    account.private_domain = existingAccount.private_domain ?? account.private_domain;
    account.hypotheses = existingAccount.hypotheses?.length ? existingAccount.hypotheses : account.hypotheses;
    account.persona_specific = existingAccount.persona_specific ?? account.persona_specific;
    account.topic_sources = existingAccount.topic_sources;
    account.benchmark_structure_cards = existingAccount.benchmark_structure_cards;
    account.benchmark_source_usage = existingAccount.benchmark_source_usage;
    account.method_overrides = existingAccount.method_overrides;
    account.canonical_body_tags = existingAccount.canonical_body_tags;
    account.tag_merge_suggestions = existingAccount.tag_merge_suggestions;
    account.weekly_review = existingAccount.weekly_review;
    account.weekly_review_snapshots = existingAccount.weekly_review_snapshots;
    account.stage_review = existingAccount.stage_review;
    account.three_day_review_cycles = existingAccount.three_day_review_cycles;
    account.profile_name = existingAccount.profile_name ?? parsed.data.profileName;
    account.profile_identity = existingAccount.profile_identity
      ?? parsed.data.profileIdentity
      ?? account.profile_identity;
    account.profile_status = existingAccount.profile_status;
    account.is_default_profile = existingAccount.is_default_profile;
    account.display_order = existingAccount.display_order;
    account.last_used_at = new Date().toISOString();
    account.profile_creation_request_id = existingAccount.profile_creation_request_id;
    account.platform_binding = existingAccount.platform_binding;
  }
  if (!existingAccount && parsed.data.mode === "create") {
    // 模型只负责补全人设，不得把其他业务的词带进刚创建的账号上下文。
    // 保存前清洗一次，确保创建后的首屏、后续选题和正文读取同一套业务事实。
    Object.assign(account, accountForBusinessGeneration(account));
  }
  plan.owner_user_id = account.owner_user_id;

  if (!parsed.data.previewOnly) {
    await store.saveAccount(account);
    if (!parsed.data.regenerateAccountId && !storedPlanForRetry) {
      await store.savePlan(generatedPlan);
    }
  }
  if (usage) {
    await store.saveUsage({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: guard.auth.user.id,
      feature: "growth_text",
      ...usage,
      metadata: { action: parsed.data.previewOnly ? "bootstrap_preview" : "bootstrap", persona: parsed.data.persona },
    });
  }

  return NextResponse.json({ account, plan, previewOnly: Boolean(parsed.data.previewOnly) });
}
