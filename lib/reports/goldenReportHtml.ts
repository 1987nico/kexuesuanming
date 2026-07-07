/**
 * goldenReportHtml —— 大报告「金样本」渲染器（系统渲染层的唯一真源）。
 *
 * 目标：给定结构化 deep_report 数据，产出与《金样本大报告》逐像素一致的 HTML。
 * 用法：/reports/deep/[id] 页面与 PDF 路由都调 renderGoldenReportHtml()，
 * 保证「生成大报告 / 编辑器预览 / 导出 PDF」三处画面完全一致。
 *
 * 说明：本文件只负责 HTML/CSS 排版；数值由 deepMath 算定，文本由流水线/编辑器给。
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const GOLDEN_REPORT_RENDER_VERSION = "golden-deep-diagnosis-cover-v2";

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fmt1 = (x: unknown): string => {
  const n = Number(x);
  if (Number.isNaN(n)) return String(x ?? "");
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
};
const signed = (x: unknown): string => {
  const n = Number(x);
  if (Number.isNaN(n)) return String(x ?? "");
  return n > 0 ? `+${fmt1(n)}` : fmt1(n);
};
const formatDate = (value: unknown): string => {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
};

function loadCss(): string {
  const dir = path.join(process.cwd(), "app", "reports", "deep");
  // 基座 CSS 里 @media print 的 @page 固定为 A4，会把宽卡裁掉；金样本报告是宽版，直接替换页面尺寸
  const base = readFileSync(path.join(dir, "deep-report.css"), "utf8").replace(
    /size:\s*A4\s*;?/g,
    "size: 1320px 1700px;"
  );
  let golden = "";
  try {
    golden = readFileSync(path.join(dir, "golden.css"), "utf8");
  } catch {
    /* golden.css 可选 */
  }
  return base + "\n" + golden;
}

// ---------- 类型 ----------
export interface ForceDetail {
  力: string;
  现状: number;
  P: number;
  E: number;
  S: number;
  T: number;
  未来: number;
  Δ: number;
  判断逻辑: string;
}
export interface MarketRow {
  序号: number | string;
  方向: string;
  Step4判断: string;
  五力现状: number;
  五力未来: number;
  Δ: number;
  处理方式: string;
  含义: string;
  五力明细: ForceDetail[];
}
export interface VrinRow {
  idx: number | string;
  dir: string;
  v: number;
  r: number;
  i: number;
  n: number;
  opp: number;
  total: number;
  comp: number;
  rank: number;
  ev: { v: string; r: string; i: string; n: string };
  acts: string[];
}
export interface PremortemFinding {
  layer: "market" | "moat" | "capability" | "motivation" | "reality";
  reason: string;
  s30: string;
  s90: string;
  s6: string;
  exit: string;
  mit: string;
}
export interface PremortemItem {
  idx: number | string;
  dir: string;
  comp: number;
  script: string;
  findings: PremortemFinding[];
  links: Array<[string, PremortemFinding["layer"]]>;
}
export interface CrossPit {
  title: string;
  desc: string;
}
export interface RoadmapPhase {
  tag: string;
  name: string;
  q: string;
  tone: "blue" | "gold" | "green";
  goal: string;
  acts: Array<[string, string]>;
  pass: string;
  stop: string;
}
export interface Kv {
  t: string;
  d: string;
}
export interface VerdictData {
  conclusion: string;
  mainline: Array<[string, string, string]>;
  why: Kv[];
  dont: Kv[];
  prereq: Kv[];
  confidence: string;
}
export interface GoldenReportData {
  customerName: string;
  generatedAt?: string;
  market: MarketRow[];
  vrin: VrinRow[];
  cross?: CrossPit[];
  premortem?: PremortemItem[];
  roadmapLogic?: string;
  phases?: RoadmapPhase[];
  gates?: Kv[];
  totalStop?: string;
  reminds?: Kv[];
  verdict?: VerdictData;
}

