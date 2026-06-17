import { describe, expect, test } from "bun:test";
import { orderSchema, orderStatusSchema } from "../shared/contracts.ts";
import {
  cancelOrderBodySchema,
  orderResponseSchema,
} from "../shared/route-schemas.ts";

describe("V10.4C order cancellation contracts", () => {
  test("order status schema accepts cancelled and rejects unknown statuses", () => {
    expect(orderStatusSchema.safeParse("cancelled").success).toBe(true);
    expect(orderStatusSchema.safeParse("refunded").success).toBe(false);
    expect(orderStatusSchema.safeParse("reopened").success).toBe(false);
  });

  test("cancel order body accepts empty body and optional trimmed reason", () => {
    expect(cancelOrderBodySchema.parse(undefined)).toEqual({});
    expect(cancelOrderBodySchema.parse({})).toEqual({});
    expect(cancelOrderBodySchema.parse({ reason: "  客人臨時取消  " }))
      .toEqual({ reason: "客人臨時取消" });
  });

  test("cancel order body rejects reasons over 120 characters", () => {
    expect(
      cancelOrderBodySchema.safeParse({ reason: "a".repeat(120) }).success,
    ).toBe(true);
    expect(
      cancelOrderBodySchema.safeParse({ reason: "a".repeat(121) }).success,
    ).toBe(false);
  });

  test("order schema carries cancellation fields", () => {
    const parsed = orderSchema.parse({
      id: 3,
      userId: "user-1",
      items: [],
      total: 80,
      status: "cancelled",
      paymentStatus: "unpaid",
      customerNote: "",
      cancelReason: "客人臨時取消",
      cancelledBy: "user-1",
      cancelledAt: "2026-06-16T00:02:00.000Z",
      refundReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      submittedAt: "2026-06-16T00:01:00.000Z",
    });

    expect(parsed.status).toBe("cancelled");
    expect(parsed.cancelReason).toBe("客人臨時取消");
  });

  test("order response schema includes cancellation fields", () => {
    const parsed = orderResponseSchema.parse({
      id: 3,
      userId: "user-1",
      items: [],
      total: 80,
      status: "cancelled",
      paymentStatus: "unpaid",
      customerNote: "",
      cancelReason: "客人臨時取消",
      cancelledBy: "user-1",
      cancelledAt: "2026-06-16T00:02:00.000Z",
      refundReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      createdAtTaipei: "2026/06/16 08:00",
      submittedAt: "2026-06-16T00:01:00.000Z",
      pickupCode: "A-0003",
    });

    expect(parsed.pickupCode).toBe("A-0003");
    expect(parsed.cancelledBy).toBe("user-1");
  });
});
