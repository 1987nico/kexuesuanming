import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import { TITLE_METHOD_BY_ID } from "@/lib/growth/methods";
import type { ContentDraft, GrowthRun, TitleMethodId } from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountId: z.string().min(1),
  title: z.string().trim().min(1).max(20),
  titlePromise: z.string().trim().min(1).max(500),
  publishedAt: z.string().datetime(),
  methodId: z.string().min(1),
  generationMode: z.enum(["default", "explore"]),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });

  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (Date.parse(parsed.data.publishedAt) > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ error: "published_at_in_future", message: "实际发布时间不能晚于当前时间。" }, { status: 400 });
  }
  const method = TITLE_METHOD_BY_ID[parsed.data.methodId as TitleMethodId];
  if (!method) return NextResponse.json({ error: "method_not_found" }, { status: 400 });

  const timestamp = new Date().toISOString();
  const runId = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  const learningEligible = method.group === "native";
  const draft: ContentDraft = {
    id: draftId,
    tenant_id: account.tenant_id,
    owner_user_id: account.owner_user_id ?? guard.auth.user.id,
    account_id: account.id,
    run_id: runId,
    status: "published",
    business_line: account.business_line ?? "executive",
    method_group: method.group,
    method_id: method.id,
    method_label: method.label,
    generation_mode: parsed.data.generationMode,
    title_promise: parsed.data.titlePromise,
    selected_body_version: "selected",
    raw_body_tags: [],
    tagging_status: "unclassified",
    canonical_tag_ids: [],
    cta_type: account.persona === "merchant" ? "service_entry" : account.persona === "expert" ? "on_platform_consult" : "soft_bridge",
    validation_checks: [],
    schema_version: "method_v3_2",
    method_attribution_status: "confirmed",
    eligible_for_method_learning: learningEligible,
    test_variable: "补录内容的标题入口",
    expected_signal: "有效咨询",
    title: parsed.data.title,
    alternative_titles: [],
    target_user: account.target_user,
    cover_text: parsed.data.title,
    body: "历史补录：正文已在小红书人工发布，系统不覆盖原文。",
    hashtags: [],
    comment_prompt: "",
    word_count: { title: parsed.data.title.length, body_and_tags: 0, total: parsed.data.title.length, within_limit: true },
    follow_reason: account.follow_reason || "持续获得相关判断",
    trust_anchor: account.trust_source,
    review_points: ["有效咨询", "主页访问", "收藏", "分享"],
    cover_suggestion: "历史补录不重建封面",
    published_at: parsed.data.publishedAt,
    distributed_at: parsed.data.publishedAt,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const run: GrowthRun = {
    id: runId,
    tenant_id: account.tenant_id,
    owner_user_id: account.owner_user_id ?? guard.auth.user.id,
    account_id: account.id,
    status: "published",
    week: 1,
    objective: "补录已人工发布笔记",
    experiment_hypothesis: "补录内容只按确认后的方法归属参与复盘。",
    selected_topic: undefined,
    topic_pool: [],
    generation_mode: parsed.data.generationMode,
    draft,
    created_at: timestamp,
    updated_at: timestamp,
  };
  await store.saveRun(run);

  return NextResponse.json({ draft, learningEligible, message: learningEligible ? "已进入复盘待办。" : "对标法缺少原始母题，只进入历史统计，不进入方法胜率。" });
}
