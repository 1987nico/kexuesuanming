import { describe, expect, it } from "vitest";
import {
  buildTitleSemanticSignature,
  canonicalizeGrowthTitle,
  containsTraditionalChinese,
  evaluateGrowthTitleQuality,
  evaluateTitleSemanticDuplicate,
  findUnsupportedTitleClaims,
  hasGarbledLatinCjkMix,
  titleForMethodSemanticComparison,
  titlesAreMethodAwareSemanticDuplicates,
  titlesAreSemanticDuplicates,
} from "./titleQuality";

describe("标题质量门禁", () => {
  it("统一常见繁体字，并明确标记原始输出含繁体", () => {
    expect(canonicalizeGrowthTitle("留學當下別衝動轉職")).toBe("留学当下别冲动转职");
    expect(containsTraditionalChinese("留學當下別衝動轉職")).toBe(true);
    expect(evaluateGrowthTitleQuality("留學當下別衝動轉職")).toMatchObject({
      canonicalTitle: "留学当下别冲动转职",
      acceptable: false,
      reasons: ["traditional_chinese"],
    });
  });

  it("拦截超长、乱码和明显生造黑话", () => {
    expect(evaluateGrowthTitleQuality("这是一个明显超过二十个字符的标题，不能直接发布").reasons).toContain("too_long");
    expect(hasGarbledLatinCjkMix("38岁gangga离开小公司，尴尬")).toBe(true);
    expect(evaluateGrowthTitleQuality("38岁gangga离开小公司，尴尬").reasons).toContain("garbled_latin_cjk");
    expect(evaluateGrowthTitleQuality("离体制邪修六步漏斗，饭局判胜算").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("花百万留学，不敢跟爸妈说投了没信").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("海归投简历没信，不敢跟爸妈说").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("留学花了百万，秋招连岗都投错").reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality("花家里钱留学，投错岗不敢说").reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality("跟风投管培，还是蹲对口秋招岗？").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("背景看着光鲜，投岗全没回音").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("以前找教授写推，如今备背调").reasons).toContain("unnatural_jargon");
    expect(evaluateGrowthTitleQuality("我替孩子找内推，不如先对岗位").reasons).toContain("incomplete_sentence");
    expect(evaluateGrowthTitleQuality("我替孩子找内推，不如先看岗位匹配").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("从前等机会，现在先做准备").reasons).toContain("generic_title");
    expect(evaluateGrowthTitleQuality("以前怕没学位，现在怕没方向").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("投岗位前，先看匹配度").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("求职没信心时，先收窄岗位").acceptable).toBe(true);
    expect(evaluateGrowthTitleQuality("AI筛简历后，先查岗位").acceptable).toBe(true);
  });

  it("拦截没有业务事实支持的具体身份、金额、成绩和日期", () => {
    const title = "前国企高管，创业首年营收五百万";
    expect(findUnsupportedTitleClaims(title)).not.toHaveLength(0);
    expect(evaluateGrowthTitleQuality(title).reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality("2026年回国拿到大厂offer").reasons).toContain("unsupported_factual_claim");
    expect(evaluateGrowthTitleQuality(title, {
      supportedFacts: ["前国企高管", "创业首年营收五百万"],
    }).reasons).not.toContain("unsupported_factual_claim");
  });
});

