import type { AssessmentProfile } from "@/lib/reports/assessmentProfile";
import { buildDeepReport, buildLiteCustomerInput } from "@/lib/reports/builders";
import type { DeepReportGenerated } from "@/lib/reports/deepReport";
import type { DeepReportShape } from "@/lib/reports/reportShapes";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) return value.map((item) => str(item)).filter(Boolean).join("；");
  return String(value);
}

function formatDateCN(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;
}

function Page({ no, title, intro, children }: { no: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="dr-page">
      <div className="dr-toprule" />
      <h2 className="dr-section-title">{`${no} · ${title}`}</h2>
      {intro && <p className="dr-intro">{intro}</p>}
      {children}
      <div className="dr-footer">
        <span>职业 / 事业方向科学算命咨询报告 | 保密交付</span>
        <span>{no.padStart(2, "0")}</span>
      </div>
    </section>
  );
}

function IOBlock({ label, body }: { label: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <div className="dr-io-block">
      <div className="dr-io-label">{label}</div>
      <div className="dr-io-body">{body}</div>
    </div>
  );
}

function StepNarrative({
  narratives,
  step,
  fallbackInput,
}: {
  narratives?: DeepReportGenerated["step_narratives"];
  step: keyof NonNullable<DeepReportGenerated["step_narratives"]>;
  fallbackInput?: string;
}) {
  const block = narratives?.[step];
  return (
    <>
      <IOBlock label="输入" body={str(block?.输入, fallbackInput ?? "")} />
      <IOBlock label="推理" body={str(block?.推理)} />
      <IOBlock label="输出" body={str(block?.输出)} />
    </>
  );
}

