import { describe, expect, test } from "bun:test";
import {
  operationsSummaryRangeSchema,
  operationsSummarySchema,
} from "../shared/contracts.ts";
import {
  operationsSummaryQuerySchema,
  operationsSummaryResponseSchema,
} from "../shared/route-schemas.ts";

describe("V10.4H operations summary contracts", () => {
  test("summary range accepts today and all only", () => {
    expect(operationsSummaryRangeSchema.safeParse("today").success).toBe(true);
    expect(operationsSummaryRangeSchema.safeParse("all").success).toBe(true);
    expect(operationsSummaryRangeSchema.safeParse("week").success).toBe(false);
  });

  test("summary query defaults to today", () => {
    expect(operationsSummaryQuerySchema.parse({})).toEqual({
      range: "today",
    });
    expect(operationsSummaryQuerySchema.parse({ range: "all" })).toEqual({
      range: "all",
    });
  });

  test("summary schema carries revenue and fixed status counts", () => {
    const parsed = operationsSummarySchema.parse({
      range: "today",
      generatedAt: "2026-06-17T00:00:00.000Z",
      generatedAtTaipei: "2026/06/17 08:00",
      orderCount: 5,
      activeOrderCount: 2,
      completedOrderCount: 2,
      cancelledOrderCount: 1,
      paidOrderCount: 1,
      refundedOrderCount: 1,
      grossRevenue: 300,
      refundedAmount: 120,
      netRevenue: 180,
      unpaidAmount: 90,
      byStatus: {
        pending: 0,
        submitted: 1,
        preparing: 0,
        ready: 1,
        completed: 2,
        cancelled: 1,
      },
    });

    expect(parsed.netRevenue).toBe(180);
    expect(parsed.byStatus.ready).toBe(1);
  });

  test("summary response schema wraps summary data", () => {
    const parsed = operationsSummaryResponseSchema.parse({
      data: {
        range: "all",
        generatedAt: "2026-06-17T00:00:00.000Z",
        generatedAtTaipei: "2026/06/17 08:00",
        orderCount: 0,
        activeOrderCount: 0,
        completedOrderCount: 0,
        cancelledOrderCount: 0,
        paidOrderCount: 0,
        refundedOrderCount: 0,
        grossRevenue: 0,
        refundedAmount: 0,
        netRevenue: 0,
        unpaidAmount: 0,
        byStatus: {
          pending: 0,
          submitted: 0,
          preparing: 0,
          ready: 0,
          completed: 0,
          cancelled: 0,
        },
      },
    });

    expect(parsed.data.range).toBe("all");
  });
});
