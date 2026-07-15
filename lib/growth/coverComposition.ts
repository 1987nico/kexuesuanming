export type BuyerCCaseMode = "真实案例" | "情景演绎";

export interface BuyerCCoverOverlay {
  companyName: string;
  companyLine: string;
  venueBanner: string;
  emailSender: string;
  emailSubject: string;
  emailRows: string[];
  disclosure: string;
  headlineLines: string[];
  accentColor: string;
}

const COMPANY_PATTERNS = [
  { pattern: /中国石油|中石油|PetroChina/i, name: "中国石油", color: "#b31319" },
  { pattern: /中国石化|中石化|Sinopec/i, name: "中国石化", color: "#c4111a" },
  { pattern: /阿里巴巴|阿里(?!山)/i, name: "阿里巴巴", color: "#f36c21" },
  { pattern: /腾讯|Tencent/i, name: "腾讯", color: "#1769d2" },
] as const;

function findCompany(source: string) {
  for (const company of COMPANY_PATTERNS) {
    if (company.pattern.test(source)) return { name: company.name, color: company.color };
  }
  const custom = source.match(/([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,18}(?:集团|公司|银行|证券|科技|能源))/u)?.[1];
  return custom ? { name: custom, color: "#a81218" } : null;
}

function findRole(source: string) {
  const cleaned = COMPANY_PATTERNS.reduce((value, company) => value.replace(company.pattern, ""), source);
  const match = cleaned.match(
    /([\u4e00-\u9fa5A-Za-z0-9+#/\-]{2,18}(?:工程师|分析师|管培生|产品经理|品牌岗|运营岗|技术岗|岗位))/u,
  )?.[1];
  return match ? match.replace(/^的/u, "") : "关键信息已隐去";
}

export function splitCoverHeadline(raw: string) {
  const text = raw.replace(/[｜|]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return ["留学生秋招现场"];
  const explicit = text.split(" ").filter(Boolean);
  if (explicit.length >= 2) {
    const midpoint = Math.ceil(explicit.length / 2);
    return [explicit.slice(0, midpoint).join(" "), explicit.slice(midpoint).join(" ")].filter(Boolean).slice(0, 2);
  }
  const naturalSplit = text.search(/老二|孩子|秋招|校招/u);
  if (naturalSplit > 2) return [text.slice(0, naturalSplit), text.slice(naturalSplit)].slice(0, 2);
  const chars = Array.from(text);
  if (chars.length <= 11) return [text];
  const midpoint = Math.ceil(chars.length / 2);
  return [chars.slice(0, midpoint).join(""), chars.slice(midpoint).join("")];
}

export function buildBuyerCCoverOverlay(input: {
  title: string;
  coverText?: string;
  caseMode?: BuyerCCaseMode;
  caseMaterial?: string;
  body?: string;
}): BuyerCCoverOverlay {
  const mode = input.caseMode === "真实案例" ? "真实案例" : "情景演绎";
  const source = [input.caseMaterial, input.body].filter(Boolean).join("\n");
  const found = findCompany(source);
  const companyName = found?.name || (mode === "真实案例" ? "案例企业" : "远航能源（虚构）");
  const displayCompany = mode === "情景演绎" && found ? `${companyName}求职情景` : companyName;
  const role = findRole(source);

  return {
    companyName: displayCompany,
    companyLine: `${displayCompany}校园招聘`,
    venueBanner: `${displayCompany} 2026届留学生招聘会`,
    emailSender: `${displayCompany}校园招聘中心`,
    emailSubject: "录用结果通知 / Offer Notification",
    emailRows: ["候选人：王*", `应聘岗位：${role}`, "工作地点：关键信息已隐去", "通知时间：2026-07-**"],
    disclosure: mode === "情景演绎" ? "情景演绎 / 示意图" : "AI场景合成 / 案例信息脱敏",
    headlineLines: splitCoverHeadline(input.coverText || input.title),
    accentColor: found?.color || "#a81218",
  };
}
