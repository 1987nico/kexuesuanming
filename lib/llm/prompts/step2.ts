import type { SurveyData } from "@/lib/survey/schema";
import type { Step1Output } from "./step1";
import { METHODOLOGY_SYSTEM } from "./methodology";

export interface Step2Opportunity {
  idx: number; // 1..30
  category: string; // 行业/方向分类，如 "教育红利复用"
  title: string;
  oneLiner: string; // 一句话定义
  dayInLife: string; // 典型一天
  workContent: string; // 典型工作内容
  workMethods: string; // 典型工作方法
  imagePrompt: string; // 场景图 prompt（英文，给图像模型）
  evidence: { label: string; url?: string }[]; // 1-2 条外部佐证
}

export interface Step2Output {
  opportunities: Step2Opportunity[];
}

export function step2Prompt(
  survey: SurveyData,
  step1: Step1Output,
  externalSnippets: string[]
) {
  const system = METHODOLOGY_SYSTEM;
  const user = `[Step 2 · 机会发散 30 个 · 画面化]

【输入】
Step 1 喜欢区: ${step1.likeProfile}
Step 1 不喜欢区: ${step1.dislikeProfile}
Step 1 主题:
${step1.themes.map((t, i) => `  ${i + 1}) ${t.title} —— ${t.rationale}`).join("\n")}

受访人能力射程: ${survey.transferableSkills.join("、")}
最近经历主线: ${survey.recentExperience}
关键战绩: ${survey.keyAchievements}
最大现实约束: ${survey.biggestConstraint}

【外部检索片段（可作为佐证素材）】
${externalSnippets.length ? externalSnippets.join("\n---\n") : "（无外部检索结果，请基于通用知识 + 已知 2025-2026 行业趋势作答）"}

【推理任务】
按「行业 × 角色 × 商业模式」三维拼接，硬性扩散到 30 个候选机会。
- 反向剔除：任何落入「Step 1 不喜欢区」的角色直接不放（如纯陪伴疗愈、社工、体制内慢节奏）。
- 必须覆盖至少 5 个不同 category（如：教育红利复用、跨行业组织能力复用、内容/IP、投资/顾问/战略、组合/平台 等）。
- 每条必须有强画面感的「典型一天」，要写出具体时间、对接对象、动作（如「早 9 点跨时差对接迪拜代理…」）。
- 外部佐证 evidence 引用真实报告/媒体名（如「艾瑞《2026 GenAI+教育》」），URL 可选。

【输出格式 - 严格 JSON】
{
  "opportunities": [
    {
      "idx": 1,
      "category": "string",
      "title": "string",
      "oneLiner": "string",
      "dayInLife": "string (>=80 字，含具体时间和动作)",
      "workContent": "string (3-5 件交付物/高频任务)",
      "workMethods": "string (最依赖的工具、节奏、协作模式)",
      "imagePrompt": "string (英文，给图像模型，<=30 词)",
      "evidence": [{"label": "string", "url": "string?"}]
    }
    // ...共 30 条，idx 从 1 到 30 ...
  ]
}`;
  return { system, user };
}
