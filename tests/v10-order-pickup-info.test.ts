import { describe, expect, test } from "bun:test";
import {
  orderResponseSchema,
  submitOrderBodySchema,
  toOrderResponse,
} from "../shared/route-schemas.ts";

describe("V10.4B order pickup info contracts", () => {
  test("submit order body accepts empty body and optional customer note", () => {
    expect(submitOrderBodySchema.parse(undefined)).toEqual({});
    expect(submitOrderBodySchema.parse({})).toEqual({});
    expect(
      submitOrderBodySchema.parse({ customerNote: "不要辣，餐點分袋" }),
    ).toEqual({ customerNote: "不要辣，餐點分袋" });
    expect(submitOrderBodySchema.parse({ customerNote: "  到店付款  " }))
      .toEqual({ customerNote: "到店付款" });
  });

  test("submit order body rejects customer notes over 120 characters", () => {
    expect(
      submitOrderBodySchema.safeParse({ customerNote: "a".repeat(120) })
        .success,
    ).toBe(true);
    expect(
      submitOrderBodySchema.safeParse({ customerNote: "a".repeat(121) })
        .success,
    ).toBe(false);
  });

  test("order response schema requires pickup code and customer note", () => {
    const parsed = orderResponseSchema.parse({
      id: 7,
      userId: "user-1",
      items: [],
      total: 95,
      status: "submitted",
      customerNote: "到店付款",
      createdAt: "2026-06-16T00:00:00.000Z",
      createdAtTaipei: "2026/06/16 08:00",
      pickupCode: "A-0007",
    });

    expect(parsed.customerNote).toBe("到店付款");
    expect(parsed.pickupCode).toBe("A-0007");
  });

  test("pickup code is derived from order id", () => {
    const response = toOrderResponse({
      id: 7,
      userId: "user-1",
      items: [],
      total: 95,
      status: "submitted",
      customerNote: "",
      createdAt: "2026-06-16T00:00:00.000Z",
      submittedAt: "2026-06-16T00:01:00.000Z",
    });

    expect(response.pickupCode).toBe("A-0007");
  });
});