function DirectionCards({ items }: { items: Array<Record<string, unknown>> }) {
  if (!items.length) return <p className="dr-note">方向内容待生成。</p>;
  return (
    <>
      {items.map((item, i) => {
        const title = str(item["方向"] || item["name"] || `方向 ${i + 1}`);
        const rows = Object.entries(item).filter(([k]) => k !== "方向" && k !== "name");
        return (
          <div key={i} className="dr-direction-card">
            <div className="dr-direction-title">{title}</div>
            {rows.map(([key, value]) => (
              <div key={key} className="dr-direction-row">
                <span className="dr-direction-key">{key}</span>
                <span>{str(value)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function chunkRows<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function isScoreLike(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  return /^[-+]?\d+(\.\d+)?$/.test(value.trim());
}

function deriveMarketOverviewRows(
  overviewRows: Array<Record<string, unknown>>,
  marketRows: Array<Record<string, unknown>>
) {
  if (overviewRows.length) return overviewRows;
  const scoreKeys = ["五力现状", "五力未来", "Δ", "机会现状", "机会未来", "合计"];
  return marketRows
    .map((row, i) => {
      if (!scoreKeys.some((key) => isScoreLike(row[key]))) return null;
      return {
        序号: row["序号"] ?? i + 1,
        方向: row["方向"] ?? row["name"] ?? row["direction"] ?? `方向 ${i + 1}`,
        五力现状: row["五力现状"],
        五力未来: row["五力未来"],
        Δ: row["Δ"] ?? row["delta"],
        机会现状: row["机会现状"],
        机会未来: row["机会未来"],
        合计: row["合计"],
        Step4判断: row["Step4判断"] ?? row["Step4处理方式"] ?? row["判断"],
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function DataTable({
  rows,
  columns,
  className,
}: {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  className?: string;
}) {
  if (!rows.length) return null;
  const cols = columns.length ? columns : Object.keys(rows[0] ?? {});
  return (
    <table className={["dr-table", className].filter(Boolean).join(" ")}>
      <thead>
        <tr>
          {cols.map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {cols.map((col) => (
              <td key={col}>{str(row[col])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const marketOverviewColumns = ["序号", "方向", "五力现状", "五力未来", "Δ", "机会现状", "机会未来", "合计", "Step4判断"];

function MarketMethodBlock() {
  return (
    <div className="dr-method-box">
      <p>
        P/E/S/T 分别看政策监管、经济环境、社会趋势和技术变化，再修正波特五力的现状威胁与未来威胁。
      </p>
      <p>
        五力威胁分为 0-100，越高越不利；Δ = 五力未来 - 五力现状。机会分为 0-10，合计用于判断是否进入下一步。
      </p>
    </div>
  );
}

function MarketOverviewTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return <DataTable rows={rows} columns={marketOverviewColumns} className="dr-market-overview" />;
}

function CoverConclusion({ conclusion }: { conclusion: Record<string, unknown> }) {
  const items = [
    conclusion["主线"] ? `主线：${conclusion["主线"]}` : null,
    conclusion["第一切口"] ? `第一切口：${conclusion["第一切口"]}` : null,
    conclusion["暗线"] ? `暗线小 MVP：${conclusion["暗线"]}` : null,
    conclusion["行动方式"] ? `行动方式：${conclusion["行动方式"]}` : null,
  ].filter(Boolean);

  if (items.length) {
    return (
      <ol>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    );
  }
  return <p>{str(conclusion["最终建议"] || conclusion["一句话结论"], "报告结论待生成。")}</p>;
}

export function DeepConsultationReport({
  profile,
  generated,
}: {
  profile: AssessmentProfile;
  generated: DeepReportGenerated;
}) {
  const report: DeepReportShape = buildDeepReport(profile, generated);
  const s = report.sections;
  const name = profile.customer_name;
  const input = buildLiteCustomerInput(profile);
  const vp = profile.value_profile;
  const conclusion = asRecord(s.conclusion_first);
  const narratives = generated.step_narratives;
  const images = generated.images ?? {};

  const step1FallbackInput = [
    `价值观 Top：${vp.liked_values.join("、")}`,
    `低优先级价值观：${vp.excluded_values.join("、")}`,
    `当前关键问题：${input.current_decision}，${input.stuck_point}`,
    `感兴趣方向：${input.desired_direction}`,
    `明确不碰：${input.avoid_direction}`,
  ].join("\n");

  const finalRec = asRecord(s.final_recommendations);
  const ninetyPlan = asRecord(s.ninety_day_plan);
  const step3 = asRecord(s.step3_sensory_validation);
  const sensoryTable = asArray(step3["方向处理表"] ?? generated.sensory_table);
  const step4Market = asRecord(s.step4_market_analysis);
  const marketRows = asArray(step4Market["各方向市场判断"] ?? generated.market);
  const marketOverviewRows = deriveMarketOverviewRows(asArray(step4Market["市场总览"] ?? generated.market_overview), marketRows);
  const marketOverviewChunks = chunkRows(marketOverviewRows, 6);
  const marketDetailChunks = chunkRows(marketRows, 3);
  const vrinRows = asArray(asRecord(s.step5_vrin)["各方向胜算"] ?? generated.vrin);
  const premortemRows = asArray(asRecord(s.step6_premortem)["各方向验尸"] ?? generated.premortem);

  const vrinColumns = ["方向", "价值V", "稀缺R", "难模仿I", "难替代N", "VRIN总分", "综合分", "凭证", "盲点"];

  return (
    <div className="dr-doc">
      {/* 蓝色封皮 + 0. 报告结论先行 */}
      <section className="dr-page dr-cover">
        <div className="dr-cover-kicker">职业 / 事业方向 · 科学算命咨询报告</div>
        <h1 className="dr-cover-title">
          {name} · 职业 / 事业方向
          <br />
          科学算命咨询报告
        </h1>
        <div className="dr-cover-sub">价值观双三圈 · PrinciplesYou 天赋测评 · 六步决策漏斗 · 方向感性验证</div>
        <div className="dr-cover-section-label">0. 报告结论先行</div>
        <div className="dr-cover-conclusion">
          {conclusion["一句话结论"] ? (
            <p style={{ marginBottom: 12, fontWeight: 600 }}>{str(conclusion["一句话结论"])}</p>
          ) : null}
          <CoverConclusion conclusion={conclusion} />
        </div>
        <div className="dr-cover-meta">
          <div>客户：{name}</div>
          <div>交付日期：{formatDateCN(generated.generated_at)}</div>
          <div>复用底稿编号：{profile.id}</div>
        </div>
        <div className="dr-cover-footer">
          <span>保密交付</span>
          <span>01</span>
        </div>
      </section>

      {/* 1. 方法论 */}
      <Page no="01" title="方法论：这份报告如何得出结论">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="dr-figure" src="/report-assets/decision-funnel.png" alt="科学算命 · 职业/事业决策漏斗" />
        <IOBlock
          label="输入"
          body={
            Array.isArray(asRecord(s.methodology)["输入"])
              ? (asRecord(s.methodology)["输入"] as unknown[]).map((x) => `• ${str(x)}`).join("\n")
              : "问卷、价值观双三圈、PrinciplesYou、方向感性验证、外部市场事实。"
          }
        />
        <IOBlock
          label="推理"
          body="本报告按漏斗顺序判断：Step1 喜欢区 → Step2 方向发散 → Step3 感性验证 → Step4 市场分析 → Step5 VRIN 资源验证 → Step6 失败验尸。"
        />
        <IOBlock label="输出" body={str(asRecord(s.methodology)["输出"], "主线、切口、暗线、止损线和 90 天验证实验。")} />
      </Page>

      {/* 2. Step1 */}
      <Page no="02" title="Step1：喜欢区与个人画像">
        <StepNarrative narratives={narratives} step="step1" fallbackInput={step1FallbackInput} />
        <div className="dr-grid-2" style={{ marginTop: 12 }}>
          <div className="dr-card dr-card-blue">
            <h3>喜欢区</h3>
            <ul className="dr-bullets">
              {vp.liked_values.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
            <p style={{ marginTop: 8 }}>{vp.like_summary}</p>
          </div>
          <div className="dr-card">
            <h3>排除带</h3>
            <ul className="dr-bullets">
              {vp.excluded_values.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
            <p style={{ marginTop: 8 }}>{vp.exclude_summary}</p>
          </div>
        </div>
        <div className="dr-card" style={{ marginTop: 14 }}>
          <h3>筛选句</h3>
          <p>{vp.filter_sentence}</p>
        </div>
      </Page>

      {/* 3. Step2 */}
      <Page no="03" title="Step2：方向发散">
        <StepNarrative narratives={narratives} step="step2" />
        <DirectionCards items={asArray(asRecord(s.step2_direction_expansion)["候选方向"] ?? generated.directions)} />
      </Page>

      {/* 4. Step3 */}
      <Page no="04" title="Step3：感性验证">
        <StepNarrative narratives={narratives} step="step3" />
        <div className="dr-note">{str(step3["数据来源"])}</div>
        {step3["说明"] ? <p className="dr-io-body">{str(step3["说明"])}</p> : null}
        {Array.isArray(step3["聚类主题"]) && (step3["聚类主题"] as unknown[]).length ? (
          <div className="dr-card dr-card-blue">
            <h3>聚类主题</h3>
            <ul className="dr-bullets">
              {(step3["聚类主题"] as unknown[]).map((t, i) => (
                <li key={i}>{str(t)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {images.bright_zone ? <img className="dr-figure" src={images.bright_zone} alt="感性验证亮区聚类图" /> : null}
        <DataTable
          rows={sensoryTable}
          columns={["序号", "方向", "来源", "Step4处理方式", "备注"]}
        />
      </Page>

      {/* 5. Step4 */}
      <Page no="05" title="Step4：市场分析">
        <StepNarrative narratives={narratives} step="step4" />
        <div className="dr-note">{str(step4Market["免责声明"] ?? generated.market_disclaimer)}</div>
        <MarketMethodBlock />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {images.market ? <img className="dr-figure" src={images.market} alt="市场验证矩阵" /> : null}
        {marketOverviewChunks[0]?.length ? <MarketOverviewTable rows={marketOverviewChunks[0]} /> : <DirectionCards items={marketRows} />}
      </Page>

      {marketOverviewChunks.slice(1).map((rows, i) => (
        <Page key={`market-overview-${i}`} no={`05-${i + 2}`} title="Step4：市场总览续表">
          <MarketOverviewTable rows={rows} />
        </Page>
      ))}

      {marketOverviewRows.length
        ? marketDetailChunks.map((rows, i) => (
            <Page key={`market-detail-${i}`} no={`05-${marketOverviewChunks.length + i + 1}`} title={i ? "Step4：各方向市场判断（续）" : "Step4：各方向市场判断"}>
              <DirectionCards items={rows} />
            </Page>
          ))
        : null}

      {/* 6. Step5 */}
      <Page no="06" title="Step5：资源验证">
        <StepNarrative narratives={narratives} step="step5" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {images.matrix ? <img className="dr-figure" src={images.matrix} alt="机会大小 × 个人胜算矩阵" /> : null}
        <DataTable rows={vrinRows} columns={vrinColumns} />
      </Page>

      {/* 7. Step6 */}
      <Page no="07" title="Step6：失败验尸">
        <StepNarrative narratives={narratives} step="step6" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {images.fishbone ? <img className="dr-figure" src={images.fishbone} alt="失败验尸鱼骨图" /> : null}
        {premortemRows.map((row, i) => (
          <div key={i} className="dr-card dr-card-rust">
            <h3>{str(row["方向"] || `Top ${i + 1}`)}</h3>
            <p>{str(row["12个月怎么输"] || row["失败剧本"])}</p>
            {Array.isArray(row["早期预警信号"]) ? (
              <ul className="dr-bullets">
                {(row["早期预警信号"] as unknown[]).map((sig, j) => (
                  <li key={j}>{str(sig)}</li>
                ))}
              </ul>
            ) : null}
            <p style={{ marginTop: 8 }}>
              <strong>止损线：</strong>
              {str(row["止损线"])}
            </p>
          </div>
        ))}
      </Page>

      {/* 8. 最终推荐 */}
      <Page no="08" title="最终推荐方案">
        {(["推荐1主线", "推荐2第一切口", "推荐3暗线"] as const).map((key) => {
          const block = asRecord(finalRec[key]);
          if (!Object.keys(block).length && !finalRec[key.replace(/推荐\d/, "")]) return null;
          const direction = str(block["方向"] || finalRec[key === "推荐1主线" ? "主线" : key === "推荐2第一切口" ? "切口" : "暗线"]);
          const logic = str(block["推荐逻辑"]);
          const labels: Record<string, string> = {
            推荐1主线: "推荐 1：最终主线",
            推荐2第一切口: "推荐 2：第一切口",
            推荐3暗线: "推荐 3：暗线小 MVP",
          };
          if (!direction && !logic) return null;
          return (
            <div key={key} className="dr-rec-block">
              <h3>{labels[key]}</h3>
              {direction ? <p>{direction}</p> : null}
              {logic ? <p style={{ marginTop: 8, color: "#6f7886" }}>{logic}</p> : null}
            </div>
          );
        })}
        {finalRec["与小报告的关系"] ? (
          <div className="dr-card">
            <h3>与小报告的关系</h3>
            <p>{str(finalRec["与小报告的关系"])}</p>
          </div>
        ) : null}
      </Page>

      {/* 9. 90 天验证计划 */}
      <Page no="09" title="90 天验证计划">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {images.roadmap ? <img className="dr-figure" src={images.roadmap} alt="90 天验证路线图" /> : null}
        <DataTable
          rows={(["Day0-30", "Day30-60", "Day60-90"] as const)
            .map((phase) => {
              const block = asRecord(ninetyPlan[phase]);
              if (!Object.keys(block).length) {
                const flat = str(ninetyPlan[phase === "Day0-30" ? "第0到30天" : phase === "Day30-60" ? "第30到60天" : "第60到90天"]);
                return flat ? { 阶段: phase, 内容: flat } : null;
              }
              return { 阶段: phase, ...block };
            })
            .filter(Boolean) as Array<Record<string, unknown>>}
          columns={["阶段", "主线", "切口", "暗线", "继续条件", "内容"]}
        />
        {ninetyPlan["止损线"] ? (
          <div className="dr-card dr-card-rust" style={{ marginTop: 14 }}>
            <h3>止损线</h3>
            <p>{str(ninetyPlan["止损线"])}</p>
          </div>
        ) : null}
      </Page>

      {/* 10. 最后判断 */}
      <Page no="10" title={`给${name}的最后判断`}>
        <div className="dr-card dr-card-blue">
          <p style={{ fontSize: 14, lineHeight: 1.85 }}>{str(asRecord(s.final_judgement)["判断"], "报告判断待生成。")}</p>
        </div>
        <div className="dr-note" style={{ marginTop: "auto" }}>
          本报告基于{name}填写的方向题、价值观题、天赋测评与方向感性验证生成，用于职业与事业方向决策参考。市场数据需人工核实后再作投资依据。报告不替代心理测评诊断、雇佣决策、医学、法律或财务建议。
        </div>
      </Page>
    </div>
  );
}
