import { describe, expect, it } from "vitest";
import type { DraftBlueprintContext } from "./agents";
import { composeBlueprintBody, draftBodiesAreTooSimilar } from "./runner";
import { countPublishChars } from "./validation";

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

  it("keeps the emergency long-form composition below the publish target", () => {
    const verboseBlueprint: DraftBlueprintContext = {
      ...blueprint,
      delivery_sections: Array.from({ length: 10 }, (_, index) =>
        `第${index + 1}项需要先把岗位要求和个人经历逐项放在一起核对并且记录所有可能影响判断的背景信息以免后续复盘时无法确认到底是哪一个变量出了问题`),
    };
    const body = composeBlueprintBody(verboseBlueprint, {
      format: "numbered",
      minimumSections: 10,
      exactSections: 10,
      rule: "正好交付10项。",
    }, undefined, {
      bodyVersion: "long",
      businessLine: "overseas_student",
      compact: true,
      aggressive: true,
    });

    expect(countPublishChars("秋招前先查这10项", body, ["#留学生求职", "#秋招"]).total).toBeLessThanOrEqual(950);
    expect(body.match(/^\d+\. /gm)).toHaveLength(10);
  });
});
