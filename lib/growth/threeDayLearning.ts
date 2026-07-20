import { methodApplicability, TITLE_METHOD_BY_ID } from "./methods";
import type {
  ContentDraft,
  GrowthAccount,
  GrowthCycleExperiment,
  GrowthExperimentVariable,
  GrowthLearningBrief,
  MethodGenerationMode,
  MethodPromotionSuggestion,
  ThreeDayLearningMethodAggregate,
  ThreeDayLearningSample,
  ThreeDayLearningState,
  ThreeDayReviewCycle,
  TitleMethodId,
} from "./types";

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function unique(values: Array<string | undefined>, limit = 40) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].slice(0, limit);
}

function completedCycles(account: GrowthAccount) {
  return [...(account.three_day_review_cycles ?? [])]
    .filter((cycle) => cycle.status === "completed")
    .sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at));
}

function sampleKey(sample: Pick<ThreeDayLearningSample, "draft_id" | "source_key">) {
  return sample.draft_id ? `draft:${sample.draft_id}` : `source:${sample.source_key}`;
}

export function buildThreeDayLearningSamples(account: GrowthAccount): ThreeDayLearningSample[] {
  const deduped = new Map<string, ThreeDayLearningSample>();
  for (const cycle of completedCycles(account)) {
    for (const note of cycle.notes) {
      if (!note.content_eligible && !note.commercial_eligible) continue;
      const sample: ThreeDayLearningSample = {
        cycle_id: cycle.id,
        cycle_number: cycle.cycle_number,
        source_key: note.source_key,
        source_title: note.source_title,
        draft_id: note.draft_id,
        method_id: note.method_id,
        method_label: note.method_label,
        method_group: note.method_group,
        generation_mode: note.generation_mode,
        published_at: note.published_at,
        metrics: note.metrics,
        derived: note.derived,
        content_eligible: note.content_eligible,
        commercial_eligible: note.commercial_eligible,
        attributed_inquiries: note.attributed_inquiries,
        inquiry_rate: note.commercial_eligible
          && note.attributed_inquiries !== undefined
          && note.metrics.views > 0
          ? Number((note.attributed_inquiries / note.metrics.views).toFixed(6))
          : undefined,
      };
      const key = sampleKey(sample);
      if (!deduped.has(key)) deduped.set(key, sample);
    }
  }
  return [...deduped.values()].sort((a, b) => b.published_at.localeCompare(a.published_at));
}

function cycleMethodAboveMedian(cycle: ThreeDayReviewCycle, methodId: TitleMethodId) {
  const commercial = cycle.notes.filter((note) =>
    note.commercial_eligible
    && note.attributed_inquiries !== undefined
    && note.metrics.views > 0);
  const method = commercial.filter((note) => note.method_id === methodId);
  if (!method.length || commercial.length === method.length) return false;
  const rate = (note: typeof commercial[number]) => (note.attributed_inquiries ?? 0) / note.metrics.views;
  return median(method.map(rate)) > median(commercial.map(rate));
}

function promotionSuggestions(
  account: GrowthAccount,
  samples: ThreeDayLearningSample[],
  byMethod: ThreeDayLearningMethodAggregate[],
): MethodPromotionSuggestion[] {
  const commercial = samples.filter((sample) => sample.commercial_eligible && sample.inquiry_rate !== undefined);
  if (commercial.length < 30) return [];
  const cycles = completedCycles(account);
  return byMethod
    .filter((item) => item.generation_mode === "explore"
      && methodApplicability(account.persona, item.method_id, account.method_overrides) === "explore"
      && item.commercial_valid_count >= 5
      && item.above_persona_inquiry_median)
    .filter((item) => cycles.filter((cycle) =>
      cycle.notes.some((note) => note.method_id === item.method_id && note.commercial_eligible)).slice(0, 2).length >= 2)
    .filter((item) => cycles
      .filter((cycle) => cycle.notes.some((note) => note.method_id === item.method_id && note.commercial_eligible))
      .slice(0, 2)
      .every((cycle) => cycleMethodAboveMedian(cycle, item.method_id)))
    .map((item) => ({
      method_id: item.method_id,
      method_label: item.method_label,
      reason: "连续两个三日复盘周期的有效咨询率高于当前视角中位数，且已有至少5篇商业有效样本；仍需运营人工确认。",
      valid_count: item.commercial_valid_count,
      median_inquiry_rate: item.median_inquiry_rate ?? 0,
    }));
}

