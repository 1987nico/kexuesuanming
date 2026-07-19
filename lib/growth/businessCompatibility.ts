import type { GrowthAccount, GrowthBusinessLine } from "./types";

const EXECUTIVE_STRONG_FOREIGN = /留学生|留学家庭|留学生家长|孩子求职|美国\s*top|海外硕士|秋招陪跑|求职辅导/iu;
const EXECUTIVE_FOREIGN_SIGNALS = [/孩子/iu, /家长/iu, /offer/iu, /硕士/iu, /秋招/iu, /投递/iu, /群面/iu];
const OVERSEAS_STRONG_FOREIGN = /中高管|职业决策|事业方向|职业换挡|裸辞|离开体制|管理层转型|高管转型/iu;

/**
 * 历史账号曾把两条业务写进同一组人设字段。这里仅决定当前业务是否展示/参与生成，
 * 不修改数据库中的原始历史值。
 */
export function isBusinessCompatibleText(value: string | undefined, businessLine: GrowthBusinessLine) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  if (businessLine === "overseas_student") return !OVERSEAS_STRONG_FOREIGN.test(text);
  if (EXECUTIVE_STRONG_FOREIGN.test(text)) return false;
  return EXECUTIVE_FOREIGN_SIGNALS.filter((pattern) => pattern.test(text)).length < 2;
}

export function visibleBusinessText(value: string | undefined, businessLine: GrowthBusinessLine) {
  return isBusinessCompatibleText(value, businessLine) ? String(value ?? "") : "";
}

export function accountForBusinessGeneration(account: GrowthAccount): GrowthAccount {
  const businessLine = account.business_line ?? "executive";
  return {
    ...account,
    persona_specific: Object.fromEntries(
      Object.entries(account.persona_specific ?? {}).map(([key, value]) => [
        key,
        visibleBusinessText(value, businessLine),
      ]),
    ),
    content_directions: (account.content_directions ?? []).filter((value) =>
      isBusinessCompatibleText(value, businessLine)),
  };
}
