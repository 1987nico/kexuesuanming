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

/**
 * 两条业务各自独立的母定位。产品页面允许编辑这些业务事实，
 * 三种内容视角在生成或重新生成人设时共同继承当前业务的母定位。
 */
export interface GrowthBusinessPosition {
  business_line: GrowthBusinessLine;
  service_category: string;
  target_user: string;
  core_problem: string;
  main_offer: string;
  differentiation: string;
  trust_source: string;
  compliance_redline: string;
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
  /** 来源为运营手工补充，或由每日职业榜接口自动发现。 */
  source_provider?: "manual" | "redfox_daily";
  /** 自动来源对应的榜单日期与原始排名，便于证明时效和避免重复请求。 */
  rank_date?: string;
  rank_position?: number;
  /** v3.6：来源是否真的适合当前标题方法。旧来源读取时会重新计算，不要求数据库迁移。 */
  source_method_fit_status?: "passed" | "failed" | "uncertain";
  source_method_fit_version?: "v3_6" | "v3_7" | "v3_8";
  source_method_fit_evidence?: string;
}

export interface BenchmarkStructureCard {
  id: string;
  account_id: string;
  business_line: GrowthBusinessLine;
  persona: GrowthPersona;
  method_id: TitleMethodId;
  source_id: string;
  source_url: string;
  source_title: string;
  source_author: string;
  sentence_structure: string;
  conflict_structure: string;
  audience_situation: string;
  emotional_hook: string;
  promised_result: string;
  inheritable_element: string;
  replacement_requirement: string;
  /**
   * v3.8：从原题中抽出的可迁移语义槽位。它们是给生成器与门禁共同使用的
   * “原题关系”，不是运营者需要填写的字段。
   */
  semantic_slots: {
    audience_or_role: string;
    unusual_action_or_method: string;
    scene_or_channel: string;
    goal_or_outcome: string;
    relationship: string;
    required_slot_keys: Array<
      "audience_or_role"
      | "unusual_action_or_method"
      | "scene_or_channel"
      | "goal_or_outcome"
      | "relationship"
    >;
  };
  /** 语义槽位不足时不会锁卡，来源型标题会透明暂停。 */
  semantic_status: "ready" | "insufficient";
  forbidden_copy_elements: string[];
  source_fit_status: "passed" | "failed";
  source_fit_reason: string;
  status: "locked" | "expired" | "rejected";
  structure_version: "v3_7" | "v3_8";
  generated_at: string;
  expires_at: string;
}

export interface GrowthTitleFingerprint {
  title: string;
  normalized_fingerprint: string;
  semantic_fingerprint: string;
  /** 可解释的标题语义摘要，用于跨批去重与验收排查，不保存模型推理。 */
  semantic_signature?: {
    audience: string;
    scenario: string;
    conflict: string;
    promise: string;
    frame: string;
  };
  /** 仅用于后台多样性门禁，不作为内容方向或运营标签展示。 */
  sentence_frame?: string;
  /** 从标题和标题承诺归纳的开放母题键，只用于避免近期反复写同一件事。 */
  mother_topic_key?: string;
  /** 人物、场景和结果的组合签名，只用于生成前素材轮换。 */
  material_signature?: string;
  diversity_version?: "v1";
  business_line: GrowthBusinessLine;
  persona: GrowthPersona;
  method_id: TitleMethodId;
  generation_mode: MethodGenerationMode;
  source_id?: string;
  structure_card_id?: string;
}

export type TopicBatchRotationMode =
  | "regenerate_titles"
  | "regenerate_single_title"
  | "rotate_single_source"
  | "rotate_all_sources"
  | "automatic_rotation";

export interface TopicDirectionLock {
  method_id: TitleMethodId;
  target_user: string;
  pain: string;
  title_promise: string;
  origin_force?: string;
  conflict_judgement?: string;
  source_id?: string;
}

