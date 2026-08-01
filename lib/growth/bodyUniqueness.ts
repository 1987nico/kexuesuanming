import type { BodyGenerationHistoryEntry, ContentDraft, GrowthRun } from "./types";

const HISTORY_WINDOW_MS = 90 * 86_400_000;
const MAX_HISTORY_PER_RUN = 48;
const STRICT_SIMILARITY_THRESHOLD = 0.72;

export interface BodyUniquenessReference {
  body: string;
  title?: string;
  topic_id?: string;
  draft_id?: string;
  created_at?: string;
}

function normalizedText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function normalizedParagraphs(value: string) {
  return value
    .split(/\n{2,}/u)
    .map(normalizedText)
    .filter((paragraph) => paragraph.length >= 18);
}

function ngrams(value: string, width = 3) {
  const chars = Array.from(normalizedText(value));
  if (chars.length < width) return new Set(chars.length ? [chars.join("")] : []);
  return new Set(chars.slice(0, chars.length - width + 1)
    .map((_, index) => chars.slice(index, index + width).join("")));
}

export function bodyFingerprint(value: string) {
  const normalized = normalizedText(value);
  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized.length}:${(hash >>> 0).toString(16)}`;
}

export function bodySimilarityScore(left: string, right: string) {
  const leftNormalized = normalizedText(left);
  const rightNormalized = normalizedText(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (leftNormalized === rightNormalized) return 1;
  const leftNgrams = ngrams(left);
  const rightNgrams = ngrams(right);
  if (!leftNgrams.size || !rightNgrams.size) return 0;
  let overlap = 0;
  for (const gram of leftNgrams) if (rightNgrams.has(gram)) overlap += 1;
  return overlap / Math.min(leftNgrams.size, rightNgrams.size);
}

export function repeatedParagraphCount(left: string, right: string) {
  const rightParagraphs = new Set(normalizedParagraphs(right));
  return normalizedParagraphs(left).filter((paragraph) => rightParagraphs.has(paragraph)).length;
}

function openingParagraph(value: string) {
  return normalizedParagraphs(value)[0] ?? "";
}

export function bodyUniquenessProblem(
  candidate: string,
  history: BodyUniquenessReference[],
) {
  const candidateFingerprint = bodyFingerprint(candidate);
  for (const reference of history) {
    if (!reference.body.trim()) continue;
    if (bodyFingerprint(reference.body) === candidateFingerprint) {
      return { reason: "exact_duplicate" as const, reference, score: 1 };
    }
    const opening = openingParagraph(candidate);
    const previousOpening = openingParagraph(reference.body);
    if (opening.length >= 24 && opening === previousOpening) {
      return { reason: "repeated_opening" as const, reference, score: 1 };
    }
    const repeatedParagraphs = repeatedParagraphCount(candidate, reference.body);
    if (repeatedParagraphs >= 2) {
      return {
        reason: "repeated_paragraphs" as const,
        reference,
        score: bodySimilarityScore(candidate, reference.body),
      };
    }
    const score = bodySimilarityScore(candidate, reference.body);
    if (score >= STRICT_SIMILARITY_THRESHOLD) {
      return { reason: "high_similarity" as const, reference, score };
    }
  }
  return null;
}

export function bodyHistoryReferences(input: {
  drafts: ContentDraft[];
  runs: GrowthRun[];
  now?: Date;
}) {
  const cutoff = (input.now ?? new Date()).getTime() - HISTORY_WINDOW_MS;
  const fromDrafts: BodyUniquenessReference[] = input.drafts
    .filter((draft) => Date.parse(draft.created_at) >= cutoff)
    .map((draft) => ({
      body: draft.body,
      title: draft.title,
      topic_id: input.runs.find((run) => run.id === draft.run_id)?.selected_topic?.id,
      draft_id: draft.id,
      created_at: draft.created_at,
    }));
  const fromRuns: BodyUniquenessReference[] = input.runs.flatMap((run) =>
    (run.body_generation_history ?? [])
      .filter((entry) => Date.parse(entry.created_at) >= cutoff)
      .map((entry) => ({
        body: entry.body,
        title: entry.title,
        topic_id: entry.topic_id,
        draft_id: entry.draft_id,
        created_at: entry.created_at,
      }))
  );
  const seen = new Set<string>();
  return [...fromRuns, ...fromDrafts]
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .filter((reference) => {
      const key = bodyFingerprint(reference.body);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * 渐进式长版生成时，已经呈现的短版属于当前配对稿，不是“近90天历史稿”。
 * 两者的差异由 draftVariantOrderIsValid / draftBodiesAreTooSimilar 单独检查；
 * 若把短版继续放进历史门禁，长版共享核心判断和合同段落就会被自己误伤。
 */
export function historyExcludingCurrentPair(
  history: BodyUniquenessReference[],
  currentPairBodies: string[],
  currentPair?: {
    titles?: string[];
    topicIds?: string[];
    draftIds?: string[];
  },
) {
  const current = new Set(currentPairBodies.filter(Boolean).map(bodyFingerprint));
  const titles = new Set(currentPair?.titles?.filter(Boolean).map(normalizedText) ?? []);
  const topicIds = new Set(currentPair?.topicIds?.filter(Boolean) ?? []);
  const draftIds = new Set(currentPair?.draftIds?.filter(Boolean) ?? []);
  return history.filter((reference) => (
    !current.has(bodyFingerprint(reference.body))
    && (!reference.title || !titles.has(normalizedText(reference.title)))
    && (!reference.topic_id || !topicIds.has(reference.topic_id))
    && (!reference.draft_id || !draftIds.has(reference.draft_id))
  ));
}

export function appendBodyGenerationHistory(
  run: GrowthRun,
  drafts: ContentDraft[],
): GrowthRun {
  const additions: BodyGenerationHistoryEntry[] = drafts.map((draft) => ({
    draft_id: draft.id,
    topic_id: run.topic_pool.find((topic) => topic.method_id === draft.method_id)?.id,
    method_id: draft.method_id,
    title: draft.title,
    title_promise: draft.title_promise,
    body_version: draft.selected_body_version === "long" ? "long" : "short",
    body: draft.body,
    body_fingerprint: bodyFingerprint(draft.body),
    created_at: draft.created_at,
  }));
  const byFingerprint = new Map<string, BodyGenerationHistoryEntry>();
  for (const entry of [...additions, ...(run.body_generation_history ?? [])]) {
    if (!byFingerprint.has(entry.body_fingerprint)) {
      byFingerprint.set(entry.body_fingerprint, entry);
    }
  }
  return {
    ...run,
    body_generation_history: [...byFingerprint.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, MAX_HISTORY_PER_RUN),
    updated_at: new Date().toISOString(),
  };
}
