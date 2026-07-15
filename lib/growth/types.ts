export type GrowthDirection = "A" | "B" | "C";

export type GrowthPersona = "merchant" | "buyer" | "expert";

export type GrowthBusinessTrack = "international-student-career" | "executive-career";

export const GROWTH_BUSINESS_TRACKS: GrowthBusinessTrack[] = [
  "international-student-career",
  "executive-career",
];

export interface GrowthBusinessPosition {
  track: GrowthBusinessTrack;
  label: string;
  short_label: string;
  service_category: string;
  target_user: string;
  core_problem: string;
  main_offer: string;
  differentiation: string;
  trust_source: string;
  compliance_redline: string;
  persona_profiles: Record<
    GrowthPersona,
    {
      label: string;
      account_name: string;
      description: string;
    }
  >;
}

export const GROWTH_PERSONAS: GrowthPersona[] = ["merchant", "buyer", "expert"];

export const GROWTH_PERSONA_LABELS: Record<GrowthPersona, string> = {
  merchant: "商家",
  buyer: "买家",
  expert: "专家",
};

export type ContentType = "diagnostic" | "tool" | "story";

export type ContentStatus = "draft" | "ready" | "published" | "reviewed";

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
  persona: GrowthPersona;
  // 业务母定位。旧账号未写此字段时按「中高管职业决策」读取。
  business_track?: GrowthBusinessTrack;
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
  weekly_review?: WeeklyReviewResult;
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
    { key: "bridge", label: "转化桥（转折帖怎么软出场）", placeholder: "例如：后来找专业的人带，服务只作为故事中的自然经历出现，不做评论或私信诱导" },
    { key: "case_material", label: "真实案例素材", placeholder: "填写已核对、可公开的真实经历；未提供的事实系统不会补写" },
  ],
  expert: [
    { key: "expertise", label: "专业领域", placeholder: "例如：组织发展、职业决策" },
    { key: "methodology", label: "代表方法论/成果", placeholder: "例如：六步职业决策漏斗" },
    { key: "monetization", label: "变现方式", placeholder: "咨询 / 课程 / 知识付费 / 训练营" },
  ],
};

const INTERNATIONAL_STUDENT_PERSONA_SPECIFIC_FIELDS: Record<
  GrowthPersona,
  PersonaSpecificField[]
> = {
  merchant: [
    { key: "what_you_are", label: "你是什么（品类）", placeholder: "例如：留学生回国求职方向规划与秋招陪跑服务" },
    { key: "how_different", label: "有何不同（定位）", placeholder: "例如：先定方向和目标岗位，再做简历、面试与投递节奏" },
    { key: "why_believe", label: "何以见得（信任状）", placeholder: "例如：导师背景、匿名案例、交付流程和招聘节点复盘" },
    { key: "main_offer", label: "主营产品/服务", placeholder: "例如：方向诊断、岗位地图、简历面试与秋招陪跑" },
    { key: "price_band", label: "客单价区间", placeholder: "填写实际价格区间，不确定可暂时留空" },
    { key: "conversion_goal", label: "转化目标", placeholder: "例如：预约诊断、购买辅导服务" },
  ],
  buyer: [
    { key: "identity", label: "留学生家长身份/现状", placeholder: "例如：孩子海外硕士毕业，正在准备回国秋招的家长" },
    { key: "struggle", label: "正在纠结的求职问题", placeholder: "例如：专业能投哪些岗、秋招节奏是否已经晚了" },
    { key: "growth_arc", label: "家庭求职成长弧线", placeholder: "从盲目海投 → 找到方向 → 按招聘节奏准备 → 拿到合适结果" },
    { key: "bridge", label: "转化桥（老师怎么自然出现）", placeholder: "例如：后来找专业的老师带，先把方向和岗位理顺" },
    { key: "case_material", label: "情景设定（可选）", placeholder: "可指定孩子专业/学历/毕业时间、目标行业和岗位、希望出现的城市或求职阶段；不填时系统会生成完整具体设定。真实企业只能作为关注或准备投递的目标，不能写成虚构Offer结果" },
  ],
  expert: [
    { key: "expertise", label: "专业领域", placeholder: "例如：留学生回国求职方向规划、秋招与校招" },
    { key: "methodology", label: "代表方法论/成果", placeholder: "例如：方向诊断—岗位地图—材料—面试—投递节奏五步法" },
    { key: "monetization", label: "变现方式", placeholder: "诊断 / 单项辅导 / 秋招陪跑 / 训练营" },
  ],
};

export function personaSpecificFields(
  persona: GrowthPersona,
  track: GrowthBusinessTrack = "executive-career",
) {
  return track === "international-student-career"
    ? INTERNATIONAL_STUDENT_PERSONA_SPECIFIC_FIELDS[persona]
    : PERSONA_SPECIFIC_FIELDS[persona];
}

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
  direction: GrowthDirection;
  title: string;
  target_user: string;
  pain: string;
  content_type: ContentType;
  hook: string;
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
  owner_user_id?: string | null;
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
  direction: GrowthDirection;
  content_type: ContentType;
  case_mode?: "真实案例" | "情景演绎";
  cover_source?: "ai" | "manual";
  cover_variant?: "招聘现场版" | "结果对照版";
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
  // 系统指定的正文结构；用于生成候选稿和选定稿的醒目标注
  structure_name?: string;
  compliance?: DraftCompliance;
  published_at?: string;
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
  business_positions?: Partial<Record<GrowthBusinessTrack, GrowthBusinessPosition>>;
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
