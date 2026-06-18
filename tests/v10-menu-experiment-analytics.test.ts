import { describe, expect, test } from "bun:test";
import {
  menuExperimentDetailSchema,
  menuExperimentExposureSchema,
  type MenuExperimentExposure,
  type MenuItem,
  type Order,
} from "../shared/contracts.ts";
import {
  buildMenuExperimentDetail,
  buildMenuExperiments,
} from "../shared/menu-experiment-analytics.ts";

function menuItem(
  id: string,
  variant: string,
  overrides: Partial<MenuItem> = {},
): MenuItem {
  return {
    id,
    entityId: `entity-${id}`,
    logicalId: id.split("-")[0] ?? id,
    version: 1,
    majorVersion: 1,
    minorVersion: 0,
    versionNote: "",
    name: `Item ${id}`,
    price: 50,
    salePrice: null,
    promotionLabel: "",
    category: "測試",
    description: "測試品項",
    image_url: "/imgs/menu/example.webp",
    displayOrder: 1,
    isSoldOut: false,
    isHidden: false,
    experimentKey: "hero-copy",
    experimentVariant: variant,
    isCurrentVersion: true,
    changeReason: null,
    ...overrides,
  };
}

function order(id: number, item: MenuItem, qty: number): Order {
  return {
    id,
    userId: `user-${id}`,
    items: [{ item, qty }],
    total: (item.salePrice ?? item.price) * qty,
    status: "completed",
    paymentStatus: "paid",
    paidBy: "staff-1",
    paidAt: "2026-06-18T01:00:00.000Z",
    refundReason: "",
    refundedBy: null,
    customerNote: "",
    cancelReason: "",
    cancelledBy: null,
    createdAt: "2026-06-18T00:00:00.000Z",
    submittedAt: "2026-06-18T00:10:00.000Z",
  };
}

describe("V10.3F menu experiment exposure analytics", () => {
  test("exposure schema validates visitor and variant snapshots", () => {
    const parsed = menuExperimentExposureSchema.parse({
      visitorKey: "visitor-1",
      experimentKey: "hero-copy",
      experimentVariant: "A",
      menuItemId: "001-01",
      exposedAt: "2026-06-18T00:00:00.000Z",
    });

    expect(parsed.experimentVariant).toBe("A");
    expect(menuExperimentExposureSchema.safeParse({}).success).toBe(false);
  });

  test("summary deduplicates repeat exposures and computes conversion rate", () => {
    const variantA = menuItem("001-01", "A");
    const variantB = menuItem("002-01", "B", { price: 80 });
    const exposures: MenuExperimentExposure[] = [
      {
        visitorKey: "visitor-1",
        experimentKey: "hero-copy",
        experimentVariant: "A",
        menuItemId: "001-01",
        exposedAt: "2026-06-18T00:00:00.000Z",
      },
      {
        visitorKey: "visitor-1",
        experimentKey: "hero-copy",
        experimentVariant: "A",
        menuItemId: "001-01",
        exposedAt: "2026-06-18T00:01:00.000Z",
      },
      {
        visitorKey: "visitor-2",
        experimentKey: "hero-copy",
        experimentVariant: "B",
        menuItemId: "002-01",
        exposedAt: "2026-06-18T00:02:00.000Z",
      },
    ];

    const summary = buildMenuExperiments(
      [variantA, variantB],
      [order(1, variantA, 2)],
      exposures,
    )[0]!;
    const aStats = summary.variants.find((variant) => variant.variant === "A")!;
    const bStats = summary.variants.find((variant) => variant.variant === "B")!;

    expect(aStats.exposureCount).toBe(1);
    expect(aStats.orderCount).toBe(1);
    expect(aStats.quantitySold).toBe(2);
    expect(aStats.revenue).toBe(100);
    expect(aStats.conversionRate).toBe(1);
    expect(bStats.exposureCount).toBe(1);
    expect(bStats.conversionRate).toBe(0);
  });

  test("detail schema includes exposure rows for one experiment", () => {
    const variantA = menuItem("001-01", "A");
    const detail = buildMenuExperimentDetail(
      "hero-copy",
      [variantA],
      [],
      [
        {
          visitorKey: "visitor-1",
          experimentKey: "hero-copy",
          experimentVariant: "A",
          menuItemId: "001-01",
          exposedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    );

    expect(detail?.exposures).toHaveLength(1);
    expect(menuExperimentDetailSchema.parse(detail).experimentKey).toBe(
      "hero-copy",
    );
  });
});
