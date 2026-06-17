import { describe, expect, test } from "bun:test";
import { orderSchema, paymentStatusSchema } from "../shared/contracts.ts";
import {
  orderResponseSchema,
  refundOrderBodySchema,
  reopenOrderBodySchema,
} from "../shared/route-schemas.ts";

describe("V10.4G refund and reopen contracts", () => {
  test("payment status schema accepts refunded and rejects unknown statuses", () => {
    expect(paymentStatusSchema.safeParse("unpaid").success).toBe(true);
    expect(paymentStatusSchema.safeParse("paid").success).toBe(true);
    expect(paymentStatusSchema.safeParse("refunded").success).toBe(true);
    expect(paymentStatusSchema.safeParse("cancelled").success).toBe(false);
  });

  test("refund and reopen bodies accept optional trimmed reasons", () => {
    expect(refundOrderBodySchema.parse(undefined)).toEqual({});
    expect(refundOrderBodySchema.parse({})).toEqual({});
    expect(refundOrderBodySchema.parse({ reason: "  客人要求退款  " }))
      .toEqual({ reason: "客人要求退款" });

    expect(reopenOrderBodySchema.parse(undefined)).toEqual({});
    expect(reopenOrderBodySchema.parse({})).toEqual({});
    expect(reopenOrderBodySchema.parse({ reason: "  客人回來取餐  " }))
      .toEqual({ reason: "客人回來取餐" });
  });

  test("refund and reopen bodies reject reasons over 120 characters", () => {
    expect(
      refundOrderBodySchema.safeParse({ reason: "a".repeat(120) }).success,
    ).toBe(true);
    expect(
      refundOrderBodySchema.safeParse({ reason: "a".repeat(121) }).success,
    ).toBe(false);

    expect(
      reopenOrderBodySchema.safeParse({ reason: "a".repeat(120) }).success,
    ).toBe(true);
    expect(
      reopenOrderBodySchema.safeParse({ reason: "a".repeat(121) }).success,
    ).toBe(false);
  });

  test("order schema carries refund fields without changing completed status", () => {
    const parsed = orderSchema.parse({
      id: 15,
      userId: "user-1",
      items: [],
      total: 180,
      status: "completed",
      paymentStatus: "refunded",
      paidBy: "staff-1",
      paidAt: "2026-06-16T00:05:00.000Z",
      customerNote: "分袋",
      cancelReason: "",
      refundReason: "餐點重複付款",
      refundedBy: "staff-2",
      refundedAt: "2026-06-16T00:10:00.000Z",
      createdAt: "2026-06-16T00:00:00.000Z",
      submittedAt: "2026-06-16T00:01:00.000Z",
    });

    expect(parsed.status).toBe("completed");
    expect(parsed.paymentStatus).toBe("refunded");
    expect(parsed.refundReason).toBe("餐點重複付款");
    expect(parsed.refundedBy).toBe("staff-2");
  });

  test("order response schema includes refund fields", () => {
    const parsed = orderResponseSchema.parse({
      id: 15,
      userId: "user-1",
      items: [],
      total: 180,
      status: "completed",
      paymentStatus: "refunded",
      paidBy: "staff-1",
      paidAt: "2026-06-16T00:05:00.000Z",
      customerNote: "分袋",
      cancelReason: "",
      refundReason: "餐點重複付款",
      refundedBy: "staff-2",
      refundedAt: "2026-06-16T00:10:00.000Z",
      createdAt: "2026-06-16T00:00:00.000Z",
      createdAtTaipei: "2026/06/16 08:00",
      submittedAt: "2026-06-16T00:01:00.000Z",
      pickupCode: "A-0015",
    });

    expect(parsed.pickupCode).toBe("A-0015");
    expect(parsed.paymentStatus).toBe("refunded");
    expect(parsed.refundedAt).toBe("2026-06-16T00:10:00.000Z");
  });

  test("reopened order shape preserves order content and clears cancellation", () => {
    const parsed = orderResponseSchema.parse({
      id: 16,
      userId: "user-1",
      items: [],
      total: 90,
      status: "submitted",
      paymentStatus: "unpaid",
      customerNote: "到店付款",
      cancelReason: "",
      cancelledBy: null,
      refundReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      createdAtTaipei: "2026/06/16 08:00",
      submittedAt: "2026-06-16T00:20:00.000Z",
      pickupCode: "A-0016",
    });

    expect(parsed.status).toBe("submitted");
    expect(parsed.paymentStatus).toBe("unpaid");
    expect(parsed.customerNote).toBe("到店付款");
    expect(parsed.cancelReason).toBe("");
  });
});
