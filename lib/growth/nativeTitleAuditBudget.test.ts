import { describe, expect, it } from "vitest";
import { methodsForPersona } from "./methods";
import {
  compactNativeAuditOptions,
  compactNativeAuditRetryOptions,
  type NativeTitleCandidateOption,
} from "./runner";
import { normalizeTitleForComparison } from "./titleQuality";
import type { TitleMethodId, TopicCandidate } from "./types";

function option(
  methodId: TitleMethodId,
  title: string,
  kind: "model" | "fallback",
): NativeTitleCandidateOption {
  return {
    audit: { id: `${kind}:${methodId}:${title}`, methodId, title, kind },
    topic: {
      id: `${methodId}:${title}`,
      method_group: "native",
      method_id: methodId,
      method_label: methodId,
      generation_mode: "default",
      title,
      title_promise: "用真实场景兑现标题承诺。",
      target_user: "测试用户",
      pain: "测试痛点",
      hook: title,
      origin_force: "测试场景",
      conflict_judgement: "测试冲突",
      follow_reason: "测试原因",
      test_variable: "测试变量",
      expected_signal: "有效咨询",
      repeatable_angle: "测试角度",
      broad_traffic_risk: 3,
      priority: "A",
    } as TopicCandidate,
  };
}

describe("原生标题语义审核候选预算", () => {
  it("六个原生方法首轮每法审核两条候选，总量仍不超过12条", () => {
    const methods = methodsForPersona("expert", "default").filter((method) => !method.sourceRequired);
    expect(methods).toHaveLength(6);
    const candidatesByMethod = new Map(methods.map((method) => [method.id, [
      option(method.id, `${method.id}模型一`, "model"),
      option(method.id, `${method.id}模型二`, "model"),
      option(method.id, `${method.id}兜底一`, "fallback"),
      option(method.id, `${method.id}兜底二`, "fallback"),
    ]]));

    const compact = compactNativeAuditOptions({ methods, candidatesByMethod });
    const total = methods.flatMap((method) => compact.get(method.id) ?? []);
    expect(total).toHaveLength(methods.length * 2);
    expect(total.length).toBeLessThanOrEqual(12);
    for (const method of methods) {
      const options = compact.get(method.id) ?? [];
      expect(options).toHaveLength(2);
      expect(options.some((item) => item.audit.kind === "model")).toBe(true);
    }
  });

  it("二次审核优先取未审安全候选，避免连续只审模型近似题", () => {
    const methods = methodsForPersona("buyer", "default").filter((method) => !method.sourceRequired);
    expect(methods).toHaveLength(4);
    const candidatesByMethod = new Map(methods.map((method) => [method.id, [
      option(method.id, `${method.id}模型甲`, "model"),
      option(method.id, `${method.id}模型乙`, "model"),
      option(method.id, `${method.id}模型丙`, "model"),
      option(method.id, `${method.id}模型丁`, "model"),
      option(method.id, `${method.id}兜底甲`, "fallback"),
      option(method.id, `${method.id}兜底乙`, "fallback"),
      option(method.id, `${method.id}兜底丙`, "fallback"),
    ]]));
    const auditedTitles = methods.flatMap((method) => [
      `${method.id}模型甲`,
      `${method.id}模型乙`,
      `${method.id}兜底甲`,
    ]);
    const audited = new Set(auditedTitles.map(normalizeTitleForComparison));

    const retry = compactNativeAuditRetryOptions({
      methods,
      candidatesByMethod,
      auditedTitleFingerprints: audited,
    });
    const total = methods.flatMap((method) => retry.get(method.id) ?? []);
    expect(total).toHaveLength(methods.length * 2);
    expect(total.every((item) => item.audit.kind === "fallback")).toBe(true);
    expect(total.every((item) => !audited.has(normalizeTitleForComparison(item.topic.title)))).toBe(true);
  });

  it("定向补题只有模型候选时，不会为不存在的兜底候选浪费审核名额", () => {
    const methods = methodsForPersona("buyer", "default").filter((method) => !method.sourceRequired);
    const candidatesByMethod = new Map(methods.map((method) => [method.id, [
      option(method.id, `${method.id}补题一`, "model"),
      option(method.id, `${method.id}补题二`, "model"),
      option(method.id, `${method.id}补题三`, "model"),
      option(method.id, `${method.id}补题四`, "model"),
    ]]));

    const compact = compactNativeAuditOptions({ methods, candidatesByMethod, idPrefix: "G" });
    const total = methods.flatMap((method) => compact.get(method.id) ?? []);
    expect(total).toHaveLength(methods.length * 2);
    for (const method of methods) {
      const options = compact.get(method.id) ?? [];
      expect(options).toHaveLength(2);
      expect(options.every((item) => item.audit.kind === "model")).toBe(true);
    }
  });
});