// ---------- 封面与目录 ----------
function sectionCover(data: GoldenReportData): string {
  const generatedAt = formatDate(data.generatedAt);
  const top = [...data.vrin].sort((a, b) => a.rank - b.rank)[0];
  const conclusion = data.verdict?.conclusion || top?.dir || "完成方向诊断、市场判断与个人胜算验证";
  return `<section class="pg cover">
  <h1>深度诊断报告</h1>
  <div class="line"></div>
  <div class="meta">
    <div>客户：${esc(data.customerName)}</div>
    ${generatedAt ? `<div>交付日期：${esc(generatedAt)}</div>` : ""}
    <div>报告类型：深度诊断报告</div>
    <div>核心结论：${esc(conclusion)}</div>
  </div>
  <div class="flow">
    <b>诊断</b><br>
    市场分析<br>
    个人胜算<br>
    避坑验证<br>
    90 天行动
  </div>
</section>`;
}

function sectionToc(data: GoldenReportData): string {
  const rows = [
    ["01", "市场结构判断", "把已点亮方向放进 PEST 与波特五力，判断哪些机会值得继续验证。"],
    ["02", "个人胜算模型", "用 VRIN 四维看你在哪些方向上更有资源、壁垒和可复制优势。"],
    data.premortem?.length
      ? ["03", "失败验尸", "提前看见 Top3 方向最可能怎么输，并给出预警信号与止损红线。"]
      : null,
    data.phases?.length
      ? ["04", "90 天验证路线图", "把需求、付费、可复制三个关键问题拆成低成本行动。"]
      : null,
    data.verdict ? ["05", "最终判断", "收口成一条主推路线、明确不要做什么，以及成败前提。"] : null,
  ].filter(Boolean) as string[][];

  return `<section class="pg inner toc">
  <div class="h1">目录</div>
  <div class="lead">这份报告按“先看机会，再看自己能不能赢，最后决定如何验证”的顺序展开。</div>
  ${rows
    .map(
      ([no, title, desc]) => `<div class="toc-row">
    <div class="toc-no">${esc(no)}</div>
    <div class="toc-t">${esc(title)}</div>
    <div class="toc-d">${esc(desc)}</div>
  </div>`
    )
    .join("")}
</section>`;
}

// ---------- S4 市场机会卡 ----------
const FORCE_CHIP: Record<string, string> = {
  行业竞争: "dr-fc-blue",
  潜在进入者: "dr-fc-purple",
  替代者: "dr-fc-red",
  供应商: "dr-fc-green",
  购买者: "dr-fc-gold",
};

function forcesMiniMap(details: ForceDetail[]): string {
  const by = new Map(details.map((d) => [d.力, d]));
  const node = (name: string, x: number, y: number, w: number, cls: string) => {
    const d = by.get(name);
    const now = d ? d.现状 : "-";
    const fut = d ? d.未来 : "-";
    const dd = d ? `　Δ${d.Δ > 0 ? "+" : ""}${d.Δ}` : "";
    return `<div class="dr-fmap-node ${cls}" style="left:${x}px;top:${y}px;width:${w}px"><div class="dr-fmap-name">${esc(name)}</div><div class="dr-fmap-val">${now} → ${fut}${dd}</div></div>`;
  };
  return `<div class="dr-fmap">
  <div class="dr-fmap-title">五力结构</div>
  <div class="dr-fmap-sub">节点显示：现状威胁 → 未来威胁 与 Δ</div>
  <div class="dr-fmap-canvas">
    <div class="dr-fmap-line dr-fmap-line-v" style="left:150px;top:38px;height:36px"></div>
    <div class="dr-fmap-line dr-fmap-line-v" style="left:150px;top:120px;height:42px"></div>
    <div class="dr-fmap-line dr-fmap-line-h" style="top:96px;left:88px;width:16px"></div>
    <div class="dr-fmap-line dr-fmap-line-h" style="top:96px;left:196px;width:16px"></div>
    ${node("潜在进入者", 92, 0, 116, "dr-fc-purple")}
    ${node("供应商", 4, 74, 84, "dr-fc-green")}
    ${node("行业竞争", 104, 74, 92, "dr-fc-blue")}
    ${node("购买者", 212, 74, 84, "dr-fc-gold")}
    ${node("替代者", 104, 162, 92, "dr-fc-red")}
  </div>
  <div class="dr-fmap-note">读法：五力分越高，对该判断维度越不友好；箭头表示被行业演化推向的方向。</div>
</div>`;
}

