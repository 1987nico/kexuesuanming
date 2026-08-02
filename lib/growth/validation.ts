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

export const XHS_PUBLISH_CHAR_LIMIT = 1000;
export const XHS_PUBLISH_CHAR_TARGET = 950;

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
    within_limit: total <= XHS_PUBLISH_CHAR_LIMIT,
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

const TIME_SENSITIVE_BENCHMARK_PATTERN = /(?:今天|今日|昨天|昨晚|本周|这周|刚刚|最新|官宣|突发|热搜|新规|新政策|倒计时|截至|今年|明年|20\d{2}年|20\d{2}届|双11|618)/iu;

export function benchmarkSourcePolicy(
  source: Pick<TopicSourceSnapshot, "method_id" | "original_title" | "published_at" | "benchmark_pool" | "source_validity_days">,
  at = new Date(),
) {
  const method = TITLE_METHOD_BY_ID[source.method_id];
  const ageDays = sourceAgeDays(source as TopicSourceSnapshot, at);
  if (method?.group !== "benchmark") {
    return { eligible: ageDays <= 7, pool: "recent_opportunity" as const, validityDays: 7 as const, ageDays };
  }
  if (source.source_validity_days && source.benchmark_pool) {
    return {
      eligible: ageDays <= source.source_validity_days,
      pool: source.benchmark_pool,
      validityDays: source.source_validity_days,
      ageDays,
    };
  }
  if (ageDays <= 7) {
    return { eligible: true, pool: "recent_opportunity" as const, validityDays: 7 as const, ageDays };
  }
  const title = source.original_title.trim();
  const evergreen = title.length >= 6 && !TIME_SENSITIVE_BENCHMARK_PATTERN.test(title);
  return {
    eligible: evergreen && ageDays <= 90,
    pool: "evergreen_benchmark" as const,
    validityDays: 90 as const,
    ageDays,
  };
}

