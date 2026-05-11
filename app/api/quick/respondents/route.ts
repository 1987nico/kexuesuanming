import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/db/store";
import { QUICK_PANEL_ID, QUICK_PANEL_TITLE, SEED_ITEMS } from "@/lib/quickScore/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  panelId: z.string().min(1),
  name: z.string().min(1).max(40),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parse = bodySchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: "validation", issues: parse.error.flatten() }, { status: 400 });
  }
  const { panelId, name } = parse.data;
  if (panelId !== QUICK_PANEL_ID) {
    return NextResponse.json({ error: "panel_not_found" }, { status: 404 });
  }

  await store().ensureQuickPanel(QUICK_PANEL_ID, QUICK_PANEL_TITLE, SEED_ITEMS);
  const respondent = await store().createQuickRespondent(panelId, name.trim());
  return NextResponse.json({ respondent });
}
