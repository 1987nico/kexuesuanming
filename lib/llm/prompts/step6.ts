import type { SurveyData } from "@/lib/survey/schema";
import type { Step2Opportunity } from "./step2";
import type { Step4OpportunityAnalysis } from "./step4";
import type { Step5VRINItem } from "./step5";
import { METHODOLOGY_SYSTEM } from "./methodology";

export type PremortemLayer = "market" | "moat" | "capability" | "motivation" | "reality";

export const PREMORTEM_LAYER_LABELS: Record<PremortemLayer, string> = {
  market: "市场层（PEST 恶化项 + 五力高强度项）",
  moat: "竞争壁垒层（VRIN R/I/N 低分维）",
  capability: "资源/能力层（PrinciplesYou 短板 × 角色关键能力错配）",
  motivation: "价值观/动机层（与排除带的边缘交集 + 勉强分理由）",
  reality: "现实约束层（家庭/现金流/孩子教育/地理）",
};

export interface PremortemFinding {
  layer: PremortemLayer;
  failureReason: string;
  earlySignal30d: string;
  earlySignal90d: string;
  earlySignal6m: string;
  exitCondition: string;
  mitigation: string;
}

export interface Step6Premortem {
  idx: number;
  title: string;
  narrative: string; // "输的剧本" 200 字第一人称
  findings: PremortemFinding[]; // 5 层，每层 1 条
  actionLinks: { actionDay: string; failureLayer: PremortemLayer }[]; // 90 天动作 ↔ 失败假设
}

export interface Step6Output {
  premortems: Step6Premortem[];
}

export function step6Prompt(
  survey: SurveyData,
  principlesYou: string | undefined,
  top3Opps: Array<{
    opp: Step2Opportunity;
    analysis: Step4OpportunityAnalysis;
    vrin: Step5VRINItem;
    userScore: number;
    userReason: string;
  }>
) {
  const system =
    METHODOLOGY_SYSTEM +
    `

【Step 6 失败验尸特别要求】
你现在的视角是：「12 个月后的我正在写复盘」。倒推「如果这条路输了，最有可能是怎么输的」。
- 每条失败原因必须引用前面 Step 1-5 的某条已有数据/凭证作为证据（防止瞎编新风险）
- 早期预警必须可量化（"DAU 第 60 天未达 1000" 而不是 "用户增长不行"）
- 退出条件必须是红线（达到就 cut loss，避免沉没成本）
- "输的剧本" 必须用具体场景化叙事（不是概括，是画面），约 200 字`;

  const user = `[Step 6 · 失败验尸 Pre-mortem]

【最终 Top 3 候选】
${top3Opps
  .map((t) => {
    const ff = t.analysis.fiveForcesNow;
    const ffF = t.analysis.fiveForcesFuture;
    return `[#${t.opp.idx}] ${t.opp.title}
  定义: ${t.opp.oneLiner}
  用户感性分: ${t.userScore}/10 — "${t.userReason}"
  PEST: P=${t.analysis.pest.P} | E=${t.analysis.pest.E} | S=${t.analysis.pest.S} | T=${t.analysis.pest.T}
  五力 现状/演化: 竞争 ${ff.competitorIntensity}/${ffF.competitorIntensity} 新入 ${ff.newEntrantThreat}/${ffF.newEntrantThreat} 替代 ${ff.substituteThreat}/${ffF.substituteThreat} 供 ${ff.supplierPower}/${ffF.supplierPower} 买 ${ff.buyerPower}/${ffF.buyerPower}
  VRIN: V${t.vrin.v} R${t.vrin.r} I${t.vrin.i} N${t.vrin.n} (total ${t.vrin.total}/20)
  VRIN 凭证: V=${t.vrin.evidence.v} | R=${t.vrin.evidence.r} | I=${t.vrin.evidence.i} | N=${t.vrin.evidence.n}
  Step4 结论: ${t.analysis.conclusion}
  90 天动作: ${t.vrin.ninetyDayActions.map((a) => `${a.day}: ${a.action}`).join("; ")}`;
  })
  .join("\n\n")}

【用户排除带（Step 1 不喜欢区）& 现实约束】
- 最大现实约束: ${survey.biggestConstraint}
- 家庭状态: ${survey.familyStatus} / 主要收入责任: ${survey.incomeResponsibility} / 家庭支持度: ${survey.familySupport}
- 收入下限: ${survey.minNextIncome} / 下降容忍: ${survey.incomeDownTolerance}
- Bottom 3 价值观: ${survey.bottomValues.join("、")}

【PrinciplesYou 短板】
${principlesYou || survey.principlesYouSummary || "（未提供）"}

【推理任务】
对每个 Top 3 候选生成：
1) 一段 ~200 字的「输的剧本」第一人称叙事——12 个月后的我正在写复盘，把最高风险点串联成具体场景化故事。例："2027 年 X 月，我的招生漏斗 ROI 跌破 0.8，团队走了 3 个核心，孩子学校开始投诉…"
2) 5 层失败因，每层 1 条最致命的失败原因 + 30 天/90 天/6 月 量化早期预警 + 退出条件 + 缓解动作。5 层定义：
   - market: 市场层（引用 PEST 恶化项或五力≥4 力）
   - moat: 竞争壁垒层（引用 VRIN ≤3 分维）
   - capability: 资源/能力层（引用 PrinciplesYou 低分位特质 × 角色关键能力）
   - motivation: 价值观/动机层（引用与 Bottom 3 的边缘交集，或用户打分理由里的"勉强"信号）
   - reality: 现实约束层（引用问卷的家庭/现金流/孩子教育）
3) 90 天动作 ↔ 失败假设的挂钩 (actionLinks)：每个 Day 段（"Day 0-30" / "Day 30-60" / "Day 60-90"）至少挂 1 个 failureLayer

【输出格式 - 严格 JSON】
{
  "premortems": [
    {
      "idx": 数字,
      "title": "string",
      "narrative": "string (~200 字第一人称)",
      "findings": [
        {
          "layer": "market" | "moat" | "capability" | "motivation" | "reality",
          "failureReason": "string",
          "earlySignal30d": "string (量化)",
          "earlySignal90d": "string (量化)",
          "earlySignal6m": "string (量化)",
          "exitCondition": "string (红线)",
          "mitigation": "string"
        }
        // 必须 5 条，5 个 layer 各一条
      ],
      "actionLinks": [
        {"actionDay": "Day 0-30", "failureLayer": "market|moat|capability|motivation|reality"}
      ]
    }
  ]
}`;
  return { system, user };
}