export interface TopicTitleMutation {
  mutation_type: "single_title_regeneration";
  parent_run_id: string;
  regenerated_topic_id: string;
  method_id: TitleMethodId;
  previous_title: string;
  new_title: string;
  direction_lock: TopicDirectionLock;
  generation_attempts: number;
  created_at: string;
}

export interface BenchmarkSourceUsage {
  business_line: GrowthBusinessLine;
  persona: GrowthPersona;
  method_id: TitleMethodId;
  source_id: string;
  original_url: string;
  first_used_at: string;
  last_used_at: string;
  generated_batch_count: number;
  selected_count: number;
  rotation_status:
    | "active"
    | "rotation_recommended"
    | "expired"
    | "rejected"
    | "replaced";
}

export interface TopicBatchRotation {
  mode: TopicBatchRotationMode;
  requested_method_id?: TitleMethodId;
  changed_method_ids: TitleMethodId[];
  retained_method_ids: TitleMethodId[];
  paused_method_ids: TitleMethodId[];
  previous_source_ids: string[];
  new_source_ids: string[];
  created_at: string;
}

/**
 * 单个标题方法在一次生成任务中的交付结果。
 *
 * 新流程不再因为一个槽位无法通过而撤销整批已合格标题。这个字段只记录
 * 运营页应如何展示本次结果；标题本身仍只有通过去重和迁移检查后才会写入。
 */
export interface TopicMethodDelivery {
  method_id: TitleMethodId;
  method_label: string;
  status: "ready" | "paused" | "failed";
  /** 给操作者看的简短原因，不暴露模型原始报错。 */
  reason?: string;
  attempts: number;
  topic_id?: string;
  /** 本轮新生成、沿用上一批，或当前没有可展示标题。 */
  title_origin: "new" | "retained" | "none";
  retained_from_run_id?: string;
}

export interface ValidationCheck {
  key: "source" | "identity" | "fulfillment" | "compliance" | "conversion";
  status: "passed" | "needs_edit" | "blocked";
  message: string;
  /** 兑现等复合门禁的原子结果，便于只展示真正失败的原因。 */
  details?: Array<{
    code: string;
    status: "passed" | "needs_edit" | "not_applicable";
    message: string;
  }>;
}

export type DraftValidationKey = "identity" | "fulfillment" | "conversion";

export interface DraftValidationAnnotation {
  id: string;
  key: DraftValidationKey;
  quote: string;
  start: number;
  end: number;
  reason: string;
  confidence: number;
}

export interface DraftValidationReport {
  status: "passed" | "failed";
  attempts: number;
  checked_at: string;
  annotations: DraftValidationAnnotation[];
}

export interface DraftIdentityContract {
  persona: GrowthPersona;
  expression_goal: string;
  required_elements: string[];
  evidence_basis: string;
  target_section: "identity_evidence";
  /** 已进入最终正文的身份依据原句；校验通过结构定位，不再猜固定关键词。 */
  evidence: string;
}

export interface DraftFulfillmentContract {
  promise_type: "ordinary" | "counted" | "material" | "comparison";
  promised_count?: number;
  required_sections: Array<{
    id: string;
    requirement: string;
    minimum_content: string[];
  }>;
}

export interface DraftConversionContract {
  problem_context: string;
  attempted_action: string;
  professional_role: string;
  intervention_action: string;
  stage_result: string;
  evidence_basis: string;
  /** 已进入最终正文的完整因果桥接段。 */
  bridge_paragraph: string;
}

export interface DraftDeliveryContract {
  contract_version: "v3_4";
  identity_contract: DraftIdentityContract;
  fulfillment_contract: DraftFulfillmentContract;
  conversion_contract: DraftConversionContract;
}

export type DraftCertificationStatus = "generating" | "repairing" | "certified" | "incident";

