import { describe, expect, it } from "vitest";
import { countPublishChars, isPublishTextWithinLimit, normalizeTags } from "./validation";

describe("growth publish validation", () => {
  it("normalizes hashtags and keeps at most five", () => {
    expect(normalizeTags(["中高层转型", "#第二曲线", "小红书运营", "IP", "报告", "多余"])).toEqual([
      "#中高层转型",
      "#第二曲线",
      "#小红书运营",
      "#IP",
      "#报告",
    ]);
  });

  it("accepts publish text at the 1000 character boundary", () => {
    const title = "标题";
    const body = "一".repeat(992);
    const hashtags = ["#A", "#B"];
    const result = countPublishChars(title, body, hashtags);

    expect(result.total).toBe(1000);
    expect(result.within_limit).toBe(true);
    expect(isPublishTextWithinLimit(title, body, hashtags)).toBe(true);
  });

  it("rejects publish text above the 1000 character boundary", () => {
    const title = "标题";
    const body = "一".repeat(993);
    const hashtags = ["#A", "#B"];
    const result = countPublishChars(title, body, hashtags);

    expect(result.total).toBe(1001);
    expect(result.within_limit).toBe(false);
    expect(isPublishTextWithinLimit(title, body, hashtags)).toBe(false);
  });
});
