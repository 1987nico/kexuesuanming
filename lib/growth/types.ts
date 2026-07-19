export type GrowthDirection = "A" | "B" | "C";

export type GrowthPersona = "merchant" | "buyer" | "expert";

export type GrowthBusinessLine = "executive" | "overseas_student";

export const GROWTH_BUSINESS_LINES: GrowthBusinessLine[] = ["overseas_student", "executive"];

export const GROWTH_BUSINESS_LINE_LABELS: Record<GrowthBusinessLine, string> = {
  executive: "中高管业务",
  overseas_student: "留学生业务",
};

export const GROWTH_BUSINESS_LINE_VALUES: Record<GrowthBusinessLine, string> = {
  executive: "中高管职业决策",
  overseas_student: "留学生求职辅导",
};

export interface GrowthBusinessDefinition {
  label: string;
  summary: string;
  service: string;
  target: string;
  category: string;
  difference: string;
  trust: string;
  personas: Record<GrowthPersona, { role: string; description: string }>;
}

export const GROWTH_BUSINESS_DEFINITIONS: Record<GrowthBusinessLine, GrowthBusinessDefinition> = {
  overseas_student: {
    label: "留学生求职辅导",
    summary: "留学生回国求职方向规划与秋招陪跑",
    service: "求职方向诊断＋目标岗位地图＋简历/面试辅导＋秋招陪跑",
    target: "准备海外秋招或回国求职的留学生，以及关注孩子就业结果的家长",
    category: "留学生回国求职方向规划与秋招陪跑",
    difference: "先把方向、岗位和招聘节奏定清楚，再进入简历、面试与投递；不是只修改一份简历",
    trust: "专业老师陪跑流程、匿名交付案例、真实招聘节点复盘与可验证的方法清单",
    personas: {
      merchant: { role: "求职辅导服务商", description: "明着经营，讲服务差异、交付过程、案例证据和选择标准。" },
      buyer: { role: "留学生家长", description: "以家长第一人称记录孩子求职阶段、现场、变化和转折。" },
      expert: { role: "留学生求职老师", description: "用岗位判断、招聘节奏和辅导方法建立专业信任。" },
    },
  },
  executive: {
    label: "中高管职业决策",
    summary: "中高管职业与事业方向决策咨询",
    service: "职业方向初步诊断报告＋深度决策报告＋咨询陪跑",
    target: "35岁上下、正在转型换挡、裸辞、离开体制或考虑创业的中高管与成熟职场人",
    category: "中高管职业与事业方向决策咨询",
    difference: "把个人画像、市场机会、个人胜算、失败风险和90天验证放进同一套决策系统",
    trust: "252题测评、六步决策漏斗、匿名交付样例与真人把关",
    personas: {
      merchant: { role: "职业决策服务商", description: "明着经营，讲产品、交付差异、案例证据和购买标准。" },
      buyer: { role: "转型中的中高管", description: "以真人处境记录裸辞、转型、副业和重新找方向的过程。" },
      expert: { role: "职业决策顾问", description: "用决策框架、市场判断和案例复盘建立专业权威。" },
    },
  },
};

export const GROWTH_PERSONAS: GrowthPersona[] = ["merchant", "buyer", "expert"];

export const GROWTH_PERSONA_LABELS: Record<GrowthPersona, string> = {
  merchant: "商家",
  buyer: "买家",
  expert: "专家",
};

export type ContentType = "diagnostic" | "tool" | "story";

export type TitleMethodGroup = "native" | "benchmark";

export type TitleMethodId =
  | "traffic"
  | "human_pain"
  | "tug_of_war"
  | "scarce_material"
  | "superlative"
  | "contrarian"
  | "nostalgia"
  | "inventory"
  | "same_product"
  | "same_effect"
  | "similar_audience"
  | "same_outcome"
  | "viral_framework";

export type MethodApplicability = "default" | "explore" | "disabled";
export type MethodGenerationMode = Exclude<MethodApplicability, "disabled">;

