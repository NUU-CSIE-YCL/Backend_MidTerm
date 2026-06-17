import { describe, expect, test } from "bun:test";
import {
  CUSTOMER_ORDER_REFRESH_INTERVAL_MS,
  PICKUP_BOARD_REFRESH_INTERVAL_MS,
  WORKBENCH_REFRESH_INTERVAL_MS,
  getAutoRefreshTargets,
} from "../shared/auto-refresh.ts";
import type { Role, SessionUser } from "../shared/contracts.ts";

function userWithRoles(roles: Role[]): SessionUser {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "Test User",
    roles,
  };
}

describe("V10.4F auto refresh policy", () => {
  test("uses the intended polling intervals", () => {
    expect(PICKUP_BOARD_REFRESH_INTERVAL_MS).toBe(10_000);
    expect(WORKBENCH_REFRESH_INTERVAL_MS).toBe(10_000);
    expect(CUSTOMER_ORDER_REFRESH_INTERVAL_MS).toBe(15_000);
  });

  test("guest only refreshes the public pickup board", () => {
    expect(getAutoRefreshTargets(null)).toEqual({
      pickupBoard: true,
      customerOrders: false,
      workbench: false,
      adminRbac: false,
    });
  });

  test("customer refreshes own order data but not the workbench", () => {
    expect(getAutoRefreshTargets(userWithRoles(["customer"]))).toEqual({
      pickupBoard: true,
      customerOrders: true,
      workbench: false,
      adminRbac: false,
    });
  });

  test("operational roles refresh the workbench", () => {
    for (const role of ["staff", "chef", "owner", "admin"] as const) {
      expect(
        getAutoRefreshTargets(userWithRoles(["customer", role])).workbench,
      ).toBe(true);
    }
  });

  test("admin RBAC data is intentionally not auto-refreshed", () => {
    expect(getAutoRefreshTargets(userWithRoles(["customer", "admin"])))
      .toMatchObject({
        pickupBoard: true,
        customerOrders: true,
        workbench: true,
        adminRbac: false,
      });
  });
});
