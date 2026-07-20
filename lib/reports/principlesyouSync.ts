import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { TalentProfile, TalentTrait } from "./assessmentProfile";
import * as bundledCollector from "./principlesyouCollector";
import { generateLocalTalentProfile } from "./principlesyouLocal";

export type TalentAnswers = Record<number, number>;

export interface TalentProfileResult {
  profile: TalentProfile;
  source: "original-sync" | "local";
  attempts: number;
}

export interface TalentProfileOptions {
  retries?: number;
  timeoutMs?: number;
}

function hashJSON(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function answerDistribution(answers: TalentAnswers): TalentProfile["answer_distribution"] {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as TalentProfile["answer_distribution"];
  for (const value of Object.values(answers)) {
    if (value >= 1 && value <= 7) distribution[value as 1 | 2 | 3 | 4 | 5 | 6 | 7] += 1;
  }
  return distribution;
}

function bandFromQuintile(quintile?: string): TalentTrait["band"] {
  const normalized = (quintile || "").toLowerCase().replace(/\s+/g, "_");
  if (normalized === "very_low") return "very_low";
  if (normalized === "low") return "low";
  if (normalized === "high") return "high";
  if (normalized === "very_high") return "very_high";
  return "moderate";
}

function traitsFromOriginal(results: any) {
  const traits: TalentTrait[] = [];
  const dimensions = [...(results?.dimensions || []), ...(results?.validity || [])];
  for (const dimension of dimensions) {
    for (const trait of dimension.traits || []) {
      traits.push({
        key: trait.key,
        name: trait.display_name || trait.name || trait.key,
        percentile: trait.percentile,
        band: bandFromQuintile(trait.quintile),
      });
    }
  }
  return traits;
}

function mapOriginalResultsToTalentProfile(
  answers: TalentAnswers,
  results: any,
  evidence: NonNullable<TalentProfile["evidence"]>
): TalentProfile {
  const traits = traitsFromOriginal(results);
  return {
    mode: "original-sync",
    answer_distribution: answerDistribution(answers),
    top_archetypes: (results?.all_archetypes || [])
      .map((archetype: any) => ({
        key: archetype.key,
        name: archetype.display_name || archetype.name || archetype.key,
        percentile: archetype.percentile,
        raw_score: archetype.raw_score,
      }))
      .sort((left: any, right: any) => (right.percentile ?? 0) - (left.percentile ?? 0))
      .slice(0, 6),
    high_traits: [...traits].sort((left, right) => (right.percentile ?? 0) - (left.percentile ?? 0)).slice(0, 6),
    low_traits: [...traits].sort((left, right) => (left.percentile ?? 0) - (right.percentile ?? 0)).slice(0, 6),
    raw: results,
    evidence,
  };
}

async function importCollector() {
  const collectPath = process.env.PRINCIPLESYOU_COLLECT_PATH;
  if (!collectPath) return bundledCollector;
  // collect.mjs compares import.meta.url with process.argv[1] at module load time.
  // Some embedded runtimes (or node --eval smoke checks) do not set argv[1].
  process.argv[1] ||= "next-server.mjs";
  return import(/* webpackIgnore: true */ pathToFileURL(collectPath).href) as Promise<{
    createSession: () => Promise<any>;
    getQuestions: (session: any) => Promise<any>;
    postAnswers: (session: any, answers: Array<{ question_number: number; answer_number: number }>) => Promise<any>;
    score: (session: any) => Promise<any>;
  }>;
}

export async function syncOriginalTalentProfile(answers: TalentAnswers): Promise<TalentProfile> {
  const collector = await importCollector();
  const session = await collector.createSession();
  let current = await collector.getQuestions(session);
  let answered = 0;

  while (!current.assessment_complete) {
    const pageAnswers = (current.questions || []).map((question: any) => {
      answered += 1;
      return {
        question_number: question.number,
        answer_number: answers[question.number] ?? 4,
      };
    });
    current = await collector.postAnswers(session, pageAnswers);
  }

  const results = await collector.score(session);
  return mapOriginalResultsToTalentProfile(answers, results, {
    provider: "principlesyou",
    session_id: session.userAssessmentId ? String(session.userAssessmentId) : undefined,
    synced_at: new Date().toISOString(),
    source_hash: hashJSON({ answered, results }),
  });
}

async function withOptionalTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`original_sync_timeout_${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function generateTalentProfileWithFallback(
  answers: TalentAnswers,
  options: TalentProfileOptions = {}
): Promise<TalentProfileResult> {
  const retries = options.retries ?? 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const profile = await withOptionalTimeout(syncOriginalTalentProfile(answers), options.timeoutMs);
      profile.evidence = {
        provider: "principlesyou",
        ...profile.evidence,
        retry_count: attempt - 1,
      };
      return { profile, source: "original-sync", attempts: attempt };
    } catch (error) {
      lastError = error;
      console.warn("[principlesyou] original sync failed:", (error as Error).message);
    }
  }

  const profile = generateLocalTalentProfile(
    answers,
    lastError instanceof Error ? lastError.message : "original_sync_failed"
  );
  profile.evidence = {
    provider: "local",
    ...profile.evidence,
    retry_count: retries,
  };
  return { profile, source: "local", attempts: retries + 1 };
}
