import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";
const eventNames = [
  "topic_batch_ready",
  "topic_batch_shown",
  "topic_batch_swapped",
  "topic_selected",
  "body_preheat_started",
  "body_preheat_ready",
  "body_requested",
  "body_shown",
  "draft_version_chosen",
  "content_copied",
  "content_published",
] as const;

const schema = z.object({
  event: z.enum(eventNames),
  accountId: z.string().min(1),
  businessLine: z.enum(["executive", "overseas_student"]),
  persona: z.enum(["merchant", "buyer", "expert"]),
  runId: z.string().optional(),
  topicId: z.string().optional(),
  draftId: z.string().optional(),
  batchNumber: z.number().int().min(1).max(100).optional(),
  generationMode: z.enum(["default", "explore"]).optional(),
  cacheHit: z.boolean().optional(),
  durationMs: z.number().min(0).max(3_600_000).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }
  const store = growthStore();
  const account = await store.getAccount(parsed.data.accountId);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (guard.auth.role !== "admin" && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (account.business_line !== parsed.data.businessLine || account.persona !== parsed.data.persona) {
    return NextResponse.json({ error: "workspace_context_mismatch" }, { status: 409 });
  }
  await store.saveUsage({
    tenant_id: DEFAULT_TENANT_ID,
    user_id: guard.auth.user.id,
    feature: "growth_text",
    metadata: {
      action: parsed.data.event,
      ...parsed.data,
    },
  });
  // 用户真正看到/选择标题或继续正文时，才把这个账号标记为近期活跃。
  // 夜间预生成据此优先补给真实在用账号，避免被很久没打开的测试人设占满库存。
  await store.saveAccount({
    ...account,
    last_used_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
