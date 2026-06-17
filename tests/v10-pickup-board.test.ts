import { describe, expect, test } from "bun:test";
import {
  pickupBoardListResponseSchema,
  pickupBoardOrderSchema,
  toPickupBoardOrder,
} from "../shared/route-schemas.ts";

describe("V10.4E pickup board contracts", () => {
  test("pickup board order only accepts ready orders", () => {
    expect(
      pickupBoardOrderSchema.safeParse({
        id: 7,
        pickupCode: "A-0007",
        status: "ready",
        createdAt: "2026-06-16T00:00:00.000Z",
        createdAtTaipei: "2026/06/16 08:00",
      }).success,
    ).toBe(true);

    for (const status of [
      "pending",
      "submitted",
      "preparing",
      "completed",
      "cancelled",
    ]) {
      expect(
        pickupBoardOrderSchema.safeParse({
          id: 7,
          pickupCode: "A-0007",
          status,
          createdAt: "2026-06-16T00:00:00.000Z",
          createdAtTaipei: "2026/06/16 08:00",
        }).success,
      ).toBe(false);
    }
  });

  test("pickup board list response validates public order rows", () => {
    const parsed = pickupBoardListResponseSchema.parse({
      data: [
        {
          id: 7,
          pickupCode: "A-0007",
          status: "ready",
          createdAt: "2026-06-16T00:00:00.000Z",
          createdAtTaipei: "2026/06/16 08:00",
        },
      ],
    });

    expect(parsed.data[0]?.pickupCode).toBe("A-0007");
  });

  test("pickup board helper exposes no private order details", () => {
    const row = toPickupBoardOrder({
      id: 7,
      userId: "user-1",
      items: [],
      total: 95,
      status: "ready",
      paymentStatus: "unpaid",
      paidBy: null,
      customerNote: "不要辣",
      cancelReason: "",
      refundReason: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      submittedAt: "2026-06-16T00:01:00.000Z",
    });

    expect(row).toEqual({
      id: 7,
      pickupCode: "A-0007",
      status: "ready",
      createdAt: "2026-06-16T00:00:00.000Z",
      createdAtTaipei: row.createdAtTaipei,
    });
    expect(typeof row.createdAtTaipei).toBe("string");
    expect("userId" in row).toBe(false);
    expect("items" in row).toBe(false);
    expect("total" in row).toBe(false);
    expect("customerNote" in row).toBe(false);
    expect("paymentStatus" in row).toBe(false);
  });
});
