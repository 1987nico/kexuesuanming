import type { SurveyData } from "@/lib/survey/schema";
import type { Step2Opportunity } from "./step2";
import { METHODOLOGY_SYSTEM } from "./methodology";

export interface Step4PEST {
  P: string;
  E: string;
  S: string;
  T: string;
}

export interface Step4FiveForcesItem {
  competitorIntensity: number; // 1-5
  newEntrantThreat: number;
  substituteThreat: number;
  supplierPower: number;
  buyerPower: number;
}

export interface Step4OpportunityAnalysis {
  idx: number;
  title: string;
  pest: Step4PEST;
  fiveForcesNow: Step4FiveForcesItem;
  fiveForcesFuture: Step4FiveForcesItem;
  scoreNow: number; // 0-10
  scoreFuture: number; // 0-10
  conclusion: string;
}

export interface Step4Output {
  analyses: Step4OpportunityAnalysis[];
  shortlist: number[]; // 收敛到约 6 个 idx
}

export function step4Prompt(
  survey: SurveyData,
  qualifiedOpps: Array<{ opp: Step2Opportunity; userScore: number; userReason: string }>,
  externalSnippets: string[]
) {
  const system = METHODOLOGY_SYSTEM;
  const user = `[Step 4 · 机会够不够大 —— PEST + 波特五力（收敛到 ~6）]

【输入】用户感性验证 ≥7 分的机会（${qualifiedOpps.length} 项）：
${qualifiedOpps
  .map(
    (q) =>
      `[#${q.opp.idx}] ${q.opp.title}\n  定义: ${q.opp.oneLiner}\n  用户感性分: ${q.userScore}/10 — "${q.userReason}"\n  典型一天: ${q.opp.dayInLife}`
  )
  .join("\n\n")}

【外部检索片段】
${externalSnippets.length ? externalSnippets.join("\n---\n") : "（基于通用知识 + 2025-2026 行业趋势作答）"}

【推理任务】
对每个机会跑：
1) PEST 扫描：P/E/S/T 各一段，必须包含具体数据/趋势/链接（如「教育部 AI+教育行动 2027 全阶段覆盖」「K12 AI 教育 2024→2031 由 3.91 亿→78.15 亿美元 CAGR 39.6% (The Insight Partners)」）。
2) 波特五力 现状评分（1-5）：现有竞争者强度 / 潜在进入者威胁 / 替代品威胁 / 供应商议价 / 买方议价。
3) 波特五力 演化后（未来 3-5 年）评分（1-5）。
4) 综合 scoreNow (0-10) 和 scoreFuture (0-10)。
5) 一句话结论：机会大小定性 + 关键演化判断。

收敛规则：综合「scoreNow + scoreFuture」≥ 13 进入 shortlist；shortlist 大约 6 个 idx；同质项可合并视角。

【输出格式 - 严格 JSON】
{
  "analyses": [
    {
      "idx": 数字,
      "title": "string",
      "pest": {"P": "string", "E": "string", "S": "string", "T": "string"},
      "fiveForcesNow": {
        "competitorIntensity": 1-5,
        "newEntrantThreat": 1-5,
        "substituteThreat": 1-5,
        "supplierPower": 1-5,
        "buyerPower": 1-5
      },
      "fiveForcesFuture": { ...同上... },
      "scoreNow": 0-10,
      "scoreFuture": 0-10,
      "conclusion": "string (含合并建议如适用)"
    }
  ],
  "shortlist": [数字数组，约 6 个 idx]
}`;
  return { system, user };
}
