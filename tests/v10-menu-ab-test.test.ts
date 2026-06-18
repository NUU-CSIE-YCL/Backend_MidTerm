import { describe, expect, test } from "bun:test";
import { menuExperimentSchema, menuItemSchema } from "../shared/contracts.ts";
import {
  createMenuItemBodySchema,
  menuExperimentListResponseSchema,
  updateMenuItemBodySchema,
} from "../shared/route-schemas.ts";

function menuItem(id: string) {
  const logicalId = id.split("-")[0] ?? id;

  return {
    id,
    entityId: `entity-${logicalId}`,
    logicalId,
    version: Number.parseInt(id.split("-")[1] ?? "1", 10),
    name: `Item ${id}`,
    price: 80,
    salePrice: null,
    promotionLabel: "",
    category: "test",
    description: "Test item",
    image_url: "/imgs/menu/test.webp",
    displayOrder: 1,
    isSoldOut: false,
    isHidden: false,
    majorVersion: 1,
    minorVersion: 0,
    versionNote: "",
    experimentKey: "toast-copy",
    experimentVariant: "A",
    isCurrentVersion: true,
  };
}

describe("V10.3 menu A/B metadata contracts", () => {
  test("menu item schema includes experiment metadata", () => {
    const parsed = menuItemSchema.parse(menuItem("001-01"));

    expect(parsed.experimentKey).toBe("toast-copy");
    expect(parsed.experimentVariant).toBe("A");
  });

  test("create and update bodies accept experiment metadata", () => {
    expect(
      createMenuItemBodySchema.parse({
        name: "Toast",
        price: 80,
        category: "test",
        description: "Experiment item",
        image_url: "/imgs/menu/test.webp",
        experiment_key: "toast-copy",
        experiment_variant: "B",
      }).experiment_variant,
    ).toBe("B");

    expect(
      updateMenuItemBodySchema.parse({
        experiment_key: "toast-copy",
        experiment_variant: "A",
      }).experiment_key,
    ).toBe("toast-copy");
  });

  test("experiment summary response contains variants and sales", () => {
    const experiment = menuExperimentSchema.parse({
      experimentKey: "toast-copy",
      variants: [
        {
          variant: "A",
          itemCount: 1,
          exposureCount: 8,
          orderCount: 2,
          quantitySold: 4,
          revenue: 320,
          conversionRate: 0.25,
        },
      ],
    });

    expect(experiment.variants[0]?.revenue).toBe(320);
    expect(experiment.variants[0]?.exposureCount).toBe(8);
    expect(
      menuExperimentListResponseSchema.parse({ data: [experiment] }).data[0]
        ?.experimentKey,
    ).toBe("toast-copy");
  });
});
