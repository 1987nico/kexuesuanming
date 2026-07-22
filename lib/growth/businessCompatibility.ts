import { DEFAULT_BUSINESS_POSITIONS } from "./businessPosition";
import {
  GROWTH_BUSINESS_DEFINITIONS,
  type GrowthAccount,
  type GrowthBusinessLine,
  type GrowthPersona,
} from "./types";

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

/**
 * v3.2 上线前的账号没有 business_line。不能把“缺字段”直接当成中高管，
 * 否则留学生账号会在正文阶段被装配成中高管合同。
 */
export function resolveAccountBusinessLine(account: GrowthAccount): GrowthBusinessLine {
  if (account.business_line) return account.business_line;

  const legacyText = [
    account.name,
    account.target_user,
    account.core_problem,
    account.account_value,
    account.trust_source,
    account.one_liner,
    account.follow_reason,
    ...(account.content_directions ?? []),
    ...Object.values(account.persona_specific ?? {}),
  ].filter(Boolean).join(" ").toLowerCase();

  const overseasSignals = ["留学生", "留学", "回国求职", "海外秋招", "秋招陪跑", "offer"];
  const executiveSignals = ["中高管", "高管", "职业决策", "事业方向", "职业参谋", "管理层转型"];
  const overseasScore = overseasSignals.filter((signal) => legacyText.includes(signal)).length;
  const executiveScore = executiveSignals.filter((signal) => legacyText.includes(signal)).length;
  return overseasScore > executiveScore ? "overseas_student" : "executive";
}

function safeBusinessText(value: string | undefined, businessLine: GrowthBusinessLine, fallback: string) {
  return visibleBusinessText(value, businessLine).trim() || fallback;
}

export function accountMatchesWorkspace(
  account: GrowthAccount,
  expected: { accountId: string; businessLine: GrowthBusinessLine; persona: GrowthPersona },
) {
  return account.id === expected.accountId
    && resolveAccountBusinessLine(account) === expected.businessLine
    && account.persona === expected.persona;
}

export function accountForBusinessGeneration(account: GrowthAccount): GrowthAccount {
  const businessLine = resolveAccountBusinessLine(account);
  const position = DEFAULT_BUSINESS_POSITIONS[businessLine];
  const definition = GROWTH_BUSINESS_DEFINITIONS[businessLine];
  const role = definition.personas[account.persona].role;
  return {
    ...account,
    // 所有后续合同和兜底逻辑只读取这个显式字段，禁止再把旧账号误判为 executive。
    business_line: businessLine,
    name: safeBusinessText(account.name, businessLine, `面霸君 · ${role}`),
    target_user: safeBusinessText(account.target_user, businessLine, position.target_user),
    core_problem: safeBusinessText(account.core_problem, businessLine, position.core_problem),
    account_value: safeBusinessText(account.account_value, businessLine, position.differentiation),
    trust_source: safeBusinessText(account.trust_source, businessLine, position.trust_source),
    one_liner: safeBusinessText(account.one_liner, businessLine, role),
    follow_reason: safeBusinessText(account.follow_reason, businessLine, definition.personas[account.persona].description),
    not_doing: safeBusinessText(account.not_doing, businessLine, position.compliance_redline),
    compliance_redline: safeBusinessText(account.compliance_redline, businessLine, position.compliance_redline),
    hypotheses: (account.hypotheses ?? []).filter((value) => isBusinessCompatibleText(value, businessLine)),
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
