import { describe, expect, it } from "vitest";
import {
  buildTitleSemanticSignature,
  canonicalizeGrowthTitle,
  containsTraditionalChinese,
  evaluateGrowthTitleQuality,
  evaluateTitleSemanticDuplicate,
  findUnsupportedTitleClaims,
  hasGarbledLatinCjkMix,
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

  it("允许同一业务下材料和冲突都不同的标题", () => {
    const first = "留学生秋招前先查时间线";
    const second = "回国求职前，先做岗位筛选";
    expect(titlesAreSemanticDuplicates(first, second)).toBe(false);
    expect(buildTitleSemanticSignature(first).scenario).toBe("recruiting_timeline");
    expect(buildTitleSemanticSignature(second).scenario).toBe("job_targeting");
  });
});
