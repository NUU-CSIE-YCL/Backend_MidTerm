import { describe, expect, test } from "bun:test";
import { menuItemSchema } from "../shared/contracts.ts";
import {
  createMenuItemBodySchema,
  updateMenuItemBodySchema,
} from "../shared/route-schemas.ts";

function menuItem(id: string, patch: Partial<{
  salePrice: number | null;
  promotionLabel: string;
}> = {}) {
  const logicalId = id.split("-")[0] ?? id;

  return {
    id,
    entityId: `entity-${logicalId}`,
    logicalId,
    version: Number.parseInt(id.split("-")[1] ?? "1", 10),
    name: `Item ${id}`,
    price: 80,
    salePrice: patch.salePrice ?? null,
    promotionLabel: patch.promotionLabel ?? "",
    category: "test",
    description: "Test item",
    image_url: "/imgs/menu/test.webp",
    displayOrder: 1,
    isSoldOut: false,
    isHidden: false,
    isCurrentVersion: true,
  };
}

describe("V10.5C menu promotions contracts", () => {
  test("menu item schema includes sale price and promotion label", () => {
    const parsed = menuItemSchema.parse(
      menuItem("001-01", { salePrice: 65, promotionLabel: "今日特價" }),
    );

    expect(parsed.salePrice).toBe(65);
    expect(parsed.promotionLabel).toBe("今日特價");
  });

  test("create menu body accepts valid sale price and promotion label", () => {
    const parsed = createMenuItemBodySchema.parse({
      name: "特價蛋餅",
      price: 60,
      sale_price: 45,
      promotion_label: "早鳥",
      category: "蛋餅",
      description: "測試特價",
      image_url: "/imgs/menu/test.webp",
    });

    expect(parsed.sale_price).toBe(45);
    expect(parsed.promotion_label).toBe("早鳥");
  });

  test("create menu body rejects sale price that is not lower than price", () => {
    expect(
      createMenuItemBodySchema.safeParse({
        name: "錯誤特價",
        price: 60,
        sale_price: 60,
        category: "蛋餅",
        description: "測試特價",
        image_url: "/imgs/menu/test.webp",
      }).success,
    ).toBe(false);
  });

  test("update menu body accepts clearing sale price with null", () => {
    const parsed = updateMenuItemBodySchema.parse({
      sale_price: null,
      promotion_label: "",
      change_reason: "取消特價",
    });

    expect(parsed.sale_price).toBeNull();
  });
});
