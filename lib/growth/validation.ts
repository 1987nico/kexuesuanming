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
