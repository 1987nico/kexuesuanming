/**
 * 问卷字段定义（结构化）—— 严格对齐 `问卷.xlsx`。
 * 用于：
 *   1. 前端表单渲染
 *   2. 后端 zod 校验
 *   3. AI Prompt 注入
 */

import { z } from "zod";

// ============ 枚举选项 ============

export const CAREER_STATUS = [
  "在职，但在考虑下一步",
  "已离职，正在看机会",
  "刚换新工作，正在适应",
  "创业中",
  "合伙/跟项目中",
  "休息或观察中",
  "其他",
] as const;

export const ROLE_TYPE = [
  "公司老板/创始人",
  "合伙人/联合创始人",
  "高管/业务负责人",
  "中层管理者",
  "专家型岗位",
  "独立顾问/自由职业",
  "其他",
] as const;

export const TRIGGER_REASON = [
  "行业变化明显",
  "想创业或做自己的事",
  "家庭或生活阶段变化",
  "晋升/发展空间受限",
  "组织调整职业发展受阻",
  "收入变化或收入预期下降",
  "想重新判断自己的长期方向",
  "判断业务无盈利可能",
  "其他",
] as const;

export const ACHIEVEMENT_SOURCE = [
  "个人能力",
  "老板授权",
  "团队能力",
  "运气因素",
  "行业红利",
  "平台资源",
  "时代机会",
  "其他",
] as const;

export const TRANSFERABLE_SKILLS = [
  "组织管理能力",
  "团队搭建能力",
  "运营能力",
  "行业认知",
  "销售能力",
  "客户/资源整合能力",
  "跨部门协同能力",
  "数据分析能力",
  "复杂问题拆解能力",
  "产品能力",
  "内容/IP 能力",
  "技术能力",
  "其他",
] as const;

export const INCOME_RANGE = [
  "30 万以下",
  "30-50 万",
  "50-100 万",
  "100-200 万",
  "200-500 万",
  "500 万以上",
  "不方便填写",
] as const;

export const INCOME_RANGE_FLEX = [...INCOME_RANGE, "视机会而定", "暂时说不清", "其他"] as const;

export const INCOME_DOWN_TOLERANCE = [
  "不能接受",
  "1-3 个月",
  "3-6 个月",
  "6-12 个月",
  "12 个月以上",
  "视机会而定",
  "不确定",
] as const;

export const FAMILY_STATUS = ["未婚", "已婚无孩", "已婚有孩", "离异/单亲", "其他"] as const;

export const INCOME_RESPONSIBILITY = [
  "是，主要靠我",
  "不是，伴侣/家人承担更多",
  "我和伴侣共同承担",
  "目前压力不大",
  "不方便填写",
  "其他",
] as const;

export const FAMILY_SUPPORT = [
  "非常支持",
  "比较支持",
  "中立",
  "不太支持",
  "明确反对",
  "还没充分沟通",
  "不方便填写",
] as const;

// 价值观候选（综合 PrinciplesYou + Schwartz 价值观 + 问卷答案归纳）
export const VALUE_OPTIONS = [
  "家财万贯",
  "拥有充满乐趣和冒险的生活",
  "学习/进化",
  "实现职业目标",
  "了解世界",
  "助人为乐",
  "被爱",
  "安稳度日，优哉游哉",
  "品行端正",
  "创新",
  "家庭和美",
  "影响力 / 改变世界",
  "自由 / 自主",
  "美感与创造",
  "归属与团队",
  "声望与认可",
  "公平与正义",
  "自我实现",
  "传承与责任",
  "健康与活力",
] as const;

export const EXPECTED_OUTCOMES = [
  "判断几条路径哪个更适合",
  "梳理自己的能力和市场价值",
  "看清自己现在真正的问题",
  "实现职业目标",
  "其他",
] as const;

// ============ 表单 Schema (zod) ============

export const surveySchema = z
  .object({
    name: z.string().min(1, "请填写姓名"),
    city: z.string().min(1, "请填写所在城市"),
    careerStatus: z.enum(CAREER_STATUS),
    careerStatusOther: z.string().optional(),
    roleType: z.enum(ROLE_TYPE),
    roleTypeOther: z.string().optional(),

    coreQuestion: z.string().min(2, "请描述你想解决的核心问题"),
    pathsConsidered: z.string().min(2, "请列出已考虑的路径"),

    triggerReasons: z.array(z.enum(TRIGGER_REASON)).min(1, "至少选 1 项"),
    triggerOther: z.string().optional(),

    recentExperience: z.string().min(2, "请列出最近 1-3 段主要职业经历"),
    keyAchievements: z.string().min(2, "请列出 2-3 个关键战绩"),

    achievementSources: z.array(z.enum(ACHIEVEMENT_SOURCE)).min(1),
    achievementSourceOther: z.string().optional(),
    achievementMainSource: z.string().min(1),

    transferableSkills: z.array(z.enum(TRANSFERABLE_SKILLS)).min(1),
    transferableSkillsOther: z.string().optional(),
    worryValue: z.string().optional(),

    currentIncome: z.enum(INCOME_RANGE),
    peakIncome: z.enum(INCOME_RANGE),
    minNextIncome: z.enum(INCOME_RANGE_FLEX),
    minNextIncomeOther: z.string().optional(),
    incomeDownTolerance: z.enum(INCOME_DOWN_TOLERANCE),

    familyStatus: z.enum(FAMILY_STATUS),
    familyStatusOther: z.string().optional(),
    incomeResponsibility: z.enum(INCOME_RESPONSIBILITY),
    incomeResponsibilityOther: z.string().optional(),
    familySupport: z.enum(FAMILY_SUPPORT),
    biggestConstraint: z.string().min(1, "请填写最大现实约束"),
    biggestConstraintOther: z.string().optional(),

    topValues: z
      .array(z.string())
      .min(3, "请选满 3 个")
      .max(3, "最多选 3 个"),
    topValuesOther: z.string().optional(),
    bottomValues: z
      .array(z.string())
      .min(3, "请选满 3 个")
      .max(3, "最多选 3 个"),
    bottomValuesOther: z.string().optional(),
    conflictPriority: z.string().min(1, "请选择冲突时优先保的价值观"),

    principlesYouSummary: z.string().optional(),
    expectedOutcomes: z.array(z.enum(EXPECTED_OUTCOMES)).min(1),
    expectedOutcomesOther: z.string().optional(),
    additionalInfo: z.string().optional(),
  })
  .refine(
    (data) => {
      const overlap = data.topValues.filter((v) => data.bottomValues.includes(v));
      return overlap.length === 0;
    },
    { message: "最重要价值观与最不重要价值观不能重叠", path: ["bottomValues"] }
  );

export type SurveyData = z.infer<typeof surveySchema>;
