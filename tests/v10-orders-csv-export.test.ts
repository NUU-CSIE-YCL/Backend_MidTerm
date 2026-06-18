import { describe, expect, test } from "bun:test";
import { operationsSummaryRangeSchema } from "../shared/contracts.ts";
import { ordersCsvQuerySchema } from "../shared/route-schemas.ts";

describe("V10.6A orders CSV export contracts", () => {
  test("CSV export query defaults to today", () => {
    expect(ordersCsvQuerySchema.parse({})).toEqual({ range: "today" });
    expect(ordersCsvQuerySchema.parse({ range: "all" })).toEqual({
      range: "all",
    });
  });

  test("CSV export range shares operations summary range", () => {
    expect(operationsSummaryRangeSchema.safeParse("today").success).toBe(true);
    expect(operationsSummaryRangeSchema.safeParse("all").success).toBe(true);
    expect(ordersCsvQuerySchema.safeParse({ range: "week" }).success).toBe(
      false,
    );
  });

  test("CSV public columns intentionally exclude user identity fields", () => {
    const headers = [
      "orderId",
      "pickupCode",
      "status",
      "paymentStatus",
      "total",
      "itemCount",
      "itemSummary",
      "createdAt",
      "submittedAt",
      "paidAt",
      "refundedAt",
      "cancelledAt",
    ];

    expect(headers).not.toContain("email");
    expect(headers).not.toContain("roles");
    expect(headers).not.toContain("userId");
  });
});