export function buildThreeDayLearningState(
  account: GrowthAccount,
  drafts: readonly ContentDraft[],
  at = new Date(),
): ThreeDayLearningState {
  const cycles = completedCycles(account);
  const latest = cycles[0];
  const samples = buildThreeDayLearningSamples(account);
  const commercial = samples.filter((sample) => sample.commercial_eligible && sample.inquiry_rate !== undefined);
  const personaMedian = median(commercial.map((sample) => sample.inquiry_rate ?? 0));
  const methodKeys = [...new Set(samples
    .filter((sample) => sample.method_id && sample.method_group && sample.generation_mode)
    .map((sample) => `${sample.method_id}:${sample.generation_mode}`))];
  const byMethod = methodKeys.map((methodKey): ThreeDayLearningMethodAggregate => {
    const [methodId, generationMode] = methodKey.split(":") as [TitleMethodId, MethodGenerationMode];
    const related = samples.filter((sample) => sample.method_id === methodId && sample.generation_mode === generationMode);
    const commercialRelated = related.filter((sample) => sample.commercial_eligible && sample.inquiry_rate !== undefined);
    const example = related[0];
    return {
      method_id: methodId,
      method_label: example?.method_label || TITLE_METHOD_BY_ID[methodId].label,
      method_group: example?.method_group || TITLE_METHOD_BY_ID[methodId].group,
      generation_mode: generationMode,
      content_valid_count: related.filter((sample) => sample.content_eligible).length,
      commercial_valid_count: commercialRelated.length,
      median_cover_ctr: median(related.map((sample) => sample.metrics.cover_ctr)),
      median_value_rate: median(related.map((sample) => sample.derived.value_rate ?? 0)),
      median_save_rate: median(related.map((sample) => sample.derived.save_rate ?? 0)),
      median_share_rate: median(related.map((sample) => sample.derived.share_rate ?? 0)),
      median_inquiry_rate: commercialRelated.length
        ? median(commercialRelated.map((sample) => sample.inquiry_rate ?? 0))
        : undefined,
      above_persona_inquiry_median: commercialRelated.length > 0
        && median(commercialRelated.map((sample) => sample.inquiry_rate ?? 0)) > personaMedian,
      source_cycle_ids: unique(related.map((sample) => sample.cycle_id)),
      source_keys: unique(related.map((sample) => sample.source_key)),
    };
  }).sort((a, b) => b.commercial_valid_count - a.commercial_valid_count
    || b.content_valid_count - a.content_valid_count
    || TITLE_METHOD_BY_ID[a.method_id].order - TITLE_METHOD_BY_ID[b.method_id].order);

  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
  const tagMap = new Map<string, ThreeDayLearningSample[]>();
  for (const sample of samples.filter((item) => item.content_eligible && item.draft_id)) {
    const draft = draftById.get(sample.draft_id!);
    if (!draft || (draft.status !== "published" && draft.status !== "reviewed")) continue;
    for (const tag of (draft.raw_body_tags ?? []).filter((item) => item.active !== false)) {
      if (!tagMap.has(tag.text)) tagMap.set(tag.text, []);
      tagMap.get(tag.text)!.push(sample);
    }
  }
  const byTag = [...tagMap.entries()].map(([tag, related]) => {
    const commercialRelated = related.filter((sample) => sample.commercial_eligible && sample.inquiry_rate !== undefined);
    return {
      tag,
      content_valid_count: related.length,
      commercial_valid_count: commercialRelated.length,
      median_inquiry_rate: commercialRelated.length
        ? median(commercialRelated.map((sample) => sample.inquiry_rate ?? 0))
        : undefined,
      draft_ids: unique(related.map((sample) => sample.draft_id)),
    };
  }).sort((a, b) => b.commercial_valid_count - a.commercial_valid_count
    || b.content_valid_count - a.content_valid_count);

  const activeExperiment = [...(account.cycle_experiments ?? [])]
    .reverse()
    .find((experiment) => experiment.source_cycle_id === latest?.id
      && ["pending", "confirmed", "applied"].includes(experiment.status));
  return {
    version: `three-day-v1-${latest?.id ?? "empty"}-${latest?.updated_at ?? at.toISOString()}`,
    generated_at: at.toISOString(),
    source_cycle_ids: cycles.map((cycle) => cycle.id),
    content_eligible_total: samples.filter((sample) => sample.content_eligible).length,
    commercial_eligible_total: commercial.length,
    unattributed_inquiries_total: cycles.reduce((sum, cycle) => sum + (cycle.unattributed_inquiries ?? 0), 0),
    by_method: byMethod,
    by_tag: byTag,
    promotion_suggestions: promotionSuggestions(account, samples, byMethod),
    latest_completed_cycle_id: latest?.id,
    active_experiment: activeExperiment,
  };
}

