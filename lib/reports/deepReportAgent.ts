import { llmJSON } from "@/lib/llm/router";
import type { AssessmentProfile } from "./assessmentProfile";
import type { DeepReportGenerated, SensoryScoreInput } from "./deepReport";
import type { DirectionSession } from "./directionSession";
import { sessionDislikedCards, sessionLikedCards } from "./directionSession";
import type { InitialDiagnosisGenerated } from "./initialDiagnosis";
import { buildLiteCustomerInput } from "./builders";
import { archetypeZhName, traitZhName } from "./talentNames";

const MARKET_DISCLAIMER =
  "本节市场分析由 AI 基于公开常识与推理生成，其中涉及的行业规模、竞争格局、政策与数据均需人工核实真实来源后再交付，不可直接作为投资依据。";

const DEEP_SYSTEM_PROMPT = `你是「职业/事业方向深度诊断报告」的首席顾问。你要基于客户的价值观双三圈、PrinciplesYou 天赋测评、问卷、初步诊断报告，以及（如有）方向滑卡感性验证结果，产出一份逻辑自洽、可交付的深度诊断报告。

报告体例对齐「年雪 · 职业/事业方向咨询报告」金样本：
- 封面先给结论：主线、第一切口、暗线、行动方式（主次结构，不是并列创业项目）
- 每个 Step 按「输入 → 推理 → 输出」三段写清楚
- Step3 对每个达标方向给出 Step4 处理方式（进入/合并/淘汰/保留为策略）
- Step4 用 PEST 修正波特五力，对入围方向做市场判断
- Step5 用 VRIN 收敛 Top3，给出综合分与凭证
- Step6 反向推演失败剧本，写早期信号和止损线
- 最终推荐 3 条：主线、第一切口、暗线小 MVP
- 90 天验证计划按三条推荐分列动作与继续条件

硬性要求：
- 全文不得出现「科学算命」「职场参谋」字样（内部代号与品牌名，不对客户暴露），也不要出现「小报告」「大报告」「完整咨询报告」等旧叫法，对客户统一说「初步诊断报告」「深度诊断报告」。
- 全程中文、大白话，咨询顾问判断密度，不说空话套话。
- 一切判断必须回扣价值观（喜欢区/排除带）和天赋特质。
- 必须与初步诊断报告逻辑一致；若最终推荐不同，在「与初步诊断报告的关系」里解释。
- 方向滑卡「点亮」的方向必须进入 Step3 达标列表，不得忽略。
- 市场分析可推理，但不得编造具体数字和来源；外部事实用「（待核实）」标注。
- Step4 可以给顾问评分，但必须说明评分是决策判断，不是外部市场事实。
- 不承诺收益、不打包票。失败验尸要写清楚会怎么输。
- 只输出 JSON，不要自我对话或与用户商量的话。`;

export interface DeepPromptInput {
  profile: AssessmentProfile;
  liteMainCut?: string;
  initialDiagnosis?: InitialDiagnosisGenerated;
  directionSession?: DirectionSession;
  sensoryScores?: SensoryScoreInput[];
}