function pestCell(v: number): string {
  if (v > 0) return `<td class="dr-pest-up">+${v}</td>`;
  if (v < 0) return `<td class="dr-pest-down">${v}</td>`;
  return `<td class="dr-pest-zero">${v}</td>`;
}
function deltaChip(v: number): string {
  const cls = v > 0 ? "dr-delta-bad" : v < 0 ? "dr-delta-good" : "dr-delta-flat";
  const txt = v > 0 ? `+${v}` : `${v}`;
  return `<span class="dr-delta-chip ${cls}">${txt}</span>`;
}

function marketCard(row: MarketRow): string {
  const now = fmt1(row.五力现状);
  const fut = fmt1(row.五力未来);
  const delta = signed(row.Δ);
  const rows = row.五力明细
    .map(
      (d) => `<tr>
      <td><span class="dr-force-chip ${FORCE_CHIP[d.力] ?? ""}">${esc(d.力)}</span></td>
      <td>${d.现状}</td>${pestCell(d.P)}${pestCell(d.E)}${pestCell(d.S)}${pestCell(d.T)}
      <td>${d.未来}</td>
      <td>${deltaChip(d.Δ)}</td>
      <td class="dr-forces-logic">${esc(d.判断逻辑)}</td>
    </tr>`
    )
    .join("");
  return `<div class="dr-mkt-card">
  <div class="dr-mkt-head">
    <div class="dr-mkt-title">#${esc(row.序号)} ${esc(row.方向)}｜PEST → 五力市场机会分析</div>
    <div class="dr-mkt-formula">现状 ＋ P ＋ E ＋ S ＋ T ＝ 未来</div>
  </div>
  <div class="dr-mkt-toprow">
    <div class="dr-mkt-metrics">
      <div class="dr-metric dr-metric-blue"><em>五力现状</em>${now}</div>
      <div class="dr-metric dr-metric-red"><em>五力未来</em>${fut}</div>
      <div class="dr-metric dr-metric-red"><em>Δ</em>${delta}</div>
    </div>
    <div class="dr-mkt-handling"><em>Step4 处理方式</em><div>${esc(row.处理方式)}</div></div>
  </div>
  <div class="dr-mkt-body">
    <div class="dr-mkt-left">
      ${forcesMiniMap(row.五力明细)}
      <div class="dr-mkt-meaning">
        <div class="dr-mkt-meaning-label">对后续选择的含义</div>
        <p>${esc(row.含义)}</p>
      </div>
    </div>
    <div class="dr-mkt-right">
      <div class="dr-mkt-detail-title">PEST → 五力市场机会分析明细</div>
      <div class="dr-mkt-detail-sub">每一行都按：现状威胁 + P + E + S + T = 未来威胁</div>
      <table class="dr-forces-table">
        <thead><tr><th>五力</th><th>现状</th><th>P</th><th>E</th><th>S</th><th>T</th><th>未来</th><th>Δ</th><th>判断逻辑</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="dr-mkt-defnote">
        <div class="dr-mkt-defnote-label">图中分数定义</div>
        威胁分越高，行业越不友好；Δ&gt;0 表示未来更难做。Step4 只回答市场结构，最终还要叠加 Step5 里的个人胜算。
      </div>
    </div>
  </div>
</div>`;
}

function sectionMarket(data: GoldenReportData): string {
  return `<div class="gsec dr-root">
  <div class="pg-title">
    <h1>Step4 · 市场分析：PEST → 波特五力市场机会分析</h1>
    <div class="sub">「感性验证」中点亮的方向逐一进入市场结构判断（威胁分 0–100，越高越不友好）</div>
  </div>
  ${data.market.map(marketCard).join("\n")}
</div>`;
}

// ---------- S5 VRIN 表 ----------
const dimCls = (v: number): string => (v >= 5 ? "v5" : v === 4 ? "v4" : v === 3 ? "v3" : "v2");

