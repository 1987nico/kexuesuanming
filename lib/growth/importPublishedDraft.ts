import { randomUUID } from "node:crypto";
import type { ContentDraft, ContentType, GrowthAccount, GrowthDirection, GrowthRun } from "./types";

function normalizeTitle(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function findDraftByTitle(drafts: ContentDraft[], title: string) {
  const normalized = normalizeTitle(title);
  return drafts.find((draft) => normalizeTitle(draft.title) === normalized) ?? null;
}

export function buildImportedPublishedDraft(input: {
  account: GrowthAccount;
  run: GrowthRun;
  ownerUserId: string;
  title: string;
  body: string;
  direction: GrowthDirection;
  contentType: ContentType;
  publishedAt: string;
  now?: string;
}): ContentDraft {
  const timestamp = input.now ?? new Date().toISOString();
  const title = input.title.trim();
  const body = input.body.trim();
  const bodyAndTags = Array.from(body).length;
  const titleLength = Array.from(title).length;

  return {
    id: randomUUID(),
    tenant_id: input.account.tenant_id,
    owner_user_id: input.ownerUserId,
    account_id: input.account.id,
    run_id: input.run.id,
    status: "published",
    direction: input.direction,
    content_type: input.contentType,
    test_variable: "补录已发布笔记",
    expected_signal: "记录发布24小时后的标题、正文和转化表现",
    title,
    alternative_titles: [],
    target_user: input.account.target_user,
    cover_text: title,
    body,
    hashtags: [],
    comment_prompt: "",
    word_count: {
      title: titleLength,
      body_and_tags: bodyAndTags,
      total: titleLength + bodyAndTags,
      within_limit: titleLength + bodyAndTags <= 1000,
    },
    follow_reason: input.account.follow_reason ?? "",
    trust_anchor: input.account.trust_source,
    review_points: ["曝光", "观看", "平均观看时长", "收藏", "有效咨询"],
    cover_suggestion: "",
    published_at: input.publishedAt,
    created_at: timestamp,
    updated_at: timestamp,
  };
}