function buildDeepUserPrompt(input: DeepPromptInput) {
  const { profile } = input;
  const vp = profile.value_profile;
  const tp = profile.talent_profile;
  const surveyInput = buildLiteCustomerInput(profile);
  const topArchetypes = tp.top_archetypes
    .slice(0, 6)
    .map((a) => archetypeZhName(a.key, a.name))
    .join("、");
  const highTraits = tp.high_traits.slice(0, 8).map((t) => traitZhName(t.key, t.name)).join("、");
  const lowTraits = tp.low_traits.slice(0, 8).map((t) => traitZhName(t.key, t.name)).join("、");

  const diagnosis = input.initialDiagnosis;
  const diagnosisBlock = diagnosis
    ? `
【初步诊断报告（深度诊断报告必须逻辑一致）】
一句话结论：${diagnosis.one_line_conclusion}
主判断：${diagnosis.main_judgement}
推荐主切口：${diagnosis.recommended_cut}
初步方向：${diagnosis.initial_direction}
最大风险：${diagnosis.biggest_risk}
适合形态：${diagnosis.suitable_forms.join("；")}
不建议形态：${diagnosis.not_recommended_forms.join("；")}
方向假设：${diagnosis.direction_hypothesis}`
    : "";

  const session = input.directionSession;
  const likedCards = session ? sessionLikedCards(session) : [];
  const dislikedCards = session ? sessionDislikedCards(session) : [];
  const sessionBlock = session
    ? `
【方向滑卡测评（深度诊断报告测评）】
状态：${session.status}；点亮 ${likedCards.length} / ${session.target_likes} 个方向
点亮方向（右滑，必须纳入 Step3 达标列表）：
${likedCards.map((c) => `- ${c.title}：${c.one_liner}`).join("\n") || "（暂无）"}
划掉方向（左滑，应作为排除或降权信号）：
${dislikedCards.map((c) => `- ${c.title}：${c.one_liner}`).join("\n") || "（暂无）"}`
    : "";

  const sensoryBlock =
    input.sensoryScores && input.sensoryScores.length
      ? `客户本人真实感性验证（方向滑卡点亮，≥7 视为达标，必须以此为准）：
${input.sensoryScores.map((s) => `- ${s.direction}：${s.score}${s.reason ? `（${s.reason}）` : ""}`).join("\n")}`
      : likedCards.length
        ? `以上点亮方向即为真实感性验证结果，待客户录入=false。`
        : "客户尚未完成方向滑卡测评。请对 Step2 方向给出预判达标性，并标注 待客户录入=true。";

  return `
客户：${profile.customer_name}

【问卷关键信息】
当前决策：${surveyInput.current_decision}
时间窗口：${surveyInput.time_window}
最大卡点：${surveyInput.stuck_point}
能量来源：${surveyInput.energy_source}
想避开的状态：${surveyInput.avoid_state}
可迁移资产：${surveyInput.transferable_assets}
感兴趣方向：${surveyInput.desired_direction}
明确不碰：${surveyInput.avoid_direction}
原始问卷：${JSON.stringify(profile.survey_answers)}

【价值观双三圈】
喜欢区：${vp.liked_values.join("、")}
排除带：${vp.excluded_values.join("、")}
喜欢区小结：${vp.like_summary}
排除带小结：${vp.exclude_summary}
筛选句：${vp.filter_sentence}

【天赋测评（${tp.mode === "original-sync" ? "PrinciplesYou 真实同步" : "本地兜底"}）】
主原型：${topArchetypes || "无"}
高分特质：${highTraits || "无"}
低分（需补偿）特质：${lowTraits || "无"}
${diagnosisBlock}
${sessionBlock}

【感性验证输入】
${sensoryBlock}

请输出如下 JSON（中文键，值要具体、可交付）：
{
  "conclusion_first": {
    "一句话结论": "",
    "最终建议": "",
    "主线": "",
    "第一切口": "",
    "暗线": "",
    "行动方式": ""
  },
  "step_narratives": {
    "step1": { "输入": "", "推理": "", "输出": "" },
    "step2": { "输入": "", "推理": "", "输出": "" },
    "step3": { "输入": "", "推理": "", "输出": "" },
    "step4": { "输入": "", "推理": "", "输出": "" },
    "step5": { "输入": "", "推理": "", "输出": "" },
    "step6": { "输入": "", "推理": "", "输出": "" }
  },
  "directions": [
    { "方向": "", "理由": "", "契合价值观": "", "排除带护栏": "" }
  ],
  "sensory": { "说明": "", "达标方向": [""], "待客户录入": false, "聚类主题": [""] },
  "sensory_table": [
    { "序号": 1, "方向": "", "来源": "方向滑卡第N轮", "Step4处理方式": "进入|合并|淘汰|保留为策略", "备注": "" }
  ],
  "market": [
    {
      "方向": "",
      "机会判断": "",
      "政策与经济": "",
      "社会趋势": "",
      "技术变化": "",
      "竞争与门槛": "",
      "五力现状": "",
      "五力未来": "",
      "Step4判断": "进入|观察|淘汰",
      "待核实提示": ""
    }
  ],
  "market_overview": [
    {
      "序号": 1,
      "方向": "",
      "五力现状": 62.4,
      "五力未来": 69.6,
      "Δ": 7.2,
      "机会现状": 6.5,
      "机会未来": 6.6,
      "合计": 13.1,
      "Step4判断": "进入|合并进入|合并观察|观察|淘汰|保留为策略"
    }
  ],
  "vrin": [
    {
      "方向": "",
      "价值V": 4,
      "稀缺R": 4,
      "难模仿I": 3,
      "难替代N": 3,
      "VRIN总分": 14,
      "Step4机会": "",
      "综合分": "",
      "凭证": "",
      "盲点": ""
    }
  ],
  "premortem": [
    {
      "方向": "",
      "失败剧本": "",
      "12个月怎么输": "",
      "早期预警信号": [""],
      "止损线": "",
      "对策": [""]
    }
  ],
  "final_recommendations": {
    "推荐1主线": { "方向": "", "推荐逻辑": "" },
    "推荐2第一切口": { "方向": "", "推荐逻辑": "" },
    "推荐3暗线": { "方向": "", "推荐逻辑": "" },
    "与初步诊断报告的关系": ""
  },
  "ninety_day_plan": {
    "表头": ["阶段", "主线", "切口", "暗线", "继续条件"],
    "Day0-30": { "主线": "", "切口": "", "暗线": "", "继续条件": "" },
    "Day30-60": { "主线": "", "切口": "", "暗线": "", "继续条件": "" },
    "Day60-90": { "主线": "", "切口": "", "暗线": "", "继续条件": "" },
    "止损线": ""
  },
  "final_judgement": { "判断": "" },
  "diagram_data": {
    "matrix": [ { "direction": "", "opportunity": 14, "win": 15 } ],
    "bright_zone": [ { "direction": "", "score": 8 } ],
    "market_matrix": [ { "direction": "", "opportunity": 8, "barrier": 6 } ]
  }
}

要求：
- directions 6-10 个，只能在喜欢区内发散
- sensory_table 覆盖所有达标方向（含滑卡点亮的）
- market 对 Step4 进入/观察的方向做分析
- market_overview 覆盖 sensory_table 里所有 Step4 处理方式不是“淘汰”的方向；五力威胁分 0-100，越高越不利；Δ=五力未来-五力现状；机会分 0-10；合计=机会现状+机会未来
- vrin 收敛 Top3-5，Top3 在 final_recommendations 体现
- premortem 对 Top3 各写一份
- diagram_data 分数与上文判断一致`.trim();
}

