import { contentUsePolicyFor, perspectiveContractFor } from "./perspectiveStrategy";
import type {
  BodyContentIntent,
  BodyOperatingContractV4,
  GrowthAccount,
  TopicCandidate,
} from "./types";

function field(account: GrowthAccount, key: string) {
  return account.persona_specific?.[key]?.trim() || "";
}

function intentFor(account: GrowthAccount, topic: TopicCandidate): BodyContentIntent {
  const text = `${topic.title} ${topic.title_promise}`;
  if (account.persona === "merchant") {
    return /价格|购买|下单|付款|套餐|服务|诊断|咨询/u.test(text)
      ? "merchant_sku_sale"
      : "merchant_service_mechanism";
  }
  if (account.persona === "expert") {
    if (/品牌|机构|哪家|对比|测评/u.test(text)) return "expert_brand_comparison";
    if (/区别|比较|怎么选|哪种|还是/u.test(text)) return "expert_category_comparison";
    return "expert_judgement";
  }
  return /为什么|不敢|焦虑|后悔|纠结|崩溃|迷茫/u.test(text)
    ? "buyer_resonance"
    : "buyer_experience";
}

function primaryActionFor(account: GrowthAccount) {
  if (account.persona === "merchant") {
    return field(account, "conversion_goal") || "邀请符合条件的人在站内说明具体处境并咨询当前SKU";
  }
  if (account.persona === "expert") return "邀请读者补充自身变量，继续做适配判断";
  return "邀请处境相似的人在站内说出当前卡点";
}

export function compileBodyOperatingContract(
  account: GrowthAccount,
  topic: TopicCandidate,
): BodyOperatingContractV4 {
  const perspective = perspectiveContractFor(account);
  const usePolicy = contentUsePolicyFor(account);
  const activeSku = field(account, "main_offer");
  const comparisonScope = field(account, "comparison_scope");
  const comparisonBrands = field(account, "comparison_brands");
  const intent = intentFor(account, topic);
  return {
    contract_version: "v4_0",
    business_line: account.business_line ?? "executive",
    persona: account.persona,
    account_id: account.id,
    account_profile: account.one_liner || account.name,
    speaker_identity: field(account, "identity") || account.profile_identity || account.one_liner || account.name,
    content_intent: intent,
    subject: topic.target_user || account.target_user,
    title: topic.title,
    title_promise: topic.title_promise,
    required_evidence: perspective.required_elements,
    prohibited_claims: perspective.prohibited_elements,
    conversion_rule: perspective.generation_rule,
    primary_action: primaryActionFor(account),
    active_sku: activeSku || undefined,
    comparison_scope: comparisonScope || undefined,
    comparison_brands: comparisonBrands || undefined,
    evidence_mode: usePolicy.mode === "internal_training"
      ? "internal_training"
      : account.persona === "buyer"
        ? "real_or_authorized"
        : account.persona === "expert"
          ? "public_sources"
          : "configured_business_facts",
    source_title: topic.method_group === "benchmark" ? topic.source_snapshot?.original_title : undefined,
    compiled_at: new Date().toISOString(),
  };
}

export function formatBodyOperatingContract(contract: BodyOperatingContractV4) {
  return [
    `正文经营任务：${contract.content_intent}`,
    `发声身份：${contract.speaker_identity}`,
    `本篇对象：${contract.subject}`,
    `必须兑现：${contract.title_promise}`,
    `证据要求：${contract.required_evidence.join("；")}`,
    `禁止：${contract.prohibited_claims.join("；")}`,
    `唯一承接动作：${contract.primary_action}`,
  ].join("\n");
}
