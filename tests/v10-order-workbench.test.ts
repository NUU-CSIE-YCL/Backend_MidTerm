import { describe, expect, test } from "bun:test";
import { orderSchema, orderStatusSchema } from "../shared/contracts.ts";
import {
  orderResponseSchema,
  updateOrderStatusBodySchema,
} from "../shared/route-schemas.ts";

describe("V10.4A order workbench contracts", () => {
  test("order status schema accepts only workflow statuses", () => {
    for (const status of [
      "pending",
      "submitted",
      "preparing",
      "ready",
      "completed",
      "cancelled",
    ]) {
      expect(orderStatusSchema.safeParse(status).success).toBe(true);
    }

    expect(orderStatusSchema.safeParse("paid").success).toBe(false);
  });

  test("workbench status update body only accepts operational next states", () => {
    for (const status of ["preparing", "ready", "completed"]) {
      expect(updateOrderStatusBodySchema.safeParse({ status }).success).toBe(
        true,
      );
    }

    expect(
      updateOrderStatusBodySchema.safeParse({ status: "pending" }).success,
    ).toBe(false);
    expect(
      updateOrderStatusBodySchema.safeParse({ status: "submitted" }).success,
    ).toBe(false);
  });

  test("order schema accepts every workflow status", () => {
    const baseOrder = {
      id: 1,
      userId: "user-1",
      items: [],
      total: 0,
      paymentStatus: "unpaid",
      customerNote: "",
      cancelReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
    };

    expect(orderSchema.parse({ ...baseOrder, status: "submitted" }).status).toBe(
      "submitted",
    );
    expect(orderSchema.parse({ ...baseOrder, status: "preparing" }).status).toBe(
      "preparing",
    );
    expect(orderSchema.parse({ ...baseOrder, status: "ready" }).status).toBe(
      "ready",
    );
    expect(orderSchema.parse({ ...baseOrder, status: "completed" }).status).toBe(
      "completed",
    );
  });

  test("order response schema can return workbench statuses", () => {
    const parsed = orderResponseSchema.parse({
      id: 2,
      userId: "user-1",
      items: [],
      total: 120,
      status: "ready",
      paymentStatus: "unpaid",
      customerNote: "",
      cancelReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      createdAtTaipei: "2026/06/16 08:00",
      pickupCode: "A-0002",
    });

    expect(parsed.status).toBe("ready");
  });
});
