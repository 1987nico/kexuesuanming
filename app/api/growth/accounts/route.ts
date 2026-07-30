import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import {
  accountBelongsToProfileWorkspace,
  toAccountSummary,
} from "@/lib/growth/accountProfiles";
import {
  GROWTH_BUSINESS_LINES,
  GROWTH_PERSONAS,
  type GrowthBusinessLine,
  type GrowthPersona,
} from "@/lib/growth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = "mianbajun";

export async function GET(req: Request) {
  const guard = await requireMianbaApiAuth();
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const businessLine = url.searchParams.get("businessLine") as GrowthBusinessLine;
  const persona = url.searchParams.get("persona") as GrowthPersona;
  if (!GROWTH_BUSINESS_LINES.includes(businessLine) || !GROWTH_PERSONAS.includes(persona)) {
    return NextResponse.json({ error: "validation", message: "业务或视角参数无效。" }, { status: 400 });
  }
  const ownerScope = guard.auth.role === "admin" ? undefined : guard.auth.user.id;
  const accounts = await growthStore().listAccounts(TENANT_ID, ownerScope, businessLine);
  return NextResponse.json({
    accounts: accounts
      .filter((account) => accountBelongsToProfileWorkspace(account, {
        tenantId: TENANT_ID,
        ownerUserId: ownerScope,
        businessLine,
        persona,
      }))
      .map(toAccountSummary),
  });
}