export interface TopicSourceSnapshot {
  id: string;
  method_id: TitleMethodId;
  platform: string;
  author: string;
  original_title: string;
  original_url: string;
  published_at: string;
  heat_snapshot: string;
  collected_at: string;
  migration_note?: string;
  link_status: "accessible" | "restricted" | "invalid";
  verified_by_operator?: boolean;
  freshness: "within_72h" | "day_4_to_7" | "historical";
}

export interface ValidationCheck {
  key: "source" | "identity" | "fulfillment" | "compliance";
  status: "passed" | "needs_edit" | "blocked";
  message: string;
}

export interface RawBodyTag {
  id: string;
  text: string;
  reason: string;
  generated_at: string;
  body_version: "short" | "long" | "selected";
  edited_by_operator?: boolean;
  /** false 表示已被后续人工修正/重新归纳替代，但原始记录永久保留。 */
  active?: boolean;
  canonical_tag_id?: string;
}

export interface CanonicalBodyTag {
  id: string;
  name: string;
  definition: string;
  raw_tags: string[];
  approved_at: string;
}

export interface TagMergeSuggestion {
  id: string;
  proposed_name: string;
  definition: string;
  member_tags: string[];
  representative_draft_ids: string[];
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at?: string;
}

export type ContentStatus = "draft" | "ready" | "published" | "reviewed";

export type GrowthSchemaVersion = "legacy_v1" | "method_v3_2";
export type MethodAttributionStatus = "missing" | "confirmed";

export type NoteDistributionStatus = "normal" | "limited" | "violation" | "deleted";

export type ReviewInputSource = "manual" | "screenshot" | "mixed";

export type ReviewSampleStatus =
  | "valid"
  | "low_sample"
  | "paid"
  | "limited"
  | "violation"
  | "deleted"
  | "historical_unknown"
  | "not_ready";

export type GrowthExperimentVariable =
  | "title_cover"
  | "opening"
  | "audience_expression"
  | "body_structure"
  | "evidence"
  | "closing"
  | "length";