function sectionVrin(data: GoldenReportData): string {
  const ranked = [...data.vrin].sort((a, b) => a.rank - b.rank);
  const tbody = ranked
    .map((r) => {
      const top = r.rank <= 3;
      const evShort = r.idx === 6 ? r.ev.n : r.ev.v;
      return `<tr class="${top ? "s5-top" : ""}">
      <td class="s5-rank">${r.rank}${top ? " ★" : ""}</td>
      <td class="s5-dir">#${esc(r.idx)} ${esc(r.dir)}</td>
      <td class="s5-num ${dimCls(r.v)}">${r.v}</td>
      <td class="s5-num ${dimCls(r.r)}">${r.r}</td>
      <td class="s5-num ${dimCls(r.i)}">${r.i}</td>
      <td class="s5-num ${dimCls(r.n)}">${r.n}</td>
      <td class="s5-total">${r.total}<span>/20</span></td>
      <td class="s5-num">${r.opp}</td>
      <td class="s5-comp">${r.comp}</td>
      <td class="s5-ev">${esc(evShort)}</td>
    </tr>`;
    })
    .join("");
  const cards = ranked
    .slice(0, 3)
    .map((r) => {
      const dims = (
        [
          ["价值 V", "v"],
          ["稀缺 R", "r"],
          ["难模仿 I", "i"],
          ["难替代 N", "n"],
        ] as const
      )
        .map(
          ([k, kk]) =>
            `<div class="s5-dimrow"><span class="s5-dimk">${k}</span><span class="s5-dimv ${dimCls(
              r[kk] as number
            )}">${r[kk]}</span><span class="s5-dimt">${esc(r.ev[kk])}</span></div>`
        )
        .join("");
      const acts = r.acts
        .map((a) => {
          const [day, ...rest] = a.split("：");
          return `<div class="s5-act"><em>${esc(day)}</em>${esc(rest.join("："))}</div>`;
        })
        .join("");
      return `<div class="s5-card">
      <div class="s5-card-head"><span class="s5-badge">Top ${r.rank}</span>
        <span class="s5-card-title">#${esc(r.idx)} ${esc(r.dir)}</span>
        <span class="s5-card-score">VRIN ${r.total}/20 · 机会 ${r.opp}/10 · 综合 ${r.comp}</span></div>
      <div class="s5-dims">${dims}</div>
      <div class="s5-acts"><div class="s5-acts-label">90 天小成本验证</div>${acts}</div>
    </div>`;
    })
    .join("");
  return `<div class="gsec dr-root">
  <div class="pg-title">
    <h1>Step5 · VRIN 个人胜算模型：${data.vrin.length} 个进入方向 → 收敛 Top3</h1>
    <div class="sub">把 Step4「进入」的方向用 VRIN 四维（1–5，满分 20）再筛一遍，叠加 Step4 机会分排出综合胜算</div>
  </div>
  <div class="pg-note">
    VRIN：<b>V 价值</b>（对客户有多值）·<b>R 稀缺</b>（拥有此能力的人多不多）·<b>I 难模仿</b>（路径依赖/战绩信用）·<b>N 难替代</b>（能否被别的资源顶替）。每维 1–5，<b>综合分 = Step4机会 × VRIN总分 / 20</b>（0–10）。★ 为最终 Top3。
  </div>
  <table class="s5-table">
    <thead><tr><th>综合排名</th><th>方向</th><th>价值V</th><th>稀缺R</th><th>难模仿I</th><th>难替代N</th><th>VRIN总分</th><th>Step4机会</th><th>综合分</th><th>关键凭证</th></tr></thead>
    <tbody>${tbody}</tbody>
  </table>
  <div class="s5-anchor">评分锚点：5=强壁垒/高价值 · 4=明显优势 · 3=中性可做 · 2=偏弱/易被替代。综合分越高＝「机会大 × 自己能赢」越同时成立。</div>
  <div class="s5-cards">
    <div class="pg-title"><h1 style="font-size:17px;margin:8px 0 2px;">最终 Top 3 · 凭证与 90 天验证</h1></div>
    ${cards}
  </div>
</div>`;
}

// ---------- S6 避坑指南 ----------
const PK_LAYER: Record<PremortemFinding["layer"], [string, string, string]> = {
  market: ["市场层", "dr-fc-blue", "PEST 恶化 / 五力高威胁"],
  moat: ["壁垒层", "dr-fc-purple", "VRIN 低分维 / 护城河浅"],
  capability: ["能力层", "dr-fc-red", "性格短板 × 角色关键能力"],
  motivation: ["动机层", "dr-fc-gold", "价值观底三项 / 勉强信号"],
  reality: ["现实层", "dr-fc-green", "现金流 / 家庭 / 时间"],
};