export interface DraftRepairRecord {
  field: DraftValidationKey | "length" | "fallback";
  reason_code: string;
  action: string;
  repaired_at: string;
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

export type ReviewInputSource = "manual" | "screenshot" | "excel" | "mixed";

export type GrowthReviewWindow = "content_24h" | "business_7d" | "attribution_30d";

export type MetricConfirmationStatus = "unknown" | "confirmed_zero" | "confirmed_value";

export type GrowthDistributionType = "unknown" | "organic" | "paid";

export type ThreeDayCycleStatus = "draft" | "completed" | "skipped";

export type ThreeDayTrafficStatus =
  | "unknown"
  | "organic_normal"
  | "paid"
  | "limited"
  | "violation"
  | "deleted";

export type ThreeDayMatchStatus =
  | "matched"
  | "suggested"
  | "external_history"
  | "unmatched" // 只读兼容旧周期；新导入统一写 external_history
  | "excluded";

export type ThreeDayMatchScope =
  | "current_persona"
  | "same_business_other_persona"
  | "cross_business"
  | "external";

export type ReviewBusinessAssignmentStatus =
  | "auto_confirmed"
  | "suggested"
  | "ambiguous"
  | "manual_confirmed"
  | "external_history"
  | "excluded";

export interface ThreeDayMatchCandidate {
  draft_id: string;
  account_id: string;
  business_line: GrowthBusinessLine;
  persona: GrowthPersona;
  title: string;
  status: ContentStatus;
  published_at?: string;
  title_similarity: number;
  time_delta_seconds?: number;
  match_reason: string;
}

export interface ThreeDayNoteMetrics {
  impressions: number;
  views: number;
  cover_ctr: number;
  likes: number;
  comments: number;
  saves: number;
  follows: number;
  shares: number;
  avg_view_seconds: number;
  danmaku: number;
}

export interface ThreeDayDerivedMetrics {
  like_rate?: number;
  comment_rate?: number;
  save_rate?: number;
  share_rate?: number;
  follow_rate?: number;
  value_rate?: number;
  interaction_rate?: number;
}

export interface ThreeDayNoteSnapshot {
  source_key: string;
  source_title?: string;
  published_at: string;
  content_format: string;
  draft_id?: string;
  matched_account_id?: string;
  matched_business_line?: GrowthBusinessLine;
  /** Excel笔记最终归入的业务；未确定时保持为空。 */
  assigned_business_line?: GrowthBusinessLine;
  business_assignment_status?: ReviewBusinessAssignmentStatus;
  business_assignment_confidence?: number;
  business_assignment_reason?: string;
  matched_persona?: GrowthPersona;
  system_title?: string;
  system_published_at?: string;
  official_published_at?: string;
  published_at_delta_seconds?: number;
  method_id?: TitleMethodId;
  method_label?: string;
  method_group?: TitleMethodGroup;
  generation_mode?: MethodGenerationMode;
  match_status: ThreeDayMatchStatus;
  match_scope?: ThreeDayMatchScope;
  match_confidence?: number;
  match_reason: string;
  match_candidates?: ThreeDayMatchCandidate[];
  resolution_type?: "automatic" | "confirmed" | "official_time" | "external_history" | "excluded";
  resolved_at?: string;
  metrics: ThreeDayNoteMetrics;
  derived: ThreeDayDerivedMetrics;
  traffic_status: ThreeDayTrafficStatus;
  content_eligible: boolean;
  commercial_eligible: boolean;
  attributed_inquiries?: number;
  eligibility_reasons: string[];
}

export interface ThreeDayCycleDecision {
  keep: string[];
  retest_or_pause: string[];
  next_variable: GrowthExperimentVariable;
  next_variable_reason: string;
  summary: string;
}

export interface ThreeDayReviewCycle {
  id: string;
  account_id: string;
  business_line: GrowthBusinessLine;
  persona: GrowthPersona;
  cycle_number: number;
  status: ThreeDayCycleStatus;
  started_at: string;
  due_at: string;
  completed_at?: string;
  next_due_at?: string;
  source_file_name?: string;
  source_file_size?: number;
  /** 同一Excel拆出的两条业务子周期共享该批次ID。 */
  import_batch_id?: string;
  source_file_hash?: string;
  batch_total_rows?: number;
  batch_business_counts?: Partial<Record<GrowthBusinessLine, number>>;
  batch_unassigned_count?: number;
  sibling_cycle_ids?: Partial<Record<GrowthBusinessLine, string>>;
  /** 等待期提前上传的数据只能整理，开放时间前不能完成复盘。 */
  preuploaded?: boolean;
  source_row_count: number;
  source_date_from?: string;
  source_date_to?: string;
  imported_at?: string;
  traffic_confirmed: boolean;
  notes: ThreeDayNoteSnapshot[];
  qualified_inquiries?: number;
  unattributed_inquiries?: number;
  diagnosis_199_entries?: number;
  diagnosis_199_sales?: number;
  deep_6999_qualified?: number;
  deep_6999_sales?: number;
  decision?: ThreeDayCycleDecision;
  created_at: string;
  updated_at: string;
}

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
  /** 面向运营展示的账号人设名称；旧数据为空时由系统按业务与视角补默认名。 */
  profile_name?: string;
  /**
   * 账号实际发声身份。它比“买家/商家/专家”更具体，用来区分同一买家视角下
   * 的留学生本人号与家长号，禁止标题和正文仅凭视角猜第一人称。
   */
  profile_identity?: GrowthProfileIdentity;
  /** 归档只隐藏账号人设，不删除其标题、正文与复盘历史。 */
  profile_status?: "active" | "archived";
  /** 同一业务与视角下首次进入时优先选择的账号人设。 */
  is_default_profile?: boolean;
  display_order?: number;
  last_used_at?: string;
  /** 新建账号人设请求的幂等键，防止网络重试产生重复账号。 */
  profile_creation_request_id?: string;
  /**
   * 历史人设经操作者人工确认后的显式归属。只有确认记录与当前业务、视角一致时，
   * 才能覆盖旧数据缺字段或文案冲突带来的自动隔离。
   */
  profile_attribution_confirmation?: {
    business_line: GrowthBusinessLine;
    persona: GrowthPersona;
    confirmed_at: string;
    confirmed_by: string;
  };
  /** 归属调整审计记录；只追加，不覆盖原始人设及其内容历史。 */
  profile_attribution_history?: Array<{
    action: "confirm" | "reassign" | "archive";
    from_business_line?: GrowthBusinessLine;
    from_persona: GrowthPersona;
    to_business_line?: GrowthBusinessLine;
    to_persona?: GrowthPersona;
    operated_at: string;
    operated_by: string;
  }>;
  /** 只保存小红书账号标识，不保存密码、Cookie 或登录凭据。 */
  platform_binding?: GrowthPlatformBinding;
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
  /** v3.7 对标两阶段生成缓存；只供系统内部使用，不在运营页展示。 */
  benchmark_structure_cards?: BenchmarkStructureCard[];
  /** v3.8 每个业务×视角×方法下的母题使用次数与换源状态。 */
  benchmark_source_usage?: BenchmarkSourceUsage[];
  method_overrides?: Partial<Record<TitleMethodId, MethodApplicability>>;
  canonical_body_tags?: CanonicalBodyTag[];
  tag_merge_suggestions?: TagMergeSuggestion[];
  weekly_review?: WeeklyReviewResult;
  /** 固定周期快照。实时汇总不得覆盖这里的历史周期。 */
  weekly_review_snapshots?: WeeklyReviewResult[];
  cycle_experiments?: GrowthCycleExperiment[];
  /** v3.4 三日复盘：本地兼容预览先保存在账号载荷，正式上线后迁移至独立表。 */
  three_day_review_cycles?: ThreeDayReviewCycle[];
  // 旧字段兼容：历史数据仍能打开，新代码统一写入 weekly_review。
  stage_review?: StageReviewResult;
  created_at: string;
  updated_at: string;
}

