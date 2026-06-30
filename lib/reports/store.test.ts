import { describe, expect, it } from "vitest";
import { isReportOrderStatus, MemoryReportStore } from "./store";

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
});
