import { describe, expect, test } from "bun:test";
import type { MenuItem } from "../shared/contracts.ts";
import { selectExperimentedMenuItems } from "../shared/menu-experiments.ts";
import { experimentedMenuQuerySchema } from "../shared/route-schemas.ts";

function menuItem(
  id: string,
  patch: Partial<MenuItem> = {},
): MenuItem {
  const logicalId = id.split("-")[0] ?? id;

  return {
    id,
    entityId: `entity-${logicalId}`,
    logicalId,
    version: Number.parseInt(id.split("-")[1] ?? "1", 10),
    majorVersion: 1,
    minorVersion: 0,
    versionNote: "",
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
    experimentKey: "",
    experimentVariant: "",
    isCurrentVersion: true,
    ...patch,
  };
}

describe("V10.3E experimented menu split", () => {
  test("query requires a visitor key", () => {
    expect(
      experimentedMenuQuerySchema.parse({ visitorKey: "visitor-1" }),
    ).toEqual({ visitorKey: "visitor-1" });
    expect(experimentedMenuQuerySchema.safeParse({}).success).toBe(false);
  });

  test("same visitor gets stable variant per experiment", () => {
    const menu = [
      menuItem("001-01", {
        experimentKey: "hero-copy",
        experimentVariant: "A",
      }),
      menuItem("002-01", {
        experimentKey: "hero-copy",
        experimentVariant: "B",
      }),
    ];

    const first = selectExperimentedMenuItems(menu, "visitor-stable");
    const second = selectExperimentedMenuItems(menu, "visitor-stable");

    expect(first.map((item) => item.id)).toEqual(
      second.map((item) => item.id),
    );
    expect(first).toHaveLength(1);
  });

  test("non experiment items pass through with selected variant", () => {
    const menu = [
      menuItem("001-01", { displayOrder: 1 }),
      menuItem("002-01", {
        displayOrder: 2,
        experimentKey: "price-copy",
        experimentVariant: "A",
      }),
      menuItem("003-01", {
        displayOrder: 3,
        experimentKey: "price-copy",
        experimentVariant: "B",
      }),
    ];

    const selected = selectExperimentedMenuItems(menu, "visitor-2");

    expect(selected.some((item) => item.id === "001-01")).toBe(true);
    expect(
      selected.filter((item) => item.experimentKey === "price-copy"),
    ).toHaveLength(1);
  });

  test("different visitors may land on different variants", () => {
    const menu = [
      menuItem("001-01", {
        experimentKey: "button-copy",
        experimentVariant: "A",
      }),
      menuItem("002-01", {
        experimentKey: "button-copy",
        experimentVariant: "B",
      }),
    ];

    const seenVariants = new Set(
      Array.from({ length: 20 }, (_, index) =>
        selectExperimentedMenuItems(menu, `visitor-${index}`)[0]
          ?.experimentVariant,
      ),
    );

    expect(seenVariants.has("A")).toBe(true);
    expect(seenVariants.has("B")).toBe(true);
  });
});
