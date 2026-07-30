import type {
  GrowthAccount,
  GrowthBusinessLine,
  GrowthPersona,
  GrowthProfileIdentity,
} from "./types";

const PARENT_SIGNAL = /家长|妈妈|爸爸|父母|娃|孩子|儿子|女儿/u;
const STUDENT_SELF_SIGNAL = /留学生本人|学生本人|毕业生本人|我的秋招|本人求职|求职踩坑|边找方向|边投边|回国求职实录/u;

export function defaultProfileIdentity(
  businessLine: GrowthBusinessLine,
  persona: GrowthPersona,
): GrowthProfileIdentity {
  if (persona === "merchant") return "service_operator";
  if (persona === "expert") return "professional_expert";
  return businessLine === "overseas_student"
    ? "overseas_student_parent"
    : "executive_self";
}

/**
 * 旧账号没有显式发声身份时，只在兼容读取层推断；新建和编辑都会保存显式值。
 * 留学生买家若没有家长证据，宁可按本人号处理，避免把“我在求职”误写成“我家娃”。
 */
export function resolveProfileIdentity(account: GrowthAccount): GrowthProfileIdentity {
  if (account.persona === "merchant") return "service_operator";
  if (account.persona === "expert") return "professional_expert";
  if (account.business_line === "executive") return "executive_self";

  const primaryEvidence = [
    account.profile_name,
    account.one_liner,
    account.name,
    account.persona_specific?.identity,
  ].filter(Boolean).join(" ");
  const evidence = [
    primaryEvidence,
    account.target_user,
  ].filter(Boolean).join(" ");
  // 多账号上线初期曾把所有留学生买家默认写成家长。若账号名称和一句话人设
  // 都明确是本人求职记录，则把这个旧默认值视作兼容脏数据，而非人工选择。
  if (
    account.profile_identity === "overseas_student_parent"
    && STUDENT_SELF_SIGNAL.test(primaryEvidence)
    && !PARENT_SIGNAL.test(primaryEvidence)
  ) {
    return "overseas_student_self";
  }
  if (account.profile_identity) return account.profile_identity;
  if (STUDENT_SELF_SIGNAL.test(primaryEvidence) && !PARENT_SIGNAL.test(primaryEvidence)) {
    return "overseas_student_self";
  }
  if (PARENT_SIGNAL.test(evidence)) return "overseas_student_parent";
  if (STUDENT_SELF_SIGNAL.test(evidence)) return "overseas_student_self";
  return "overseas_student_self";
}

export function profileIdentityLabel(identity: GrowthProfileIdentity) {
  switch (identity) {
    case "overseas_student_self":
      return "留学生本人";
    case "overseas_student_parent":
      return "留学生家长";
    case "executive_self":
      return "转型中的中高管本人";
    case "service_operator":
      return "服务经营者";
    case "professional_expert":
      return "专业顾问/老师";
  }
}

export function profileIdentityContract(account: GrowthAccount) {
  const identity = resolveProfileIdentity(account);
  if (identity === "overseas_student_parent") {
    return {
      identity,
      requiredVoice: "以留学生家长第一人称，只写亲子处境、家长动作和孩子求职进展",
      forbiddenVoice: "不得把家长写成正在投递、面试或找工作的留学生本人",
    };
  }
  if (identity === "overseas_student_self") {
    return {
      identity,
      requiredVoice: "以正在海外秋招或回国求职的留学生本人第一人称",
      forbiddenVoice: "不得出现我家孩子、陪娃、爸妈替我记录等家长叙事",
    };
  }
  if (identity === "executive_self") {
    return {
      identity,
      requiredVoice: "以正在做职业或事业决策的中高管本人第一人称",
      forbiddenVoice: "不得混入留学生、家长、孩子秋招或求职辅导叙事",
    };
  }
  if (identity === "service_operator") {
    return {
      identity,
      requiredVoice: "以服务经营者身份说明服务对象、交付动作和边界",
      forbiddenVoice: "不得冒充买家亲历者或虚构个人求职经历",
    };
  }
  return {
    identity,
    requiredVoice: "以专业顾问或老师身份给出判断、方法和适用边界",
    forbiddenVoice: "不得冒充买家本人或家长，不得虚构个人转型/求职经历",
  };
}

export function isProfileIdentityCompatibleText(
  value: string | undefined,
  identity: GrowthProfileIdentity,
) {
  const text = String(value ?? "");
  if (!text) return true;
  if (identity === "overseas_student_self") return !PARENT_SIGNAL.test(text);
  if (identity === "overseas_student_parent") {
    return !/留学生本人|学生本人|毕业生本人|我的秋招|本人求职/u.test(text);
  }
  if (identity === "executive_self") {
    return !/留学生|家长|孩子秋招|陪娃|海外秋招|回国求职/u.test(text);
  }
  return true;
}

export function isProfileTitleCompatible(
  value: string | undefined,
  account: GrowthAccount,
) {
  const title = String(value ?? "").trim();
  if (!title) return false;
  const identity = resolveProfileIdentity(account);
  if (!isProfileIdentityCompatibleText(title, identity)) return false;
  if (identity === "overseas_student_parent") return PARENT_SIGNAL.test(title);
  return true;
}
