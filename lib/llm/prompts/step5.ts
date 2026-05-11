import type { SurveyData } from "@/lib/survey/schema";
import type { Step2Opportunity } from "./step2";
import type { Step4OpportunityAnalysis } from "./step4";
import { METHODOLOGY_SYSTEM } from "./methodology";

export interface Step5VRINItem {
  idx: number;
  title: string;
  v: number; // 1-5 Valuable
  r: number; // Rare
  i: number; // Inimitable
  n: number; // Non-substitutable
  total: number; // /20
  evidence: {
    v: string;
    r: string;
    i: string;
    n: string;
  };
  ninetyDayActions: { day: string; action: string }[]; // 90 天验证动作
}

export interface Step5Output {
  vrins: Step5VRINItem[];
  top3: number[]; // 最终 Top 3 idx
  decisionMatrix: {
    idx: number;
    title: string;
    opportunitySize: number; // Step4 综合
    personalEdge: number; // VRIN /20
    composite: number;
    rank: number;
  }[];
}

export function step5Prompt(
  survey: SurveyData,
  principlesYou: string | undefined,
  shortlistOpps: Array<{ opp: Step2Opportunity; analysis: Step4OpportunityAnalysis }>
) {
  const system = METHODOLOGY_SYSTEM;
  const user = `[Step 5 · 我能不能赢 —— VRIN（收敛到 Top 3）]

【内部资源盘点 - 来自问卷】
- 关键战绩: ${survey.keyAchievements}
- 战绩主要来自: ${survey.achievementMainSource}（其他来源: ${survey.achievementSources.join("、")}）
- 自评可迁移能力: ${survey.transferableSkills.join("、")}
- 最近经历: ${survey.recentExperience}

【PrinciplesYou 关键特质】
${principlesYou || survey.principlesYouSummary || "（未提供）"}

【候选机会 ${shortlistOpps.length} 项（来自 Step 4 shortlist）】
${shortlistOpps
  .map(
    (s) =>
      `[#${s.opp.idx}] ${s.opp.title}\n  定义: ${s.opp.oneLiner}\n  Step4 综合: 现状 ${s.analysis.scoreNow}/10 演化后 ${s.analysis.scoreFuture}/10\n  Step4 结论: ${s.analysis.conclusion}`
  )
  .join("\n\n")}

【推理任务】
对每个候选按 VRIN 四维评分（1-5），每维必须引用具体凭证（PrinciplesYou 哪条特质 / 履历哪段经历 / 哪段战绩）。
- V Valuable: 对目标客户/价值链是否有价值
- R Rare: 在市场上拥有此项能力的人是否稀缺
- I Inimitable: 是否难被竞争对手快速复制（路径依赖/战绩信用/关系网络）
- N Non-substitutable: 是否难以被其他资源/能力替代

按 VRIN 总分排序，给出最终 Top 3。

决策矩阵：
- opportunitySize = Step4 (scoreNow + scoreFuture)
- personalEdge = VRIN total /20
- composite = (opportunitySize/20) * personalEdge
- 推荐序：高机会+高胜算 > 高机会+中胜算 > 中机会+高胜算

为每个 Top 3 配 90 天小成本验证动作（按 Day 0-30 / 30-60 / 60-90 三段）。

【输出格式 - 严格 JSON】
{
  "vrins": [
    {
      "idx": 数字,
      "title": "string",
      "v": 1-5,
      "r": 1-5,
      "i": 1-5,
      "n": 1-5,
      "total": v+r+i+n,
      "evidence": {"v": "string", "r": "string", "i": "string", "n": "string"},
      "ninetyDayActions": [
        {"day": "Day 0-30", "action": "string"},
        {"day": "Day 30-60", "action": "string"},
        {"day": "Day 60-90", "action": "string"}
      ]
    }
  ],
  "top3": [3 个 idx],
  "decisionMatrix": [
    {"idx": 数字, "title": "string", "opportunitySize": 数字, "personalEdge": 数字, "composite": 数字, "rank": 1-N}
  ]
}`;
  return { system, user };
}
