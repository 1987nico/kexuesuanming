import type {
  ContentDraft,
  DraftCompliance,
  DraftValidationAnnotation,
  DraftValidationKey,
  DraftValidationReport,
  GrowthPersona,
  TopicCandidate,
  TopicSourceSnapshot,
  ValidationCheck,
} from "./types";
import { methodApplicability, TITLE_METHOD_BY_ID } from "./methods";

export function normalizeTags(tags: string[]) {
  return tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).slice(0, 5);
}

export function countPublishChars(title: string, body: string, hashtags: string[]) {
  const bodyAndTags = `${body}\n${hashtags.join(" ")}`.length;
  const total = title.length + bodyAndTags;
  return {
    title: title.length,
    body_and_tags: bodyAndTags,
    total,
    within_limit: total <= 1000,
  };
}

export function isPublishTextWithinLimit(title: string, body: string, hashtags: string[]) {
  return countPublishChars(title, body, hashtags).within_limit;
}

export type InteractionComplianceField = "title" | "cover_text" | "body" | "comment_prompt" | "hashtags";

export interface InteractionComplianceIssue {
  code: string;
  field: InteractionComplianceField;
  message: string;
}

interface InteractionRule {
  code: string;
  message: string;
  pattern: RegExp;
}

// These rules mirror the interaction-inducement patterns seen in Xiaohongshu
// enforcement notices. They intentionally target calls to action, not ordinary
// discussion of likes, comments, or followers in an analytical context.
const INTERACTION_RULES: InteractionRule[] = [
  {
    code: "keyword_comment",
    message: "不得要求读者在评论区留下数字、关键词或口令",
    pattern:
      /(?:评论区?|留言区?|下方|评论里).{0,12}(?:扣|留|回复|打出|发送|写下).{0,12}(?:[「『【“\"'《]?[0-9a-z一二三四五六七八九十]|决策|样例|资料|报告|清单|模板|链接)/i,
  },
  {
    code: "interaction_exchange",
    message: "不得用评论、私信、点赞、收藏或关注交换资料、样例、福利或链接",
    pattern:
      /(?:评论|留言|回复|扣|私信|点赞|点个赞|收藏|关注|转发|分享).{0,36}(?:我发你|发你|送你|给你|领取|获取|拿到|抽取|福利|资源|资料|样例|模板|清单|链接|报告|诊断)/i,
  },
  {
    code: "benefit_for_interaction",
    message: "不得以需要资料、体检、样例等理由要求互动",
    pattern:
      /(?:需要|想要|感兴趣|领取|获取|获得|拿一份|看样例|做体检).{0,30}(?:评论|留言|回复|扣|私信|点赞|收藏|关注)/i,
  },
  {
    code: "direct_engagement_request",
    message: "不得直接要求点赞、收藏、关注、评论、转发或互关互赞",
    pattern:
      /(?:(?:记得|欢迎|请|可以|帮我|顺手|先|别忘了).{0,10}(?:点赞|点个赞|收藏|关注|评论|转发|分享|互关|互赞)|(?:点赞|点个赞|收藏|关注|评论|转发|分享).{0,10}(?:一下|支持|不迷路|去霉运|接好运|抽奖|有惊喜))/i,
  },
  {
    code: "promotional_giveaway",
    message: "不得用免费赠送、抽奖或惊喜噱头换取互动",
    pattern:
      /(?:(?:免费送|送福利|抽奖|送出.{0,8}(?:份|名|个)).{0,24}(?:点赞|收藏|关注|评论|留言|转发|分享)|(?:点赞|收藏|关注|评论|留言|转发|分享).{0,24}(?:免费送|送福利|抽奖|中奖|有惊喜|抽取))/i,
  },
  {
    code: "private_contact",
    message: "不得引导读者私信或添加站外联系方式",
    pattern: /(?:私信我|来私信|后台私信|加我|加微信|加微|加\s*[vV]|[vV][xX]|联系方式)/i,
  },
];

function normalizedText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function scanInteractionCompliance(
  text: string,
  field: InteractionComplianceField,
): InteractionComplianceIssue[] {
  const value = normalizedText(text);
  if (!value) return [];
  return INTERACTION_RULES.filter((rule) => rule.pattern.test(value)).map((rule) => ({
    code: rule.code,
    field,
    message: rule.message,
  }));
}

export function scanDraftCompliance(
  draft: Pick<ContentDraft, "title" | "cover_text" | "body" | "comment_prompt" | "hashtags">,
) {
  return [
    ...scanInteractionCompliance(draft.title, "title"),
    ...scanInteractionCompliance(draft.cover_text, "cover_text"),
    ...scanInteractionCompliance(draft.body, "body"),
    ...scanInteractionCompliance(draft.comment_prompt, "comment_prompt"),
    ...scanInteractionCompliance(draft.hashtags.join(" "), "hashtags"),
  ];
}

function textUnits(text: string) {
  const chunks = text.split(/([。！？!?；;\n]+)/);
  const units: string[] = [];
  for (let index = 0; index < chunks.length; index += 2) {
    const content = chunks[index] ?? "";
    const delimiter = chunks[index + 1] ?? "";
    if (content || delimiter) units.push(`${content}${delimiter}`);
  }
  return units;
}

function stripRiskyBodyUnits(body: string) {
  const removed: InteractionComplianceIssue[] = [];
  const kept = textUnits(body).filter((unit) => {
    const issues = scanInteractionCompliance(unit, "body");
    if (issues.length === 0) return true;
    removed.push(...issues);
    return false;
  });
  return {
    body: kept.join("").replace(/\n{3,}/g, "\n\n").trim(),
    removed,
  };
}

function uniqueIssueMessages(issues: InteractionComplianceIssue[]) {
  return [...new Set(issues.map((issue) => issue.message))];
}

const SAFE_DISCUSSION_QUESTION = "你更担心能力不能迁移，还是资源不能迁移？";

/**
 * Applies a deterministic safety pass after LLM generation. Risky CTA sentences
 * are removed, while a draft that still contains risk is marked blocked.
 */
export function enforceDraftCompliance(draft: ContentDraft, fallbackTitle?: string): ContentDraft {
  const detected = scanDraftCompliance(draft);
  const bodyResult = stripRiskyBodyUnits(draft.body);
  const safeFallbackTitle = fallbackTitle?.trim() || draft.title;
  const title = scanInteractionCompliance(draft.title, "title").length > 0 ? safeFallbackTitle : draft.title;
  const coverText =
    scanInteractionCompliance(draft.cover_text, "cover_text").length > 0 ? title : draft.cover_text;
  const commentPrompt =
    scanInteractionCompliance(draft.comment_prompt, "comment_prompt").length > 0
      ? SAFE_DISCUSSION_QUESTION
      : draft.comment_prompt;
  const alternativeTitles = draft.alternative_titles.filter(
    (candidate) => scanInteractionCompliance(candidate, "title").length === 0,
  );

  const candidate: ContentDraft = {
    ...draft,
    title,
    cover_text: coverText,
    body: bodyResult.body,
    comment_prompt: commentPrompt,
    alternative_titles: alternativeTitles.length > 0 ? alternativeTitles : [title],
    word_count: countPublishChars(title, bodyResult.body, draft.hashtags),
  };
  const remaining = scanDraftCompliance(candidate);
  const bodyTooShort = candidate.body.trim().length < 40;
  const status: DraftCompliance["status"] =
    remaining.length > 0 || bodyTooShort ? "blocked" : detected.length > 0 ? "rewritten" : "passed";
  const issues = uniqueIssueMessages([
    ...detected,
    ...remaining,
    ...(bodyTooShort
      ? [
          {
            code: "body_too_short_after_rewrite",
            field: "body" as const,
            message: "移除风险表达后正文内容不足，请重新生成",
          },
        ]
      : []),
  ]);

  return {
    ...candidate,
    compliance: {
      status,
      issues,
      checked_at: new Date().toISOString(),
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function sourceAgeDays(source: TopicSourceSnapshot, at = new Date()) {
  const published = Date.parse(source.published_at);
  if (!Number.isFinite(published)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (at.getTime() - published) / DAY_MS);
}

export function sourceIsUsable(source: TopicSourceSnapshot | undefined, at = new Date()) {
  if (!source) return false;
  const collected = Date.parse(source.collected_at);
  const snapshotAgeMs = at.getTime() - collected;
  return (
    /^https?:\/\//i.test(source.original_url) &&
    (source.link_status === "accessible" || (source.link_status === "restricted" && source.verified_by_operator === true)) &&
    source.verified_by_operator === true &&
    sourceAgeDays(source, at) <= 7 &&
    Number.isFinite(collected) &&
    snapshotAgeMs >= 0 &&
    snapshotAgeMs <= DAY_MS
  );
}

export function validateTopicCandidate(topic: TopicCandidate, persona: GrowthPersona): ValidationCheck[] {
  const method = TITLE_METHOD_BY_ID[topic.method_id];
  if (!method) {
    return [
      { key: "source", status: "needs_edit", message: "历史内容缺少标题方法与来源记录" },
      { key: "identity", status: "needs_edit", message: "历史内容需要人工确认账号身份" },
      { key: "fulfillment", status: topic.title_promise?.trim() ? "passed" : "needs_edit", message: topic.title_promise?.trim() ? `正文需兑现：${topic.title_promise}` : "历史内容缺少标题承诺" },
      { key: "compliance", status: scanInteractionCompliance(topic.title, "title").length ? "blocked" : "passed", message: scanInteractionCompliance(topic.title, "title").length ? "标题含互动诱导或导流风险" : "标题未发现互动诱导风险" },
    ];
  }
  const sourceRequired = method.sourceRequired;
  const sourcePassed = !sourceRequired || sourceIsUsable(topic.source_snapshot);
  const applicability = methodApplicability(persona, topic.method_id);
  return [
    {
      key: "source",
      status: sourcePassed ? "passed" : "blocked",
      message: sourcePassed
        ? sourceRequired
          ? "近期母题、原链接和人工核验完整"
          : "该原生方法不要求外部母题"
        : "缺少7天内母题，或热度快照/链接核验已超过24小时",
    },
    {
      key: "identity",
      status: applicability === "disabled" ? "blocked" : "passed",
      message:
        applicability === "disabled"
          ? "该方法不适合当前账号视角"
          : `该方法属于当前视角的${applicability === "default" ? "默认" : "探索"}范围`,
    },
    {
      key: "fulfillment",
      status: topic.title_promise.trim() ? "passed" : "needs_edit",
      message: topic.title_promise.trim() ? `正文需兑现：${topic.title_promise}` : "尚未说明正文要兑现什么",
    },
    {
      key: "compliance",
      status: scanInteractionCompliance(topic.title, "title").length ? "blocked" : "passed",
      message: scanInteractionCompliance(topic.title, "title").length
        ? "标题含互动诱导或站外导流风险"
        : "标题未发现互动诱导风险",
    },
  ];
}

export function extractPromisedCount(title: string) {
  const signalsCountedDelivery = /(?:这\s*\d|先查|必查|必看|清单|路线图|资料|盘点|步骤|方法|条路|种选择)/.test(title);
  if (!signalsCountedDelivery) return undefined;
  const matches = [...title.matchAll(/(\d{1,2})(?=\s*(?:项|条|步|种|个|份|类|大))/g)];
  const match = matches.at(-1);
  return match ? Number(match[1]) : undefined;
}

function openingRespondsToTitle(draft: ContentDraft) {
  const opening = draft.body.slice(0, 30).replace(/\s/g, "");
  const identityTokens = ["中高管", "高管", "中层", "管理层", "总监", "负责人", "老板", "专家", "顾问", "留学生", "海归", "毕业生", "家长"];
  const conflictTokens = ["离职", "留任", "转型", "跳槽", "重新定价", "两条路", "职业", "平台", "选择", "求职", "投递", "回国", "留当地", "岗位", "秋招"];
  return identityTokens.some((token) => opening.includes(token)) && conflictTokens.some((token) => `${draft.title}${opening}`.includes(token));
}

interface IndexedBodyUnit {
  quote: string;
  start: number;
  end: number;
}

function indexedBodyUnits(body: string): IndexedBodyUnit[] {
  let cursor = 0;
  return textUnits(body).flatMap((raw) => {
    const rawStart = body.indexOf(raw, cursor);
    if (rawStart < 0) return [];
    cursor = rawStart + raw.length;
    const leading = raw.length - raw.trimStart().length;
    const quote = raw.trim();
    if (!quote) return [];
    const start = rawStart + leading;
    return [{ quote, start, end: start + quote.length }];
  });
}

function annotation(
  draft: ContentDraft,
  key: DraftValidationKey,
  unit: IndexedBodyUnit,
  reason: string,
  confidence: number,
): DraftValidationAnnotation {
  return {
    id: `${draft.id}-${key}-${unit.start}-${unit.end}`,
    key,
    quote: unit.quote,
    start: unit.start,
    end: unit.end,
    reason,
    confidence,
  };
}

function numberedBodyUnits(body: string): IndexedBodyUnit[] {
  const units: IndexedBodyUnit[] = [];
  const pattern = /(^|\n)(\s*(?:\d{1,2}[.、)]|[一二三四五六七八九十]+[、.])[^\n]*)/g;
  for (const match of body.matchAll(pattern)) {
    const raw = match[2] ?? "";
    const leading = raw.length - raw.trimStart().length;
    const quote = raw.trim();
    const start = (match.index ?? 0) + (match[1]?.length ?? 0) + leading;
    if (quote) units.push({ quote, start, end: start + quote.length });
  }
  return units;
}

function identityEvidence(draft: ContentDraft, persona: GrowthPersona) {
  const patterns: Record<GrowthPersona, RegExp> = {
    buyer: /(?:我|我们|我家|孩子|家长|自己).{0,36}(?:求职|秋招|投递|回国|留任|离职|转型|选择|岗位|职业|面试|简历)/,
    expert: /(?:我的判断|我判断|我见过|咨询中|咨询里|建议|先看|关键是|真正要看|需要判断|适合先)/,
    merchant: /(?:我们|本服务|服务中|交付中|客户|学员).{0,36}(?:服务|交付|陪跑|诊断|辅导|帮助|解决|梳理|规划)/,
  };
  return indexedBodyUnits(draft.body).find((unit) => patterns[persona].test(unit.quote));
}

function conversionEvidence(draft: ContentDraft) {
  const role = /(?:专业的?)?(?:求职机构|求职老师|辅导老师|职业顾问|职业决策顾问|咨询师|教练|专业团队)|(?:咨询|服务)(?:中|里|过程)/;
  const action = /(?:带|陪跑|辅导|指导|帮助|梳理|诊断|规划|复盘|判断|验证)/;
  const outcome = /(?:方向|岗位|节奏|简历|面试|路径|能力|市场|风险|选择|证据|时间线|招聘|投递|清楚|理顺|收窄|验证)/;
  return indexedBodyUnits(draft.body).find((unit) =>
    role.test(unit.quote) && action.test(unit.quote) && outcome.test(unit.quote));
}

export function analyzeDraftValidation(
  draft: ContentDraft,
  persona: GrowthPersona,
  attempts = 0,
): { checks: ValidationCheck[]; report: DraftValidationReport } {
  const topicLike: TopicCandidate = {
    id: draft.id,
    method_group: draft.method_group,
    method_id: draft.method_id,
    method_label: draft.method_label,
    generation_mode: draft.generation_mode,
    title: draft.title,
    title_promise: draft.title_promise,
    target_user: draft.target_user,
    pain: "",
    hook: draft.cover_text,
    source_snapshot: draft.source_snapshot,
    follow_reason: draft.follow_reason,
    test_variable: draft.test_variable,
    expected_signal: draft.expected_signal,
    repeatable_angle: "",
    broad_traffic_risk: 0,
    priority: "A",
  };
  const topicChecks = validateTopicCandidate(topicLike, persona);
  const annotations: DraftValidationAnnotation[] = [];
  const identityUnit = identityEvidence(draft, persona);
  const applicabilityCheck = topicChecks.find((check) => check.key === "identity");
  const identityPassed = applicabilityCheck?.status === "passed" && Boolean(identityUnit);
  if (identityUnit) {
    annotations.push(annotation(
      draft,
      "identity",
      identityUnit,
      `这句话使用了当前${persona === "buyer" ? "买家" : persona === "expert" ? "专家" : "商家"}视角表达具体处境或判断`,
      0.96,
    ));
  }
  const count = extractPromisedCount(draft.title);
  const hasPromisedMaterial = /清单|路线图|资料|盘点|表|步骤/.test(draft.title);
  const numberedUnits = numberedBodyUnits(draft.body);
  const countFulfilled = count === undefined || numberedUnits.length === count;
  const materialFulfilled = !hasPromisedMaterial || numberedUnits.length > 0 || draft.body.length >= 280;
  const opensOnPromise = openingRespondsToTitle(draft);
  const fulfillmentPassed = countFulfilled && materialFulfilled && opensOnPromise;
  const openingUnit = indexedBodyUnits(draft.body)[0];
  if (fulfillmentPassed && openingUnit) {
    annotations.push(annotation(draft, "fulfillment", openingUnit, "开头直接回应了标题中的人物和核心冲突", 0.94));
    numberedUnits.slice(0, 10).forEach((unit, index) => annotations.push(annotation(
      draft,
      "fulfillment",
      unit,
      count ? `对应标题承诺的第${index + 1}项` : "正文直接交付了标题承诺的内容",
      0.98,
    )));
  }
  const conversionUnit = conversionEvidence(draft);
  const conversionPassed = Boolean(conversionUnit);
  if (conversionUnit) {
    annotations.push(annotation(
      draft,
      "conversion",
      conversionUnit,
      "这句话同时说明了专业角色、介入动作和解决的具体问题",
      0.96,
    ));
  }

  const checks: ValidationCheck[] = [
    {
      key: "identity" as const,
      status: identityPassed ? "passed" as const : "needs_edit" as const,
      message: identityPassed
        ? `正文已体现当前${persona === "buyer" ? "买家" : persona === "expert" ? "专家" : "商家"}身份`
        : applicabilityCheck?.status === "blocked"
          ? applicabilityCheck.message
          : "正文尚未用当前视角表达具体处境、经验或判断",
    },
    {
      key: "fulfillment" as const,
      status: fulfillmentPassed ? "passed" as const : "needs_edit" as const,
      message: fulfillmentPassed
        ? `正文已覆盖标题承诺：${draft.title_promise}`
        : "正文尚未做到：数字逐项一致、资料/路线图实际交付、前30字回应人物与冲突",
    },
    {
      key: "conversion" as const,
      status: conversionPassed ? "passed" as const : "needs_edit" as const,
      message: conversionPassed
        ? "正文已自然说明专业老师、求职机构或职业顾问如何介入并提供帮助"
        : "正文缺少自然的专业服务介入；可说明找了专业老师、求职机构或职业顾问后，具体如何梳理、指导或陪跑",
    },
  ];
  const status = hardChecksAllowPublishing(checks) && (["identity", "fulfillment", "conversion"] as const)
    .every((key) => annotations.some((item) => item.key === key)) ? "passed" : "failed";
  return {
    checks,
    report: {
      status,
      attempts,
      checked_at: new Date().toISOString(),
      annotations,
    },
  };
}

export function validateDraftHardChecks(draft: ContentDraft, persona: GrowthPersona): ValidationCheck[] {
  return analyzeDraftValidation(draft, persona, draft.validation_report?.attempts ?? 0).checks;
}

export function withDraftValidation(
  draft: ContentDraft,
  persona: GrowthPersona,
  attempts = draft.validation_report?.attempts ?? 0,
): ContentDraft {
  const analysis = analyzeDraftValidation(draft, persona, attempts);
  return { ...draft, validation_checks: analysis.checks, validation_report: analysis.report };
}

export function hardChecksAllowPublishing(checks: ValidationCheck[]) {
  const required: ValidationCheck["key"][] = ["identity", "fulfillment", "conversion"];
  return required.every((key) => checks.some((check) => check.key === key && check.status === "passed"));
}
