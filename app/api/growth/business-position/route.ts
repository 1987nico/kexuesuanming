import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import {
  businessPositionsFromSettings,
  resolveBusinessPosition,
} from "@/lib/growth/businessPosition";
import { growthStore } from "@/lib/growth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  business_line: z.enum(["executive", "overseas_student"]),
  service_category: z.string().trim().min(1).max(300),
  target_user: z.string().trim().min(1).max(1000),
  core_problem: z.string().trim().min(1).max(1000),
  main_offer: z.string().trim().min(1).max(1000),
  differentiation: z.string().trim().min(1).max(1000),
  trust_source: z.string().trim().min(1).max(1000),
  compliance_redline: z.string().trim().min(1).max(1000),
});

export async function GET() {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const settings = await growthStore().getBusinessSettings(DEFAULT_TENANT_ID);
  return NextResponse.json({ positions: businessPositionsFromSettings(settings) });
}

export async function PUT(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const store = growthStore();
  const settings = await store.getBusinessSettings(DEFAULT_TENANT_ID);
  const current = resolveBusinessPosition(settings, parsed.data.business_line);
  const position = { ...current, ...parsed.data };
  await store.saveBusinessSettings({
    ...settings,
    business_positions: {
      ...businessPositionsFromSettings(settings),
      [parsed.data.business_line]: position,
    },
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ position });
}