export type GrowthProfileIdentity =
  | "overseas_student_self"
  | "overseas_student_parent"
  | "executive_self"
  | "service_operator"
  | "professional_expert";

export interface GrowthPlatformBinding {
  platform: "xiaohongshu";
  account_name: string;
  account_uid?: string;
  profile_url?: string;
  binding_status: "bound" | "unbound";
  bound_at?: string;
}

export interface GrowthAccountSummary {
  id: string;
  business_line: GrowthBusinessLine;
  persona: GrowthPersona;
  profile_name: string;
  profile_identity: GrowthProfileIdentity;
  one_liner: string;
  profile_status: "active" | "archived";
  is_default_profile: boolean;
  display_order: number;
  last_used_at: string;
  platform_binding: GrowthPlatformBinding;
  created_at: string;
  updated_at: string;
}

export type GrowthAccountAttributionReason =
  | "missing_business_line"
  | "content_conflict";

export interface GrowthPendingAccountProfileSummary {
  id: string;
  profile_name: string;
  one_liner: string;
  source_business_line?: GrowthBusinessLine;
  source_persona: GrowthPersona;
  suggested_business_line: GrowthBusinessLine;
  reason: GrowthAccountAttributionReason;
  reason_label: string;
  has_history: boolean;
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
    { key: "main_offer", label: "当前主推SKU", placeholder: "每篇只主推一个SKU。例如：199元职业方向初步诊断" },
    { key: "sku_catalog", label: "可销售SKU列表", placeholder: "逐项写产品名、适用对象和价格；生成时系统只选择其中一个" },
    { key: "sku_target", label: "SKU适用对象", placeholder: "写清适合谁、不适合谁，以及用户正处于什么场景" },
    { key: "sku_problem", label: "SKU解决的问题", placeholder: "具体到用户正在付出什么代价，不能只写“解决迷茫”" },
    { key: "sku_delivery", label: "交付内容与过程", placeholder: "例如：测评、岗位地图、一次人工解读、90天验证计划" },
    { key: "price_band", label: "公开价格", placeholder: "例如：199元；如果不公开，明确写“不公开价格”" },
    { key: "payment_method", label: "付款方式", placeholder: "例如：一次性付款、分阶段付款、服务后付款；只写真实可执行方式" },
    { key: "service_promise", label: "服务承诺", placeholder: "例如：先判断是否适配，再决定是否购买；不要承诺确定结果" },
    { key: "promise_conditions", label: "承诺成立条件", placeholder: "说明对象、周期、配合要求和不包含的结果" },
    { key: "sku_evidence", label: "SKU证据", placeholder: "公开样例、服务流程、匿名案例或可核验的阶段结果" },
    { key: "conversion_goal", label: "唯一转化动作", placeholder: "例如：查看主页产品、购买诊断、提交站内咨询；每篇只能选一个" },
  ],
  buyer: [
    { key: "identity", label: "真人身份/现状", placeholder: "例如：34 岁被裁的前互联网中层，正在找方向" },
    { key: "struggle", label: "正在纠结的决策", placeholder: "例如：要不要裸辞、副业该不该做、转不转行" },
    { key: "growth_arc", label: "成长弧线/人设走向", placeholder: "从迷茫求助 → 边试边记录 → 找到方向" },
    { key: "bridge", label: "转化桥（转折帖怎么软出场）", placeholder: "例如：做了个职业测评/找人梳理后想通了，引导私信" },
    { key: "case_mode", label: "素材模式", placeholder: "真实亲历 / 授权复合案例 / 内部培训模拟" },
    { key: "case_material", label: "具体场景素材", placeholder: "写时间、地点、动作、对话、冲突和当时的真实感受；不要只写结论" },
    { key: "original_attempt", label: "原来试过什么", placeholder: "例如：海投、反复改简历、听熟人建议、自己列方向" },
    { key: "intervention_action", label: "专业服务做了什么", placeholder: "写老师、顾问或机构具体做的一个关键动作" },
    { key: "stage_result", label: "阶段变化", placeholder: "例如：岗位收窄、材料对齐、排除一条路、反馈开始能复盘；不承诺上岸" },
  ],
  expert: [
    { key: "expertise", label: "专业领域", placeholder: "例如：组织发展、职业决策" },
    { key: "methodology", label: "代表方法论/成果", placeholder: "例如：六步职业决策漏斗" },
    { key: "monetization", label: "变现方式", placeholder: "咨询 / 课程 / 知识付费 / 训练营" },
    { key: "comparison_scope", label: "可比较的品类/方案", placeholder: "例如：面试辅导、求职陪跑、实习项目、机构服务、个人专家" },
    { key: "comparison_brands", label: "可点名比较的品牌", placeholder: "填写允许公开比较的真实品牌；未填写时只做品类比较" },
    { key: "comparison_criteria", label: "比较标准", placeholder: "例如：适用对象、交付深度、验证方式、时间成本、价格和风险" },
    { key: "comparison_sources", label: "公开依据", placeholder: "官网、公开产品页、公开采访或可核验体验；不要使用传闻" },
    { key: "interest_disclosure", label: "利益关系说明", placeholder: "说明自己与被比较品牌或产品的关系；没有则写“无直接利益关系”" },
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
  /**
   * 仅用于原生法的系统兜底候选：记录这个候选对应的可复用母题。
   * 不展示给操作者，写入标题指纹后用于避免后续批次把同一件事换词重发。
   */
  fallback_premise_key?: string;
  /** 操作者编辑标题后，必须重新同步正文承诺，才能进入正文生成。 */
  title_promise_status?: "synced" | "stale" | "invalid";
  title_promise_validation?: string;
  target_user: string;
  pain: string;
  hook: string;
  source_snapshot?: TopicSourceSnapshot;
  /** 来源型标题已通过“确实使用母题逻辑”的内部二元门禁；不保存具体迁移推理。 */
  source_usage_status?: "passed" | "failed";
  source_usage_version?: "v3_5" | "v3_6" | "v3_7" | "v3_8";
  /** 独立模型完成的来源适配与迁移二元门禁；只存审计证据，不在运营页展示推理。 */
  migration_validation_status?: "passed" | "failed";
  migration_validation_version?: "v3_6" | "v3_7" | "v3_8";
  migration_validation_evidence?: string;
  structure_card_id?: string;
  structure_version?: "v3_7" | "v3_8";
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
  generation_status?: "generating" | "completed" | "failed";
  uniqueness_status?: "passed" | "failed";
  generation_attempts?: number;
  /** 同一次“换一批”请求的幂等键：浏览器断连后重试仍返回这一批，而不重复生成。 */
  generation_request_id?: string;
  /** 仅供运营排查的分段耗时与结果，不展示模型内部推理。 */
  generation_diagnostics?: {
    total_ms: number;
    source_ms?: number;
    generation_ms?: number;
    save_ms?: number;
    /** 仅用于定位标题批次失败阶段，不展示模型内部内容。 */
    failure_phase?: "source" | "native_generation" | "native_audit" | "unknown";
    failed_method_ids?: TitleMethodId[];
    native_title_audit?: {
      status: "passed" | "fallback_recovery" | "timeout" | "incomplete" | "unavailable" | "not_needed";
      candidate_count: number;
      reference_count: number;
      elapsed_ms: number;
      missing_candidate_ids?: string[];
    };
    /** 本轮被本地或语义门禁拒绝、已写入下一轮排除池的标题数。 */
    rejected_candidate_count?: number;
  };
  structure_version?: "v3_7" | "v3_8";
  migration_status?: "passed" | "failed";
  title_fingerprints?: GrowthTitleFingerprint[];
  source_rotation?: TopicBatchRotation;
  title_mutation?: TopicTitleMutation;
  unavailable_methods?: Array<{
    method_id: TitleMethodId;
    method_label: string;
    reason: string;
  }>;
  /** v3.8 槽位级交付记录；历史批次缺失时按 topic_pool 兼容读取。 */
  method_deliveries?: TopicMethodDelivery[];
  // 已生成过的选题标题历史（用于换一批时不与历史重复）
  seen_titles?: string[];
  /**
   * 未选用正文也必须进入历史去重。保存在运行 payload 中，避免为了专项修复增加
   * 一张生产表；每个运行只保留最近48个版本，生成端只读取90天窗口。
   */
  body_generation_history?: BodyGenerationHistoryEntry[];
  draft?: ContentDraft;
  review?: GrowthReview;
  learning_trace?: GrowthLearningTrace;
  created_at: string;
  updated_at: string;
}

