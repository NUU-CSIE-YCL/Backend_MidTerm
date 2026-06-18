import { describe, expect, test } from "bun:test";
import { menuPriceAnalysisSchema } from "../shared/contracts.ts";
import { menuPriceAnalysisResponseSchema } from "../shared/route-schemas.ts";

describe("V10.3 menu price analysis contracts", () => {
  test("price analysis response keeps version sales snapshots", () => {
    const parsed = menuPriceAnalysisResponseSchema.parse({
      data: {
        logicalId: "001",
        name: "Classic Toast",
        totalOrderCount: 2,
        totalQuantitySold: 5,
        totalRevenue: 300,
        versions: [
          {
            id: "001-01",
            logicalId: "001",
            version: 1,
            majorVersion: 1,
            minorVersion: 0,
            price: 70,
            salePrice: null,
            isCurrentVersion: false,
            orderCount: 1,
            quantitySold: 2,
            revenue: 140,
            averageUnitPrice: 70,
          },
          {
            id: "001-02",
            logicalId: "001",
            version: 2,
            majorVersion: 1,
            minorVersion: 1,
            price: 80,
            salePrice: 60,
            isCurrentVersion: true,
            orderCount: 1,
            quantitySold: 3,
            revenue: 180,
            averageUnitPrice: 60,
          },
        ],
      },
    });

    expect(parsed.data.totalQuantitySold).toBe(5);
    expect(parsed.data.versions[1]?.salePrice).toBe(60);
  });

  test("price analysis schema rejects invalid role-less shapes", () => {
    expect(
      menuPriceAnalysisSchema.safeParse({
        logicalId: "001",
        name: "Classic Toast",
        totalOrderCount: 0,
        totalQuantitySold: 0,
        totalRevenue: 0,
        versions: [],
      }).success,
    ).toBe(true);

    expect(
      menuPriceAnalysisSchema.safeParse({
        logicalId: "001",
        name: "Classic Toast",
        totalOrderCount: -1,
        totalQuantitySold: 0,
        totalRevenue: 0,
        versions: [],
      }).success,
    ).toBe(false);
  });
});
