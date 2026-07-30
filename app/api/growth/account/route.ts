import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  target_user: z.string().min(1).max(1000),
  core_problem: z.string().min(1).max(1000),
  account_value: z.string().min(1).max(1000),
  trust_source: z.string().min(1).max(1000),
  not_doing: z.string().min(1).max(1000),
  hypotheses: z.array(z.string().max(300)).max(8).default([]),
  one_liner: z.string().max(200).optional(),
  follow_reason: z.string().max(500).optional(),
  tone_style: z.string().max(300).optional(),
  filter_words: z.array(z.string().max(40)).max(12).optional(),
  avoid_expressions: z.array(z.string().max(40)).max(12).optional(),
  compliance_redline: z.string().max(500).optional(),
  private_domain: z.string().max(500).optional(),
  persona_specific: z.record(z.string().max(500)).optional(),
  profile_name: z.string().trim().min(1).max(80).optional(),
  platform_binding: z.object({
    platform: z.literal("xiaohongshu"),
    account_name: z.string().trim().max(100),
    account_uid: z.string().trim().max(120).optional(),
    profile_url: z.string().trim().url().max(500).optional(),
    binding_status: z.enum(["bound", "unbound"]),
    bound_at: z.string().optional(),
  }).optional(),
});

export async function PUT(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });
  }

  const store = growthStore();
  const existing = await store.getAccount(parsed.data.id);
  if (!existing) {
    return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  }
  if (guard.auth.role !== "admin" && existing.owner_user_id !== guard.auth.user.id) {
    return NextResponse.json({ error: "forbidden", message: "不能修改其他用户的账号人设。" }, { status: 403 });
  }

  const bindingUid = parsed.data.platform_binding?.account_uid?.trim();
  if (bindingUid) {
    const accounts = await store.listAccounts(existing.tenant_id, existing.owner_user_id ?? undefined);
    const duplicate = accounts.find((candidate) =>
      candidate.id !== existing.id
      && candidate.profile_status !== "archived"
      && candidate.platform_binding?.platform === "xiaohongshu"
      && candidate.platform_binding.account_uid === bindingUid);
    if (duplicate) {
      return NextResponse.json({
        error: "duplicate_platform_binding",
        message: "这个小红书账号已经绑定到另一个账号人设，请先检查账号归属。",
      }, { status: 409 });
    }
  }

  const account = {
    ...existing,
    ...parsed.data,
    platform_binding: parsed.data.platform_binding
      ? {
        ...parsed.data.platform_binding,
        binding_status: parsed.data.platform_binding.account_name ? "bound" as const : "unbound" as const,
        bound_at: parsed.data.platform_binding.account_name
          ? parsed.data.platform_binding.bound_at || new Date().toISOString()
          : undefined,
      }
      : existing.platform_binding,
    last_used_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await store.saveAccount(account);
  return NextResponse.json({ account });
}
