import type { GrowthAccount, GrowthPersona } from "./types";

export interface GrowthPerspectiveContract {
  persona: GrowthPersona;
  role: string;
  primary_goal: string;
  primary_metrics: string[];
  required_elements: string[];
  allowed_elements: string[];
  prohibited_elements: string[];
  generation_rule: string;
}

function value(account: GrowthAccount, key: string) {
  return account.persona_specific?.[key]?.trim() || "";
}

export function isInternalTrainingAccount(account: GrowthAccount) {
  return account.persona === "buyer"
    && /内部培训|培训模拟/u.test(value(account, "case_mode"));
}

export function contentUsePolicyFor(account: GrowthAccount) {
  const internalTraining = isInternalTrainingAccount(account);
  return internalTraining
    ? {
        mode: "internal_training" as const,
        publishEligible: false,
        blockReason: "内部培训模拟内容仅供训练，不得复制为正式发布内容，也不进入方法学习。",
        requiredMarker: "【内部培训模拟案例｜禁止对外发布】",
      }
    : {
        mode: "production" as const,
        publishEligible: true,
        blockReason: undefined,
        requiredMarker: undefined,
      };
}

function merchantContract(account: GrowthAccount): GrowthPerspectiveContract {
  const activeSku = value(account, "main_offer");
  const price = value(account, "price_band");
  const payment = value(account, "payment_method");
  const promise = value(account, "service_promise");
  const condition = value(account, "promise_conditions");
  const delivery = value(account, "sku_delivery");
  const evidence = value(account, "sku_evidence") || account.trust_source;
  const cta = value(account, "conversion_goal");
  return {
    persona: "merchant",
    role: "直接说明产品、交付与购买条件的经营者",
    primary_goal: "用一个真实SKU促成站内有效咨询或购买",
    primary_metrics: ["产品询价", "有效咨询", "诊断购买", "服务成交"],
    required_elements: [
      activeSku ? `本篇只允许主推SKU：${activeSku}` : "本篇只允许主推一个SKU",
      delivery ? `交付过程：${delivery}` : "必须写清具体交付动作",
      evidence ? `可用证据：${evidence}` : "必须给出可核验的流程或阶段证据",
      cta ? `唯一转化动作：${cta}` : "只保留一个站内转化动作",
    ],
    allowed_elements: [
      price ? `允许公开价格：${price}` : "价格未配置时不得自行编造",
      payment ? `允许公开付款方式：${payment}` : "付款方式未配置时不得自行编造",
      promise ? `允许使用服务承诺：${promise}` : "服务承诺未配置时不得自行编造",
    ],
    prohibited_elements: [
      condition ? `承诺不得超出这些条件：${condition}` : "不得承诺确定上岸、确定录用或确定收益",
      "不得在同一篇正文中叠加第二个SKU或第二个转化动作",
    ],
    generation_rule: "先写用户卡点，再写当前SKU如何交付、依据是什么，最后自然给出唯一购买或咨询入口。",
  };
}

function buyerContract(account: GrowthAccount): GrowthPerspectiveContract {
  const identity = value(account, "identity");
  const scene = value(account, "case_material");
  const attempt = value(account, "original_attempt");
  const intervention = value(account, "intervention_action");
  const result = value(account, "stage_result");
  const mode = value(account, "case_mode");
  const internalTraining = isInternalTrainingAccount(account);
  return {
    persona: "buyer",
    role: "从具体处境出发记录问题、选择和变化的亲历者",
    primary_goal: "先产生共鸣与信任，再促成站内有效咨询",
    primary_metrics: ["阅读时长", "共鸣评论", "关注", "有效咨询"],
    required_elements: [
      identity ? `发声身份：${identity}` : "必须使用当前账号人设的第一人称身份",
      scene ? `可用具体场景：${scene}` : "至少包含一个有动作、现场或对话的具体场景",
      attempt ? `原有尝试：${attempt}` : "必须写清当事人原来试过什么",
      intervention ? `专业介入动作：${intervention}` : "必须写清老师、顾问或机构具体做了什么",
      result ? `阶段变化：${result}` : "必须给出克制、可验证的阶段变化",
    ],
    allowed_elements: [
      "允许口语化、不完美和带有真实犹豫的表达",
      internalTraining
        ? "当前为内部培训模拟：允许高度写实的复合场景，但必须整体标记“内部培训模拟案例，禁止对外发布”"
        : "可以使用真实亲历或已授权的复合案例",
    ],
    prohibited_elements: [
      "不得把买家写成专家或商家，不得直接报价和硬推产品",
      "不得编造真实品牌Offer、冒充真实客户见证或承诺确定上岸",
    ],
    generation_rule: "按具体处境→原有尝试→选择过程→专业介入→阶段变化展开，服务只能作为经历中的自然转折。",
  };
}

function expertContract(account: GrowthAccount): GrowthPerspectiveContract {
  const scope = value(account, "comparison_scope");
  const brands = value(account, "comparison_brands");
  const criteria = value(account, "comparison_criteria");
  const sources = value(account, "comparison_sources");
  const disclosure = value(account, "interest_disclosure");
  return {
    persona: "expert",
    role: "提供选择标准、品类比较和专业判断的从业者",
    primary_goal: "通过可解释的比较和判断促成有效咨询",
    primary_metrics: ["收藏", "分享", "专业问题", "有效咨询"],
    required_elements: [
      scope ? `优先比较范围：${scope}` : "至少比较两个真实方案或品类",
      criteria ? `比较标准：${criteria}` : "必须给出适用对象、交付、成本、验证和风险等明确标准",
      sources ? `公开依据：${sources}` : "涉及外部事实时必须基于公开可核验依据",
      disclosure ? `利益关系：${disclosure}` : "涉及品牌比较时必须说明利益关系",
    ],
    allowed_elements: [
      "品类比较默认开放",
      brands ? `允许点名比较这些品牌：${brands}` : "未配置品牌时只做品类或服务方式比较",
    ],
    prohibited_elements: [
      "不得使用传闻、虚构竞品事实或恶意贬低",
      "不得只给绝对排名，必须说明结论成立的条件和适用人群",
    ],
    generation_rule: "先定义用户场景，再按同一组标准比较方案，最后给出带适用条件的选择建议。",
  };
}

export function perspectiveContractFor(account: GrowthAccount): GrowthPerspectiveContract {
  if (account.persona === "merchant") return merchantContract(account);
  if (account.persona === "expert") return expertContract(account);
  return buyerContract(account);
}

export function perspectivePromptContract(account: GrowthAccount) {
  const contract = perspectiveContractFor(account);
  return [
    `当前视角内容任务：${contract.role}`,
    `本篇主目标：${contract.primary_goal}`,
    `必须落实：${contract.required_elements.join("；")}`,
    `允许使用：${contract.allowed_elements.join("；")}`,
    `禁止：${contract.prohibited_elements.join("；")}`,
    `生成顺序：${contract.generation_rule}`,
    `复盘优先观察：${contract.primary_metrics.join("、")}`,
  ].join("\n");
}
