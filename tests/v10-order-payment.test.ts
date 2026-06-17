import { describe, expect, test } from "bun:test";
import { orderSchema, paymentStatusSchema } from "../shared/contracts.ts";
import {
  orderResponseSchema,
  toOrderResponse,
} from "../shared/route-schemas.ts";

describe("V10.4D order payment contracts", () => {
  test("payment status schema accepts unpaid, paid, and refunded", () => {
    expect(paymentStatusSchema.safeParse("unpaid").success).toBe(true);
    expect(paymentStatusSchema.safeParse("paid").success).toBe(true);
    expect(paymentStatusSchema.safeParse("refunded").success).toBe(true);
    expect(paymentStatusSchema.safeParse("pending").success).toBe(false);
  });

  test("order schema carries unpaid status before pickup completion", () => {
    for (const status of ["pending", "submitted", "preparing", "ready"]) {
      const parsed = orderSchema.parse({
        id: 10,
        userId: "user-1",
        items: [],
        total: 120,
        status,
        paymentStatus: "unpaid",
        paidBy: null,
        customerNote: "",
        cancelReason: "",
        refundReason: "",
        createdAt: "2026-06-16T00:00:00.000Z",
      });

      expect(parsed.paymentStatus).toBe("unpaid");
    }
  });

  test("order response schema carries paid fields for completed orders", () => {
    const parsed = orderResponseSchema.parse({
      id: 11,
      userId: "user-1",
      items: [],
      total: 150,
      status: "completed",
      paymentStatus: "paid",
      paidBy: "staff-1",
      paidAt: "2026-06-16T00:05:00.000Z",
      customerNote: "",
      cancelReason: "",
      refundReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      createdAtTaipei: "2026/06/16 08:00",
      submittedAt: "2026-06-16T00:01:00.000Z",
      pickupCode: "A-0011",
    });

    expect(parsed.paymentStatus).toBe("paid");
    expect(parsed.paidBy).toBe("staff-1");
    expect(parsed.paidAt).toBe("2026-06-16T00:05:00.000Z");
  });

  test("toOrderResponse preserves payment fields", () => {
    const response = toOrderResponse({
      id: 12,
      userId: "user-1",
      items: [],
      total: 150,
      status: "completed",
      paymentStatus: "paid",
      paidBy: "staff-1",
      paidAt: "2026-06-16T00:05:00.000Z",
      customerNote: "",
      cancelReason: "",
      refundReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      submittedAt: "2026-06-16T00:01:00.000Z",
    });

    expect(response.pickupCode).toBe("A-0012");
    expect(response.paymentStatus).toBe("paid");
    expect(response.paidBy).toBe("staff-1");
  });
});
