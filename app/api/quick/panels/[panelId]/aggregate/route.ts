import { NextResponse } from "next/server";
import { store } from "@/lib/db/store";
import { QUICK_PANEL_ID, QUICK_PANEL_TITLE, SEED_ITEMS } from "@/lib/quickScore/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner 专用：返回某 panel 下所有受访者 + 全部打分。
 * 必须带 ?token=xxx，且与服务端 OWNER_VIEW_TOKEN 匹配。
 */
export async function GET(
  req: Request,
  { params }: { params: { panelId: string } }
) {
  if (params.panelId !== QUICK_PANEL_ID) {
    return NextResponse.json({ error: "panel_not_found" }, { status: 404 });
  }

  const expected = process.env.OWNER_VIEW_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "owner_token_not_configured" },
      { status: 500 }
    );
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await store().ensureQuickPanel(QUICK_PANEL_ID, QUICK_PANEL_TITLE, SEED_ITEMS);
  const panel = await store().getQuickPanel(QUICK_PANEL_ID);
  const { respondents, scores } = await store().getQuickPanelAggregate(QUICK_PANEL_ID);

  return NextResponse.json({ panel, respondents, scores });
}