// 兜底清洗：品牌与内部代号不允许出现在交付内容里（对客户只说「咨询报告」）。
function normalizePublicReportTerms(text: string): string {
  return text
    .replaceAll("完整咨询报告", "深度诊断报告")
    .replaceAll("大报告", "深度诊断报告")
    .replaceAll("小报告", "初步诊断报告");
}

export function scrubBrandTerms<T>(value: T): T {
  if (typeof value === "string") {
    return normalizePublicReportTerms(value)
      .replaceAll("科学算命咨询报告", "咨询报告")
      .replaceAll("「科学算命」", "")
      .replaceAll("“科学算命”", "")
      .replaceAll(/科学算命\s*[·・]\s*/g, "")
      .replaceAll("科学算命", "")
      .replaceAll("「职场参谋」", "")
      .replaceAll("“职场参谋”", "")
      .replaceAll("职场参谋", "") as T;
  }
  if (Array.isArray(value)) return value.map((item) => scrubBrandTerms(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        normalizePublicReportTerms(k),
        scrubBrandTerms(v),
      ])
    ) as T;
  }
  return value;
}

export async function generateDeepReport(input: DeepPromptInput): Promise<{
  generated: DeepReportGenerated;
  usage?: Record<string, unknown>;
}> {
  const result = await llmJSON<Record<string, unknown>>({
    system: DEEP_SYSTEM_PROMPT,
    user: buildDeepUserPrompt(input),
    maxTokens: 12000,
    temperature: 0.45,
  });
  const d = scrubBrandTerms(result.data ?? {});

  const asArray = (v: unknown): Array<Record<string, unknown>> =>
    Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
  const asObj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

  const usedInput = !!(input.sensoryScores && input.sensoryScores.length);
  const sensory = asObj(d.sensory);
  if (!usedInput && sensory["待客户录入"] === undefined) sensory["待客户录入"] = true;
  if (usedInput) sensory["待客户录入"] = false;

  const stepNarrativesRaw = asObj(d.step_narratives);
  const stepNarratives: DeepReportGenerated["step_narratives"] = {};
  for (const key of ["step1", "step2", "step3", "step4", "step5", "step6"] as const) {
    const block = asObj(stepNarrativesRaw[key]);
    if (Object.keys(block).length) stepNarratives[key] = block;
  }

  const generated: DeepReportGenerated = {
    generated_at: new Date().toISOString(),
    provider: result.raw.provider,
    model: result.raw.model,
    market_disclaimer: MARKET_DISCLAIMER,
    sensory_from_input: usedInput,
    conclusion_first: asObj(d.conclusion_first),
    directions: asArray(d.directions),
    sensory,
    sensory_table: asArray(d.sensory_table),
    market_overview: asArray(d.market_overview) as unknown as DeepReportGenerated["market_overview"],
    market: asArray(d.market),
    vrin: asArray(d.vrin),
    premortem: asArray(d.premortem),
    final_recommendations: asObj(d.final_recommendations),
    ninety_day_plan: asObj(d.ninety_day_plan),
    final_judgement: asObj(d.final_judgement),
    step_narratives: Object.keys(stepNarratives).length ? stepNarratives : undefined,
    diagram_data: asObj(d.diagram_data) as DeepReportGenerated["diagram_data"],
  };

  return {
    generated,
    usage: {
      provider: result.raw.provider,
      model: result.raw.model,
      input_tokens: result.raw.usage?.inputTokens,
      output_tokens: result.raw.usage?.outputTokens,
    },
  };
}
