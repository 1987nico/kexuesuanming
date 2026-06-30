import type { DeepReportShape, LiteReportShape } from "@/lib/reports/reportShapes";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

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

function SimpleList({ items }: { items: unknown }) {
  if (!Array.isArray(items)) return <TextBlock value={items} />;
  return (
    <ul className="report-pill-list">
      {items.map((item, index) => (
        <li key={index}>
          <TextBlock value={item} />
        </li>
      ))}
    </ul>
  );
}

function LiteCover({ value }: { value: unknown }) {
  const data = asRecord(value);
  return (
    <div className="lite-cover">
      <div>
        <div className="lite-cover-kicker">职场参谋｜初步诊断报告</div>
        <h1>{String(data.title || "职场参谋｜初步诊断报告")}</h1>
        <p>{String(data.subtitle || "基于方向输入、价值观双三圈与天赋测评的初步判断")}</p>
      </div>
      <div className="lite-cover-meta">
        <div>客户：{String(data.customer_name || "未填写")}</div>
        <div>交付日期：{String(data.delivery_date || "")}</div>
      </div>
      <div className="lite-cover-conclusion">{String(data.conclusion || "")}</div>
      <SimpleList items={data.badges} />
    </div>
  );
}

function LiteCoreDiagnosis({ value }: { value: unknown }) {
  const data = asRecord(value);
  return (
    <div className="lite-diagnosis-grid">
      {[
        ["主判断", data.main_judgement],
        ["初步方向", data.initial_direction],
        ["最大风险", data.biggest_risk],
        ["下一步动作", data.next_action],
      ].map(([label, content]) => (
        <div key={String(label)} className="lite-diagnosis-card">
          <div className="lite-label">{String(label)}</div>
          <p>{String(content || "")}</p>
        </div>
      ))}
    </div>
  );
}

function LiteValueProfile({ value }: { value: unknown }) {
  const data = asRecord(value);
  return (
    <div className="lite-two-column">
      <div className="lite-circle-card">
        <div className="lite-label">喜欢区</div>
        <SimpleList items={data.liked_values} />
        <p>{String(data.like_summary || "")}</p>
      </div>
      <div className="lite-circle-card lite-circle-muted">
        <div className="lite-label">排除带</div>
        <SimpleList items={data.excluded_values} />
        <p>{String(data.exclude_summary || "")}</p>
      </div>
      <div className="lite-wide-card">
        <div className="lite-label">方向筛选句</div>
        <p>{String(data.filter_sentence || "")}</p>
      </div>
    </div>
  );
}

function LiteTalentArchetype({ value }: { value: unknown }) {
  const data = asRecord(value);
  return (
    <div className="lite-two-column">
      <div className="lite-wide-card">
        <div className="lite-label">天赋原型判断</div>
        <SimpleList items={data.top_archetypes} />
      </div>
      <div className="lite-wide-card">
        <div className="lite-label">三个关键人格信号</div>
        <SimpleList items={data.three_signals} />
      </div>
      <div className="lite-wide-card">
        <div className="lite-label">职业翻译</div>
        <p>{String(data.career_translation || "")}</p>
      </div>
      <div className="lite-wide-card lite-muted-text">
        <div className="lite-label">数据模式</div>
        <TextBlock value={{ mode: data.mode, evidence: data.evidence }} />
      </div>
    </div>
  );
}

function LiteTraitTable({ value }: { value: unknown }) {
  const data = asRecord(value);
  const traits = Array.isArray(data.key_traits) ? data.key_traits : [];
  return (
    <div>
      <div className="lite-three-cards">
        <div>
          <div className="lite-label">思考方式</div>
          <TextBlock value={data.thinking} />
        </div>
        <div>
          <div className="lite-label">人际方式</div>
          <TextBlock value={data.interpersonal} />
        </div>
        <div>
          <div className="lite-label">自我驱动</div>
          <TextBlock value={data.self_drive} />
        </div>
      </div>
      <table className="lite-trait-table">
        <thead>
          <tr>
            <th>特质</th>
            <th>百分位</th>
            <th>区间</th>
            <th>职业解释</th>
          </tr>
        </thead>
        <tbody>
          {traits.map((trait: any, index) => (
            <tr key={trait.key || index}>
              <td>{trait.name || trait.key}</td>
              <td>{trait.percentile ?? "-"}</td>
              <td>{trait.band || "-"}</td>
              <td>{trait.explanation || (Number(trait.percentile) >= 60 ? "适合在合适场景中主动使用。" : "需要流程、搭档或工具补偿。")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiteRiskCompensation({ value }: { value: unknown }) {
  const data = asRecord(value);
  return (
    <div className="lite-two-column">
      <div className="lite-circle-card">
        <div className="lite-label">最强优势</div>
        <SimpleList items={data.strongest} />
      </div>
      <div className="lite-circle-card lite-circle-muted">
        <div className="lite-label">最需补偿</div>
        <SimpleList items={data.needs_compensation} />
      </div>
      <div className="lite-wide-card">
        <div className="lite-label">补偿系统</div>
        <SimpleList items={data.system} />
      </div>
    </div>
  );
}

function LiteDataAppendix({ value }: { value: unknown }) {
  const data = asRecord(value);
  return (
    <div>
      <div className="lite-wide-card">
        <div className="lite-label">数据完整性</div>
        <p>{String(data.data_integrity || "")}</p>
      </div>
      <div className="lite-distribution">
        {Object.entries(asRecord(data.answer_distribution)).map(([score, count]) => (
          <div key={score}>
            <strong>{score}分</strong>
            <span>{String(count)}题</span>
          </div>
        ))}
      </div>
      <div className="lite-wide-card lite-muted-text">
        <div className="lite-label">同步证据</div>
        <TextBlock value={data.evidence} />
      </div>
    </div>
  );
}

function LiteGenericSection({ value }: { value: unknown }) {
  return <TextBlock value={value} />;
}

function LiteSectionBody({ sectionKey, value }: { sectionKey: keyof LiteReportShape["sections"]; value: unknown }) {
  if (sectionKey === "cover") return <LiteCover value={value} />;
  if (sectionKey === "core_diagnosis") return <LiteCoreDiagnosis value={value} />;
  if (sectionKey === "value_profile") return <LiteValueProfile value={value} />;
  if (sectionKey === "talent_archetype") return <LiteTalentArchetype value={value} />;
  if (sectionKey === "work_behavior") return <LiteTraitTable value={value} />;
  if (sectionKey === "risk_compensation") return <LiteRiskCompensation value={value} />;
  if (sectionKey === "data_appendix") return <LiteDataAppendix value={value} />;
  return <LiteGenericSection value={value} />;
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
            <LiteSectionBody sectionKey={key} value={value} />
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
