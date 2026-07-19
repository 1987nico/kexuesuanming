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

  const account = {
    ...existing,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  await store.saveAccount(account);
  return NextResponse.json({ account });
}
