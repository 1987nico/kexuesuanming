import type { SurveyData } from "@/lib/survey/schema";
import { METHODOLOGY_SYSTEM } from "./methodology";

export interface Step1Output {
  likeProfile: string; // 喜欢区画像（Top 3 三圈交集）
  dislikeProfile: string; // 不喜欢区画像 / 排除带
  themes: { title: string; rationale: string }[]; // 1-3 个具体形态主题
  principlesCrossCheck: string[]; // PrinciplesYou 反向校验要点
  conflictNote: string; // 价值观冲突优先序的说明
}

export function step1Prompt(survey: SurveyData, principlesYou?: string) {
  const system = METHODOLOGY_SYSTEM;
  const user = `[Step 1 · 圈定「喜欢」与「不喜欢」的边界 —— 价值观双三圈]

【输入】
最重要 Top 3 价值观（顺序未必=优先级）：
  V+1: ${survey.topValues[0]}
  V+2: ${survey.topValues[1]}
  V+3: ${survey.topValues[2]}
${survey.topValuesOther ? `  Top 补充: ${survey.topValuesOther}` : ""}

最不重要 Bottom 3 价值观：
  V-1: ${survey.bottomValues[0]}
  V-2: ${survey.bottomValues[1]}
  V-3: ${survey.bottomValues[2]}
${survey.bottomValuesOther ? `  Bottom 补充: ${survey.bottomValuesOther}` : ""}

冲突时优先保: ${survey.conflictPriority}

受访人画像：
  姓名/城市/状态: ${survey.name} / ${survey.city} / ${survey.careerStatus}
  角色: ${survey.roleType}
  核心问题: ${survey.coreQuestion}
  已考虑路径: ${survey.pathsConsidered}
  触发原因: ${survey.triggerReasons.join("、")}
  最近职业经历: ${survey.recentExperience}
  关键战绩: ${survey.keyAchievements}
  自评可迁移能力: ${survey.transferableSkills.join("、")}
  最担心不能迁移的价值: ${survey.worryValue || "未填"}
  收入区间（当前/峰值/下阶段最低）: ${survey.currentIncome} / ${survey.peakIncome} / ${survey.minNextIncome}
  家庭状态: ${survey.familyStatus} / 主要收入责任: ${survey.incomeResponsibility} / 家庭支持度: ${survey.familySupport}
  最大现实约束: ${survey.biggestConstraint}

PrinciplesYou 关键特质（用户填写或上传摘要）：
${principlesYou || survey.principlesYouSummary || "（未提供，请基于价值观推断）"}

【推理任务】
1) 画出 Top 3 三圈 Venn 的交集 = 喜欢区，要求是「让用户同时被三个核心价值观点燃的活动域」。给出 2 段画像描述（不超过 80 字/段）。
2) 画出 Bottom 3 三圈交集 = 不喜欢区 / 排除带；列出 5-8 个直接 PASS 的典型角色形态。
3) 用 PrinciplesYou 反向校验：列出 4-6 条「价值观 vs 行为特质」的强一致 / 潜在矛盾 / 同向加强。
4) 把喜欢区收口为 1-3 个具体形态主题（不是岗位/不是行业，而是底层形态，如「业务接管型 turnaround」「认知/产品型 IP」），每条给出一句话 rationale。
5) 用一句话说明冲突优先序对方向选择的影响。

【输出格式 - 严格 JSON】
{
  "likeProfile": "string",
  "dislikeProfile": "string",
  "themes": [{"title": "string", "rationale": "string"}],
  "principlesCrossCheck": ["string"],
  "conflictNote": "string"
}`;
  return { system, user };
}
