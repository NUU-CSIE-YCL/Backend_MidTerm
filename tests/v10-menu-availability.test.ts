import { describe, expect, test } from "bun:test";
import { menuItemSchema } from "../shared/contracts.ts";
import {
  createMenuItemBodySchema,
  menuListResponseSchema,
  updateMenuItemBodySchema,
} from "../shared/route-schemas.ts";

function menuItem(id: string, patch: Partial<{
  isSoldOut: boolean;
  isHidden: boolean;
}> = {}) {
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
    displayOrder: 1,
    isSoldOut: patch.isSoldOut ?? false,
    isHidden: patch.isHidden ?? false,
    isCurrentVersion: true,
  };
}

describe("V10.5B menu availability contracts", () => {
  test("menu item schema includes sold out and hidden flags", () => {
    const parsed = menuItemSchema.parse(
      menuItem("001-01", { isSoldOut: true, isHidden: true }),
    );

    expect(parsed.isSoldOut).toBe(true);
    expect(parsed.isHidden).toBe(true);
  });

  test("create menu body accepts optional availability flags", () => {
    const parsed = createMenuItemBodySchema.parse({
      name: "售完測試品項",
      price: 55,
      category: "餐點",
      description: "測試售完",
      image_url: "/imgs/menu/test.webp",
      is_sold_out: true,
      is_hidden: false,
    });

    expect(parsed.is_sold_out).toBe(true);
    expect(parsed.is_hidden).toBe(false);
  });

  test("update menu body accepts availability flags", () => {
    const parsed = updateMenuItemBodySchema.parse({
      category: "飲料",
      is_sold_out: true,
      is_hidden: true,
      change_reason: "切換品項狀態",
    });

    expect(parsed.is_sold_out).toBe(true);
    expect(parsed.is_hidden).toBe(true);
  });

  test("menu list response can include sold out items and hidden admin items", () => {
    const parsed = menuListResponseSchema.parse({
      data: [
        menuItem("001-01", { isSoldOut: true }),
        menuItem("002-01", { isHidden: true }),
      ],
    });

    expect(parsed.data[0]?.isSoldOut).toBe(true);
    expect(parsed.data[1]?.isHidden).toBe(true);
  });
});