export interface BodyGenerationHistoryEntry {
  draft_id: string;
  topic_id?: string;
  method_id: TitleMethodId;
  title: string;
  title_promise: string;
  body_version: "short" | "long";
  body: string;
  body_fingerprint: string;
  created_at: string;
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
  /** 仅供操作者查看的正文证据层；复制和发布始终读取纯净 body。 */
  validation_report?: DraftValidationReport;
  /** v3.4 正文交付合同：生成、修复和标注共享同一份结构化依据。 */
  delivery_contract?: DraftDeliveryContract;
  certification_status?: DraftCertificationStatus;
  certified_at?: string;
  repair_history?: DraftRepairRecord[];
  fallback_used?: boolean;
  incident_id?: string;
  /** v3.5 正文生成管线诊断，仅供系统排障，不进入复制或发布内容。 */
  generation_pipeline_version?: "v3_5";
  generation_diagnostics?: {
    initial_missing_fields: string[];
    normalization_actions: string[];
    final_status: "certified" | "failed";
    total_duration_ms: number;
  };
  /** v3.2兼容元数据：旧记录只做读取适配，不自动回写。 */
  schema_version?: GrowthSchemaVersion;
  method_attribution_status?: MethodAttributionStatus;
  legacy_direction?: GrowthDirection;
  legacy_content_type?: ContentType;
  eligible_for_method_learning?: boolean;
  /** 内容用途由账号人设决定；内部培训模拟不得进入正式发布与方法学习。 */
  content_use_mode?: "production" | "internal_training";
  publish_eligible?: boolean;
  publish_block_reason?: string;
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
  /** 官方Excel修正发布状态/时间时保留原值，避免静默覆盖。 */
  publication_history?: Array<{
    previous_status: ContentStatus;
    previous_published_at?: string;
    official_published_at: string;
    source: "official_excel";
    corrected_at: string;
  }>;
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

export interface GrowthReviewSnapshot {
  id: string;
  review_window: GrowthReviewWindow;
  metrics: GrowthReviewMetrics;
  input_source: ReviewInputSource;
  captured_at: string;
  supersedes_snapshot_id?: string;
  metric_confirmation_status?: Partial<Record<keyof GrowthReviewMetrics, MetricConfirmationStatus>>;
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
  /** v3.3 复盘中心：旧字段 metrics 继续提供最新合并视图，快照永久保留。 */
  snapshots?: GrowthReviewSnapshot[];
  content_reviewed_at?: string;
  business_reviewed_at?: string;
  attribution_reviewed_at?: string;
  business_metrics_status?: MetricConfirmationStatus;
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
  confidence?: "display_only" | "trend" | "decision_ready";
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

export interface GrowthCycleExperiment {
  id: string;
  account_id: string;
  period_id: string;
  target_user: string;
  method_id?: TitleMethodId;
  method_label?: string;
  generation_mode?: MethodGenerationMode;
  hypothesis: string;
  experiment_variable: GrowthExperimentVariable;
  expected_signal: string;
  stop_condition: string;
  evidence_review_ids: string[];
  status: "pending" | "confirmed" | "rejected" | "applied";
  created_at: string;
  resolved_at?: string;
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
  period_id?: string;
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
  experiment_card?: GrowthCycleExperiment;
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
  /** 两条业务母定位独立保存；旧设置没有该字段时使用系统默认值。 */
  business_positions?: Partial<Record<GrowthBusinessLine, GrowthBusinessPosition>>;
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
