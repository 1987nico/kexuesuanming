import { describe, expect, it } from "vitest";
import type { DraftBlueprintContext } from "./agents";
import { composeBlueprintBody, draftBodiesAreTooSimilar } from "./runner";

const blueprint: DraftBlueprintContext = {
  opening: "前阵子陪孩子忙秋招，我们在回国还是留当地这件事上，来回改了好几次主意。",
  core_judgement: "秋招真正难的不是同时准备两边，而是没有把岗位、材料和截止时间放进同一套节奏里。",
  delivery_format: "numbered",
  delivery_sections: [
    "7—8月先确定目标岗位和简历版本。",
    "9—10月分别记录国内外岗位的截止时间。",
    "11—12月根据投递和面试反馈收窄方向。",
  ],
  service_bridge: "我们自己折腾了几轮还是没理顺，后来才找了一位求职老师一起梳理现有材料。她先把岗位和招聘节奏对齐，孩子不再拿一份简历乱投，下一步也有了顺序。",
  stage_result: "孩子不再拿一份简历乱投。",
  closing: "先把毕业时间、目标岗位和最近一次反馈写在同一页。",
};

const spec = {
  format: "numbered" as const,
  minimumSections: 3,
  rule: "至少交付3个可执行节点。",
};

describe("draft variants", () => {
  it("builds materially different short and long bodies from one judgement", () => {
    const shortBody = composeBlueprintBody(blueprint, spec, undefined, {
      bodyVersion: "short",
      businessLine: "overseas_student",
    });
    const longBody = composeBlueprintBody(blueprint, spec, undefined, {
      bodyVersion: "long",
      businessLine: "overseas_student",
    });

    expect(longBody.length).toBeGreaterThan(shortBody.length + 150);
    expect(draftBodiesAreTooSimilar(shortBody, longBody)).toBe(false);
    expect(shortBody).toContain("秋招真正难的不是同时准备两边");
    expect(longBody).toContain("秋招真正难的不是同时准备两边");
  });

  it("detects duplicate or near-duplicate bodies", () => {
    const body = "先把岗位和材料放在同一张表里，再根据真实反馈收窄方向。";
    expect(draftBodiesAreTooSimilar(body, body)).toBe(true);
    expect(draftBodiesAreTooSimilar(body, `${body}\n\n先记录结果。`)).toBe(true);
  });
});
