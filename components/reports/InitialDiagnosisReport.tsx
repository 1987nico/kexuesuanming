import type { AssessmentProfile, TalentTrait } from "@/lib/reports/assessmentProfile";
import type { InitialDiagnosisGenerated } from "@/lib/reports/initialDiagnosis";
import { buildLiteCustomerInput } from "@/lib/reports/builders";
import { archetypeDisplayLabel, englishName, traitDisplayLabel, traitZhName } from "@/lib/reports/talentNames";

const BAND_LABELS: Record<TalentTrait["band"], string> = {
  very_low: "非常低",
  low: "低",
  moderate: "中等",
  high: "高",
  very_high: "非常高",
};

function traitExplanation(trait: TalentTrait): string {
  if (trait.explanation) return trait.explanation;
  const name = traitZhName(trait.key, trait.name);
  switch (trait.band) {
    case "very_high":
    case "high":
      return `${name}偏高，适合在合适场景中主动使用。`;
    case "very_low":
      return `${name}偏低，长期依赖它会明显耗能。`;
    case "low":
      return `${name}略低，需要流程、搭档或工具补偿。`;
    default:
      return `${name}处于中间区间，可按场景灵活调用。`;
  }
}

function formatDateCN(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;
}

function formatDateTimeCN(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Page({ no, title, intro, children }: { no: string; title: string; intro?: string; children: React.ReactNode }) {
  const pageNo = String(Number(no) + 1).padStart(2, "0");
  return (
    <section className="ir-page">
      <div className="ir-toprule" />
      <h2 className="ir-section-title">{`${no} · ${title}`}</h2>
      {intro && <p className="ir-intro">{intro}</p>}
      {children}
      <div className="ir-footer">
        <span>初步诊断报告 | 保密交付</span>
        <span>{pageNo}</span>
      </div>
    </section>
  );
}

function Card({
  tone,
  title,
  children,
}: {
  tone?: "cream" | "teal" | "rust" | "plain";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "cream" ? " ir-card-cream" : tone === "teal" ? " ir-card-teal" : tone === "rust" ? " ir-card-rust" : "";
  return (
    <div className={"ir-card" + toneClass}>
      <h3>{title}</h3>
      {typeof children === "string" ? <p>{children}</p> : children}
    </div>
  );
}

function Bars({
  items,
  color,
  max = 100,
}: {
  items: Array<{ label: string; score: number }>;
  color?: "teal" | "gold" | "rust";
  max?: number;
}) {
  const fillClass = color === "gold" ? "ir-bar-fill ir-bar-fill-gold" : color === "rust" ? "ir-bar-fill ir-bar-fill-rust" : "ir-bar-fill";
  return (
    <div>
      {items.map((item) => (
        <div key={item.label} className="ir-bar-row">
          <div className="ir-bar-label">{item.label}</div>
          <div className="ir-bar-score">{item.score}</div>
          <div className="ir-bar-track">
            <div className={fillClass} style={{ width: `${Math.min(100, Math.max(2, (item.score / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 价值观三圈 Venn（确定性 SVG） */
function ValueVenn({
  title,
  values,
  summary,
  palette,
}: {
  title: string;
  values: string[];
  summary: string;
  palette: "gold" | "gray";
}) {
  const fill = palette === "gold" ? "#f8e1a0" : "#dde4ed";
  const stroke = palette === "gold" ? "#f0bd3d" : "#b5c3d1";
  const centerFill = palette === "gold" ? "#f0bd3d" : "#b5c3d1";
  const r = 78;
  const cx = 150;
  const positions = [
    { x: cx, y: 92 },
    { x: cx - 55, y: 178 },
    { x: cx + 55, y: 178 },
  ];
  const centerY = 145;
  const summaryLines = summary
    .replace(/([，。；、,;])/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#111826", marginBottom: 10 }}>{title}</div>
      <svg viewBox="0 0 300 280" style={{ width: "100%", maxWidth: 300 }}>
        {positions.map((pos, i) => (
          <circle key={i} cx={pos.x} cy={pos.y} r={r} fill={fill} fillOpacity={0.62} stroke={stroke} strokeWidth={1.6} />
        ))}
        <circle cx={cx} cy={centerY} r={34} fill={centerFill} fillOpacity={0.9} />
        <text x={cx} y={centerY - 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111826">
          {title}
        </text>
        {summaryLines.map((line, i) => (
          <text key={i} x={cx} y={centerY - 3 + i * 11} textAnchor="middle" fontSize="8" fill="#111826">
            {line}
          </text>
        ))}
        <text x={positions[0].x} y={positions[0].y - 34} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#111826">
          {values[0] || ""}
        </text>
        <text x={positions[1].x - 26} y={positions[1].y + 34} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#111826">
          {values[1] || ""}
        </text>
        <text x={positions[2].x + 26} y={positions[2].y + 34} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#111826">
          {values[2] || ""}
        </text>
      </svg>
    </div>
  );
}

export function InitialDiagnosisReport({
  profile,
  diagnosis,
}: {
  profile: AssessmentProfile;
  diagnosis: InitialDiagnosisGenerated;
}) {
  const input = buildLiteCustomerInput(profile);
  const vp = profile.value_profile;
  const tp = profile.talent_profile;
  const d = diagnosis;
  const name = profile.customer_name;

  const archetypes = tp.top_archetypes.slice(0, 6);
  const highTraits = tp.high_traits.slice(0, 7);
  const lowTraits = tp.low_traits.slice(0, 7);
  const traitRows = [...tp.high_traits.slice(0, 5), ...tp.low_traits.slice(0, 5)];
  const distribution = tp.answer_distribution;
  const distTotal = Object.values(distribution).reduce((sum, n) => sum + n, 0) || 1;
  const distMax = Math.max(...Object.values(distribution), 1);

  const inputCards: Array<{ label: string; value: string }> = [
    { label: "当前决策", value: input.current_decision },
    { label: "时间窗口", value: input.time_window },
    { label: "卡点", value: input.stuck_point },
    { label: "能量来源", value: input.energy_source },
    { label: "可迁移资产", value: input.transferable_assets },
    { label: "想避开的状态", value: input.avoid_state },
    { label: "想靠近的方向", value: input.desired_direction },
    { label: "明确不碰的方向", value: input.avoid_direction },
  ];

  const ninetyDaySteps = [
    { title: "第1-2周 · 锁定一个窄人群", body: d.ninety_day.weeks_1_2 },
    { title: "第3-4周 · 做最小可卖交付", body: d.ninety_day.weeks_3_4 },
    { title: "第5-8周 · 转成付费试点", body: d.ninety_day.weeks_5_8 },
    { title: "第9-12周 · 标准化与提价", body: d.ninety_day.weeks_9_12 },
  ];

  return (
    <div className="ir-doc">
      {/* 封面（白底） */}
      <section className="ir-page">
        <div className="ir-toprule" />
        <div className="ir-cover-body">
          <div className="ir-cover-head">
            <h1>初步诊断报告</h1>
            <div className="ir-cover-sub">基于方向输入、价值观双三圈与天赋测评的初步判断</div>
          </div>
          <div className="ir-cover-client">
            <div className="ir-cover-name">客户：{name}</div>
            <div className="ir-cover-date">交付日期：{formatDateCN(profile.updated_at)}</div>
          </div>
          <div className="ir-cover-badges">
            <span className="ir-badge">初步诊断</span>
            <span className="ir-badge ir-badge-teal">方向初筛</span>
            <span className="ir-badge ir-badge-teal">252题完整</span>
            <span className="ir-badge">保密交付</span>
          </div>
          <div className="ir-cover-cards">
            <Card tone="cream" title="本报告定位">
              这是一份用于职业与创业方向初筛的诊断报告。它帮助你看清当前问题、优势组合、价值观边界和下一步验证框架，但不替代完整访谈后的最终决策方案。
            </Card>
            <Card tone="teal" title="一句话结论">{d.one_line_conclusion}</Card>
          </div>
        </div>
        <div className="ir-footer">
          <span>初步诊断报告 | 保密交付</span>
          <span>01</span>
        </div>
      </section>

      {/* 01 核心诊断结论 */}
      <Page no="01" title="核心诊断结论" intro="这页先给判断，后面的页面提供证据。">
        <div className="ir-grid-2" style={{ rowGap: 22 }}>
          <Card tone="cream" title="主判断">{d.main_judgement}</Card>
          <Card tone="teal" title="初步方向">{d.initial_direction}</Card>
          <Card tone="rust" title="最大风险">{d.biggest_risk}</Card>
          <Card title="下一步动作">{d.next_action}</Card>
        </div>
        <div style={{ marginTop: "auto", paddingBottom: 8 }}>
          <Card title="本次诊断给出的结论层级">
            本报告已经能帮你排除明显不适合的方向，并找到值得验证的主线。真正投入前，还要结合履历、资源、现金流、客户验证和执行约束做完整判断。
          </Card>
        </div>
      </Page>

      {/* 02 当前问题识别 */}
      <Page no="02" title="当前问题识别">
        <div className="ir-kicker">客户输入</div>
        <div className="ir-grid-2" style={{ rowGap: 12 }}>
          {inputCards.map((card) => (
            <div key={card.label} className="ir-input-card">
              <div className="ir-input-label">{card.label}</div>
              <div className="ir-input-value">{card.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26 }}>
          <div className="ir-kicker">判断</div>
          <ul className="ir-bullets">
            {d.consultant_reading.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </Page>

      {/* 03 价值观双三圈 */}
      <Page no="03" title="价值观双三圈">
        <div className="ir-grid-2" style={{ marginTop: 10 }}>
          <ValueVenn title="喜欢区" values={vp.liked_values} summary={vp.like_summary} palette="gold" />
          <ValueVenn title="排除带" values={vp.excluded_values} summary={vp.exclude_summary} palette="gray" />
        </div>
        <div style={{ marginTop: "auto", display: "grid", gap: 16, paddingBottom: 8 }}>
          <Card tone="cream" title="方向筛选句">
            {`只有当一个方向同时满足：${vp.filter_sentence.replace(/。$/, "")}时，才值得进入下一轮验证。`}
          </Card>
          <Card tone="teal" title="关键解释">{d.value_key_note}</Card>
        </div>
      </Page>

      {/* 04 天赋原型与优势信号 */}
      <Page no="04" title="天赋原型与优势信号">
        <Card tone="cream" title="天赋原型判断">{d.archetype_judgement}</Card>
        <div className="ir-grid-2" style={{ marginTop: 24, columnGap: 40 }}>
          <div>
            <div className="ir-kicker">原型相似度</div>
            <Bars
              items={archetypes.map((a, i) => ({
                label: `${i + 1}. ${archetypeDisplayLabel(a.key, a.name)}`,
                score: a.percentile ?? a.raw_score ?? 0,
              }))}
              color="teal"
            />
          </div>
          <div>
            <div className="ir-kicker">三个关键人格信号</div>
            <ul className="ir-bullets">
              {d.key_signals.map((signal, i) => (
                <li key={i}>{signal}</li>
              ))}
            </ul>
          </div>
        </div>
        <div style={{ marginTop: "auto", paddingBottom: 8 }}>
          <Card title="职业翻译">{d.career_translation}</Card>
        </div>
      </Page>

      {/* 05 工作场景中的行为模式 */}
      <Page no="05" title="工作场景中的行为模式">
        <div className="ir-grid-3">
          <Card tone="cream" title="思考方式">
            <ul className="ir-bullets">
              {d.behavior_modes.thinking.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </Card>
          <Card tone="teal" title="人际方式">
            <ul className="ir-bullets">
              {d.behavior_modes.interpersonal.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </Card>
          <Card tone="rust" title="自我驱动">
            <ul className="ir-bullets ir-bullets-rust">
              {d.behavior_modes.self_drive.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </Card>
        </div>
        <div style={{ marginTop: 20 }}>
          <Card tone="cream" title="使用建议">{d.behavior_advice}</Card>
        </div>
        <div style={{ marginTop: 24 }}>
          <div className="ir-kicker">关键特质摘要</div>
          <table className="ir-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>特质</th>
                <th style={{ width: "12%" }}>百分位</th>
                <th style={{ width: "14%" }}>区间</th>
                <th>职业解释</th>
              </tr>
            </thead>
            <tbody>
              {traitRows.map((trait) => (
                <tr key={trait.key}>
                  <td>
                    <span className="ir-trait-name">{traitZhName(trait.key, trait.name)}</span>
                    <span className="ir-trait-en">{englishName(trait.key, trait.name)}</span>
                  </td>
                  <td className={trait.band === "high" || trait.band === "very_high" ? "ir-score-high" : "ir-score-low"}>
                    {trait.percentile ?? "—"}
                  </td>
                  <td>{BAND_LABELS[trait.band]}</td>
                  <td>{traitExplanation(trait)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>

      {/* 06 初步方向建议 */}
      <Page no="06" title="初步方向建议">
        <Card tone="cream" title="推荐主切口">{d.recommended_cut}</Card>
        <div className="ir-grid-2" style={{ marginTop: 24 }}>
          <Card tone="teal" title="适合进入验证的形态">
            <ul className="ir-bullets">
              {d.suitable_forms.map((form, i) => (
                <li key={i}>{form}</li>
              ))}
            </ul>
          </Card>
          <Card tone="rust" title="暂不建议进入的形态">
            <ul className="ir-bullets ir-bullets-rust">
              {d.not_recommended_forms.map((form, i) => (
                <li key={i}>{form}</li>
              ))}
            </ul>
          </Card>
        </div>
        <div style={{ marginTop: "auto", paddingBottom: 8 }}>
          <Card tone="cream" title="方向假设">{d.direction_hypothesis}</Card>
        </div>
      </Page>

      {/* 07 90 天验证框架 */}
      <Page no="07" title="90 天验证框架">
        <div className="ir-timeline" style={{ marginTop: 10 }}>
          {ninetyDaySteps.map((step, i) => (
            <div key={i} className="ir-timeline-item">
              <div className="ir-timeline-no">{i + 1}</div>
              <div>
                <div className="ir-timeline-title">{step.title}</div>
                <div className="ir-timeline-body">{step.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", paddingBottom: 8 }}>
          <Card tone="rust" title="止损线">{d.ninety_day.stop_loss}</Card>
        </div>
      </Page>

      {/* 08 风险与补偿机制 */}
      <Page no="08" title="风险与补偿机制">
        <div className="ir-grid-2" style={{ columnGap: 40 }}>
          <div>
            <div className="ir-kicker">最强优势</div>
            <Bars
              items={highTraits.map((t) => ({ label: traitDisplayLabel(t.key, t.name), score: t.percentile ?? 0 }))}
              color="teal"
            />
          </div>
          <div>
            <div className="ir-kicker">最需补偿</div>
            <Bars
              items={lowTraits.map((t) => ({ label: traitDisplayLabel(t.key, t.name), score: t.percentile ?? 0 }))}
              color="rust"
            />
          </div>
        </div>
        <div style={{ marginTop: "auto", paddingBottom: 8 }}>
          <Card tone="cream" title="补偿系统">
            <ul className="ir-bullets">
              <li>组织补偿：所有项目使用固定交付清单，需求不进清单就不承诺。</li>
              <li>务实补偿：每个新想法必须写清目标客户、付费理由、成本、边界和退出线。</li>
              <li>情绪补偿：压力期不做扩张决策，先把承诺减少到可兑现范围。</li>
              <li>反馈补偿：每周让外部搭档审视证据，专门寻找反例和盲点。</li>
            </ul>
          </Card>
        </div>
      </Page>

      {/* 09 本次诊断边界 */}
      <Page no="09" title="本次诊断边界">
        <div style={{ display: "grid", gap: 22 }}>
          <Card tone="teal" title="本次已经完成">
            {`方向初筛、价值观边界、天赋信号、优势组合、风险提醒和 90 天验证框架。它足以帮助${name}减少盲目选择，进入更清晰的验证。`}
          </Card>
          <Card tone="rust" title="本次还不能完成">
            不能直接替代完整决策。是否真正投入，还需要结合履历、收入结构、现金流压力、家庭约束、已有客户资源、可投入时间和真实市场反馈。
          </Card>
          <Card tone="cream" title="为什么要保留边界">
            方向判断最容易犯的错误，是把测评结论当成最终答案。本报告的价值是帮你找到高概率方向和明显风险；真正决策需要把人的特质、资源约束和市场证据放到同一张图里。
          </Card>
        </div>
        <div style={{ marginTop: 34 }}>
          <div className="ir-kicker">建议的下一步问题</div>
          <ul className="ir-bullets">
            <li>这个方向是否已有明确付费人群，而不是只有内容兴趣？</li>
            <li>第一版服务可以卖给谁，价格多少，交付边界是什么？</li>
            <li>如果 90 天验证失败，损失在哪里，如何止损？</li>
            <li>哪些能力必须自己做，哪些必须交给流程、工具或搭档？</li>
          </ul>
        </div>
      </Page>

      {/* 10 下一步决策怎么推进 */}
      <Page
        no="10"
        title="下一步决策怎么推进"
        intro="如果你要把初步判断变成可执行选择，下一步需要补齐真实经历、资源约束和市场证据。"
      >
        <div className="ir-grid-2">
          <Card tone="cream" title="你需要补齐的信息">
            <ul className="ir-bullets">
              <li>真实履历、项目经历和能力资产。</li>
              <li>现金流、时间、家庭和机会成本约束。</li>
              <li>3 个候选方向的评分矩阵。</li>
              <li>商业模式、报价和首批客户路径。</li>
              <li>90 天行动计划、止损线和复盘机制。</li>
            </ul>
          </Card>
          <Card tone="teal" title="为什么不能只靠本报告">
            <ul className="ir-bullets">
              <li>测评能说明倾向，不能说明市场会不会买单。</li>
              <li>价值观能说明能量，不能说明现金流能不能撑住。</li>
              <li>方向假设需要真实客户证据验证。</li>
              <li>重大决策必须把人、资源、市场和执行放在一起算。</li>
            </ul>
          </Card>
        </div>
        <div style={{ marginTop: "auto", paddingBottom: 8 }}>
          <Card tone="cream" title="下一步你要确认什么">
            如果你准备把这次初筛变成真实选择，下一步要补齐履历、现金流、资源、客户证据和时间约束。重点不是“再做一份报告”，而是判断哪条路径先验证、怎么卖、怎么执行、什么时候止损。
          </Card>
        </div>
      </Page>

      {/* 11 数据附录 */}
      <Page no="11" title="数据附录">
        <Card tone="teal" title="数据完整性">
          {`尾号 ${profile.id.slice(-12)}；客户：${name}；252题完整；更新：${formatDateTimeCN(profile.updated_at)}（中国时间）。`}
        </Card>
        <div style={{ marginTop: 24 }}>
          <div className="ir-kicker">252 题答案分布</div>
          <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
            {([1, 2, 3, 4, 5, 6, 7] as const).map((score) => {
              const count = distribution[score] ?? 0;
              const isPeak = count === distMax;
              return (
                <div
                  key={score}
                  style={{ display: "grid", gridTemplateColumns: "40px 1fr 52px", alignItems: "center", columnGap: 14 }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111826" }}>{score}分</div>
                  <div className="ir-bar-track" style={{ gridColumn: "auto", height: 9 }}>
                    <div
                      className={isPeak ? "ir-bar-fill" : count / distTotal > 0.15 ? "ir-bar-fill ir-bar-fill-gold" : "ir-bar-fill ir-bar-fill-rust"}
                      style={{ width: `${Math.max(2, (count / distMax) * 100)}%` }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: "#6f7886" }}>{count}题</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: "auto", display: "grid", gap: 16, paddingBottom: 8 }}>
          <Card title="交付说明">
            {`本报告基于${name}填写的方向题、价值观题和天赋测评答案生成，用于职业与创业方向初筛。报告不替代心理测评诊断、雇佣决策、医学、法律或财务建议。`}
          </Card>
          <Card tone="cream" title="复核建议">
            用于真实决策前，建议补充履历、现金流、资源、过往项目和可投入时间等信息，再做完整参谋复核。
          </Card>
        </div>
      </Page>
    </div>
  );
}