export type WeeklyDirectionAction = "scale" | "retest" | "explore" | "pause";

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
  owner_user_id?: string | null;
  /** 旧账号未保存该字段时根据人设内容兼容识别业务线。 */
  business_line?: GrowthBusinessLine;
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
  /** 历史A/B/C定位，只读兼容；v3.1新流程不再写入或使用。 */
  content_directions?: string[];
  tone_style?: string;
  filter_words?: string[];
  avoid_expressions?: string[];
  compliance_redline?: string;
  private_domain?: string;
  // 视角专属字段：key -> value
  persona_specific?: Record<string, string>;
  topic_sources?: TopicSourceSnapshot[];
  method_overrides?: Partial<Record<TitleMethodId, MethodApplicability>>;
  canonical_body_tags?: CanonicalBodyTag[];
  tag_merge_suggestions?: TagMergeSuggestion[];
  weekly_review?: WeeklyReviewResult;
  /** 固定周期快照。实时汇总不得覆盖这里的历史周期。 */
  weekly_review_snapshots?: WeeklyReviewResult[];
  // 旧字段兼容：历史数据仍能打开，新代码统一写入 weekly_review。
  stage_review?: StageReviewResult;
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
    { key: "what_you_are", label: "你是什么（品类）", placeholder: "用顾客已有的分类词说清你归哪类，一听就懂。例：给中高管做职业决策的顾问，不是测评工具" },
    { key: "how_different", label: "有何不同（定位）", placeholder: "对顾客有意义且基于竞争的差异，测试：听完不会追问『那又如何』。例：别人只给测评结果，我给能落地的决策框架 + 90 天陪跑" },
    { key: "why_believe", label: "何以见得（信任状）", placeholder: "给可信证据，三类任选：有效承诺 / 顾客可自行验证 / 第三方证明。例：7 年组织咨询、20+ 成功案例、可看匿名交付样例" },
    { key: "main_offer", label: "主营产品/服务", placeholder: "例如：中高端职业咨询、定制化培训" },
    { key: "price_band", label: "客单价区间", placeholder: "例如：2000-8000 元" },
    { key: "conversion_goal", label: "转化目标", placeholder: "加微 / 到店 / 下单 / 留资" },
  ],
  buyer: [
    { key: "identity", label: "真人身份/现状", placeholder: "例如：34 岁被裁的前互联网中层，正在找方向" },
    { key: "struggle", label: "正在纠结的决策", placeholder: "例如：要不要裸辞、副业该不该做、转不转行" },
    { key: "growth_arc", label: "成长弧线/人设走向", placeholder: "从迷茫求助 → 边试边记录 → 找到方向" },
    { key: "bridge", label: "转化桥（转折帖怎么软出场）", placeholder: "例如：做了个职业测评/找人梳理后想通了，引导私信" },
    { key: "case_mode", label: "历史案例呈现方式", placeholder: "例如：匿名第一人称复盘、关键节点对照" },
    { key: "case_material", label: "历史案例素材", placeholder: "例如：可公开的角色、处境、行动与结果，不填写敏感身份" },
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
  owner_user_id?: string | null;
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
  method_group: TitleMethodGroup;
  method_id: TitleMethodId;
  method_label: string;
  generation_mode: MethodGenerationMode;
  title: string;
  title_promise: string;
  target_user: string;
  pain: string;
  hook: string;
  source_snapshot?: TopicSourceSnapshot;
  internal_insight_source?: string;
  validation_checks?: ValidationCheck[];
  // 旧字段只用于打开历史数据；新流程不再写入或依赖。
  direction?: GrowthDirection;
  content_type?: ContentType;
  origin_force?: string;
  conflict_judgement?: string;
  follow_reason: string;
  test_variable: string;
  expected_signal: string;
  repeatable_angle: string;
  broad_traffic_risk: number;
  priority: "S" | "A" | "B" | "C";
  weekly_action?: WeeklyDirectionAction;
  evidence?: string;
  learning_trace?: GrowthLearningTrace;
  scores?: {
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
  owner_user_id?: string | null;
  account_id: string;
  plan_id?: string;
  status: ContentStatus;
  week: number;
  objective: string;
  experiment_hypothesis: string;
  selected_topic?: TopicCandidate;
  topic_pool: TopicCandidate[];
  generation_mode?: MethodGenerationMode;
  unavailable_methods?: Array<{
    method_id: TitleMethodId;
    method_label: string;
    reason: string;
  }>;
  // 已生成过的选题标题历史（用于换一批时不与历史重复）
  seen_titles?: string[];
  draft?: ContentDraft;
  review?: GrowthReview;
  learning_trace?: GrowthLearningTrace;
  created_at: string;
  updated_at: string;
}

export interface ContentDraft {
  id: string;
  tenant_id: string;
  owner_user_id?: string | null;
  account_id: string;
  run_id: string;
  status: ContentStatus;
  business_line: string;
  method_group: TitleMethodGroup;
  method_id: TitleMethodId;
  method_label: string;
  generation_mode: MethodGenerationMode;
  title_promise: string;
  source_snapshot?: TopicSourceSnapshot;
  selected_body_version: "short" | "long" | "selected";
  raw_body_tags: RawBodyTag[];
  tagging_status: "tagged" | "unclassified" | "pending";
  canonical_tag_ids: string[];
  cta_type: "soft_bridge" | "on_platform_consult" | "service_entry";
  validation_checks: ValidationCheck[];
  /** v3.2兼容元数据：旧记录只做读取适配，不自动回写。 */
  schema_version?: GrowthSchemaVersion;
  method_attribution_status?: MethodAttributionStatus;
  legacy_direction?: GrowthDirection;
  legacy_content_type?: ContentType;
  eligible_for_method_learning?: boolean;
  // 旧字段只用于打开历史数据；新流程不再写入或依赖。
  direction?: GrowthDirection;
  content_type?: ContentType;
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
  // 买家视角故事化专属（其它视角为空）：所用故事模式与预估画面率
  story_mode?: string;
  pictorial_rate?: string;
  compliance?: DraftCompliance;
  published_at?: string;
  original_post_url?: string;
  distributed_at?: string;
  is_paid_distribution?: boolean;
  learning_trace?: GrowthLearningTrace;
  created_at: string;
  updated_at: string;
}

export interface DraftCompliance {
  status: "passed" | "rewritten" | "blocked";
  issues: string[];
  checked_at: string;
}

export interface GrowthReviewMetrics {
  published_at?: string;
  snapshot_at?: string;
  note_url?: string;
  note_status?: NoteDistributionStatus;
  promoted?: boolean;
  input_source?: ReviewInputSource;
  impressions?: number;
  reads?: number;
  ctr?: number;
  average_view_seconds?: number;
  likes?: number;
  saves?: number;
  comments?: number;
  shares?: number;
  profile_visits?: number;
  follows?: number;
  comment_keywords?: string[];
  private_messages?: number;
  qualified_inquiries?: number;
  diagnosis_199_entries?: number;
  diagnosis_199_sales?: number;
  deep_6999_qualified?: number;
  deep_6999_sales?: number;
  target_customer_quote?: string;
  traffic_sources?: {
    home?: number;
    search?: number;
    profile?: number;
    other?: number;
  };
  search_keywords?: string[];
  audience?: {
    gender?: Record<string, number>;
    age?: Record<string, number>;
    cities?: Record<string, number>;
    city_tiers?: Record<string, number>;
    interests?: Record<string, number>;
  };
}

export interface GrowthDerivedMetrics {
  ctr: number;
  engagement_rate: number;
  save_rate: number;
  comment_rate: number;
  share_rate: number;
  follow_rate: number;
  inquiry_rate: number;
}

export interface GrowthReviewSample {
  status: ReviewSampleStatus;
  strategy_eligible: boolean;
  reasons: string[];
}

export interface GrowthEntryDiagnosis {
  title_pattern: string;
  primary_audience: string;
  primary_keyword: string;
  performance:
    | "strong_aligned"
    | "strong_entry_weak_delivery"
    | "weak_entry_strong_content"
    | "weak_both"
    | "insufficient";
  benchmark_note_count: number;
  account_ctr_median?: number;
  direction_ctr_median?: number;
}

export interface GrowthReview {
  id: string;
  tenant_id: string;
  owner_user_id?: string | null;
  draft_id: string;
  metrics: GrowthReviewMetrics;
  derived_metrics?: GrowthDerivedMetrics;
  sample?: GrowthReviewSample;
  entry_diagnosis?: GrowthEntryDiagnosis;
  classification: ReviewClassification;
  entry_judgement: string;
  body_judgement?: string;
  conversion_judgement?: string;
  compliance_judgement?: string;
  value_judgement: string;
  follow_judgement: string;
  audience_judgement: string;
  next_variable: string;
  manager_instruction: string;
  topic_instruction: string;
  writer_instruction: string;
  experiment_variable?: GrowthExperimentVariable;
  learning_version?: string;
  created_at: string;
  updated_at?: string;
}

// 阶段复盘：跨笔记按方向聚合，做方向级决策
export interface DirectionAggregate {
  direction: GrowthDirection;
  label?: string;
  note_count: number;
  reviewed_count: number;
  valid_count?: number;
  recent_7d_count?: number;
  rolling_28d_count?: number;
  total_reads: number;
  total_saves: number;
  total_comments: number;
  total_follows: number;
  avg_save_rate: number; // saves / reads
  avg_comment_rate: number; // comments / reads
  median_impressions?: number;
  median_reads?: number;
  median_ctr?: number;
  median_average_view_seconds?: number;
  median_save_rate?: number;
  median_share_rate?: number;
  median_follow_rate?: number;
  median_inquiry_rate?: number;
  action?: WeeklyDirectionAction;
  confidence?: "low" | "medium" | "high";
  score?: number;
  evidence_review_ids?: string[];
  classifications: Record<string, number>; // 各结果分类计数
}

export interface MethodAggregate {
  method_id: TitleMethodId | "legacy";
  method_label: string;
  generation_mode: MethodGenerationMode | "legacy";
  note_count: number;
  reviewed_count: number;
  valid_count: number;
  median_ctr: number;
  median_save_rate: number;
  median_share_rate: number;
  median_follow_rate: number;
  median_inquiry_rate: number;
  /** 周复盘辅助指标；旧快照没有这些字段时按 0 展示。 */
  median_impressions?: number;
  median_reads?: number;
  median_saves?: number;
  median_shares?: number;
  median_profile_visits?: number;
  median_sales?: number;
  above_persona_inquiry_median: boolean;
  evidence_review_ids: string[];
}

export interface TagAggregate {
  tag: string;
  canonical_tag_id?: string;
  note_count: number;
  valid_count: number;
  median_inquiry_rate: number;
}

export interface MethodPromotionSuggestion {
  method_id: TitleMethodId;
  method_label: string;
  reason: string;
  valid_count: number;
  median_inquiry_rate: number;
}

export interface StageDecision {
  scale_direction: string; // 建议放大的方向
  pause_direction: string; // 建议暂停的方向
  next_focus: string; // 下一阶段主攻
  reusable_pattern: string; // 可复用的标题/结构模板
  summary: string; // 一段话决策说明
  strategic_hypothesis?: string;
  content_allocation?: Array<{
    direction: GrowthDirection;
    percentage: number;
    action: WeeklyDirectionAction;
    reason: string;
  }>;
  title_patterns_to_repeat?: string[];
  title_patterns_to_avoid?: string[];
  body_patterns_to_repeat?: string[];
}

export interface WeeklyReviewResult {
  account_id: string;
  generated_at: string;
  learning_version?: string;
  period_start?: string;
  period_end?: string;
  rolling_window_start?: string;
  note_total: number;
  reviewed_total: number;
  eligible_total?: number;
  stale?: boolean;
  source_review_ids?: string[];
  by_method: MethodAggregate[];
  by_tag: TagAggregate[];
  promotion_suggestions: MethodPromotionSuggestion[];
  // 历史周复盘兼容；新流程固定写空数组。
  by_direction: DirectionAggregate[];
  decision: StageDecision;
}

export type StageReviewResult = WeeklyReviewResult;

export interface GrowthLearningTrace {
  version: string;
  generated_at: string;
  weekly_review_generated_at?: string;
  source_review_ids: string[];
  direction_action?: WeeklyDirectionAction;
  basis: string[];
}

export interface GrowthLearningBrief {
  trace: GrowthLearningTrace;
  weekly_strategy: string;
  topic_guidance: string[];
  title_guidance: string[];
  body_guidance: string[];
  experiment_variable: GrowthExperimentVariable;
}

// 业务设置：面霸君可在界面里编辑的业务事实（当前只有两个报告价格，后续可扩展）
export interface BusinessSettings {
  tenant_id: string;
  report_lite_price: string; // 初步诊断报告价格（字符串，允许写「199」或「199 元」等）
  report_deep_price: string; // 深度诊断报告价格
  updated_at: string;
}

export const DEFAULT_BUSINESS_SETTINGS: Omit<BusinessSettings, "tenant_id" | "updated_at"> = {
  report_lite_price: "199",
  report_deep_price: "6999",
};

export interface UsageEvent {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  feature: "growth_text" | "growth_image" | "report_lite" | "report_deep";
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  units?: number;
  cost_cents?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}