const variableCopy: Record<GrowthExperimentVariable, { hypothesis: string; expected: string; stop: string }> = {
  title_cover: {
    hypothesis: "保留内容判断，只调整标题与封面入口，能提升目标用户的有效观看。",
    expected: "封面点击率改善，同时收藏分享不下降",
    stop: "完成至少3篇同口径内容样本后复盘，期间不同时修改正文结构和承接动作。",
  },
  opening: {
    hypothesis: "保留标题承诺，只调整正文前30字和第一段，能改善内容承接。",
    expected: "观看时长、收藏或分享改善",
    stop: "完成至少3篇同口径内容样本后复盘，期间不同时修改标题方法和结尾承接。",
  },
  evidence: {
    hypothesis: "保留标题与结构，只加强事实、案例或过程证据，能提升内容价值。",
    expected: "收藏率、分享率或有效咨询改善",
    stop: "完成至少3篇同口径内容样本后复盘，期间不同时修改标题入口和主要承接动作。",
  },
  closing: {
    hypothesis: "保留标题与正文，只调整站内承接，能提升有效咨询。",
    expected: "目标用户说出具体处境、候选路径或决策冲突",
    stop: "完成至少3篇同口径内容样本后复盘，期间不同时修改标题和正文结构。",
  },
  audience_expression: {
    hypothesis: "只调整目标人群表达，能减少泛流量并提高目标咨询占比。",
    expected: "咨询者身份与当前目标人群更一致",
    stop: "完成至少3篇同口径内容样本后复盘。",
  },
  body_structure: {
    hypothesis: "只调整正文信息顺序，能提升内容理解和保存价值。",
    expected: "观看时长、收藏率或分享率改善",
    stop: "完成至少3篇同口径内容样本后复盘。",
  },
  length: {
    hypothesis: "只调整正文篇幅，能提升信息完成度和阅读效率。",
    expected: "观看时长与收藏分享的组合表现改善",
    stop: "完成至少3篇同口径内容样本后复盘。",
  },
};

export function experimentCopyForVariable(variable: GrowthExperimentVariable) {
  return variableCopy[variable];
}

export function createThreeDayCycleExperiment(
  account: GrowthAccount,
  cycle: ThreeDayReviewCycle,
  at = new Date(),
): GrowthCycleExperiment | undefined {
  if (!cycle.decision || cycle.notes.filter((note) => note.content_eligible).length < 3) return undefined;
  if ((account.cycle_experiments ?? []).some((experiment) => experiment.source_cycle_id === cycle.id)) return undefined;
  const copy = variableCopy[cycle.decision.next_variable];
  return {
    id: crypto.randomUUID(),
    account_id: account.id,
    period_id: `three-day-${cycle.cycle_number}`,
    source_cycle_id: cycle.id,
    target_user: account.target_user,
    hypothesis: `${copy.hypothesis} ${cycle.decision.next_variable_reason}`.trim(),
    experiment_variable: cycle.decision.next_variable,
    expected_signal: copy.expected,
    stop_condition: copy.stop,
    evidence_review_ids: cycle.notes.filter((note) => note.content_eligible).map((note) => note.source_key),
    status: "pending",
    created_at: at.toISOString(),
  };
}

