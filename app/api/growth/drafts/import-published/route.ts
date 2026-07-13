import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { buildImportedPublishedDraft, findDraftByTitle } from "@/lib/growth/importPublishedDraft";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountId: z.string().uuid(),
  runId: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(20).max(10_000),
  direction: z.enum(["A", "B", "C"]),
  contentType: z.enum(["diagnostic", "tool", "story"]),
  published_at: z.string().datetime(),
});

export async function POST(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "请填写标题、完整正文、内容方向和实际发布时间。", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const publishedAt = new Date(parsed.data.published_at);
  if (!Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "published_at_invalid", message: "实际发布时间不能晚于当前时间。" }, { status: 400 });
  }

  const store = growthStore();
  const [account, run] = await Promise.all([
    store.getAccount(parsed.data.accountId),
    store.getRun(parsed.data.runId),
  ]);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (!run || run.account_id !== account.id) {
    return NextResponse.json({ error: "run_not_found", message: "当前账号还没有可用的选题批次。" }, { status: 404 });
  }
  if (guard.auth.role !== "admin" && account.owner_user_id != null && account.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const drafts = await store.listDrafts(account.id);
  const existing = findDraftByTitle(drafts, parsed.data.title);
  if (existing) {
    if (existing.status === "reviewed") {
      return NextResponse.json({ draft: existing, existing: true, message: "这篇笔记已经完成复盘，无需重复补录。" });
    }
    const recovered = {
      ...existing,
      status: "published" as const,
      body: parsed.data.body,
      direction: parsed.data.direction,
      content_type: parsed.data.contentType,
      published_at: publishedAt.toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.saveDraft(recovered);
    return NextResponse.json({ draft: recovered, existing: true, message: "已恢复原笔记的复盘入口。" });
  }

  const draft = buildImportedPublishedDraft({
    account,
    run,
    ownerUserId: guard.auth.user.id,
    title: parsed.data.title,
    body: parsed.data.body,
    direction: parsed.data.direction,
    contentType: parsed.data.contentType,
    publishedAt: publishedAt.toISOString(),
  });
  await store.saveDraft(draft);

  return NextResponse.json({ draft, existing: false, message: "已补录到单篇复盘清单。" }, { status: 201 });
}
