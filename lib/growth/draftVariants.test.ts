import { describe, expect, it } from "vitest";
import type { DraftBlueprintContext } from "./agents";
import type { ContentDraft, GrowthAccount, TopicCandidate } from "./types";
import { bodyUniquenessProblem } from "./bodyUniqueness";
import {
  certifyDraftForOperator,
  composeBlueprintBody,
  composeUniqueDeterministicDraftBody,
  draftBodiesAreTooSimilar,
  draftMeetsPublishTarget,
  draftVariantOrderIsValid,
  fallbackDraftBlueprint,
  normalizeDraftSpecificBlueprint,
} from "./runner";
import { countPublishChars } from "./validation";

const blueprint: DraftBlueprintContext = {
  contract_version: "v3_4",
  identity_contract: {
    persona: "buyer",
    expression_goal: "用家长亲历体现买家身份",
    required_elements: ["家庭处境", "亲历行动"],
    evidence_basis: "留学生家长人设",
    target_section: "identity_evidence",
    evidence: "这段时间我把孩子的毕业时间、目标岗位和每次投递反馈都记在一起，才看清我们真正卡住的地方。",
  },
  fulfillment_contract: {
    promise_type: "material",
    required_sections: [
      { id: "section_1", requirement: "交付第一个节点", minimum_content: ["时间", "动作"] },
      { id: "section_2", requirement: "交付第二个节点", minimum_content: ["时间", "动作"] },
      { id: "section_3", requirement: "交付第三个节点", minimum_content: ["时间", "动作"] },
    ],
  },
  conversion_contract: {
    problem_context: "两边求职节奏没有对齐",
    attempted_action: "反复修改材料",
    professional_role: "求职老师",
    intervention_action: "梳理岗位与招聘节奏",
    stage_result: "孩子不再拿一份简历乱投。",
    evidence_basis: "辅导流程",
    bridge_paragraph: "我们自己折腾了几轮还是没理顺，后来才找了一位求职老师一起梳理现有材料。她先把岗位和招聘节奏对齐，孩子不再拿一份简历乱投，下一步也有了顺序。",
  },
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
  it("repairs the production human-pain incident before the final delivery gate", () => {
    const normalized = normalizeDraftSpecificBlueprint({
      opening: "我最近越想越乱。",
      core_judgement: "平台光环会影响职业判断。",
      delivery_sections: ["先把自己的能力证据列出来。"],
    }, blueprint, spec, "overseas_student");

    expect(normalized.blueprint.identity_contract.evidence).toBe(blueprint.identity_contract.evidence);
    expect(normalized.blueprint.conversion_contract.bridge_paragraph).toBe(blueprint.conversion_contract.bridge_paragraph);
    expect(normalized.blueprint.delivery_sections).toHaveLength(3);
    expect(normalized.initialMissingFields).toEqual(expect.arrayContaining([
      "opening",
      "identity_evidence",
      "delivery_sections",
      "service_bridge",
      "closing",
    ]));
  });

  it("merges an over-produced tug-of-war structure into exactly two promised paths", () => {
    const tugBlueprint: DraftBlueprintContext = {
      ...blueprint,
      fulfillment_contract: {
        ...blueprint.fulfillment_contract,
        promise_type: "comparison",
        required_sections: blueprint.fulfillment_contract.required_sections.slice(0, 2),
      },
      delivery_sections: [
        "留在当前岗位：先核对平台资源与个人能力。",
        "直接跳槽：先验证市场报价和岗位要求。",
      ],
    };
    const normalized = normalizeDraftSpecificBlueprint({
      opening: tugBlueprint.opening,
      identity_evidence: tugBlueprint.identity_contract.evidence,
      core_judgement: tugBlueprint.core_judgement,
      delivery_sections: [
        "路径一先看适用条件。",
        "路径一再看失败代价。",
        "路径二用小范围面试验证市场报价。",
      ],
      service_bridge: tugBlueprint.conversion_contract.bridge_paragraph,
      closing: tugBlueprint.closing,
    }, tugBlueprint, {
      format: "numbered",
      minimumSections: 2,
      exactSections: 2,
      rule: "必须正好比较两条路径。",
    }, "overseas_student");

    expect(normalized.blueprint.delivery_sections).toHaveLength(2);
    expect(normalized.blueprint.delivery_sections.join("\n")).toContain("路径一先看适用条件");
    expect(normalized.blueprint.delivery_sections.join("\n")).toContain("路径二用小范围面试");
    expect(normalized.normalizationActions).toContain("delivery_sections:merged");
  });

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

  it("does not mistake required shared contract paragraphs for duplicate variants", () => {
    const ordinaryBlueprint: DraftBlueprintContext = {
      ...blueprint,
      fulfillment_contract: {
        promise_type: "ordinary",
        required_sections: blueprint.fulfillment_contract.required_sections.slice(0, 2),
      },
      delivery_format: "paragraphs",
      delivery_sections: [
        "先把平台资源和个人能力分开，确认离开当前职位后哪些成果还能被外部验证。",
        "再用真实访谈和小范围面试验证市场反馈，不急着把辞职当成唯一动作。",
      ],
    };
    const ordinarySpec = {
      format: "paragraphs" as const,
      minimumSections: 2,
      rule: "至少用2个具体段落完成标题承诺。",
    };
    const shortBody = composeBlueprintBody(ordinaryBlueprint, ordinarySpec, undefined, {
      bodyVersion: "short",
      businessLine: "executive",
    });
    const longBody = composeBlueprintBody(ordinaryBlueprint, ordinarySpec, undefined, {
      bodyVersion: "long",
      businessLine: "executive",
    });

    expect(Array.from(longBody).length - Array.from(shortBody).length).toBeGreaterThanOrEqual(80);
    expect(draftBodiesAreTooSimilar(shortBody, longBody)).toBe(false);
  });

  it("keeps deterministic long drafts unique across different titles", () => {
    const account = {
      id: "account", tenant_id: "tenant", persona: "buyer", business_line: "overseas_student",
      one_liner: "留学生本人记录秋招", target_user: "留学生", core_problem: "秋招方向不清",
      account_value: "记录真实决策", trust_source: "本人求职过程", persona_specific: {},
    } as unknown as GrowthAccount;
    const topicBase = {
      id: "topic", method_group: "native", method_id: "contrarian", method_label: "反认知",
      generation_mode: "default", target_user: "留学生", pain: "岗位日常不清楚", hook: "",
      follow_reason: "真实经历", test_variable: "反认知", expected_signal: "咨询",
      repeatable_angle: "岗位判断", broad_traffic_risk: 1, priority: "A",
    } as unknown as TopicCandidate;
    const firstTopic = {
      ...topicBase,
      id: "first",
      title: "认识的校友多，反而不懂岗位日常",
      title_promise: "讲清校友多却不了解岗位日常的真实反差",
    };
    const secondTopic = {
      ...topicBase,
      id: "second",
      title: "公司名气大，实际职责却很窄",
      title_promise: "讲清大公司光环与实际职责局限之间的反差",
    };
    const ordinarySpec = {
      format: "paragraphs" as const,
      minimumSections: 2,
      rule: "至少用2个具体段落完成标题承诺。",
    };
    const firstBody = composeBlueprintBody(
      fallbackDraftBlueprint(account, firstTopic, "soft_bridge", ordinarySpec),
      ordinarySpec,
      undefined,
      { bodyVersion: "long", businessLine: "overseas_student" },
    );
    const secondBody = composeBlueprintBody(
      fallbackDraftBlueprint(account, secondTopic, "soft_bridge", ordinarySpec),
      ordinarySpec,
      undefined,
      { bodyVersion: "long", businessLine: "overseas_student" },
    );

    expect(firstBody).toContain(firstTopic.title);
    expect(secondBody).toContain(secondTopic.title);
    expect(bodyUniquenessProblem(secondBody, [{ body: firstBody }])).toBeNull();
  });

  it("keeps repeated fast long generations distinct across a realistic title set", () => {
    const account = {
      id: "buyer-account", tenant_id: "tenant", business_line: "executive", persona: "buyer",
      one_liner: "34岁前中层裸辞找方向的真实记录", target_user: "转型中的中高管",
      trust_source: "本人职业转型过程", persona_specific: {},
    } as unknown as GrowthAccount;
    const titles = [
      ["当了总监，不敢提离职", "讲清中高管不敢轻易离职的深层人性顾虑"],
      ["平台越大，能力越难定价", "讲清平台光环与个人能力定价之间的错位"],
      ["问了10个前辈，我反而更乱", "讲清信息越多越难做职业判断的原因"],
      ["副业有收入，我却没敢辞职", "讲清副业验证与正式转型之间的现实差距"],
      ["职位升了，选择反而变少了", "讲清高职位如何限制下一步职业选择"],
      ["熟人都劝稳，我先去做了访谈", "讲清中高管如何用外部访谈校准方向"],
      ["拿到Offer后，我先算失败成本", "讲清中高管比较机会时为什么先看失败成本"],
      ["离职前，我先验证了一个客户", "讲清从职业经理人转向独立服务的最小验证"],
    ];
    const spec = { format: "paragraphs" as const, minimumSections: 2, rule: "至少2段" };
    const history: Array<{ body: string }> = [];
    titles.forEach(([title, titlePromise], index) => {
      const topic = {
        id: `topic-${index}`, method_group: "native", method_id: "contrarian", method_label: "反认知",
        generation_mode: "default", target_user: "中高管", pain: "职业选择", hook: "",
        follow_reason: "真实经历", test_variable: "判断", expected_signal: "咨询",
        repeatable_angle: "职业决策", broad_traffic_risk: 1, priority: "A", title,
        title_promise: titlePromise,
      } as unknown as TopicCandidate;
      const base = fallbackDraftBlueprint(account, topic, "soft_bridge", spec);
      const generated = composeUniqueDeterministicDraftBody({
        account,
        topic,
        cta: "soft_bridge",
        spec,
        blueprint: base,
        bodyVersion: "long",
        businessLine: "executive",
        historicalBodies: history,
      });
      const body = generated.body;
      expect(generated.variationIndex).toBeGreaterThanOrEqual(0);
      expect(bodyUniquenessProblem(body, history), `duplicate title: ${title}`).toBeNull();
      history.push({ body });
    });
  });

  it("detects duplicate or near-duplicate bodies", () => {
    const body = "先把岗位和材料放在同一张表里，再根据真实反馈收窄方向。";
    expect(draftBodiesAreTooSimilar(body, body)).toBe(true);
    expect(draftBodiesAreTooSimilar(body, `${body}\n\n先记录结果。`)).toBe(true);
  });

  it("rejects a short draft that is longer than the long draft", () => {
    const timestamp = new Date().toISOString();
    const base = {
      id: "base", tenant_id: "tenant", account_id: "account", run_id: "run", status: "ready",
      business_line: "中高管职业决策", method_group: "native", method_id: "human_pain", method_label: "行业人性痛点",
      generation_mode: "default", title_promise: "承诺", raw_body_tags: [], tagging_status: "pending",
      canonical_tag_ids: [], cta_type: "service_entry", validation_checks: [], test_variable: "变量",
      expected_signal: "信号", title: "标题", alternative_titles: [], target_user: "中高管", cover_text: "封面",
      hashtags: ["#中高管"], comment_prompt: "", follow_reason: "", trust_anchor: "", review_points: [],
      cover_suggestion: "", created_at: timestamp, updated_at: timestamp,
    } as unknown as ContentDraft;
    const shortDraft = {
      ...base,
      selected_body_version: "short" as const,
      body: "短".repeat(500),
      word_count: { title: 2, body_and_tags: 505, total: 507, within_limit: true },
    };
    const longDraft = {
      ...base,
      id: "long",
      selected_body_version: "long" as const,
      body: "长".repeat(440),
      word_count: { title: 2, body_and_tags: 445, total: 447, within_limit: true },
    };

    expect(draftVariantOrderIsValid(shortDraft, longDraft)).toBe(false);
    expect(draftVariantOrderIsValid(
      { ...shortDraft, body: "短".repeat(300), word_count: { title: 2, body_and_tags: 305, total: 307, within_limit: true } },
      longDraft,
    )).toBe(true);
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

  it("never accepts a compact fallback on length alone", () => {
    const failed = {
      word_count: { title: 10, body_and_tags: 800, total: 810, within_limit: true },
      validation_report: { status: "failed" as const, attempts: 1, checked_at: new Date().toISOString(), annotations: [] },
    };
    const passed = {
      ...failed,
      validation_report: { ...failed.validation_report, status: "passed" as const },
    };

    expect(draftMeetsPublishTarget(failed)).toBe(false);
    expect(draftMeetsPublishTarget(passed)).toBe(true);
  });

  it("only exposes a draft after all machine contracts are certified", () => {
    const timestamp = new Date().toISOString();
    const candidate = {
      id: "certified", tenant_id: "tenant", account_id: "account", run_id: "run", status: "ready",
      business_line: "中高管职业决策", method_group: "native", method_id: "human_pain", method_label: "行业人性痛点",
      generation_mode: "default", title_promise: "讲清真实处境与下一步", selected_body_version: "short", raw_body_tags: [],
      tagging_status: "pending", canonical_tag_ids: [], cta_type: "service_entry",
      validation_checks: ["identity", "fulfillment", "conversion"].map((key) => ({ key, status: "passed", message: "通过" })),
      validation_report: { status: "passed", attempts: 1, checked_at: timestamp, annotations: [] },
      test_variable: "认证", expected_signal: "有效咨询", title: "找对方向，比瞎忙重要太多", alternative_titles: [],
      target_user: "中高管", cover_text: "找对方向", body: "已经通过合同的正文", hashtags: ["#中高管"], comment_prompt: "",
      word_count: { title: 14, body_and_tags: 100, total: 114, within_limit: true },
      follow_reason: "职业判断", trust_anchor: "真实咨询", review_points: [], cover_suggestion: "办公桌",
      compliance: { status: "passed", checked_at: timestamp, issues: [] },
      created_at: timestamp, updated_at: timestamp,
    } as ContentDraft;

    expect(certifyDraftForOperator(candidate).certification_status).toBe("certified");
    expect(() => certifyDraftForOperator({
      ...candidate,
      validation_checks: candidate.validation_checks.map((check, index) => index === 0 ? { ...check, status: "needs_edit" } : check),
    })).toThrow("draft_certification_failed");
  });
});
