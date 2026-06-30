import { describe, expect, it } from "vitest";
import { scoreTitle } from "./titleScore";

describe("growth title scoring", () => {
  it("rewards titles that match the audience and promise a concrete benefit", () => {
    const result = scoreTitle({
      title: "跳槽前必看：3步判断这家公司值不值得去",
      targetUser: "准备跳槽、转岗或重新判断职业方向的职场人",
      coreProblem: "不知道如何判断机会是否适合自己",
      topic: "跳槽机会判断清单",
    });

    expect(result.topicMatch.score).toBeGreaterThanOrEqual(72);
    expect(result.benefitClarity.score).toBeGreaterThanOrEqual(80);
    expect(result.complianceRisk.level).toBe("low");
    expect(result.totalScore).toBeGreaterThanOrEqual(75);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("flags high-commitment title claims as compliance risk", () => {
    const result = scoreTitle({
      title: "保证100%包上岸的面试秘籍",
      targetUser: "准备面试的职场人",
      coreProblem: "需要提升面试通过率",
    });

    expect(result.complianceRisk.level).toBe("high");
    expect(result.complianceRisk.score).toBeGreaterThanOrEqual(50);
    expect(result.suggestions).toContain("降低绝对化承诺，避免“保证、唯一、最强、包过”等表达。");
  });
});
