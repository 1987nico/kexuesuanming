import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { QUICK_PANEL_ID, QUICK_PANEL_TITLE, SEED_ITEMS } from "@/lib/quickScore/seed";
import type { QuickRespondent, QuickScore } from "@/lib/quickScore/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { panelId: string } }
) {
  if (params.panelId !== QUICK_PANEL_ID) {
    return NextResponse.json({ error: "panel_not_found" }, { status: 404 });
  }

  // 首次访问自动 seed
  await store().ensureQuickPanel(QUICK_PANEL_ID, QUICK_PANEL_TITLE, SEED_ITEMS);
  const panel = await store().getQuickPanel(QUICK_PANEL_ID);
  if (!panel) {
    return NextResponse.json({ error: "panel_init_failed" }, { status: 500 });
  }

  const url = new URL(req.url);
  const respondentId = url.searchParams.get("respondent_id");

  let respondent: QuickRespondent | null = null;
  let scores: QuickScore[] = [];
  if (respondentId) {
    const r = await store().getQuickRespondent(respondentId);
    if (r && r.panel_id === panel.id) {
      respondent = r;
      scores = await store().getQuickScoresByRespondent(respondentId);
    }
  }

  return NextResponse.json({
    panel,
    respondent,
    scores,
  });
}
