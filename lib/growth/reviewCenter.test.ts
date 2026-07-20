import { describe, expect, it } from "vitest";
import type { ContentDraft, GrowthReview } from "./types";
import {
  appendReviewSnapshot,
  businessMetricStatus,
  createReviewSnapshot,
  fixedCycleId,
  inquiryQualificationRate,
  perThousandImpressions,
  resolveReviewProgress,
} from "./reviewCenter";

const draft = {
  id: "draft",
  status: "published",
  published_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
} as ContentDraft;

function review(metrics: GrowthReview["metrics"]): GrowthReview {
  return {
    id: "review",
    tenant_id: "mianbajun",
    draft_id: draft.id,
    metrics,
    classification: "retest",
    entry_judgement: "入口判断",
    value_judgement: "价值判断",
    follow_judgement: "承接判断",
    audience_judgement: "人群判断",
    next_variable: "只改标题",
    manager_instruction: "作为周证据",
    topic_instruction: "继续验证",
    writer_instruction: "兑现承诺",
    created_at: "2026-07-02T00:00:00.000Z",
  };
}

describe("复盘中心时间窗口", () => {
  it("发布24小时后进入内容复盘，7天后进入商业复盘", () => {
    expect(resolveReviewProgress(draft, undefined, new Date("2026-07-01T12:00:00.000Z")).state).toBe("waiting_content");
    expect(resolveReviewProgress(draft, undefined, new Date("2026-07-02T00:00:00.000Z")).state).toBe("content_due");

    const content = appendReviewSnapshot(
      review({ impressions: 1000, reads: 100 }),
      createReviewSnapshot({ window: "content_24h", metrics: { impressions: 1000, reads: 100 }, capturedAt: "2026-07-02T00:00:00.000Z" }),
    );
    expect(resolveReviewProgress(draft, content, new Date("2026-07-05T00:00:00.000Z")).state).toBe("waiting_business");
    expect(resolveReviewProgress(draft, content, new Date("2026-07-08T00:00:00.000Z")).state).toBe("business_due");
    const attributionReady = resolveReviewProgress(draft, content, new Date("2026-07-31T00:00:00.000Z"));
    expect(attributionReady.attribution_available_at).toBe("2026-07-31T00:00:00.000Z");
    expect(attributionReady.attribution_ready).toBe(true);
  });

  it("确认0与未检查保持不同语义", () => {
    expect(businessMetricStatus({})).toBe("unknown");
    expect(businessMetricStatus({ qualified_inquiries: 0 })).toBe("confirmed_zero");
    expect(businessMetricStatus({ qualified_inquiries: 2 })).toBe("confirmed_value");
  });

  it("重算诊断后追加7天快照不会丢失既有24小时快照", () => {
    const base = review({ impressions: 900, reads: 120 });
    const contentSnapshot = createReviewSnapshot({
      window: "content_24h",
      metrics: { impressions: 900, reads: 120 },
      capturedAt: "2026-07-02T00:00:00.000Z",
    });
    const previous = appendReviewSnapshot(base, contentSnapshot);
    const regenerated = review({ impressions: 900, reads: 120, qualified_inquiries: 0 });
    const businessSnapshot = createReviewSnapshot({
      window: "business_7d",
      metrics: { qualified_inquiries: 0 },
      previous,
      capturedAt: "2026-07-08T00:00:00.000Z",
    });
    const merged = appendReviewSnapshot(regenerated, businessSnapshot, previous);

    expect(merged.snapshots?.map((item) => item.review_window)).toEqual(["content_24h", "business_7d"]);
    expect(merged.content_reviewed_at).toBe("2026-07-02T00:00:00.000Z");
    expect(merged.business_reviewed_at).toBe("2026-07-08T00:00:00.000Z");
  });

  it("输出两个明确分母的商业指标", () => {
    const metrics = { impressions: 2000, private_messages: 10, qualified_inquiries: 4 };
    expect(perThousandImpressions(metrics)).toBe(2);
    expect(inquiryQualificationRate(metrics)).toBe(0.4);
  });

  it("同一自然周生成稳定周期ID", () => {
    expect(fixedCycleId(new Date("2026-07-20T12:00:00.000Z"))).toBe("week-2026-07-20");
    expect(fixedCycleId(new Date("2026-07-26T23:00:00.000Z"))).toBe("week-2026-07-20");
  });
});
