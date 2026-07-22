import { describe, expect, it } from "vitest";
import { METHOD_APPLICABILITY, TITLE_METHODS, type TitleMethodDefinition } from "./methods";
import type { ContentDraft, DraftFulfillmentContract, GrowthPersona } from "./types";
import { analyzeDraftValidation } from "./validation";

const personas: GrowthPersona[] = ["buyer", "expert", "merchant"];
const versions: ContentDraft["selected_body_version"][] = ["short", "long"];

function contractFor(method: TitleMethodDefinition) {
  if (method.id === "tug_of_war") {
    return {
      title: "留下还是离开？",
      promise: "比较留下和离开两条路径",
      delivery: "1. 留下要看平台空间和能力积累。\n\n2. 离开要看市场报价和家庭现金流。",
    };
  }
  if (method.id === "scarce_material") {
    return {
      title: "中高管转型路线图公开了",
      promise: "直接交付中高管转型路线图",
      delivery: "1. 第一周核对能力证据和目标方向。\n\n2. 第二周访谈真实从业者验证门槛。\n\n3. 第三周用小样本试做决定是否继续。",
    };
  }
  if (method.id === "inventory") {
    return {
      title: "中高管离职前查这5项",
      promise: "逐项交付离职前的5项检查",
      delivery: "1. 离开平台后仍可验证的能力。\n\n2. 家庭现金流能承受的周期。\n\n3. 目标市场给出的真实报价。\n\n4. 提前写清楚的停止条件。\n\n5. 能被外部识别的成果证据。",
    };
  }
  return {
    title: "找对方向，比瞎忙重要太多",
    promise: "讲清试错后如何理清方向",
    delivery: "现在每个方向都先做一次小验证，有反馈再继续，没有反馈就及时停下。",
  };
}

function personaParagraphs(persona: GrowthPersona) {
  if (persona === "expert") return {
    opening: "前两天和一位来访者聊了很久，他做得越多，反而越说不清下一步。",
    identity: "那次咨询中，我先帮他梳理职业经历和外部反馈，没有急着替他选答案。",
    conversion: "职业决策顾问需要先梳理能力和市场机会，最后让候选方向收窄到一个，也明确了下一步。",
  };
  if (persona === "merchant") return {
    opening: "最近接到一个很典型的情况，当事人忙了两个月，方向却越来越散。",
    identity: "这次项目里，团队先把候选路径、职业经历和外部反馈放在同一张判断表里。",
    conversion: "那次职业决策服务里，我们先梳理能力和市场机会，最后排除了一个方向，也明确了下一步。",
  };
  return {
    opening: "我前后试了两个月，事情越做越多，心里反而越来越没底。",
    identity: "后来我把职业上的几个想法放在一起，才发现自己一直把忙碌当成了进展。",
    conversion: "我请一位职业决策顾问帮我梳理能力和市场机会，最后排除了一个方向，也明确了下一步。",
  };
}

function fulfillmentContractFor(method: TitleMethodDefinition): DraftFulfillmentContract {
  if (method.id === "tug_of_war") {
    return {
      promise_type: "comparison",
      required_sections: [
        { id: "path_1", requirement: "交付第一条路径", minimum_content: ["条件", "代价"] },
        { id: "path_2", requirement: "交付第二条路径", minimum_content: ["条件", "代价"] },
      ],
    };
  }
  if (method.id === "scarce_material") {
    return {
      promise_type: "material",
      required_sections: [
        { id: "step_1", requirement: "交付第一步", minimum_content: ["时间", "动作"] },
        { id: "step_2", requirement: "交付第二步", minimum_content: ["时间", "动作"] },
        { id: "step_3", requirement: "交付第三步", minimum_content: ["时间", "动作"] },
      ],
    };
  }
  if (method.id === "inventory") {
    return {
      promise_type: "counted",
      promised_count: 5,
      required_sections: Array.from({ length: 5 }, (_, index) => ({
        id: `item_${index + 1}`,
        requirement: `交付第${index + 1}项检查`,
        minimum_content: ["判断", "证据"],
      })),
    };
  }
  return {
    promise_type: "ordinary",
    required_sections: [
      { id: "judgement", requirement: "交付核心判断", minimum_content: ["方向", "验证"] },
      { id: "action", requirement: "交付下一步行动", minimum_content: ["行动", "反馈"] },
    ],
  };
}

function draftFor(method: TitleMethodDefinition, persona: GrowthPersona, version: ContentDraft["selected_body_version"]): ContentDraft {
  const timestamp = "2026-07-21T00:00:00.000Z";
  const contract = contractFor(method);
  const paragraphs = personaParagraphs(persona);
  return {
    id: `${method.id}-${persona}-${version}`,
    tenant_id: "tenant",
    account_id: "account",
    run_id: "run",
    status: "draft",
    business_line: "中高管职业决策",
    method_group: method.group,
    method_id: method.id,
    method_label: method.label,
    generation_mode: METHOD_APPLICABILITY[persona][method.id] === "explore" ? "explore" : "default",
    title_promise: contract.promise,
    selected_body_version: version,
    raw_body_tags: [],
    tagging_status: "pending",
    canonical_tag_ids: [],
    cta_type: persona === "buyer" ? "soft_bridge" : persona === "expert" ? "on_platform_consult" : "service_entry",
    validation_checks: [],
    test_variable: "正文合同",
    expected_signal: "有效咨询",
    title: contract.title,
    alternative_titles: [],
    target_user: "中高管",
    cover_text: contract.title,
    body: [paragraphs.opening, paragraphs.identity, paragraphs.conversion, contract.delivery].join("\n\n"),
    hashtags: ["#中高管"],
    comment_prompt: "",
    word_count: { title: contract.title.length, body_and_tags: 400, total: 420, within_limit: true },
    follow_reason: "验证正文合同",
    trust_anchor: "真实咨询",
    review_points: [],
    cover_suggestion: "办公桌",
    delivery_contract: {
      contract_version: "v3_4",
      identity_contract: {
        persona,
        expression_goal: "通过具体处境和行动体现当前视角",
        required_elements: ["具体处境", "当前视角行动"],
        evidence_basis: "当前人设与业务事实",
        target_section: "identity_evidence",
        evidence: paragraphs.identity,
      },
      fulfillment_contract: fulfillmentContractFor(method),
      conversion_contract: {
        problem_context: "原有尝试没有形成清晰方向",
        attempted_action: "自行反复比较候选方向",
        professional_role: "职业决策顾问",
        intervention_action: "梳理能力和市场机会",
        stage_result: "排除一个方向并明确下一步",
        evidence_basis: "职业决策服务流程",
        bridge_paragraph: paragraphs.conversion,
      },
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

describe("13种方法 × 3种视角 × 2种正文版本的门禁矩阵", () => {
  for (const method of TITLE_METHODS) {
    for (const persona of personas) {
      for (const version of versions) {
        it(`${method.label} / ${persona} / ${version}`, () => {
          const analysis = analyzeDraftValidation(draftFor(method, persona, version), persona);
          const disabled = METHOD_APPLICABILITY[persona][method.id] === "disabled";
          if (disabled) {
            expect(analysis.report.status).toBe("failed");
            expect(analysis.checks.find((item) => item.key === "identity")?.status).not.toBe("passed");
            return;
          }
          expect(analysis.report.status).toBe("passed");
          expect(analysis.checks.every((item) => item.status === "passed")).toBe(true);
        });
      }
    }
  }
});
