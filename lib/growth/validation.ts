import type { ContentDraft, DraftCompliance } from "./types";

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
