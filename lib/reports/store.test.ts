import { describe, expect, it } from "vitest";
import { isReportOrderStatus, MemoryReportStore } from "./store";
import type { AssessmentProfile } from "./assessmentProfile";

function profile(overrides: Partial<AssessmentProfile> = {}): AssessmentProfile {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    tenant_id: "mianbajun",
    customer_name: "测试用户",
    survey_answers: {},
    value_profile: {
      liked_values: ["学习"],
      excluded_values: ["重复"],
      like_summary: "学习",
      exclude_summary: "重复",
      filter_sentence: "学习",
    },
    talent_answers: {},
    talent_profile: {
      mode: "local",
      answer_distribution: { 1: 0, 2: 0, 3: 0, 4: 252, 5: 0, 6: 0, 7: 0 },
      top_archetypes: [],
      high_traits: [],
      low_traits: [],
    },
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("report order store", () => {
  it("validates allowed order statuses", () => {
    expect(isReportOrderStatus("unpaid")).toBe(true);
    expect(isReportOrderStatus("paid")).toBe(true);
    expect(isReportOrderStatus("cancelled")).toBe(false);
  });

  it("creates, lists, fetches, and updates report orders in memory", async () => {
    const store = new MemoryReportStore();
    const order = await store.createReportOrder({
      tenant_id: "mianbajun",
      assessment_profile_id: "550e8400-e29b-41d4-a716-446655440000",
      report_type: "lite",
      price_cents: 19900,
      customer_name: "测试用户",
      customer_contact: "wechat",
    });

    expect(order).toMatchObject({
      tenant_id: "mianbajun",
      assessment_profile_id: "550e8400-e29b-41d4-a716-446655440000",
      report_type: "lite",
      price_cents: 19900,
      customer_name: "测试用户",
      customer_contact: "wechat",
      status: "unpaid",
    });

    await store.createReportOrder({
      tenant_id: "other",
      assessment_profile_id: "550e8400-e29b-41d4-a716-446655440001",
      report_type: "deep",
    });

    expect(await store.listReportOrders("mianbajun")).toEqual([order]);
    expect(await store.getReportOrder(order.id)).toEqual(order);

    const paid = await store.updateReportOrderStatus(order.id, "paid");
    expect(paid).toMatchObject({ id: order.id, status: "paid" });
    expect(await store.updateReportOrderStatus("missing", "delivered")).toBeNull();
  });

  it("preserves direction progress when a stale profile save arrives later", async () => {
    const store = new MemoryReportStore();
    const completed = profile({
      direction_session: {
        status: "completed",
        target_likes: 1,
        cards: [
          {
            id: "c1",
            round: 1,
            title: "方向1",
            one_liner: "说明",
            typical_day: "早上做事，中午复盘，晚上输出。",
            work_content: "判断/输出",
            scene: "测试场景",
            role: "测试角色",
          },
        ],
        swipes: [{ card_id: "c1", liked: true, swiped_at: "2026-07-09T00:00:01.000Z" }],
        rounds_generated: 1,
        generating: false,
        created_at: "2026-07-09T00:00:00.000Z",
        updated_at: "2026-07-09T00:00:01.000Z",
        completed_at: "2026-07-09T00:00:01.000Z",
      },
      updated_at: "2026-07-09T00:00:01.000Z",
    });
    await store.saveAssessmentProfile(completed);

    await store.saveAssessmentProfile(
      profile({
        initial_diagnosis: {
          one_line_conclusion: "这是一个稍后写回的初步诊断。",
          main_judgement: "这是一个稍后写回的初步诊断。",
          initial_direction: "这是一个稍后写回的初步诊断。",
          biggest_risk: "这是一个稍后写回的初步诊断。",
          next_action: "这是一个稍后写回的初步诊断。",
          consultant_reading: ["这是一个稍后写回的初步诊断。", "这是一个稍后写回的初步诊断。", "这是一个稍后写回的初步诊断。"],
          value_key_note: "这是一个稍后写回的初步诊断。",
          archetype_judgement: "这是一个稍后写回的初步诊断。",
          key_signals: ["信号一：这是说明。", "信号二：这是说明。", "信号三：这是说明。"],
          career_translation: "这是一个稍后写回的初步诊断。",
          behavior_modes: {
            thinking: ["这是一个说明。", "这是一个说明。"],
            interpersonal: ["这是一个说明。", "这是一个说明。"],
            self_drive: ["这是一个说明。", "这是一个说明。"],
          },
          behavior_advice: "这是一个稍后写回的初步诊断。",
          recommended_cut: "这是一个稍后写回的初步诊断。",
          suitable_forms: ["形态一：这是说明。", "形态二：这是说明。", "形态三：这是说明。"],
          not_recommended_forms: ["形态一：这是说明。", "形态二：这是说明。", "形态三：这是说明。"],
          direction_hypothesis: "这是一个稍后写回的初步诊断。",
          ninety_day: {
            weeks_1_2: "这是一个稍后写回的初步诊断。",
            weeks_3_4: "这是一个稍后写回的初步诊断。",
            weeks_5_8: "这是一个稍后写回的初步诊断。",
            weeks_9_12: "这是一个稍后写回的初步诊断。",
            stop_loss: "这是一个稍后写回的初步诊断。",
          },
          generated_at: "2026-07-09T00:00:02.000Z",
          provider: "fallback",
          model: "deterministic",
          llm_generated: false,
        },
        updated_at: "2026-07-09T00:00:02.000Z",
      })
    );

    const saved = await store.getAssessmentProfile(completed.id);

    expect(saved?.direction_session?.status).toBe("completed");
    expect(saved?.direction_session?.swipes).toHaveLength(1);
    expect(saved?.initial_diagnosis).toBeTruthy();
  });
});
