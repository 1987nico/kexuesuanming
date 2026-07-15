import type { GrowthAccount, TopicCandidate } from "./types";
import { isInternationalStudentTrack } from "./businessPosition";

export const BUYER_C_WEEKLY_FOCUS = {
  startsAt: "2026-07-13T00:00:00+08:00",
  endsAt: "2026-07-20T00:00:00+08:00",
  label: "本周高优 · 留学生家长Offer转折",
} as const;

export const BUYER_C_DISCLOSURE = "【情景演绎｜根据常见留学生求职经历改编】";

export function buyerCaseMode(account: Pick<GrowthAccount, "persona" | "persona_specific">) {
  if (account.persona !== "buyer") return "真实案例" as const;
  return account.persona_specific?.case_mode?.trim() === "真实案例"
    ? ("真实案例" as const)
    : ("情景演绎" as const);
}

export function buyerCaseMaterial(account: Pick<GrowthAccount, "persona_specific">) {
  return account.persona_specific?.case_material?.trim() || "";
}

export function buyerCNeedsMaterial(
  account: Pick<GrowthAccount, "persona" | "persona_specific" | "business_track">,
) {
  if (!isInternationalStudentTrack(account)) return false;
  return buyerCaseMode(account) === "真实案例" && !buyerCaseMaterial(account);
}

export function isBuyerCWeeklyFocusActive(at = new Date()) {
  const time = at.getTime();
  return (
    time >= new Date(BUYER_C_WEEKLY_FOCUS.startsAt).getTime() &&
    time < new Date(BUYER_C_WEEKLY_FOCUS.endsAt).getTime()
  );
}

export function buildBuyerCTopic(account: GrowthAccount, topicId: string): TopicCandidate {
  const fictional = buyerCaseMode(account) === "情景演绎";
  return {
    id: topicId,
    direction: "C",
    title: "一转眼，轮到老二秋招了",
    target_user: "正在准备海外秋招或回国求职的留学生及其家长",
    pain: "留学生家长不了解招聘节奏，也不知道怎样陪孩子跨过第一次秋招",
    content_type: "story",
    hook: "老大拿到Offer\n老二首战留学生秋招",
    origin_force: "招聘会入口、企业横幅、孩子背影和手里的材料共同构成家长视角的现场感。",
    conflict_judgement: "老大已经拿到Offer，老二却要从第一次秋招重新开始，形成结果与起点的阶段反差。",
    follow_reason: "持续看一个留学生家长如何陪两个孩子走过不同求职阶段。",
    test_variable: "Offer结果对照＋家长现场是否提升点击、关注和有效咨询",
    expected_signal: "点击率、目标家长评论、主页访问、新增关注和有效咨询出现正向信号。",
    repeatable_angle: "替换孩子阶段和招聘现场，沉淀为留学生家长求职转折系列。",
    broad_traffic_risk: 3,
    priority: "S",
    weekly_action: "retest",
    evidence: fictional
      ? `${BUYER_C_WEEKLY_FOCUS.label}；当前使用情景演绎，正文和封面必须保留公开标识。`
      : buyerCNeedsMaterial(account)
        ? `${BUYER_C_WEEKLY_FOCUS.label}；生成正文前请先在定位卡补充真实案例素材。`
        : `${BUYER_C_WEEKLY_FOCUS.label}；使用定位卡中的真实案例素材。`,
    scores: {
      positioning: 9,
      pain_clarity: 8,
      entry_strength: 9,
      follow_reason: 8,
      experiment_value: 9,
      repeatability: 9,
    },
  };
}

export function prioritizeBuyerCTopics(input: {
  account: GrowthAccount;
  topics: TopicCandidate[];
  topicId: string;
  limit?: number;
  at?: Date;
}) {
  const limit = input.limit ?? Math.max(1, input.topics.length);
  if (
    input.account.persona !== "buyer" ||
    !isInternationalStudentTrack(input.account) ||
    !isBuyerCWeeklyFocusActive(input.at)
  ) {
    return input.topics.slice(0, limit);
  }
  const existing = input.topics.find((topic) => topic.direction === "C");
  const preset = buildBuyerCTopic(input.account, input.topicId);
  const focus = existing
    ? {
        ...existing,
        target_user: preset.target_user,
        pain: preset.pain,
        hook: preset.hook,
        follow_reason: preset.follow_reason,
        test_variable: preset.test_variable,
        expected_signal: preset.expected_signal,
        repeatable_angle: preset.repeatable_angle,
        direction: "C" as const,
        content_type: "story" as const,
        priority: "S" as const,
        weekly_action: "retest" as const,
        evidence: [existing.evidence, preset.evidence].filter(Boolean).join("；"),
      }
    : preset;
  return [focus, ...input.topics.filter((topic) => topic.id !== focus.id)].slice(0, limit);
}
