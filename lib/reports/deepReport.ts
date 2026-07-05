// 大报告由豆包生成的六步内容（结构宽松，内部用中文键，便于报告直接渲染）。
// 代码只需要按 section 读取/校验，不逐字段访问内部中文键。
export interface DeepReportGenerated {
  generated_at: string;
  provider?: string;
  model?: string;
  // 市场分析统一免责声明：LLM 生成、需人工核实外部事实
  market_disclaimer: string;
  // 是否采用了客户真实感性打分（否则为 LLM 预判、待客户录入）
  sensory_from_input: boolean;

  conclusion_first: Record<string, unknown>;
  directions: Array<Record<string, unknown>>; // Step2 方向发散
  sensory: Record<string, unknown>; // Step3 感性验证
  // Step4 总览数值表：对齐年雪报告里的五力现状/未来、机会现状/未来与判断
  market_overview?: MarketOverviewRow[];
  market: Array<Record<string, unknown>>; // Step4 市场分析
  vrin: Array<Record<string, unknown>>; // Step5 资源验证 VRIN
  premortem: Array<Record<string, unknown>>; // Step6 失败验尸
  final_recommendations: Record<string, unknown>;
  ninety_day_plan: Record<string, unknown>;
  final_judgement: Record<string, unknown>;
  // 各 Step 的输入/推理/输出叙事（对齐年雪报告体例）
  step_narratives?: Partial<
    Record<
      "step1" | "step2" | "step3" | "step4" | "step5" | "step6",
      { 输入?: string; 推理?: string; 输出?: string }
    >
  >;
  // Step3 方向处理表（序号、来源、Step4 处理方式）
  sensory_table?: Array<Record<string, unknown>>;

  // 供图表使用的结构化数值（矩阵坐标、亮区分数等）
  diagram_data?: DeepDiagramData;
  // 生成好的图表（section key -> data URL），由 gpt-image-2 生成后回填
  images?: Partial<Record<DeepDiagramKey, string>>;
}

export interface MarketOverviewRow {
  序号?: number;
  方向: string;
  五力现状: number;
  五力未来: number;
  Δ: number;
  机会现状: number;
  机会未来: number;
  合计: number;
  Step4判断: string;
}

export type DeepDiagramKey = "matrix" | "bright_zone" | "market" | "fishbone" | "roadmap";

export interface DeepDiagramData {
  // Step5 机会×胜算矩阵：每个方向机会分/胜算分（各满分 16）
  matrix?: Array<{ direction: string; opportunity: number; win: number }>;
  // Step3 亮区聚类：每个方向的感性分（满分 10）
  bright_zone?: Array<{ direction: string; score: number }>;
  // Step4 市场矩阵：市场机会 / 竞争门槛（各满分 10）
  market_matrix?: Array<{ direction: string; opportunity: number; barrier: number }>;
}

// 可选：客户/顾问录入的真实感性打分
export interface SensoryScoreInput {
  direction: string;
  score: number; // 1-10
  reason?: string;
}
