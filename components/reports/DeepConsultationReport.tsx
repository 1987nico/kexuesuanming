import type { AssessmentProfile } from "@/lib/reports/assessmentProfile";
import { buildLiteCustomerInput } from "@/lib/reports/builders";
import type { DeepReportGenerated } from "@/lib/reports/deepReport";

/**
 * 完整咨询报告渲染 —— 排版 1:1 对齐「年雪 · 职业/事业方向咨询报告」原版：
 * 白底文档流式（无页框/页脚/页码）、黑标题、蓝色列表序号、浅灰线表格（可跨页）、
 * 决策漏斗整页图、价值观双三圈图、入围项 PEST→五力明细米白大卡。
 */

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

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^[-+]?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** 数值一位小数显示（62 → 62.0），对齐原版表格 */
function fmt1(value: unknown): string {
  const n = num(value);
  return n === null ? str(value) : n.toFixed(1);
}

function fmtSigned(value: unknown): string {
  const s = str(value).trim();
  if (!s) return "";
  if (s.startsWith("+") || s.startsWith("-")) return /^\d+$/.test(s.slice(1)) ? `${s}.0` : s;
  const n = num(s);
  return n === null ? s : `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}

// ---------- 基础排版元件 ----------

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="dr-h2">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="dr-h3">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="dr-p">{children}</p>;
}

/** 多段文本：按空行拆自然段 */
function Paras({ text }: { text: string }) {
  const parts = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return (
    <>
      {parts.map((p, i) => (
        <P key={i}>{p}</P>
      ))}
    </>
  );
}

function UL({ items }: { items: React.ReactNode[] }) {
  const list = items.filter((x) => x !== null && x !== undefined && str(x) !== "");
  if (!list.length) return null;
  return (
    <ul className="dr-ul">
      {list.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function OL({ items }: { items: React.ReactNode[] }) {
  const list = items.filter((x) => x !== null && x !== undefined && str(x) !== "");
  if (!list.length) return null;
  return (
    <ol className="dr-ol">
      {list.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function Table({
  rows,
  columns,
  headers,
  format,
  className,
}: {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  headers?: Record<string, string>;
  format?: Record<string, (v: unknown) => string>;
  className?: string;
}) {
  if (!rows.length) return null;
  return (
    <table className={["dr-table", className].filter(Boolean).join(" ")}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col}>{headers?.[col] ?? col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((col) => (
              <td key={col}>{format?.[col] ? format[col](row[col]) : str(row[col])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 输入 / 推理 / 输出 三段（原版体例：加粗小标题 + 正文段落） */
function IO({
  block,
  fallbackInput,
  children,
}: {
  block?: { 输入?: string; 推理?: string; 输出?: string };
  fallbackInput?: string;
  children?: React.ReactNode; // 插在「输出」标题之后、输出正文之前（如表格前说明）
}) {
  const input = str(block?.输入, fallbackInput ?? "");
  return (
    <>
      {input ? (
        <>
          <H3>输入</H3>
          <Paras text={input} />
        </>
      ) : null}
      {str(block?.推理) ? (
        <>
          <H3>推理</H3>
          <Paras text={str(block?.推理)} />
        </>
      ) : null}
      <H3>输出</H3>
      {str(block?.输出) ? <Paras text={str(block?.输出)} /> : null}
      {children}
    </>
  );
}

// ---------- 整页图：职业 / 事业决策漏斗（对齐原版第 2 页） ----------

function DecisionFunnelFigure() {
  const stages = [
    { no: "1", title: "输入：", sub: "问卷 + PrinciplesYou", fill: "#e8f2fc", stroke: "#b8d4f0" },
    { no: "2", title: "Step 1 价值观双三圈：", sub: "喜欢区 / 排除带", fill: "#e6f3ea", stroke: "#bcdcc6" },
    { no: "3", title: "Step 2 发散 N 个方向", sub: "只在喜欢区内发散", fill: "#fdf6dd", stroke: "#e8d9a0" },
    { no: "4", title: "Step 3 感性验证：", sub: "≥7 分进入下一步", fill: "#fdeedd", stroke: "#ecc9a0" },
    { no: "5", title: "Step 4 市场分析：", sub: "PEST + 波特五力", fill: "#efe9f9", stroke: "#cfc0e8" },
    { no: "6", title: "Step 5 个人胜算：", sub: "VRIN 收敛 Top 3", fill: "#e3edf9", stroke: "#b3cdec" },
    { no: "7", title: "Step 6 失败验尸：", sub: "风险倒推 + 止损线", fill: "#fbe5e2", stroke: "#eab8b0" },
    { no: "8", title: "90 天验证方案", sub: "", fill: "#0c2d5a", stroke: "#0c2d5a" },
  ];
  const sideLabels: Record<number, string> = { 2: "身体反应", 4: "外部市场", 5: "我擅长的", 6: "反向推演" };
  const boxH = 92;
  const gap = 30;
  const startY = 128;
  const width = 760;
  return (
    <div className="dr-funnel-block">
      <svg className="dr-funnel-svg" viewBox="0 0 760 1120" role="img" aria-label="职业 / 事业决策漏斗">
        <rect x="6" y="6" width={width - 12} height={1108} fill="#fdfcf8" stroke="#d9d2c2" strokeWidth="1.5" rx="6" />
        <text x={width / 2} y={62} textAnchor="middle" fontSize="30" fontWeight="700" fill="#0c2d5a" fontFamily="'Songti SC','Noto Serif CJK SC',serif">
          职业 / 事业决策漏斗
        </text>
        <line x1={width / 2 - 110} y1={84} x2={width / 2 + 110} y2={84} stroke="#c49a2e" strokeWidth="1.5" />
        <circle cx={width / 2} cy={84} r={4} fill="none" stroke="#c49a2e" strokeWidth="1.5" />
        {stages.map((s, i) => {
          const maxW = 560;
          const minW = 380;
          const w = maxW - ((maxW - minW) / (stages.length - 1)) * i;
          const x = (width - w) / 2;
          const y = startY + i * (boxH + gap);
          const dark = i === stages.length - 1;
          return (
            <g key={s.no}>
              <rect x={x} y={y} width={w} height={boxH} rx={12} fill={s.fill} stroke={s.stroke} strokeWidth="1.5" />
              <text x={x + 34} y={y + boxH / 2 + 12} fontSize="34" fontWeight="700" fill={dark ? "#ffffff" : "#c49a2e"}>
                {s.no}
              </text>
              <line x1={x + 72} y1={y + 18} x2={x + 72} y2={y + boxH - 18} stroke={dark ? "#ffffff55" : "#00000018"} strokeWidth="1" />
              {s.sub ? (
                <>
                  <text x={x + 92} y={y + boxH / 2 - 8} fontSize="19" fontWeight="700" fill={dark ? "#ffffff" : "#364150"}>
                    {s.title}
                  </text>
                  <text x={x + 92} y={y + boxH / 2 + 22} fontSize="16" fill={dark ? "#dce8f8" : "#6f7886"}>
                    {s.sub}
                  </text>
                </>
              ) : (
                <text x={x + 92} y={y + boxH / 2 + 7} fontSize="21" fontWeight="700" fill={dark ? "#ffffff" : "#364150"}>
                  {s.title}
                </text>
              )}
              {i < stages.length - 1 && (
                <g>
                  <line x1={width / 2} y1={y + boxH + 4} x2={width / 2} y2={y + boxH + gap - 10} stroke="#364150" strokeWidth="2.5" />
                  <path
                    d={`M ${width / 2 - 6} ${y + boxH + gap - 12} L ${width / 2 + 6} ${y + boxH + gap - 12} L ${width / 2} ${y + boxH + gap - 2} Z`}
                    fill="#364150"
                  />
                </g>
              )}
              {sideLabels[i] && (
                <g>
                  <rect x={28} y={y + boxH / 2 - 20} width={104} height={40} rx={8} fill="white" stroke="#c49a2e" strokeWidth="1.2" />
                  <text x={80} y={y + boxH / 2 + 6} textAnchor="middle" fontSize="17" fontWeight="600" fill="#364150">
                    {sideLabels[i]}
                  </text>
                  <line x1={132} y1={y + boxH / 2} x2={x - 8} y2={y + boxH / 2} stroke="#c49a2e" strokeWidth="1.2" strokeDasharray="5 4" />
                  <path d={`M ${x - 10} ${y + boxH / 2 - 5} L ${x - 10} ${y + boxH / 2 + 5} L ${x - 1} ${y + boxH / 2} Z`} fill="#c49a2e" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- Step1 配图：价值观双三圈（对齐原版金框图） ----------

function ValueCirclesFigure({ profile }: { profile: AssessmentProfile }) {
  const vp = profile.value_profile;
  const liked = vp.liked_values.slice(0, 3);
  const excluded = vp.excluded_values.slice(0, 3);
  const W = 760;
  const H = 470;

  const wrap = (text: string, width: number): string[] => {
    const out: string[] = [];
    let rest = text;
    while (rest.length > width) {
      out.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    if (rest) out.push(rest);
    return out.slice(0, 4);
  };

  const circleTrio = (
    cx: number,
    cy: number,
    r: number,
    labels: string[],
    fill: string,
    stroke: string,
    centerTitle: string,
    centerText: string,
    centerColor: string
  ) => {
    const d = r * 0.62;
    const pos = [
      { x: cx, y: cy - d, lx: cx, ly: cy - d - r + 34 }, // 上
      { x: cx - d, y: cy + d * 0.72, lx: cx - d - r * 0.42, ly: cy + d * 0.72 + r - 22 }, // 左下
      { x: cx + d, y: cy + d * 0.72, lx: cx + d + r * 0.42, ly: cy + d * 0.72 + r - 22 }, // 右下
    ];
    const centerLines = wrap(centerText, 9);
    return (
      <g>
        {pos.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={r} fill={fill} fillOpacity={0.28} stroke={stroke} strokeWidth="1.4" />
        ))}
        {pos.map((p, i) =>
          labels[i] ? (
            <text key={`t${i}`} x={p.lx} y={p.ly} textAnchor="middle" fontSize="17" fontWeight="700" fill="#33302a" fontFamily="'Songti SC','Noto Serif CJK SC',serif">
              {labels[i]}
            </text>
          ) : null
        )}
        <text x={cx} y={cy + 2 - centerLines.length * 7} textAnchor="middle" fontSize="14" fontWeight="700" fill={centerColor} fontFamily="'Songti SC','Noto Serif CJK SC',serif">
          {centerTitle}
        </text>
        {centerLines.map((line, i) => (
          <text key={`c${i}`} x={cx} y={cy + 16 + i * 15 - centerLines.length * 7} textAnchor="middle" fontSize="11.5" fill="#5c5648">
            {line}
          </text>
        ))}
      </g>
    );
  };

  return (
    <div className="dr-figure-frame">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="价值观双三圈">
        <rect x="4" y="4" width={W - 8} height={H - 8} fill="#fffdf7" stroke="#c9b98a" strokeWidth="1.6" rx="4" />
        <rect x="14" y="14" width={W - 28} height={H - 28} fill="none" stroke="#e0d5b8" strokeWidth="0.8" rx="2" />
        <text x={W / 2} y={58} textAnchor="middle" fontSize="27" fontWeight="700" fill="#1c1a16" fontFamily="'Songti SC','Noto Serif CJK SC',serif">
          {profile.customer_name} · 价值观双三圈
        </text>
        <g>
          <line x1={W / 2 - 70} y1={78} x2={W / 2 + 70} y2={78} stroke="#c49a2e" strokeWidth="1" />
          <text x={W / 2} y={83} textAnchor="middle" fontSize="12" fill="#c49a2e">◇ ◇ ◇</text>
        </g>
        {circleTrio(200, 260, 92, liked, "#e8c87a", "#c9a24a", "喜欢区：", vp.like_summary, "#a67c1e")}
        {circleTrio(560, 260, 92, excluded, "#b9bec7", "#9aa1ac", "排除带：", vp.exclude_summary, "#5a6068")}
      </svg>
    </div>
  );
}

// ---------- Step4 入围项明细卡（对齐原版米白大卡） ----------

const FORCE_CHIP_CLASS: Record<string, string> = {
  行业竞争: "dr-fc-blue",
  潜在进入者: "dr-fc-purple",
  替代者: "dr-fc-red",
  供应商: "dr-fc-green",
  购买者: "dr-fc-gold",
};

function deltaTone(v: unknown): string {
  const n = num(str(v).replace("+", ""));
  if (n === null) return "";
  if (n > 0) return "dr-delta-bad";
  if (n < 0) return "dr-delta-good";
  return "dr-delta-flat";
}

/** 五力结构小图（节点：潜在进入者上、供应商左、行业竞争中、购买者右、替代者下） */
function ForcesMiniMap({ detail }: { detail: Array<Record<string, unknown>> }) {
  const byName = new Map(detail.map((d) => [str(d["力"]), d]));
  const node = (name: string, x: number, y: number, w: number, cls: string) => {
    const d = byName.get(name);
    const now = d ? fmt1(d["现状"]).replace(/\.0$/, "") : "-";
    const future = d ? fmt1(d["未来"]).replace(/\.0$/, "") : "-";
    const delta = d ? fmtSigned(str(d["Δ"] ?? "")).replace(/\.0$/, "") : "";
    return (
      <div className={`dr-fmap-node ${cls}`} style={{ left: x, top: y, width: w }}>
        <div className="dr-fmap-name">{name}</div>
        <div className="dr-fmap-val">{now} → {future}{delta ? `　Δ${delta}` : ""}</div>
      </div>
    );
  };
  return (
    <div className="dr-fmap">
      <div className="dr-fmap-title">五力结构</div>
      <div className="dr-fmap-sub">节点显示：现状威胁 → 未来威胁 与 Δ</div>
      <div className="dr-fmap-canvas">
        <div className="dr-fmap-line dr-fmap-line-v" style={{ left: "50%", top: 34, height: 40 }} />
        <div className="dr-fmap-line dr-fmap-line-v" style={{ left: "50%", top: 122, height: 40 }} />
        <div className="dr-fmap-line dr-fmap-line-h" style={{ top: 96, left: 78, width: 48 }} />
        <div className="dr-fmap-line dr-fmap-line-h" style={{ top: 96, right: 78, width: 48 }} />
        {node("潜在进入者", 86, 0, 130, "dr-fc-purple")}
        {node("供应商", 0, 74, 108, "dr-fc-green")}
        {node("行业竞争", 96, 74, 110, "dr-fc-blue")}
        {node("购买者", 214, 74, 108, "dr-fc-gold")}
        {node("替代者", 96, 162, 110, "dr-fc-red")}
      </div>
      <div className="dr-fmap-note">读法：五力分越高，对该判断维度越不友好；箭头表示被行业演化推向的方向。</div>
    </div>
  );
}

function MarketDetailCard({ row }: { row: Record<string, unknown> }) {
  const direction = str(row["方向"]);
  const no = str(row["序号"]);
  const now = fmt1(row["五力现状"]);
  const future = fmt1(row["五力未来"]);
  const delta = fmtSigned(row["Δ"]);
  const total = fmt1(row["机会合计"] ?? row["合计"]);
  const judgement = str(row["Step4判断"]);
  const meaning = str(row["含义"] ?? row["机会判断"]);
  const handling = str(row["处理方式"], judgement);
  const detail = asArray(row["五力明细"]);
  const sources = str(row["参考来源"]);
  const pending = str(row["待核实提示"]);

  return (
    <div className="dr-mkt-card">
      <div className="dr-mkt-head">
        <div className="dr-mkt-title">{`#${no} ${direction}｜PEST → 五力市场机会分析`}</div>
        <div className="dr-mkt-formula">现状 + P + E + S + T = 未来</div>
      </div>

      <div className="dr-mkt-toprow">
        <div className="dr-mkt-metrics">
          <div className="dr-metric dr-metric-blue"><em>五力现状</em>{now}</div>
          <div className="dr-metric dr-metric-red"><em>五力未来</em>{future}</div>
          <div className="dr-metric dr-metric-red"><em>Δ</em>{delta}</div>
          <div className="dr-metric dr-metric-gold"><em>机会合计</em>{total}</div>
        </div>
        <div className="dr-mkt-handling">
          <em>Step4 处理方式</em>
          <div>{handling}</div>
        </div>
      </div>

      <div className="dr-mkt-body">
        <div className="dr-mkt-left">
          <ForcesMiniMap detail={detail} />
          <div className="dr-mkt-meaning">
            <div className="dr-mkt-meaning-label">对后续选择的含义</div>
            <p>{meaning}</p>
          </div>
        </div>
        <div className="dr-mkt-right">
          <div className="dr-mkt-detail-title">PEST → 五力市场机会分析明细</div>
          <div className="dr-mkt-detail-sub">每一行都按：现状威胁 + P + E + S + T = 未来威胁</div>
          <table className="dr-forces-table">
            <thead>
              <tr>
                <th>五力</th>
                <th>现状</th>
                <th>P</th>
                <th>E</th>
                <th>S</th>
                <th>T</th>
                <th>未来</th>
                <th>Δ</th>
                <th>判断逻辑</th>
              </tr>
            </thead>
            <tbody>
              {detail.map((d, i) => {
                const name = str(d["力"]);
                const pest = (["P", "E", "S", "T"] as const).map((k) => {
                  const v = num(d[k]) ?? 0;
                  return { k, v, text: v > 0 ? `+${v}` : String(v), cls: v > 0 ? "dr-pest-up" : v < 0 ? "dr-pest-down" : "dr-pest-zero" };
                });
                return (
                  <tr key={i}>
                    <td><span className={`dr-force-chip ${FORCE_CHIP_CLASS[name] ?? ""}`}>{name}</span></td>
                    <td>{fmt1(d["现状"]).replace(/\.0$/, "")}</td>
                    {pest.map((p) => (
                      <td key={p.k} className={p.cls}>{p.text}</td>
                    ))}
                    <td>{fmt1(d["未来"]).replace(/\.0$/, "")}</td>
                    <td><span className={`dr-delta-chip ${deltaTone(d["Δ"])}`}>{fmtSigned(d["Δ"]).replace(/\.0$/, "")}</span></td>
                    <td className="dr-forces-logic">{str(d["判断逻辑"])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="dr-mkt-defnote">
            <div className="dr-mkt-defnote-label">图中分数定义</div>
            威胁分越高，行业越不友好；Δ&gt;0 表示未来更难做。Step4 只回答市场结构，最终还要叠加 Step5 里的个人胜算。
          </div>
        </div>
      </div>
      {sources ? <div className="dr-mkt-sources">参考来源：{sources}</div> : null}
      {pending ? <div className="dr-mkt-sources">待核实：{pending}</div> : null}
    </div>
  );
}

// ---------- 主组件 ----------

export function DeepConsultationReport({
  profile,
  generated,
}: {
  profile: AssessmentProfile;
  generated: DeepReportGenerated;
}) {
  const name = profile.customer_name;
  const input = buildLiteCustomerInput(profile);
  const vp = profile.value_profile;
  const tp = profile.talent_profile;
  const conclusion = asRecord(generated.conclusion_first);
  const n = generated.step_narratives ?? {};

  const sensory = asRecord(generated.sensory);
  const sensoryTable = asArray(generated.sensory_table);
  const marketRows = asArray(generated.market);
  const overviewRows = asArray(generated.market_overview);
  const excludedRows = asArray(generated.market_excluded);
  const marketSources = Array.isArray(generated.market_sources) ? generated.market_sources.map((s) => str(s)) : [];
  const vrinRows = asArray(generated.vrin);
  const finalRec = asRecord(generated.final_recommendations);
  const ninetyPlan = asRecord(generated.ninety_day_plan);

  // Top3 表（组装输出，兜底由最终推荐派生）
  const top3Rows = asArray(generated.top3_table).length
    ? asArray(generated.top3_table)
    : (
        [
          { 排序: 1, key: "推荐1主线", 角色: "主线" },
          { 排序: 2, key: "推荐2第一切口", 角色: "第一切口" },
          { 排序: 3, key: "推荐3暗线", 角色: "暗线小 MVP" },
        ] as const
      )
        .map(({ 排序, key, 角色 }) => {
          const block = asRecord(finalRec[key]);
          const direction = str(block["方向"]);
          if (!direction) return null;
          return { 排序, 方向: direction, 角色, 进入原因: str(block["推荐逻辑"]).slice(0, 60) };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

  // 浓缩验尸表（兜底：从完整 premortem 截取）
  const premortemTable = asArray(generated.premortem_table).length
    ? asArray(generated.premortem_table)
    : asArray(generated.premortem).map((row) => ({
        方向: str(row["方向"]),
        "12个月后最可能怎么输": str(row["12个月怎么输"] || row["失败剧本"]).slice(0, 60),
        早期信号: str(row["早期预警信号"] ?? row["早期信号"]),
        止损线: str(row["止损线"]),
      }));

  // 90 天计划行 + 表头带方向名
  const planRows = (["Day0-30", "Day30-60", "Day60-90"] as const)
    .map((phase) => {
      const block = asRecord(ninetyPlan[phase]);
      if (!Object.keys(block).length) return null;
      return { 阶段: phase.replace("Day", "Day "), ...block };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
  const planHeaders: Record<string, string> = {};
  (
    [
      ["主线", "主线"],
      ["切口", "第一切口"],
      ["暗线", "暗线"],
    ] as const
  ).forEach(([col, key]) => {
    const value = str(conclusion[key]);
    if (value && value.length <= 14) planHeaders[col] = `${col}：${value}`;
  });

  const highTraits = tp.high_traits.slice(0, 6).map((t) => t.name).join("、");
  const lowTraits = tp.low_traits.slice(0, 4).map((t) => t.name).join("、");
  const topArchetypes = tp.top_archetypes.slice(0, 3).map((a) => a.name).join("、");

  const likedTitles = Array.isArray(sensory["达标方向"]) ? (sensory["达标方向"] as unknown[]).map((x) => str(x)) : [];
  const clusterThemes = Array.isArray(sensory["聚类主题"]) ? (sensory["聚类主题"] as unknown[]).map((x) => str(x)) : [];
  const finalJudgement = str(asRecord(generated.final_judgement)["判断"], "报告判断待生成。");

  return (
    <div className="dr-doc">
      {/* 标题 + 0. 报告结论先行 */}
      <h1 className="dr-h1">{name} · 职业 / 事业方向咨询报告</h1>
      <H2>0. 报告结论先行</H2>
      <P>{str(conclusion["一句话结论"], "报告结论待生成。")}</P>
      <OL
        items={[
          str(conclusion["主线"]) ? (<><strong>主线：{str(conclusion["主线"])}</strong></>) : null,
          str(conclusion["第一切口"]) ? (<><strong>第一切口：{str(conclusion["第一切口"])}</strong></>) : null,
          str(conclusion["暗线"]) ? (<><strong>暗线小 MVP：{str(conclusion["暗线"])}</strong></>) : null,
          str(conclusion["行动方式"]) ? (<><strong>行动方式:{" "}{str(conclusion["行动方式"])}</strong></>) : null,
        ]}
      />
      {str(conclusion["最终建议"]) ? <P>{str(conclusion["最终建议"])}</P> : null}

      {/* 决策漏斗整页图 */}
      <DecisionFunnelFigure />

      {/* 1. 方法论 */}
      <H2>1. 方法论：这份报告如何得出结论</H2>
      <H3>输入</H3>
      <UL
        items={[
          `${name}问卷：决策类型、时间窗口、卡点、能量来源、可迁移资产、感兴趣与排除方向。`,
          `PrinciplesYou 天赋测评（252 题，${tp.mode === "original-sync" ? "真实同步" : "本地兜底"}）。`,
          "方向滑卡感性验证（客户本人点亮）结果。",
          "外部市场事实：联网检索的行业规模、竞争格局、政策与趋势公开数据（需人工核实）。",
        ]}
      />
      <H3>推理</H3>
      <P>本报告不直接问「你想做什么」，而是按漏斗顺序判断：</P>
      <OL
        items={[
          `Step1：先找喜欢区，判断什么样的活动会同时满足${name}的核心价值观。`,
          "Step2：在喜欢区里发散职业 / 事业方向。",
          "Step3：用感性验证筛出身体有反应的方向。",
          "Step4：把达标方向放进市场分析，用 PEST 修正波特五力，判断未来 3-5 年市场结构。",
          `Step5：用 VRIN 判断${name}自己能不能赢。`,
          "Step6：反向推演失败剧本，设置止损线。",
        ]}
      />
      <H3>输出</H3>
      <P>输出不是一个「玄学答案」，而是一组可验证的事业假设：主线、切口、暗线、止损线和 90 天实验。</P>

      {/* 2. Step1 */}
      <H2>2. Step1：喜欢区与个人画像</H2>
      <H3>输入</H3>
      <UL
        items={[
          `价值观 Top：${vp.liked_values.join("、")}。`,
          `低优先级价值观：${vp.excluded_values.join("、")}。`,
          `当前关键问题：${input.current_decision}；${input.stuck_point}。`,
          input.avoid_state !== "未填写" ? `想避开的状态：${input.avoid_state}。` : null,
          input.transferable_assets !== "未填写" ? `可迁移资产：${input.transferable_assets}。` : null,
          `天赋信号：主原型 ${topArchetypes || "待补充"}；高分特质 ${highTraits || "待补充"}；低分特质 ${lowTraits || "待补充"}。`,
        ]}
      />
      <ValueCirclesFigure profile={profile} />
      {str(n.step1?.推理) ? (
        <>
          <H3>推理</H3>
          <Paras text={str(n.step1?.推理)} />
        </>
      ) : null}
      <H3>输出</H3>
      <P>
        {str(n.step1?.输出) ? str(n.step1?.输出) : <>Step1 输出的喜欢区筛选句：<strong>{vp.filter_sentence}</strong></>}
      </P>

      {/* 3. Step2 */}
      <H2>3. Step2：方向发散</H2>
      <IO block={n.step2} fallbackInput={`Step1 喜欢区、${name}履历与可迁移资产、PrinciplesYou 特质、初步诊断方向假设。`} />

      {/* 4. Step3 */}
      <H2>4. Step3：感性验证</H2>
      <H3>输入</H3>
      <Paras text={str(n.step3?.输入, `方向滑卡测评中，${name}本人右滑点亮的 ${likedTitles.length || 10} 个方向。`)} />
      <H3>推理</H3>
      {str(n.step3?.推理) ? <Paras text={str(n.step3?.推理)} /> : <P>{str(sensory["说明"])}</P>}
      {clusterThemes.length ? <UL items={clusterThemes.map((t) => `${t}。`)} /> : null}
      <H3>输出</H3>
      {str(n.step3?.输出) ? <Paras text={str(n.step3?.输出)} /> : null}
      <Table rows={sensoryTable} columns={["序号", "方向", "来源", "Step4处理方式"]} />

      {/* 5. Step4 */}
      <H2>5. Step4：市场分析</H2>
      <H3>输入</H3>
      <Paras text={str(n.step4?.输入, `Step3 中 ${sensoryTable.length} 个达标方向。`)} />
      <H3>推理框架</H3>
      <P>本步使用 PEST + 波特五力，但不是分别罗列两个模型，而是看 PEST 如何改变五力：</P>
      <UL
        items={[
          "P：政策 / 监管如何改变准入、合规、供应链和经营边界。",
          "E：经济环境如何改变消费意愿、价格敏感度、成本和融资容错。",
          "S：社会趋势如何改变需求，例如生活方式、人群结构、情绪消费的变化。",
          "T：技术变化如何改变内容生产、选品、分发、AI 替代和进入门槛。",
        ]}
      />
      <P>
        计算方式：每个五力都按 <span className="dr-code">现状威胁 + P + E + S + T = 未来威胁</span> 展开。威胁分为
        0-100，越高越不利。Δ = 未来威胁 - 现状威胁。
      </P>
      <P>外部事实依据：</P>
      <UL items={marketSources.map((s) => <span key={s} className="dr-source">{s}</span>)} />
      <p className="dr-note">{generated.market_disclaimer}</p>

      <H3>Step4 总览</H3>
      <Table
        rows={overviewRows}
        columns={["序号", "方向", "五力现状", "五力未来", "Δ", "机会现状", "机会未来", "合计", "Step4判断"]}
        format={{ 五力现状: fmt1, 五力未来: fmt1, Δ: fmtSigned, 合计: fmt1 }}
      />

      {excludedRows.length ? (
        <>
          <H3>淘汰 / 不独立入围项概要</H3>
          <P>以下方向不展开 PEST 明细，只保留五力威胁变化和淘汰理由。</P>
          <Table
            rows={excludedRows}
            columns={["方向", "五力现状", "五力未来", "Δ", "处理", "概要理由"]}
            format={{ 五力现状: fmt1, 五力未来: fmt1, Δ: fmtSigned }}
          />
        </>
      ) : null}

      {marketRows.length ? (
        <>
          <H3>入围项市场分析明细</H3>
          {marketRows.map((row, i) => (
            <MarketDetailCard key={i} row={row} />
          ))}
        </>
      ) : null}

      {/* 6. Step5 */}
      <H2>6. Step5：资源验证</H2>
      <H3>输入</H3>
      <Paras text={str(n.step5?.输入, `Step4 shortlist，以及${name}的内部资源：可迁移资产、过往经历、PrinciplesYou 特质。`)} />
      <H3>推理</H3>
      <P>本步使用 VRIN：</P>
      <UL
        items={[
          `V Valuable：${name}的能力是否能直接创造客户价值。`,
          "R Rare：这种能力在目标市场里是否稀缺。",
          "I Inimitable：竞争者是否难以快速复制。",
          "N Non-substitutable：是否不容易被其他能力、工具或资源替代。",
        ]}
      />
      {str(n.step5?.推理) ? <Paras text={str(n.step5?.推理)} /> : null}
      <H3>输出</H3>
      {str(n.step5?.输出) ? <Paras text={str(n.step5?.输出)} /> : null}
      <Table
        rows={vrinRows}
        columns={["方向", "价值V", "稀缺R", "难模仿I", "难替代N", "VRIN总分", "Step4机会", "综合分", "凭证"]}
        headers={{ 价值V: "V", 稀缺R: "R", 难模仿I: "I", 难替代N: "N" }}
        format={{ Step4机会: fmt1 }}
        className="dr-vrin"
      />
      <P>Step5 Top3：</P>
      <Table rows={top3Rows} columns={["排序", "方向", "角色", "进入原因"]} />

      {/* 7. Step6 */}
      <H2>7. Step6：失败验尸</H2>
      <H3>输入</H3>
      <Paras text={str(n.step6?.输入, `Step5 Top3：${top3Rows.map((r) => str(r["方向"])).filter(Boolean).join("、")}。`)} />
      <H3>推理</H3>
      <Paras
        text={str(
          n.step6?.推理,
          "先不问「怎么成功」，先问「12 个月后最可能怎么输」。如果失败原因现在就能看见，就必须把早期信号和止损线写清楚。"
        )}
      />
      <H3>输出</H3>
      {str(n.step6?.输出) ? <Paras text={str(n.step6?.输出)} /> : null}
      <Table rows={premortemTable} columns={["方向", "12个月后最可能怎么输", "早期信号", "止损线"]} />

      {/* 8. 最终推荐方案 */}
      <H2>8. 最终推荐方案</H2>
      {(
        [
          { key: "推荐1主线", label: "推荐 1", role: "最终主线" },
          { key: "推荐2第一切口", label: "推荐 2", role: "第一切口" },
          { key: "推荐3暗线", label: "推荐 3", role: "暗线小 MVP" },
        ] as const
      ).map(({ key, label, role }) => {
        const block = asRecord(finalRec[key]);
        const direction = str(block["方向"]);
        const logic = str(block["推荐逻辑"]);
        if (!direction && !logic) return null;
        return (
          <div key={key}>
            <H3>{`${label}：${direction}（${role}）`}</H3>
            {logic ? <P>推荐逻辑：{logic}</P> : null}
          </div>
        );
      })}

      {/* 9. 90 天验证计划 */}
      <H2>9. 90 天验证计划</H2>
      <Table rows={planRows} columns={["阶段", "主线", "切口", "暗线", "继续条件"]} headers={planHeaders} />
      {str(ninetyPlan["止损线"]) ? <P><strong>止损线：</strong>{str(ninetyPlan["止损线"])}</P> : null}

      {/* 10. 最后判断 */}
      <H2>{`10. 给${name}的最后判断`}</H2>
      <Paras text={finalJudgement} />
    </div>
  );
}
