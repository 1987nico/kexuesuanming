import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/auth/activity";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import { enforceDraftCompliance, hardChecksAllowPublishing, withDraftValidation } from "@/lib/growth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  published_at: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const store = growthStore();
  const draft = await store.getDraft(params.draftId);
  if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  if (draft.content_use_mode === "internal_training" || draft.publish_eligible === false) {
    return NextResponse.json(
      {
        error: "internal_training_publish_blocked",
        message: draft.publish_block_reason || "内部培训模拟内容仅供训练，不能标记为正式发布。",
      },
      { status: 422 },
    );
  }
  if (draft.status === "reviewed") {
    return NextResponse.json(
      { error: "published_at_locked", message: "正式24小时复盘已生成，发布时间已锁定。" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }
  const publishedAt = parsed.data.published_at || new Date().toISOString();
  if (Date.parse(publishedAt) > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ error: "published_at_in_future", message: "实际发布时间不能晚于当前时间。" }, { status: 400 });
  }

  const checkedDraft = enforceDraftCompliance(draft);
  if (!checkedDraft.word_count.within_limit) {
    return NextResponse.json({
      error: "publish_text_too_long",
      message: `标题、正文和话题共${checkedDraft.word_count.total}字，超过小红书1000字限制，不能标记发布。`,
      word_count: checkedDraft.word_count,
    }, { status: 422 });
  }
  if (checkedDraft.compliance?.status === "blocked") {
    return NextResponse.json(
      {
        error: "compliance_blocked",
        message: "这篇正文仍包含小红书互动风险，不能标记发布。请重新生成或修改后再试。",
        issues: checkedDraft.compliance.issues,
      },
      { status: 422 },
    );
  }

  const account = await store.getAccount(draft.account_id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const isLegacy = checkedDraft.schema_version === "legacy_v1" || !checkedDraft.schema_version;
  const validatedDraft = isLegacy ? checkedDraft : withDraftValidation(checkedDraft, account.persona);
  const validationChecks = validatedDraft.validation_checks ?? [];
  if (!isLegacy && (!hardChecksAllowPublishing(validationChecks) || validatedDraft.validation_report?.status !== "passed")) {
    return NextResponse.json({ error: "hard_validation_blocked", message: "身份、兑现或转化植入检查未通过，不能标记发布。", checks: validationChecks }, { status: 422 });
  }

  const published = {
    ...validatedDraft,
    validation_checks: validationChecks,
    owner_user_id: checkedDraft.owner_user_id ?? guard.auth.user.id,
    status: "published" as const,
    published_at: publishedAt,
    distributed_at: publishedAt,
    updated_at: new Date().toISOString(),
  };
  await store.saveDraft(published);
  await logActivity({
    tenantId: published.tenant_id,
    userId: guard.auth.user.id,
    action: "draft_published",
    entityType: "content_draft",
    entityId: published.id,
    metadata: { title: published.title, compliance_status: published.compliance?.status, published_at: publishedAt },
  });

  const run = await store.getRun(draft.run_id);
  if (run) {
    await store.saveRun({
      ...run,
      status: "published",
      draft: published,
      updated_at: published.updated_at,
    });
  }

  return NextResponse.json({ draft: published });
}
