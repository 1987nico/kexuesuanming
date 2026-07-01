import { NextResponse } from "next/server";
import { z } from "zod";
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
});

export async function PUT(req: Request) {
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
    name: parsed.data.name,
    target_user: parsed.data.target_user,
    core_problem: parsed.data.core_problem,
    account_value: parsed.data.account_value,
    trust_source: parsed.data.trust_source,
    not_doing: parsed.data.not_doing,
    hypotheses: parsed.data.hypotheses,
    updated_at: new Date().toISOString(),
  };
  await store.saveAccount(account);
  return NextResponse.json({ account });
}
