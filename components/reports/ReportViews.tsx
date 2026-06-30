import type { DeepReportShape, LiteReportShape } from "@/lib/reports/reportShapes";

function TextBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-400">未填写</span>;
  if (typeof value === "string" || typeof value === "number") return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="report-list">
        {value.map((item, index) => (
          <li key={index}>
            <TextBlock value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="report-kv">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <div key={key} className="report-kv-row">
            <div className="report-kv-key">{key}</div>
            <div className="report-kv-value">
              <TextBlock value={item} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

const liteTitles: Record<keyof LiteReportShape["sections"], string> = {
  cover: "封面",
  core_diagnosis: "01 · 核心诊断结论",
  current_problem: "02 · 当前问题识别",
  value_profile: "03 · 价值观双三圈",
  talent_archetype: "04 · 天赋原型与优势信号",
  work_behavior: "05 · 工作场景中的行为模式",
  direction_suggestion: "06 · 初步方向建议",
  ninety_day_validation: "07 · 90 天验证框架",
  risk_compensation: "08 · 风险与补偿机制",
  diagnosis_boundary: "09 · 本次诊断边界",
  next_decision: "10 · 下一步决策怎么推进",
  data_appendix: "11 · 数据附录",
};

const deepTitles: Record<keyof DeepReportShape["sections"], string> = {
  conclusion_first: "0 · 报告结论先行",
  methodology: "1 · 方法论：这份报告如何得出结论",
  step1_value_profile: "2 · Step1：喜欢区与个人画像",
  step2_direction_expansion: "3 · Step2：方向发散",
  step3_sensory_validation: "4 · Step3：感性验证",
  step4_market_analysis: "5 · Step4：市场分析",
  step5_vrin: "6 · Step5：资源验证",
  step6_premortem: "7 · Step6：失败验尸",
  final_recommendations: "8 · 最终推荐方案",
  ninety_day_plan: "9 · 90 天验证计划",
  final_judgement: "10 · 给用户的最后判断",
};

export function LiteReportView({ report }: { report: LiteReportShape }) {
  const entries = Object.entries(report.sections) as Array<[keyof LiteReportShape["sections"], unknown]>;
  return (
    <article className="report-document report-document-lite">
      {entries.map(([key, value], index) => (
        <section key={key} className="report-page">
          <div className="report-header">职场参谋｜初步诊断报告｜保密交付 {String(index + 1).padStart(2, "0")}</div>
          <h1 className="report-title">{liteTitles[key]}</h1>
          <div className="report-section-body">
            <TextBlock value={value} />
          </div>
          <div className="report-footer">职场参谋 | 初步诊断报告 | 保密交付</div>
        </section>
      ))}
    </article>
  );
}

export function DeepReportView({ report }: { report: DeepReportShape }) {
  const entries = Object.entries(report.sections) as Array<[keyof DeepReportShape["sections"], unknown]>;
  return (
    <article className="report-document report-document-deep">
      {entries.map(([key, value], index) => (
        <section key={key} className="report-page report-page-deep">
          <div className="report-header">职业 / 事业方向科学算命咨询报告 {String(index + 1).padStart(2, "0")}</div>
          <h1 className="report-title">{deepTitles[key]}</h1>
          <div className="report-section-body">
            <TextBlock value={value} />
          </div>
          <div className="report-footer">科学算命咨询报告 | 保密交付</div>
        </section>
      ))}
    </article>
  );
}