export function sourceIsUsable(source: TopicSourceSnapshot | undefined, at = new Date()) {
  if (!source) return false;
  const collected = Date.parse(source.collected_at);
  const snapshotAgeMs = at.getTime() - collected;
  const policy = benchmarkSourcePolicy(source, at);
  return (
    /^https?:\/\//i.test(source.original_url) &&
    (source.link_status === "accessible" || (source.link_status === "restricted" && source.verified_by_operator === true)) &&
    source.verified_by_operator === true &&
    policy.eligible &&
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
          ? "真实原标题、原链接和来源校验完整"
          : "该原生方法不要求外部母题"
        : "缺少与账号匹配的近期或常青真实标题，或链接核验已超过24小时",
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

function openingHasConcreteSituation(draft: Pick<ContentDraft, "body">) {
  const opening = draft.body.trimStart().slice(0, 72).replace(/\s+/g, "");
  if (Array.from(opening).length < 12) return false;
  return /[，。！？；]/u.test(opening)
    && !/^(?:关于|针对|围绕|本文|这篇|今天(?:来)?(?:讲|聊|分享)|以下是)/u.test(opening);
}

function openingFeelsNatural(draft: Pick<ContentDraft, "body">) {
  const opening = draft.body.trimStart().slice(0, 64).replace(/\s+/g, "");
  if (!opening) return false;
  return !/^(?:作为|身为|我的判断是|我判断|先看这里|我们做.{0,16}(?:服务|咨询)时|在.{0,12}(?:咨询|服务)里，我会)/.test(opening)
    && !/(?:本文|这篇)(?:会|将|主要)?(?:讲|介绍|分享)/.test(opening);
}

export function bodyOpeningMeetsTitle(title: string, body: string) {
  // 标题与骨架的语义关系已在生成合同中锁定；这里仅验证可确定的正文结构，
  // 不再用固定职业/冲突词表误伤“方向、试错、瞎忙”等开放表达。
  void title;
  return openingHasConcreteSituation({ body }) && openingFeelsNatural({ body });
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

const SMALL_CHINESE_COUNTS: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseSmallCount(value: string) {
  if (/^\d+$/u.test(value)) return Number(value);
  return SMALL_CHINESE_COUNTS[value];
}

interface BodyCountClaim {
  count: number;
  index: number;
}

function selfIntroducedBodyCountClaims(body: string): BodyCountClaim[] {
  const claims: BodyCountClaim[] = [];
  const pattern = /(?:先|需要|要|建议|可以|记住|确认|看清|检查|做到|分成|包括|共有|有)(?:这)?([一二两三四五六七八九十]|\d{1,2})(?:件事|点|步|项|个(?:问题|动作|标准|条件|判断))(?=\s*[：:，,。；;])/gu;
  for (const match of body.matchAll(pattern)) {
    const count = parseSmallCount(match[1] ?? "");
    if (count && count > 1 && count <= 10) {
      claims.push({ count, index: (match.index ?? 0) + match[0].length });
    }
  }
  return claims;
}

function ordinalSectionsComplete(body: string, claim: BodyCountClaim) {
  const content = body.slice(claim.index);
  const ordinals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"].slice(0, claim.count);
  const markers = ordinals.map((ordinal) => {
    const match = new RegExp(`第${ordinal}(?:点|项|步|件)?\\s*[、.。：:）)]*`, "u").exec(content);
    return match ? { index: match.index, length: match[0].length } : undefined;
  });
  if (markers.some((marker) => !marker)) return false;

  return markers.every((marker, index) => {
    if (!marker) return false;
    const next = markers[index + 1];
    const section = content.slice(marker.index + marker.length, next?.index ?? content.length);
    return Array.from(section.replace(/[\s，,。；;：:、.!！？?（）()【】\[\]]/gu, "")).length >= 8;
  });
}

function selfIntroducedCountClaimDelivered(
  body: string,
  claim: BodyCountClaim,
  concreteNumberedUnits: IndexedBodyUnit[],
) {
  const numberedAfterClaim = concreteNumberedUnits.filter((unit) => unit.start >= claim.index);
  return numberedAfterClaim.length >= claim.count || ordinalSectionsComplete(body, claim);
}

type ValidationCheckDetail = NonNullable<ValidationCheck["details"]>[number];

function substantiveParagraphs(body: string) {
  return body
    .split(/\n\s*\n/u)
    .map((item) => item.trim())
    .filter((item) => Array.from(item).length >= 12);
}

function fulfillmentDetails(draft: ContentDraft): ValidationCheckDetail[] {
  const details: ValidationCheckDetail[] = [];
  const openingPassed = openingHasConcreteSituation(draft) && openingFeelsNatural(draft);
  details.push({
    code: "natural_opening",
    status: openingPassed ? "passed" : "needs_edit",
    message: openingPassed
      ? "开头已从具体处境自然切入"
      : "开头需要从具体动作、现场、念头或矛盾自然切入",
  });

  const numberedUnits = numberedBodyUnits(draft.body);
  const concreteNumberedUnits = numberedUnits.filter((unit) =>
    Array.from(unit.quote.replace(/^\s*(?:\d{1,2}[.、)]|[一二三四五六七八九十]+[、.])\s*/u, "")).length >= 8);
  const fulfillmentContract = draft.delivery_contract?.contract_version === "v3_4"
    ? draft.delivery_contract.fulfillment_contract
    : undefined;
  const count = fulfillmentContract?.promised_count ?? extractPromisedCount(draft.title);
  const promisedText = `${draft.title}${draft.title_promise}`;
  const materialPromised = fulfillmentContract
    ? fulfillmentContract.promise_type === "material"
    : /时间表|节奏表|路线图|资料|清单|盘点|表格|这张表|这份表|步骤/u.test(promisedText);
  const comparisonPromised = fulfillmentContract
    ? fulfillmentContract.promise_type === "comparison"
    : draft.method_id === "tug_of_war";

  if (count !== undefined) {
    const passed = numberedUnits.length === count && concreteNumberedUnits.length === count;
    details.push({
      code: "counted_delivery",
      status: passed ? "passed" : "needs_edit",
      message: passed
        ? `标题承诺的${count}项已逐项交付`
        : `标题承诺${count}项，正文需要正好交付${count}项具体内容；当前识别到${concreteNumberedUnits.length}项`,
    });
  }

  if (materialPromised) {
    const passed = concreteNumberedUnits.length >= 3;
    details.push({
      code: "material_delivery",
      status: passed ? "passed" : "needs_edit",
      message: passed
        ? "资料、清单或路线图已交付可直接使用的具体内容"
        : "标题承诺了资料、清单、表格或路线图，正文需要至少交付3段可直接使用的具体内容",
    });
  }

  if (comparisonPromised) {
    const passed = numberedUnits.length === 2 && concreteNumberedUnits.length === 2;
    details.push({
      code: "comparison_delivery",
      status: passed ? "passed" : "needs_edit",
      message: passed
        ? "两条路径均已给出具体比较"
        : "拔河式标题需要正好比较两条路径，并分别写清条件、代价或验证动作",
    });
  }

  const bodyCountClaims = selfIntroducedBodyCountClaims(draft.body);
  if (bodyCountClaims.length > 0) {
    const undeliveredClaim = bodyCountClaims.find(
      (claim) => !selfIntroducedCountClaimDelivered(draft.body, claim, concreteNumberedUnits),
    );
    details.push({
      code: "body_count_claim_delivery",
      status: undeliveredClaim ? "needs_edit" : "passed",
      message: undeliveredClaim
        ? `正文自己承诺了${undeliveredClaim.count}项内容，但没有逐项写完整`
        : "正文自己提出的数量承诺均已逐项写完整",
    });
  }

  if (count === undefined && !materialPromised && !comparisonPromised) {
    const paragraphCount = substantiveParagraphs(draft.body).length;
    const passed = paragraphCount >= 4;
    details.push({
      code: "ordinary_delivery",
      status: passed ? "passed" : "needs_edit",
      message: passed
        ? "普通标题已通过具体经历、判断和行动展开承诺"
        : "正文需要用具体经历、核心判断和可执行动作完整展开标题承诺",
    });
  }

  return details;
}

function exactContractUnit(body: string, quote: string | undefined) {
  const evidence = quote?.trim();
  if (!evidence) return undefined;
  const start = body.indexOf(evidence);
  if (start < 0) return undefined;
  return { quote: evidence, start, end: start + evidence.length };
}

function identityEvidence(draft: ContentDraft, persona: GrowthPersona) {
  const contract = draft.delivery_contract;
  if (contract?.contract_version === "v3_4") {
    if (contract.identity_contract.persona !== persona) return undefined;
    const requiredComplete = contract.identity_contract.required_elements.length >= 2
      && Array.from(contract.identity_contract.evidence).length >= 18;
    return requiredComplete
      ? exactContractUnit(draft.body, contract.identity_contract.evidence)
      : undefined;
  }
  const patterns: Record<GrowthPersona, RegExp> = {
    buyer: /(?:我|我们|我家|孩子|家长|自己).{0,36}(?:求职|秋招|投递|回国|留任|离职|转型|选择|岗位|职业|面试|简历)/,
    expert: /(?:我的判断|我判断|我见过|咨询中|咨询里|建议|先看|关键是|真正要看|需要判断|适合先|我.{0,24}(?:帮|让|问|拆|梳理|复盘|判断)|有次咨询|前几次咨询)/,
    merchant: /(?:我们|本服务|服务中|交付中|客户|学员).{0,36}(?:服务|交付|陪跑|诊断|辅导|帮助|解决|梳理|规划)/,
  };
  return indexedBodyUnits(draft.body).find((unit) => patterns[persona].test(unit.quote));
}

function conversionEvidenceInBody(body: string) {
  const units = indexedBodyUnits(body);
  const role = /(?:专业的?)?(?:求职机构|求职老师|辅导老师|职业顾问|职业决策顾问|咨询师|教练|专业团队)|(?:咨询|服务)(?:中|里|过程)/;
  const action = /(?:带|陪跑|辅导|指导|帮助|梳理|诊断|规划|复盘|判断|验证)/;
  const target = /(?:方向|岗位|节奏|简历|面试|路径|能力|市场|风险|选择|证据|时间线|招聘|投递|项目|经历|材料)/;
  const result = /(?:结果|最终|直接变化|变化是|至少|终于|开始|不再|从.{0,24}(?:变成|缩到|收窄到)|缩到|收窄到|定下|排除|明确了|理顺了|对齐了|有了(?:顺序|重点|下一步)|能说清|知道下一步|收到.{0,12}(?:反馈|回音|笔试|面试))/;
  const serviceIndex = units.findIndex((unit) => role.test(unit.quote) && action.test(unit.quote) && target.test(unit.quote));
  if (serviceIndex < 0) return undefined;
  const resultUnit = units.slice(serviceIndex, serviceIndex + 3).find((unit) => result.test(unit.quote));
  if (!resultUnit) return undefined;
  const serviceUnit = units[serviceIndex];
  return {
    quote: body.slice(serviceUnit.start, resultUnit.end),
    start: serviceUnit.start,
    end: resultUnit.end,
  };
}

export function bodyHasConversionEvidence(body: string) {
  return Boolean(conversionEvidenceInBody(body));
}

function conversionEvidence(draft: ContentDraft) {
  const contract = draft.delivery_contract;
  if (contract?.contract_version === "v3_4") {
    const conversion = contract.conversion_contract;
    const complete = [
      conversion.problem_context,
      conversion.attempted_action,
      conversion.professional_role,
      conversion.intervention_action,
      conversion.stage_result,
    ].every((item) => Array.from(item.trim()).length >= 4);
    return complete ? exactContractUnit(draft.body, conversion.bridge_paragraph) : undefined;
  }
  return conversionEvidenceInBody(draft.body);
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
  const numberedUnits = numberedBodyUnits(draft.body);
  const fulfillmentBreakdown = fulfillmentDetails(draft);
  const fulfillmentPassed = fulfillmentBreakdown.every((item) => item.status !== "needs_edit");
  const openingUnit = indexedBodyUnits(draft.body)[0];
  if (fulfillmentPassed && openingUnit) {
    annotations.push(annotation(draft, "fulfillment", openingUnit, "开头从具体处境自然切入，标题承诺由后续合同段落完整交付", 0.94));
    numberedUnits.slice(0, 10).forEach((unit, index) => annotations.push(annotation(
      draft,
      "fulfillment",
      unit,
      `对应标题承诺的第${index + 1}项具体内容`,
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
      "这段话把专业服务放进前后因果里，并交代了介入动作和可验证的阶段结果",
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
        : `正文尚未做到：${fulfillmentBreakdown.filter((item) => item.status === "needs_edit").map((item) => item.message).join("；")}`,
      details: fulfillmentBreakdown,
    },
    {
      key: "conversion" as const,
      status: conversionPassed ? "passed" as const : "needs_edit" as const,
      message: conversionPassed
        ? "正文已把专业服务自然放进因果链，并说明介入动作与阶段结果"
        : "正文缺少完整的自然转折：具体卡点之后，老师、机构或顾问做了什么，以及随后出现了什么可验证的阶段变化",
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
