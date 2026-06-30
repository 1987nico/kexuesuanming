import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_TENANT_ID,
  canManageReportOrders,
  getDefaultReportAuthContext,
  resolveReportAuthContext,
} from "./tenant";

describe("report tenant auth helper", () => {
  it("defaults to the mianbajun owner context", () => {
    expect(getDefaultReportAuthContext({})).toMatchObject({
      tenantId: DEFAULT_REPORT_TENANT_ID,
      role: "owner",
      canViewReportOrders: true,
      canManageReportOrders: true,
    });
  });

  it("normalizes invalid roles to the default owner role", () => {
    expect(resolveReportAuthContext({ tenantId: " custom ", role: "guest" })).toMatchObject({
      tenantId: "custom",
      role: "owner",
      canManageReportOrders: true,
    });
  });

  it("keeps viewers read-only for order management", () => {
    expect(canManageReportOrders("viewer")).toBe(false);
    expect(resolveReportAuthContext({ role: "viewer" }).canManageReportOrders).toBe(false);
  });
});
