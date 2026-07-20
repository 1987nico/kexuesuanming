import { describe, expect, it } from "vitest";
import type { AssessmentProfile } from "./assessmentProfile";
import { generateGoldenDeepReport } from "./goldenDeepPipeline";
import { toGoldenReportData } from "./goldenAdapter";
import { renderGoldenReportHtml } from "./goldenReportHtml";

function profileFixture(): AssessmentProfile {
  const now = "2026-07-07T00:00:00.000Z";
  const cards = Array.from({ length: 10 }, (_, index) => ({
    id: `card-${index + 1}`,
    round: index < 6 ? 1 : 2,
    title: [
      "AI口播短视频IP陪跑工作室（中客单价）",
      "传统行业老板个人IP咨询顾问",
      "AI企业内训（传统行业销售岗方向）",
      "垂直行业AI短视频素材库会员产品",
      "实体门店AI引流方案服务商",
      "行业老兵AI转型私董会",
      "AI数字人直播代运营（中高端）",
      "「行业判断」短视频IP（从0启动）",
      "AI行业决策工具小产品（从0启动）",
      "「反常识行业避坑」付费社群",
    ][index],
    one_liner: "用于测试金样本大报告新路线的点亮方向。",
    typical_day: "访谈客户、拆解行业、输出判断、验证付费。",
    work_content: "咨询诊断与内容验证",
    scene: "中小老板方向决策",
    role: "顾问",
  }));

  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "mianbajun",
    customer_name: "金样本大报告",
    customer_contact: "13900000000",
    survey_answers: {
      decision_type: "创业",
      energy_source: "做判断和决策",
      excluded_direction: "低价代运营",
    },
    value_profile: {
      liked_values: ["学习/进化", "了解世界", "被爱"],
      excluded_values: ["安稳度日，优哉游哉", "有知己好友", "创新"],
      like_summary: "持续学习升级，看见更大的世界，并获得真实认可。",
      exclude_summary: "只求安稳舒适，停在小圈安全感，或为新奇而创新。",
      filter_sentence: "能持续学习、连接更大的世界、让个人判断被看见。",
    },
    talent_answers: {},
    talent_profile: {
      mode: "local",
      answer_distribution: { 1: 0, 2: 0, 3: 0, 4: 252, 5: 0, 6: 0, 7: 0 },
      top_archetypes: [{ key: "maintainer", name: "规则维护者", percentile: 88 }],
      high_traits: [{ key: "critique", name: "批评判断", percentile: 91, band: "very_high" }],
      low_traits: [{ key: "autonomy", name: "自主", percentile: 2, band: "very_low" }],
    },
    direction_session: {
      status: "completed",
      target_likes: 10,
      cards,
      swipes: cards.map((card) => ({ card_id: card.id, liked: true, swiped_at: now })),
      rounds_generated: 2,
      generating: false,
      created_at: now,
      updated_at: now,
      completed_at: now,
    },
    created_at: now,
    updated_at: now,
  };
}

describe("golden deep pipeline", () => {
  it("builds a renderable golden-route report without the old staged pipeline", async () => {
    const profile = profileFixture();
    const { generated, usage } = await generateGoldenDeepReport(profile, { forceFixture: true });

    expect(generated.pipeline).toBe("golden-route-v1");
    expect(usage.source).toBe("fixture");
    expect(generated.market).toHaveLength(10);
    expect(generated.vrin).toHaveLength(6);
    expect(generated.premortem).toHaveLength(3);
    expect(generated.golden_roadmap).toBeTruthy();
    expect(generated.final_verdict).toBeTruthy();

    const data = toGoldenReportData(profile, generated);
    expect(data.market).toHaveLength(10);
    expect(data.vrin.filter((row) => row.rank <= 3)).toHaveLength(3);
    expect(data.phases).toHaveLength(3);
    expect(data.verdict?.conclusion).toContain("优先验证");

    const html = renderGoldenReportHtml(data);
    expect(html).toContain("Step4 · 市场分析");
    expect(html).toContain("最终判断");
  });
});
