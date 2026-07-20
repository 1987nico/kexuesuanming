import data from "@/lib/reports/principlesyou-data/data.json";
import zh from "@/lib/reports/principlesyou-data/zh.json";
import type { TalentProfile, TalentTrait } from "./assessmentProfile";

type TalentAnswers = Record<number, number>;

type Score = {
  key: string;
  name: string;
  rawScore: number;
  percentile: number;
  quintile: string;
};

const DATA = data as any;
const ZH = zh as any;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function quintile(percentile: number) {
  if (percentile < 20) return "very_low";
  if (percentile < 40) return "low";
  if (percentile < 60) return "moderate";
  if (percentile < 80) return "high";
  return "very_high";
}

export function zhName(key: string, fallback = key) {
  return ZH.names?.[key] || fallback;
}

export function zhArchetypeNameByKey(key: string, fallback = key) {
  return ZH.archetypes?.[key]?.[0] || fallback;
}

function zhArchetypeName(archetype: any) {
  return zhArchetypeNameByKey(archetype.key, archetype.display_name || archetype.key);
}

function keyedScore(item: { direction?: string }, answer: number) {
  return item.direction === "reverse" ? 8 - answer : answer;
}

function estimateScoreFromDeltas(key: string, answers: TalentAnswers) {
  const base = DATA.baselineScores[key] || { raw_score: 4, percentile: 50 };
  let raw = base.raw_score;
  let percentile = base.percentile ?? 50;

  for (const question of DATA.questions || []) {
    const answer = answers[question.number] ?? 4;
    const factor = (answer - 4) / 3;
    const delta = DATA.deltaByQuestion?.[question.number]?.[key];
    if (delta) {
      raw += delta.raw_delta * factor;
      percentile += delta.percentile_delta * factor;
    }
  }

  return {
    rawScore: round(raw),
    percentile: round(clamp(percentile), 1),
  };
}

function percentileFromCurve(raw: number, curve: Array<{ raw: number; percentile: number }>) {
  if (!curve?.length) return null;
  if (raw <= curve[0].raw) return curve[0].percentile;
  if (raw >= curve[curve.length - 1].raw) return curve[curve.length - 1].percentile;

  for (let index = 1; index < curve.length; index++) {
    const left = curve[index - 1];
    const right = curve[index];
    if (raw <= right.raw) {
      const span = right.raw - left.raw || 1;
      const ratio = (raw - left.raw) / span;
      return left.percentile + ratio * (right.percentile - left.percentile);
    }
  }
  return curve[curve.length - 1].percentile;
}

function calibratedArchetypeScore(
  archetypeKey: string,
  facetScores: Record<string, Score>,
  answers: TalentAnswers
) {
  const calibration = DATA.archetypeCalibration;
  const model = calibration?.archetype_raw_models?.[archetypeKey];
  if (!model) return estimateScoreFromDeltas(`archetype:${archetypeKey}`, answers);

  let raw = 4 + (model.intercept || 0);
  for (const [facetKey, weight] of Object.entries(model.weights || {})) {
    raw += Number(weight) * ((facetScores[facetKey]?.rawScore ?? 4) - 4);
  }

  raw = round(clamp(raw, 1, 7), 2);
  const curve = calibration.archetype_percentile_curves?.[archetypeKey];
  const estimated = estimateScoreFromDeltas(`archetype:${archetypeKey}`, answers);
  return {
    rawScore: raw,
    percentile: round(clamp(percentileFromCurve(raw, curve) ?? estimated.percentile), 1),
  };
}

function answerDistribution(answers: TalentAnswers): TalentProfile["answer_distribution"] {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } as TalentProfile["answer_distribution"];
  for (const value of Object.values(answers)) {
    if (value >= 1 && value <= 7) distribution[value as 1 | 2 | 3 | 4 | 5 | 6 | 7] += 1;
  }
  return distribution;
}

function toTalentTrait(score: Score): TalentTrait {
  return {
    key: score.key,
    name: score.name,
    percentile: score.percentile,
    band: quintile(score.percentile),
  };
}

export function generateLocalTalentProfile(
  answers: TalentAnswers,
  fallbackReason = "original_sync_failed"
): TalentProfile {
  const facetScores: Record<string, Score> = {};
  const traitScores: Record<string, Score> = {};

  for (const facet of DATA.facets || []) {
    const keyed = facet.items.map((item: any) => keyedScore(item, answers[item.question_number] ?? 4));
    const raw = keyed.reduce((sum: number, value: number) => sum + value, 0) / keyed.length;
    const estimated = estimateScoreFromDeltas(`facet:${facet.facet_key}`, answers);
    facetScores[facet.facet_key] = {
      key: facet.facet_key,
      name: zhName(facet.facet_key, facet.facet_name),
      rawScore: round(raw),
      percentile: estimated.percentile,
      quintile: quintile(estimated.percentile),
    };
  }

  for (const dimension of DATA.dimensions || []) {
    if (dimension.key === "validity") continue;
    for (const trait of dimension.traits || []) {
      const facets = trait.facets.map((facet: any) => facetScores[facet.key]).filter(Boolean);
      if (!facets.length) continue;
      const raw = facets.reduce((sum: number, facet: Score) => sum + facet.rawScore, 0) / facets.length;
      const estimated = estimateScoreFromDeltas(`trait:${trait.key}`, answers);
      traitScores[trait.key] = {
        key: trait.key,
        name: zhName(trait.key, trait.display_name),
        rawScore: round(raw),
        percentile: estimated.percentile,
        quintile: quintile(estimated.percentile),
      };
    }
  }

  const top_archetypes = (DATA.archetypes || [])
    .map((archetype: any) => {
      const score = calibratedArchetypeScore(archetype.key, facetScores, answers);
      return {
        key: archetype.key,
        name: zhArchetypeName(archetype),
        percentile: score.percentile,
        raw_score: score.rawScore,
      };
    })
    .sort((left: any, right: any) => (right.percentile ?? 0) - (left.percentile ?? 0))
    .slice(0, 6);

  const traits = Object.values(traitScores);
  const high_traits = traits
    .sort((left, right) => right.percentile - left.percentile)
    .slice(0, 6)
    .map(toTalentTrait);
  const low_traits = [...traits]
    .sort((left, right) => left.percentile - right.percentile)
    .slice(0, 6)
    .map(toTalentTrait);

  return {
    mode: "local",
    answer_distribution: answerDistribution(answers),
    top_archetypes,
    high_traits,
    low_traits,
    evidence: {
      provider: "local",
      synced_at: new Date().toISOString(),
      fallback_reason: fallbackReason,
    },
  };
}
