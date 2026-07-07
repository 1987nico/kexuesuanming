import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_TENANT_ID,
  canManageReportOrders,
  isTenantRole,
  resolveReportAuthContext,
} from "./tenant";

describe("report tenant auth helper", () => {
  it("accepts only mianba admin and operator roles", () => {
    expect(isTenantRole("admin")).toBe(true);
    expect(isTenantRole("operator")).toBe(true);
    expect(isTenantRole("owner")).toBe(false);
    expect(isTenantRole("viewer")).toBe(false);
  });

  it("does not promote invalid roles to admin", () => {
    expect(resolveReportAuthContext({ tenantId: " custom ", role: "guest" })).toBeNull();
  });

  it("builds an explicit report auth context", () => {
    expect(resolveReportAuthContext({ role: "operator" })).toMatchObject({
      tenantId: DEFAULT_REPORT_TENANT_ID,
      role: "operator",
      canViewReportOrders: true,
      canManageReportOrders: true,
    });
  });

  it("allows both admin and operator to manage report orders", () => {
    expect(canManageReportOrders("admin")).toBe(true);
    expect(canManageReportOrders("operator")).toBe(true);
  });
});
