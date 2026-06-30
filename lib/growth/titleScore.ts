export type TitleScoreGrade = "S" | "A" | "B" | "C";

export type ComplianceRiskLevel = "low" | "medium" | "high";

export interface TitleScoreInput {
  title: string;
  targetUser?: string;
  coreProblem?: string;
  topic?: string;
}

export interface TitleDimensionScore {
  score: number;
  reason: string;
}

export interface ComplianceRiskScore {
  score: number;
  level: ComplianceRiskLevel;
  reasons: string[];
}

export interface TitleScoreResult {
  title: string;
  topicMatch: TitleDimensionScore;
  benefitClarity: TitleDimensionScore;
  emotionalActivation: TitleDimensionScore;
  complianceRisk: ComplianceRiskScore;
  totalScore: number;
  grade: TitleScoreGrade;
  suggestions: string[];
}

const DOMAIN_TERMS = [
  "面试",
  "跳槽",
  "转岗",
  "升职",
  "职业",
  "职场",
  "简历",
  "offer",
  "中高层",
  "副业",
  "转型",
  "测评",
  "报告",
  "小红书",
  "起号",
  "咨询",
  "复盘",
  "决策",
  "方向",
];

const BENEFIT_TERMS = [
  "如何",
  "方法",
  "清单",
  "模板",
  "避坑",
  "判断",
  "搞定",
  "提升",
  "拿到",
  "解决",
  "拆解",
  "步骤",
  "指南",
  "自测",
  "答案",
  "必看",
];

const EMOTION_TERMS = [
  "焦虑",
  "迷茫",
  "后悔",
  "真相",
  "扎心",
  "别再",
  "最后",
  "必须",
  "没人告诉你",
  "踩坑",
  "救命",
  "崩溃",
  "裸辞",
  "上岸",
  "必看",
];

const AUDIENCE_TERMS = ["应届生", "打工人", "中高层", "管理者", "转岗人", "裸辞", "宝妈", "35岁", "职场新人"];

const HIGH_RISK_TERMS = ["保证", "必赚", "稳赚", "一夜暴富", "100%", "包过", "包上岸", "稳赚不赔", "内部名额"];
const MEDIUM_RISK_TERMS = ["最强", "第一", "唯一", "绝对", "躺赚", "逆天改命", "封神", "暴富"];

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function countHits(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase())).length;
}

function extractTokens(text: string) {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();
  const words = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const word of words) {
    tokens.add(word);
    if (/^[\u4e00-\u9fa5]+$/.test(word) && word.length > 2) {
      for (let index = 0; index <= word.length - 2; index += 1) {
        tokens.add(word.slice(index, index + 2));
      }
    }
  }
  return tokens;
}

function countTokenOverlap(title: string, context: string) {
  const titleTokens = extractTokens(title);
  const contextTokens = extractTokens(context);
  let overlap = 0;
  for (const token of titleTokens) {
    if (contextTokens.has(token)) overlap += 1;
  }
  return overlap;
}

function scoreTopicMatch(input: TitleScoreInput): TitleDimensionScore {
  const context = [input.targetUser, input.coreProblem, input.topic].filter(Boolean).join(" ");
  const domainHits = countHits(input.title, DOMAIN_TERMS);
  const audienceHits = countHits(input.title, AUDIENCE_TERMS);
  const overlap = context ? countTokenOverlap(input.title, context) : 0;
  const score = clampScore(50 + domainHits * 8 + audienceHits * 8 + Math.min(overlap, 4) * 8);

  if (overlap > 0) {
    return { score, reason: "标题与目标用户/核心问题有明确词义重合。" };
  }
  if (domainHits > 0) {
    return { score, reason: "标题包含职场增长相关关键词，但与输入上下文的贴合度还可加强。" };
  }
  return { score, reason: "标题主题较泛，建议加入目标人群或具体职场场景。" };
}

