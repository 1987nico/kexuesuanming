import type { DeepDiagramKey } from "@/lib/reports/deepReport";
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

function DeepPage({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="report-page report-page-deep">
      <div className="report-header">职业 / 事业方向科学算命咨询报告 · {no}</div>
      <h1 className="report-title">{title}</h1>
      <div className="report-section-body">{children}</div>
      <div className="report-footer">科学算命咨询报告 | 保密交付</div>
    </section>
  );
}

function DeepKV({ data, skip = [] }: { data: Record<string, unknown>; skip?: string[] }) {
  const entries = Object.entries(data).filter(([key]) => !skip.includes(key));
  return (
    <div className="deep-kv">
      {entries.map(([key, value]) => (
        <div key={key} className="deep-kv-row">
          <div className="deep-kv-key">{key}</div>
          <div className="deep-kv-value">
            <TextBlock value={value} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DeepCards({ items }: { items: unknown }) {
  const arr = Array.isArray(items) ? items : [];
  return (
    <div className="deep-cards">
      {arr.map((item, index) => {
        const record = asRecord(item);
        const titleKey = ["方向", "name", "标题"].find((k) => record[k] !== undefined);
        const title = titleKey ? String(record[titleKey]) : `${index + 1}`;
        const rows = Object.entries(record).filter(([key]) => key !== titleKey);
        return (
          <div key={index} className="deep-card">
            <div className="deep-card-title">{title}</div>
            {rows.map(([key, value]) => (
              <div key={key} className="deep-card-row">
                <span className="deep-card-key">{key}</span>
                <span className="deep-card-value">
                  <TextBlock value={value} />
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DeepFigure({ src, alt }: { src?: string; alt: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="deep-figure deep-figure-wide" src={src} alt={alt} />;
}

export function DeepReportView({
  report,
  customerName,
  deliveryDate,
  images,
}: {
  report: DeepReportShape;
  customerName?: string;
  deliveryDate?: string;
  images?: Partial<Record<DeepDiagramKey, string>>;
}) {
  const s = report.sections as Record<string, unknown>;
  const img = images ?? {};
  const conclusion = asRecord(s.conclusion_first);
  const step2 = asRecord(s.step2_direction_expansion);
  const step4 = asRecord(s.step4_market_analysis);
  const step5 = asRecord(s.step5_vrin);
  const step6 = asRecord(s.step6_premortem);

  return (
    <article className="report-document report-document-deep">
      {/* 封面 */}
      <section className="report-page report-page-deep deep-cover">
        <div>
          <div className="deep-cover-kicker">职业 / 事业方向 · 科学算命咨询报告</div>
          <h1 className="deep-cover-title">科学算命咨询报告</h1>
          <p className="deep-cover-sub">价值观双三圈 · PrinciplesYou 天赋测评 · 六步决策漏斗</p>
        </div>
        <div className="deep-cover-conclusion">
          <div className="lite-label">一句话结论</div>
          <p className="deep-cover-lead">{String(conclusion["一句话结论"] ?? "报告结论待生成。")}</p>
          {conclusion["最终建议"] ? (
            <>
              <div className="lite-label deep-cover-sublabel">最终建议</div>
              <p>{String(conclusion["最终建议"])}</p>
            </>
          ) : null}
        </div>
        <div className="deep-cover-meta">
          <div>客户：{customerName || "—"}</div>
          <div>交付日期：{deliveryDate || ""}</div>
          <div>复用底稿编号：{String(conclusion["复用底稿编号"] ?? "")}</div>
        </div>
      </section>

      {/* 1 方法论 + 决策漏斗图 */}
      <DeepPage no="01" title={deepTitles.methodology}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="deep-figure" src="/report-assets/decision-funnel.png" alt="科学算命 · 职业/事业决策漏斗" />
        <DeepKV data={asRecord(s.methodology)} />
      </DeepPage>

      {/* 2 Step1 价值观 */}
      <DeepPage no="02" title={deepTitles.step1_value_profile}>
        <DeepKV data={asRecord(s.step1_value_profile)} />
      </DeepPage>

      {/* 3 Step2 方向发散 */}
      <DeepPage no="03" title={deepTitles.step2_direction_expansion}>
        {step2["规则"] ? <p className="deep-note">{String(step2["规则"])}</p> : null}
        {step2["候选方向"] ? <DeepCards items={step2["候选方向"]} /> : <TextBlock value={s.step2_direction_expansion} />}
      </DeepPage>

      {/* 4 Step3 感性验证 */}
      <DeepPage no="04" title={deepTitles.step3_sensory_validation}>
        <DeepFigure src={img.bright_zone} alt="感性验证亮区聚类图" />
        <DeepKV data={asRecord(s.step3_sensory_validation)} />
      </DeepPage>

      {/* 5 Step4 市场分析 */}
      <DeepPage no="05" title={deepTitles.step4_market_analysis}>
        <DeepFigure src={img.market} alt="市场验证矩阵" />
        {step4["免责声明"] ? <p className="deep-note">{String(step4["免责声明"])}</p> : null}
        {step4["各方向市场判断"] ? (
          <DeepCards items={step4["各方向市场判断"]} />
        ) : (
          <TextBlock value={s.step4_market_analysis} />
        )}
      </DeepPage>

      {/* 6 Step5 VRIN */}
      <DeepPage no="06" title={deepTitles.step5_vrin}>
        <DeepFigure src={img.matrix} alt="机会大小 × 个人胜算矩阵" />
        {step5["说明"] ? <p className="deep-note">{String(step5["说明"])}</p> : null}
        {step5["可复用天赋"] ? (
          <div className="deep-inline-tags">
            <span className="deep-card-key">可复用天赋</span>
            <SimpleList items={step5["可复用天赋"]} />
          </div>
        ) : null}
        {step5["各方向胜算"] ? <DeepCards items={step5["各方向胜算"]} /> : <TextBlock value={s.step5_vrin} />}
      </DeepPage>

      {/* 7 Step6 失败验尸 */}
      <DeepPage no="07" title={deepTitles.step6_premortem}>
        <DeepFigure src={img.fishbone} alt="失败验尸鱼骨图" />
        {step6["说明"] ? <p className="deep-note">{String(step6["说明"])}</p> : null}
        {step6["各方向验尸"] ? <DeepCards items={step6["各方向验尸"]} /> : <TextBlock value={s.step6_premortem} />}
      </DeepPage>

      {/* 8 最终推荐 */}
      <DeepPage no="08" title={deepTitles.final_recommendations}>
        <DeepKV data={asRecord(s.final_recommendations)} />
      </DeepPage>

      {/* 9 90天计划 */}
      <DeepPage no="09" title={deepTitles.ninety_day_plan}>
        <DeepFigure src={img.roadmap} alt="90 天验证路线图" />
        <DeepKV data={asRecord(s.ninety_day_plan)} />
      </DeepPage>

      {/* 10 最后判断 */}
      <DeepPage no="10" title={deepTitles.final_judgement}>
        <DeepKV data={asRecord(s.final_judgement)} />
      </DeepPage>
    </article>
  );
}