function pkLinks(links: PremortemItem["links"]): string {
  const grp = new Map<string, string[]>();
  for (const [day, layer] of links) {
    const arr = grp.get(day) ?? [];
    arr.push(PK_LAYER[layer][0]);
    grp.set(day, arr);
  }
  const cells = [...grp.entries()]
    .map(([day, v]) => `<div class="pk-link"><em>${esc(day)}</em>盯 ${esc(v.join("、"))} 的失败假设</div>`)
    .join("");
  return `<div class="pk-links"><div class="pk-links-h">90 天动作 ↔ 失败假设挂钩（做验证时同时盯这些红线）</div><div class="pk-links-row">${cells}</div></div>`;
}

function pkCard(t: PremortemItem, rank: number): string {
  const rows = t.findings
    .map((f) => {
      const [name, chip, anchor] = PK_LAYER[f.layer];
      return `<tr>
      <td><span class="dr-force-chip ${chip}">${name}</span><div class="pk-anchor">${esc(anchor)}</div></td>
      <td class="pk-reason">${esc(f.reason)}</td>
      <td class="pk-sig"><b>30天</b> ${esc(f.s30)}<br><b>90天</b> ${esc(f.s90)}<br><b>6月</b> ${esc(f.s6)}</td>
      <td class="pk-exit">${esc(f.exit)}</td>
      <td class="pk-mit">${esc(f.mit)}</td>
    </tr>`;
    })
    .join("");
  return `<div class="pk-card">
  <div class="pk-head"><span class="pk-badge">Top ${rank}</span>
    <span class="pk-title">#${esc(t.idx)} ${esc(t.dir)}</span>
    <span class="pk-score">综合胜算 ${t.comp}</span></div>
  <div class="pk-script"><div class="pk-script-label">输的剧本 · 12 个月后的复盘</div><p>${esc(t.script)}</p></div>
  <table class="pk-table">
    <thead><tr><th>失败层</th><th>最致命的失败原因</th><th>量化早期预警</th><th>退出红线（触及即止损）</th><th>缓解动作</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${pkLinks(t.links)}
</div>`;
}

function sectionPremortem(data: GoldenReportData): string {
  if (!data.premortem?.length) return "";
  const cross = (data.cross ?? [])
    .map(
      (c, i) =>
        `<div class="pk-cross-item"><div class="pk-cross-t">坑 ${i + 1}· ${esc(c.title)}</div><div class="pk-cross-d">${esc(c.desc)}</div></div>`
    )
    .join("");
  const crossBlock = cross
    ? `<div class="pk-cross"><div class="pk-cross-h">四个必踩大坑（跨方向共性）</div><div class="pk-cross-grid">${cross}</div></div>`
    : "";
  return `<div class="gsec dr-root">
  <div class="pg-title">
    <h1>避坑指南 · Top3 失败验尸</h1>
    <div class="sub">站在「12 个月后写复盘」的视角，倒推每个 Top3 方向最可能怎么输，并给出量化预警与止损红线</div>
  </div>
  ${crossBlock}
  ${data.premortem.map((t, i) => pkCard(t, i + 1)).join("\n")}
</div>`;
}

// ---------- 90 天验证路线图 ----------
const RM_TONE: Record<RoadmapPhase["tone"], [string, string, string]> = {
  blue: ["#2f6bec", "#9dbcf3", "#f0f5ff"],
  gold: ["#a07a14", "#ddc37e", "#fdf8ec"],
  green: ["#3d7d4c", "#9cc7a5", "#f0f8f2"],
};

function rmPhase(p: RoadmapPhase): string {
  const [c, bd, bg] = RM_TONE[p.tone];
  const acts = p.acts
    .map(
      ([k, t]) =>
        `<div class="rm-act"><span class="rm-act-k" style="color:${c}">${esc(k)}</span><span class="rm-act-t">${esc(t)}</span></div>`
    )
    .join("");
  return `<div class="rm-col">
  <div class="rm-node" style="background:${c}"></div>
  <div class="rm-card" style="border-top:4px solid ${c}">
    <div class="rm-tag" style="color:${c}">${esc(p.tag)}</div>
    <div class="rm-name">${esc(p.name)}</div>
    <div class="rm-q">${esc(p.q)}</div>
    <div class="rm-goal"><em>阶段目标</em>${esc(p.goal)}</div>
    <div class="rm-acts">${acts}</div>
    <div class="rm-pass" style="background:${bg};border-color:${bd}"><em style="color:${c}">✓ 通过线（进入下阶段）</em>${esc(p.pass)}</div>
    <div class="rm-stop"><em>✗ 本阶段止损红线</em>${esc(p.stop)}</div>
  </div>
</div>`;
}

