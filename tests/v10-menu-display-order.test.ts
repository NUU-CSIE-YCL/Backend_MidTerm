import { describe, expect, test } from "bun:test";
import { menuItemSchema } from "../shared/contracts.ts";
import {
  createMenuItemBodySchema,
  menuListResponseSchema,
  reorderMenuBodySchema,
} from "../shared/route-schemas.ts";

function menuItem(id: string, displayOrder: number) {
  const logicalId = id.split("-")[0] ?? id;

  return {
    id,
    entityId: `entity-${logicalId}`,
    logicalId,
    version: Number.parseInt(id.split("-")[1] ?? "1", 10),
    name: `Item ${id}`,
    price: 50,
    salePrice: null,
    promotionLabel: "",
    category: "餐點",
    description: "Test item",
    image_url: "/imgs/menu/test.webp",
    displayOrder,
    isSoldOut: false,
    isHidden: false,
    majorVersion: 1,
    minorVersion: 0,
    versionNote: "",
    experimentKey: "",
    experimentVariant: "",
    isCurrentVersion: true,
  };
}

describe("V10.5A menu display order contracts", () => {
  test("menu item schema includes display order", () => {
    const parsed = menuItemSchema.parse(menuItem("001-01", 3));

    expect(parsed.displayOrder).toBe(3);
  });

  test("create menu body accepts optional display_order", () => {
    expect(
      createMenuItemBodySchema.parse({
        logical_id: "099",
        name: "排序測試品項",
        price: 55,
        category: "餐點",
        description: "測試排序",
        image_url: "/imgs/menu/test.webp",
        display_order: 9,
      }).display_order,
    ).toBe(9);

    expect(
      createMenuItemBodySchema.parse({
        name: "自動排序品項",
        price: 55,
        category: "餐點",
        description: "測試排序",
        image_url: "/imgs/menu/test.webp",
      }).display_order,
    ).toBeUndefined();
  });

  test("reorder body requires at least one current menu id", () => {
    expect(
      reorderMenuBodySchema.parse({
        items: [{ id: "001-01", displayOrder: 1 }],
      }),
    ).toEqual({ items: [{ id: "001-01", displayOrder: 1 }] });

    expect(reorderMenuBodySchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      reorderMenuBodySchema.safeParse({
        items: [{ id: "001-01", displayOrder: -1 }],
      }).success,
    ).toBe(false);
  });

  test("menu list response preserves sorted order supplied by API", () => {
    const parsed = menuListResponseSchema.parse({
      data: [menuItem("002-01", 1), menuItem("001-02", 2)],
    });

    expect(parsed.data.map((item) => item.id)).toEqual(["002-01", "001-02"]);
    expect(parsed.data.map((item) => item.displayOrder)).toEqual([1, 2]);
  });
});