function bodyGuidance(variable?: GrowthExperimentVariable) {
  if (variable === "opening") return ["只调整正文前30字和第一段；标题方法、核心判断和主要承接保持不变。"];
  if (variable === "evidence") return ["只加强事实、案例、过程或数字证据；标题入口和主要承接保持不变。"];
  if (variable === "closing") return ["只调整站内承接；标题、开头和正文结构保持不变，并且仍然只能有一个主要动作。"];
  if (variable === "title_cover") return ["正文核心判断、结构和主要承接保持不变，本轮变量只在标题与封面。"];
  if (variable === "body_structure") return ["只调整正文信息顺序，标题方法和主要承接保持不变。"];
  if (variable === "length") return ["只调整篇幅和展开深度，核心判断、结构顺序和主要承接保持不变。"];
  if (variable === "audience_expression") return ["只调整目标人群表达，核心判断和主要承接保持不变。"];
  return [];
}

export function buildThreeDayLearningBrief(input: {
  account: GrowthAccount;
  drafts: readonly ContentDraft[];
  methodId?: TitleMethodId;
  generationMode?: MethodGenerationMode;
  state?: ThreeDayLearningState;
  at?: Date;
}): GrowthLearningBrief {
  const at = input.at ?? new Date();
  const state = input.state ?? buildThreeDayLearningState(input.account, input.drafts, at);
  const aggregate = input.methodId
    ? state.by_method.find((item) => item.method_id === input.methodId
      && (!input.generationMode || item.generation_mode === input.generationMode))
    : undefined;
  const experiment = [...(input.account.cycle_experiments ?? [])]
    .reverse()
    .find((item) => item.source_cycle_id === state.latest_completed_cycle_id
      && (item.status === "confirmed" || item.status === "applied"));
  const latestCycle = completedCycles(input.account)[0];
  const basis = unique([
    latestCycle?.decision?.summary,
    aggregate ? `${aggregate.method_label}已有${aggregate.content_valid_count}篇内容有效样本、${aggregate.commercial_valid_count}篇商业有效样本。` : undefined,
    experiment?.hypothesis,
  ]);
  const guidanceRows = aggregate ? [aggregate] : state.by_method;
  const topicGuidance = guidanceRows
    .filter((item) => item.content_valid_count >= 3)
    .slice(0, 13)
    .map((item) => `${item.method_label}（${item.generation_mode === "default" ? "默认" : "探索"}）：${item.content_valid_count}篇内容有效样本，封面点击率中位数${(item.median_cover_ctr * 100).toFixed(2)}%，收藏与分享合计率中位数${(item.median_value_rate * 100).toFixed(2)}%；只作为历史信号，不得虚构标题规律。`);
  const titleGuidance = experiment?.experiment_variable === "title_cover"
    ? ["本轮只调整标题与封面入口；保持方法、目标人群、正文核心判断和主要承接不变。"]
    : [];
  return {
    trace: {
      version: state.version,
      generated_at: at.toISOString(),
      source_review_ids: aggregate?.source_keys ?? [],
      source_cycle_ids: aggregate?.source_cycle_ids ?? state.source_cycle_ids.slice(0, 6),
      experiment_id: experiment?.id,
      experiment_variable: experiment?.experiment_variable,
      basis,
    },
    weekly_strategy: experiment
      ? `已人工确认三日实验：${experiment.hypothesis}；停止条件：${experiment.stop_condition}`
      : state.content_eligible_total < 3
        ? `当前只有${state.content_eligible_total}篇内容有效样本，只积累证据，不改变生成策略。`
        : "三日复盘已有描述性数据，但没有已确认实验；保持当前生成策略。",
    topic_guidance: topicGuidance,
    title_guidance: titleGuidance,
    body_guidance: bodyGuidance(experiment?.experiment_variable),
    experiment_variable: experiment?.experiment_variable,
  };
}

export function formatThreeDayLearningBrief(brief: GrowthLearningBrief) {
  return [
    `三日复盘策略：${brief.weekly_strategy}`,
    `选题历史信号：${brief.topic_guidance.join("；") || "暂无，不得编造"}`,
    `标题实验要求：${brief.title_guidance.join("；") || "保持当前方法规则"}`,
    `正文实验要求：${brief.body_guidance.join("；") || "保持标题承诺与当前写作规则"}`,
    brief.experiment_variable ? `本轮唯一实验变量：${brief.experiment_variable}` : "本轮没有已确认实验变量",
    `证据版本：${brief.trace.version}`,
  ].join("\n");
}
