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
  owner_user_id?: string | null;
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
  owner_user_id?: string | null;
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

// 阶段复盘：跨笔记按方向聚合，做方向级决策
export interface DirectionAggregate {
  direction: GrowthDirection;
  note_count: number;
  reviewed_count: number;
  total_reads: number;
  total_saves: number;
  total_comments: number;
  total_follows: number;
  avg_save_rate: number; // saves / reads
  avg_comment_rate: number; // comments / reads
  classifications: Record<string, number>; // 各结果分类计数
}

export interface StageDecision {
  scale_direction: string; // 建议放大的方向
  pause_direction: string; // 建议暂停的方向
  next_focus: string; // 下一阶段主攻
  reusable_pattern: string; // 可复用的标题/结构模板
  summary: string; // 一段话决策说明
}

export interface StageReviewResult {
  account_id: string;
  generated_at: string;
  note_total: number;
  reviewed_total: number;
  by_direction: DirectionAggregate[];
  decision: StageDecision;
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
