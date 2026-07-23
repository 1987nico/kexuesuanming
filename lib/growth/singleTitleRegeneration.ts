import type {
  TopicCandidate,
  TopicDirectionLock,
  TopicTitleMutation,
} from "./types";

export function lockTopicDirection(topic: TopicCandidate): TopicDirectionLock {
  return {
    method_id: topic.method_id,
    target_user: topic.target_user,
    pain: topic.pain,
    title_promise: topic.title_promise,
    origin_force: topic.origin_force,
    conflict_judgement: topic.conflict_judgement,
    source_id: topic.source_snapshot?.id,
  };
}

export function mergeRegeneratedNativeTopic(input: {
  previous: TopicCandidate[];
  generated: TopicCandidate;
  current: TopicCandidate;
}) {
  if (
    input.current.method_group !== "native"
    || input.generated.method_group !== "native"
    || input.generated.method_id !== input.current.method_id
  ) {
    return input.previous;
  }
  return input.previous.map((topic) =>
    topic.id === input.current.id || topic.method_id === input.current.method_id
      ? input.generated
      : topic
  );
}

export function buildSingleTitleMutation(input: {
  parentRunId: string;
  current: TopicCandidate;
  generated: TopicCandidate;
  generationAttempts: number;
  createdAt: string;
}): TopicTitleMutation {
  return {
    mutation_type: "single_title_regeneration",
    parent_run_id: input.parentRunId,
    regenerated_topic_id: input.current.id,
    method_id: input.current.method_id,
    previous_title: input.current.title,
    new_title: input.generated.title,
    direction_lock: lockTopicDirection(input.current),
    generation_attempts: input.generationAttempts,
    created_at: input.createdAt,
  };
}
