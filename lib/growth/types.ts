export type GrowthDirection = "A" | "B" | "C";

export type GrowthPersona = "merchant" | "buyer" | "expert";

export const GROWTH_PERSONAS: GrowthPersona[] = ["merchant", "buyer", "expert"];

export const GROWTH_PERSONA_LABELS: Record<GrowthPersona, string> = {
  merchant: "商家",
  buyer: "买家",
  expert: "专家",
};

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
  persona: GrowthPersona;
  name: string;
  target_user: string;
  core_problem: string;
  account_value: string;
  trust_source: string;
  not_doing: string;
  hypotheses: string[];
  // 扩展字段（可选，向后兼容旧数据）
  one_liner?: string;
  follow_reason?: string;
  content_directions?: string[];
  tone_style?: string;
  filter_words?: string[];
  avoid_expressions?: string[];
  compliance_redline?: string;
  private_domain?: string;
  // 视角专属字段：key -> value
  persona_specific?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface PersonaSpecificField {
  key: string;
  label: string;
  placeholder: string;
}

export const PERSONA_SPECIFIC_FIELDS: Record<GrowthPersona, PersonaSpecificField[]> = {
  merchant: [
    { key: "main_offer", label: "主营产品/服务", placeholder: "例如：中高端职业咨询、定制化培训" },
    { key: "price_band", label: "客单价区间", placeholder: "例如：2000-8000 元" },
    { key: "conversion_goal", label: "转化目标", placeholder: "加微 / 到店 / 下单 / 留资" },
  ],
  buyer: [
    { key: "review_category", label: "测评/对比的品类", placeholder: "例如：职业课程、简历服务" },
    { key: "stance", label: "立场", placeholder: "第三方实测 / 避坑 / 平价替代" },
    { key: "monetization", label: "变现方式", placeholder: "带货 / 佣金 / 探店合作" },
  ],
  expert: [
    { key: "expertise", label: "专业领域", placeholder: "例如：组织发展、职业决策" },
    { key: "methodology", label: "代表方法论/成果", placeholder: "例如：六步职业决策漏斗" },
    { key: "monetization", label: "变现方式", placeholder: "咨询 / 课程 / 知识付费 / 训练营" },
  ],
};

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
  // 已生成过的选题标题历史（用于换一批时不与历史重复）
  seen_titles?: string[];
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