function scoreBenefitClarity(title: string): TitleDimensionScore {
  const benefitHits = countHits(title, BENEFIT_TERMS);
  const hasNumber = /\d|[一二三四五六七八九十]个|[一二三四五六七八九十]步/.test(title);
  const hasQuestion = /[?？]/.test(title) || title.includes("如何");
  const hasConcreteOutcome = /拿到|解决|判断|提升|避开|少走|搞定|看懂|选对/.test(title);
  const score = clampScore(42 + benefitHits * 10 + (hasNumber ? 10 : 0) + (hasQuestion ? 8 : 0) + (hasConcreteOutcome ? 14 : 0));

  if (hasConcreteOutcome || benefitHits >= 2) {
    return { score, reason: "标题给出了可感知的收益或行动结果。" };
  }
  return { score, reason: "标题能看出方向，但还缺少更具体的收益承诺。" };
}

function scoreEmotionalActivation(title: string): TitleDimensionScore {
  const emotionHits = countHits(title, EMOTION_TERMS);
  const contrastHits = countHits(title, ["不是", "而是", "却", "其实", "原来"]);
  const punctuationBoost = /[!！?？]/.test(title) ? 6 : 0;
  const score = clampScore(38 + emotionHits * 12 + contrastHits * 8 + punctuationBoost);

  if (emotionHits > 0 || contrastHits > 0) {
    return { score, reason: "标题包含情绪触发或反差表达，具备打开欲望。" };
  }
  return { score, reason: "标题表达偏平，建议加入痛点、反差或紧迫感。" };
}

function scoreComplianceRisk(title: string): ComplianceRiskScore {
  const highRiskHits = HIGH_RISK_TERMS.filter((term) => title.toLowerCase().includes(term.toLowerCase()));
  const mediumRiskHits = MEDIUM_RISK_TERMS.filter((term) => title.toLowerCase().includes(term.toLowerCase()));
  const score = clampScore(highRiskHits.length * 35 + mediumRiskHits.length * 18);
  const reasons = [...highRiskHits, ...mediumRiskHits].map((term) => `包含高承诺/夸大表达：${term}`);

  if (score >= 50) {
    return { score, level: "high", reasons: reasons.length ? reasons : ["存在较强绝对化或承诺式表达。"] };
  }
  if (score >= 18) {
    return { score, level: "medium", reasons: reasons.length ? reasons : ["存在一定夸张表达，发布前建议降调。"] };
  }
  return { score, level: "low", reasons: ["未发现明显绝对化收益承诺或高风险词。"] };
}

function gradeFromScore(score: number): TitleScoreGrade {
  if (score >= 86) return "S";
  if (score >= 76) return "A";
  if (score >= 62) return "B";
  return "C";
}

function buildSuggestions(result: Omit<TitleScoreResult, "suggestions">) {
  const suggestions: string[] = [];
  if (result.topicMatch.score < 72) suggestions.push("补上目标人群或具体场景，例如“转岗人”“中高层”“面试前”。");
  if (result.benefitClarity.score < 72) suggestions.push("把标题改成可执行收益：方法、清单、模板、判断标准或避坑步骤。");
  if (result.emotionalActivation.score < 65) suggestions.push("加入真实痛点、反差或紧迫感，但避免制造过度焦虑。");
  if (result.complianceRisk.level !== "low") suggestions.push("降低绝对化承诺，避免“保证、唯一、最强、包过”等表达。");
  if (suggestions.length === 0) suggestions.push("标题结构完整，可优先做封面句和首段钩子的 A/B 测试。");
  return suggestions;
}

export function scoreTitle(input: TitleScoreInput): TitleScoreResult {
  const title = input.title.trim();
  const topicMatch = scoreTopicMatch({ ...input, title });
  const benefitClarity = scoreBenefitClarity(title);
  const emotionalActivation = scoreEmotionalActivation(title);
  const complianceRisk = scoreComplianceRisk(title);
  const lengthPenalty = title.length < 8 || title.length > 32 ? 6 : 0;
  const totalScore = clampScore(
    topicMatch.score * 0.32 +
      benefitClarity.score * 0.3 +
      emotionalActivation.score * 0.23 +
      (100 - complianceRisk.score) * 0.15 -
      lengthPenalty,
  );
  const baseResult = {
    title,
    topicMatch,
    benefitClarity,
    emotionalActivation,
    complianceRisk,
    totalScore,
    grade: gradeFromScore(totalScore),
  };

  return {
    ...baseResult,
    suggestions: buildSuggestions(baseResult),
  };
}