describe("标题语义去重", () => {
  it("把仅替换措辞的实习/秋招二选一判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "先补实习，还是直接冲秋招？",
      "补实习攒经历，还是直接冲秋招",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("受众、场景和冲突相同");
    expect(result.left.scenario).toBe("internship_vs_autumn_recruitment");
  });

  it("把实习还是全职的素材换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "先找个实习过渡，还是死磕全职？",
      "先做远程实习，还是冲全职岗",
    );
    expect(result.duplicate).toBe(true);
    expect(result.left.scenario).toBe("internship_vs_full_time");
    expect(result.right.conflict).toBe("internship_or_full_time");
  });

  it("把留洋回国后瞎撞简历的改词判为重复", () => {
    expect(titlesAreSemanticDuplicates(
      "留洋镀金回来，投简历还瞎撞",
      "留洋读硕，回国投简历还瞎撞",
    )).toBe(true);
  });

  it("把平台身份下不敢转型的换词判为重复", () => {
    expect(titlesAreSemanticDuplicates(
      "攥着期权的总监，不敢提转行",
      "攥着工牌的总监，不敢换赛道",
    )).toBe(true);
  });

  it("把只替换后半句的长核心短语判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "花百万留学，不敢跟爸妈说投了没信",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons.some((reason) => reason.includes("连续核心短语重复"))).toBe(true);
  });

  it("把家庭投入后不敢说秋招方向的换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "花爸妈钱留学，秋招不敢说没方向",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
    expect(result.left.conflict).toBe("parent_job_search_pressure");
    expect(result.right.conflict).toBe("parent_job_search_pressure");
  });

  it("把家庭投入后不敢说面试结果也判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花爸妈钱留学，秋招不敢说没方向",
      "花爸妈钱留学，不敢说面试全挂",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把父母压力下的投简历没信也判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花爸妈钱留学，不敢说面试全挂",
      "海归投简历没信，不敢跟爸妈说",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把花家里钱却不敢说的表达也判为父母压力母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "花家里钱留学，秋招方向全错不敢说",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把家长怕给娃添压力、因此不敢多问秋招的改写判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "帮孩子盯秋招，不敢多问怕吵架",
      "怕给娃添压力，秋招的事不敢多问",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把催孩子先定秋招方向的操作词替换判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "催娃定方向，还是等他自己想明白？",
      "催娃投简历，还是先定秋招方向？",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("家长催孩子先定求职方向的选择母题相同");
  });

  it("把催孩子投简历前先捋秋招方向的不同句式判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "催娃投简历，还是先定秋招方向？",
      "总催娃投简历，不如先捋秋招方向",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("家长催孩子先定求职方向的选择母题相同");
  });

  it("把孩子留学后秋招投什么的焦虑换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "娃留完学，连秋招投什么都犹豫",
      "供娃留完学，秋招方向他自己都懵",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("家长视角下留学后秋招方向焦虑的母题相同");
  });

  it("不会把留学家庭的秋招时间建议误判为方向焦虑重复", () => {
    expect(titlesAreSemanticDuplicates(
      "娃留完学，秋招前先理清时间线",
      "供娃留学回来，校招先补一段实习",
    )).toBe(false);
  });

  it("把待业后害怕接爸妈电话的表达也判为父母压力母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花百万留学，不敢跟爸妈说秋招没方向",
      "海归待业，怕接爸妈的视频电话",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("父母压力下的求职困境母题相同");
  });

  it("把秋招不敢说只换倾诉对象的表达判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "留了学，连秋招投什么都不敢说",
      "留了学，连秋招投啥不敢跟室友说",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("留学求职中不敢说出口的困境母题相同");
  });

  it("把投递节奏错了白搭的开头换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "海归背景好？投错节奏全白搭",
      "早投晚投都一样？节奏错了白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("招聘投递节奏错位母题相同");
  });

  it("把学历背景转向项目证据的怀旧换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以前拼学校，现在拼岗位证据",
      "过去拼背景，现在拼项目表达",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("学历背景转向项目证据的怀旧母题相同");
  });

  it("把岗没选对归为方向错位，避免反认知题换词重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以为海归吃香，投了才知道岗没选对",
      "以为海归好投，其实方向错了白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.left.conflict).toBe("role_mismatch");
    expect(result.right.conflict).toBe("role_mismatch");
  });

  it("把目标岗与保底 offer 的二选一换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "死磕目标岗，还是先拿个offer保底？",
      "死磕对口岗，还是先接个offer？",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("目标岗位与保底 offer 的二选一母题相同");
  });

  it("把留当地和回国求职的前后换序判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "留当地，还是回国求职？",
      "回国求职，还是留在当地？",
    );
    expect(result.duplicate).toBe(true);
    expect(result.left.scenario).toBe("stay_or_return");
    expect(result.right.conflict).toBe("stay_or_return_choice");
  });

  it("把海归光环转向岗位或简历的怀旧改写判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "海归吃香那几年，如今还要看岗位",
      "当年海归吃香，现在先看简历匹配",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("海归光环转向求职准备的怀旧母题相同");
  });

  it("把过去看学校或学历、现在练面试的改写判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以前拼学校，现在练面试",
      "以前看学历，现在练面试",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("学历转向面试准备的怀旧母题相同");
  });

  it("把当年录取、如今等面试的怀旧对照换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "当年收录取通知，现在等面试信",
      "当年收录取信多开心，现在等面试多揪心",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("当年录取、如今等面试的怀旧反差母题相同");
  });

  it("不会把录取后的面试准备误判为等面试消息的怀旧对照", () => {
    expect(titlesAreSemanticDuplicates(
      "当年收录取通知，现在等面试信",
      "当年收到录取通知，现在开始练面试",
    )).toBe(false);
  });

  it("不同句式的岗位错位标题不被全历史语义规则过度拦截", () => {
    const result = evaluateTitleSemanticDuplicate(
      "花家里钱留学，投错岗不敢说",
      "内推不是捷径，投错岗白搭",
    );
    expect(result.duplicate).toBe(false);
  });

  it("岗位错位且共享“白搭”结果时，不允许只替换优势来源重新交付", () => {
    const result = evaluateTitleSemanticDuplicate(
      "内推不是捷径，投错岗白搭",
      "找不对岗，努力越多越白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("岗位方向错位且结果表达相同");
  });

  it("把背景好却方向错的反认知判为同一母题", () => {
    const result = evaluateTitleSemanticDuplicate(
      "以为海归吃香，投了才知道岗没选对",
      "背景好不顶用，方向错了白搭",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("岗位方向错位的反认知母题相同");
  });

  it("把学历背景不等于秋招顺利的换词判为重复", () => {
    const result = evaluateTitleSemanticDuplicate(
      "总说学历重要，找不对岗全白搭",
      "留学背景好，未必秋招就顺",
    );
    expect(result.duplicate).toBe(true);
    expect(result.reasons).toContain("学历或留学背景不等于求职顺利的反认知母题相同");
  });

  it("不会把不同的留学生求职建议误判为学历反认知重复", () => {
    expect(titlesAreSemanticDuplicates(
      "留学生秋招前先查时间线",
      "回国求职前，先做岗位筛选",
    )).toBe(false);
  });

  it("允许同一业务下材料和冲突都不同的标题", () => {
    const first = "留学生秋招前先查时间线";
    const second = "回国求职前，先做岗位筛选";
    expect(titlesAreSemanticDuplicates(first, second)).toBe(false);
    expect(buildTitleSemanticSignature(first).scenario).toBe("recruiting_timeline");
    expect(buildTitleSemanticSignature(second).scenario).toBe("job_targeting");
  });

  it("盘点法剥离固定外壳后比较真正对象，不误伤不同对象", () => {
    expect(titleForMethodSemanticComparison(
      "inventory",
      "留学生求职，盘点4类入职认证材料",
    )).toBe("入职认证材料");
    expect(titlesAreMethodAwareSemanticDuplicates(
      "inventory",
      "留学生求职，盘点4类入职认证材料",
      "留学生求职，盘点3种群面核心角色",
    )).toBe(false);
  });

  it("盘点法同一对象只换数字仍判为重复", () => {
    expect(titlesAreMethodAwareSemanticDuplicates(
      "inventory",
      "秋招陪跑，盘点5项异地入职提前量",
      "秋招陪跑，盘点3项异地入职提前量",
    )).toBe(true);
  });
});