function sectionRoadmap(data: GoldenReportData): string {
  if (!data.phases?.length) return "";
  const cols = data.phases.map(rmPhase).join("");
  const gates = (data.gates ?? [])
    .map((g) => `<div class="rm-gate"><div class="rm-gate-t">${esc(g.t)}</div><div class="rm-gate-d">${esc(g.d)}</div></div>`)
    .join("");
  const rems = (data.reminds ?? [])
    .map((r) => `<div class="rm-rem"><b>${esc(r.t)}</b>${esc(r.d)}</div>`)
    .join("");
  return `<div class="gsec dr-root">
  <div class="pg-title">
    <h1>90 天验证路线图 · 用最小成本跑通「需求 → 付费 → 可复制」</h1>
    <div class="sub">把 Top3 的验证动作与止损红线，整合成一条可执行、每步带通过线的路线</div>
  </div>
  ${data.roadmapLogic ? `<div class="rm-logic">${data.roadmapLogic}</div>` : ""}
  <div class="rm-spine"><div class="rm-cols">${cols}</div></div>
  ${gates ? `<div class="rm-h2">三道决策门（继续 / 停止）</div><div class="rm-gates">${gates}</div>` : ""}
  ${data.totalStop ? `<div class="rm-total">${esc(data.totalStop)}</div>` : ""}
  ${rems ? `<div class="rm-h2">四条关键提醒（针对你的画像短板）</div><div class="rm-rems">${rems}</div>` : ""}
</div>`;
}

// ---------- 最终判断 ----------
function sectionVerdict(data: GoldenReportData): string {
  const v = data.verdict;
  if (!v) return "";
  const lines = v.mainline
    .map(
      ([k, t, d]) =>
        `<div class="fv-item"><div class="fv-item-k">${esc(k)}</div><div class="fv-item-b"><b>${esc(t)}</b><span>${esc(d)}</span></div></div>`
    )
    .join("");
  const cellsOf = (arr: Kv[]) =>
    arr.map((c) => `<div class="fv-cell"><div class="fv-cell-t">${esc(c.t)}</div><div class="fv-cell-d">${esc(c.d)}</div></div>`).join("");
  return `<div class="gsec dr-root">
  <div class="fv-h1">最终判断</div>
  <div class="fv-verdict"><div class="lab">一句话结论</div><div class="txt">${esc(v.conclusion)}</div></div>
  <div class="fv-h2">主推路线（一条内容线，同时验证）</div>
  <div class="fv-lines">${lines}</div>
  <div class="fv-h2">为什么是它（四条依据，来自前面各步）</div>
  <div class="fv-grid2 fv-pre">${cellsOf(v.why)}</div>
  <div class="fv-h2">明确不要做（守住排除带）</div>
  <div class="fv-grid2 fv-dont">${cellsOf(v.dont)}</div>
  <div class="fv-h2">成败四大前提</div>
  <div class="fv-grid2 fv-pre">${cellsOf(v.prereq)}</div>
</div>`;
}

function reportBody(data: GoldenReportData): string {
  return [
    sectionCover(data),
    sectionToc(data),
    sectionMarket(data),
    sectionVrin(data),
    sectionPremortem(data),
    sectionRoadmap(data),
    sectionVerdict(data),
  ]
    .filter(Boolean)
    .join("\n");
}

/** 完整独立 HTML 文档（PDF 路由 / 独立预览用） */
export function renderGoldenReportHtml(data: GoldenReportData): string {
  const css = loadCss();
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>职业 / 事业方向深度诊断报告 · ${esc(data.customerName)}</title>
<style>${css}</style></head>
<body><div class="golden-doc">${reportBody(data)}</div></body></html>`;
}

/** 可嵌入 React 页面的片段（<style> + .golden-doc），供 /reports/deep/[id] 与编辑器预览用 */
export function renderGoldenReportInner(data: GoldenReportData, opts?: { editable?: boolean }): string {
  const css = loadCss();
  const editableAttrs = opts?.editable ? ` contenteditable="true" spellcheck="false"` : "";
  return `<style>${css}</style><div class="golden-doc"${editableAttrs}>${reportBody(data)}</div>`;
}
