import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import {
  businessPositionsFromSettings,
  resolveBusinessPosition,
} from "@/lib/growth/businessPosition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "mianbajun";

const bodySchema = z.object({
  track: z.enum(["international-student-career", "executive-career"]),
  service_category: z.string().min(1).max(300),
  target_user: z.string().min(1).max(1000),
  core_problem: z.string().min(1).max(1000),
  main_offer: z.string().min(1).max(1000),
  differentiation: z.string().min(1).max(1000),
  trust_source: z.string().min(1).max(1000),
  compliance_redline: z.string().min(1).max(1000),
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
  const current = resolveBusinessPosition(settings, parsed.data.track);
  const nextPosition = {
    ...current,
    ...parsed.data,
  };
  const nextSettings = {
    ...settings,
    business_positions: {
      ...businessPositionsFromSettings(settings),
      [parsed.data.track]: nextPosition,
    },
    updated_at: new Date().toISOString(),
  };
  await store.saveBusinessSettings(nextSettings);
  return NextResponse.json({ position: nextPosition });
}
