import type {
  GrowthPersona,
  MethodApplicability,
  MethodGenerationMode,
  TitleMethodGroup,
  TitleMethodId,
} from "./types";

export interface TitleMethodDefinition {
  id: TitleMethodId;
  order: number;
  label: string;
  group: TitleMethodGroup;
  instruction: string;
  sourceRequired: boolean;
}

export const TITLE_METHODS: TitleMethodDefinition[] = [
  { id: "traffic", order: 1, label: "蹭流量", group: "native", instruction: "把72小时内的热点迁移成当前业务人群的具体决策问题，热点必须有原链接。", sourceRequired: true },
  { id: "human_pain", order: 2, label: "行业人性痛点", group: "native", instruction: "点破当前业务人群在身份、投入、稳定与选择之间不愿明说的人性冲突。", sourceRequired: false },
  { id: "tug_of_war", order: 3, label: "拔河式选题", group: "native", instruction: "把两个都合理、又彼此冲突的真实选择放进同一个标题。", sourceRequired: false },
  { id: "scarce_material", order: 4, label: "送稀缺资料", group: "native", instruction: "承诺一份正文里会直接交付的清单、路线图或判断表，不能用互动换资料。", sourceRequired: false },
  { id: "superlative", order: 5, label: "超级极限词", group: "native", instruction: "使用可被正文证明的最危险、最容易等极限表达，禁止结果保证。", sourceRequired: false },
  { id: "contrarian", order: 6, label: "反认知", group: "native", instruction: "先写常见判断，再给出有条件、有依据的反转。", sourceRequired: false },
  { id: "nostalgia", order: 7, label: "怀旧", group: "native", instruction: "用过去与现在的求职、职业经验或身份价值变化形成共鸣。", sourceRequired: false },
  { id: "inventory", order: 8, label: "盘点", group: "native", instruction: "用明确数字盘点当前业务中的资产、风险、信号或动作，正文必须逐项兑现。", sourceRequired: false },
  { id: "same_product", order: 9, label: "相同产品", group: "benchmark", instruction: "迁移近期同类职业诊断、咨询或求职服务的产品表达，不照搬措辞。", sourceRequired: true },
  { id: "same_effect", order: 10, label: "相同功效", group: "benchmark", instruction: "迁移帮助用户比较、判断、选择或降低风险的功效表达。", sourceRequired: true },
  { id: "similar_audience", order: 11, label: "相似人群", group: "benchmark", instruction: "迁移与当前业务目标用户高度相似的人群处境。", sourceRequired: true },
  { id: "same_outcome", order: 12, label: "终极结果相同", group: "benchmark", instruction: "迁移选择权、匹配度、安全感或职业起点等终极结果。", sourceRequired: true },
  { id: "viral_framework", order: 13, label: "爆款框架", group: "benchmark", instruction: "只迁移近期爆款的句式与冲突结构，替换全部业务内容。", sourceRequired: true },
];

export const TITLE_METHOD_BY_ID = Object.fromEntries(
  TITLE_METHODS.map((method) => [method.id, method]),
) as Record<TitleMethodId, TitleMethodDefinition>;

export const METHOD_APPLICABILITY: Record<
  GrowthPersona,
  Record<TitleMethodId, MethodApplicability>
> = {
  buyer: {
    traffic: "explore",
    human_pain: "default",
    tug_of_war: "default",
    scarce_material: "explore",
    superlative: "explore",
    contrarian: "default",
    nostalgia: "default",
    inventory: "explore",
    same_product: "disabled",
    same_effect: "explore",
    similar_audience: "default",
    same_outcome: "default",
    viral_framework: "default",
  },
  expert: {
    traffic: "default",
    human_pain: "default",
    tug_of_war: "default",
    scarce_material: "default",
    superlative: "default",
    contrarian: "default",
    nostalgia: "explore",
    inventory: "default",
    same_product: "explore",
    same_effect: "default",
    similar_audience: "default",
    same_outcome: "default",
    viral_framework: "default",
  },
  merchant: {
    traffic: "default",
    human_pain: "default",
    tug_of_war: "explore",
    scarce_material: "default",
    superlative: "explore",
    contrarian: "explore",
    nostalgia: "disabled",
    inventory: "default",
    same_product: "default",
    same_effect: "default",
    similar_audience: "explore",
    same_outcome: "explore",
    viral_framework: "default",
  },
};

export function methodsForPersona(
  persona: GrowthPersona,
  mode: MethodGenerationMode,
  overrides?: Partial<Record<TitleMethodId, MethodApplicability>>,
) {
  return TITLE_METHODS.filter((method) => {
    const base = METHOD_APPLICABILITY[persona][method.id];
    const effective = base === "disabled" ? "disabled" : overrides?.[method.id] ?? base;
    return effective === mode;
  });
}

export function methodApplicability(
  persona: GrowthPersona,
  methodId: TitleMethodId,
  overrides?: Partial<Record<TitleMethodId, MethodApplicability>>,
) {
  const base = METHOD_APPLICABILITY[persona][methodId];
  return base === "disabled" ? "disabled" : overrides?.[methodId] ?? base;
}

export function isTitleMethodId(value: unknown): value is TitleMethodId {
  return typeof value === "string" && value in TITLE_METHOD_BY_ID;
}
