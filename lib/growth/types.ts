export type GrowthDirection = "A" | "B" | "C";

export type ContentType = "diagnostic" | "tool" | "story";

export type ContentStatus = "draft" | "ready" | "published" | "reviewed";

export type ReviewClassification =
  | "scale"
  | "retest"
  | "weak_entry"
  | "weak_conversion"
  | "wrong_audience"
  | "pause";

export interface GrowthAccount {
  id: string;
  tenant_id: string;
  name: string;
  target_user: string;
  core_problem: string;
  account_value: string;
  trust_source: string;
  not_doing: string;
  hypotheses: string[];
  created_at: string;
  updated_at: string;
}

export interface GrowthPlan {
  id: string;
  tenant_id: string;
  account_id: string;
  title: string;
  weeks: GrowthPlanWeek[];
  created_at: string;
  updated_at: string;
}

export interface GrowthPlanWeek {
  week: number;
  theme: string;
  goal: string;
  content_mix: string;
  decision_rule: string;
}

export interface TopicCandidate {
  id: string;
  direction: GrowthDirection;
  title: string;
  target_user: string;
  pain: string;
  content_type: ContentType;
  hook: string;
  follow_reason: string;
  test_variable: string;
  expected_signal: string;
  repeatable_angle: string;
  broad_traffic_risk: number;
  priority: "S" | "A" | "B" | "C";
  scores: {
    positioning: number;
    pain_clarity: number;
    entry_strength: number;
    follow_reason: number;
    experiment_value: number;
    repeatability: number;
  };
}

export interface GrowthRun {
  id: string;
  tenant_id: string;
  account_id: string;
  plan_id?: string;
  status: ContentStatus;
  week: number;
  objective: string;
  experiment_hypothesis: string;
  selected_topic?: TopicCandidate;
  topic_pool: TopicCandidate[];
  draft?: ContentDraft;
  review?: GrowthReview;
  created_at: string;
  updated_at: string;
}

export interface ContentDraft {
  id: string;
  tenant_id: string;
  account_id: string;
  run_id: string;
  status: ContentStatus;
  direction: GrowthDirection;
  content_type: ContentType;
  test_variable: string;
  expected_signal: string;
  title: string;
  alternative_titles: string[];
  target_user: string;
  cover_text: string;
  body: string;
  hashtags: string[];
  comment_prompt: string;
  word_count: {
    title: number;
    body_and_tags: number;
    total: number;
    within_limit: boolean;
  };
  follow_reason: string;
  trust_anchor: string;
  review_points: string[];
  cover_suggestion: string;
  created_at: string;
  updated_at: string;
}

export interface GrowthReviewMetrics {
  published_at?: string;
  note_url?: string;
  impressions?: number;
  reads?: number;
  ctr?: number;
  likes?: number;
  saves?: number;
  comments?: number;
  shares?: number;
  profile_visits?: number;
  follows?: number;
  comment_keywords?: string[];
  private_messages?: number;
}

export interface GrowthReview {
  id: string;
  tenant_id: string;
  draft_id: string;
  metrics: GrowthReviewMetrics;
  classification: ReviewClassification;
  entry_judgement: string;
  value_judgement: string;
  follow_judgement: string;
  audience_judgement: string;
  next_variable: string;
  manager_instruction: string;
  topic_instruction: string;
  writer_instruction: string;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  tenant_id: string;
  feature: "growth_text" | "growth_image" | "report_lite" | "report_deep" | "title_score";
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  units?: number;
  cost_cents?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}
