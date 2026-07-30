import { NextResponse } from "next/server";
import { requireMianbaApiAuth } from "@/lib/auth/mianba";
import { growthStore } from "@/lib/growth/store";
import { growthPreviewEnabled } from "@/lib/growth/previewFixture";
import {
  accountBelongsToProfileWorkspace,
  pendingAccountProfileSummary,
  partitionAccountProfiles,
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
  const ownerScope = growthPreviewEnabled() ? undefined : guard.auth.user.id;
  const store = growthStore();
  const accounts = await store.listAccounts(TENANT_ID, ownerScope);
  const partition = partitionAccountProfiles(accounts, {
    tenantId: TENANT_ID,
    ownerUserId: ownerScope,
    businessLine,
    persona,
  });
  return NextResponse.json({
    accounts: partition.visible
      .filter((account) => accountBelongsToProfileWorkspace(account, {
        tenantId: TENANT_ID,
        ownerUserId: ownerScope,
        businessLine,
        persona,
      }))
      .map(toAccountSummary),
    review: {
      pendingCount: partition.pending.length,
      duplicateCount: partition.duplicates.length,
      pendingProfiles: await Promise.all(partition.pending.map(async (account) => {
        const [plan, runs, drafts] = await Promise.all([
          store.getLatestPlan(account.id),
          store.listRuns(account.id),
          store.listDrafts(account.id),
        ]);
        return pendingAccountProfileSummary(
          account,
          Boolean(
            plan
            || runs.length
            || drafts.length
            || account.weekly_review
            || account.three_day_review_cycles?.length,
          ),
        );
      })),
    },
  });
}
