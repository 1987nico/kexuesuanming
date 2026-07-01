import type { QuickItem } from "./types";
import { QUICK_PANEL_ID, QUICK_PANEL_TITLE, SEED_ITEMS } from "./seed";
import { OTHERS_PANEL_ID, OTHERS_PANEL_TITLE, SEED_ITEMS_OTHERS } from "./seed-others";

const REGISTRY: Record<string, { title: string; items: QuickItem[] }> = {
  [QUICK_PANEL_ID]: { title: QUICK_PANEL_TITLE, items: SEED_ITEMS },
  [OTHERS_PANEL_ID]: { title: OTHERS_PANEL_TITLE, items: SEED_ITEMS_OTHERS },
};

export function getQuickPanelDef(panelId: string): { title: string; items: QuickItem[] } | null {
  return REGISTRY[panelId] ?? null;
}
