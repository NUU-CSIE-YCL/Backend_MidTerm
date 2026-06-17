import { describe, expect, test } from "bun:test";
import { menuItemSchema } from "../shared/contracts.ts";
import {
  createMenuItemBodySchema,
  getMenuHistoryParamsSchema,
  menuHistoryResponseSchema,
  updateMenuItemBodySchema,
  updateOrderBodySchema,
} from "../shared/route-schemas.ts";

describe("V10 menu versioning contracts", () => {
  test("menu item ids are versioned strings", () => {
    const parsed = menuItemSchema.parse({
      id: "001-01",
      entityId: "entity-001",
      logicalId: "001",
      version: 1,
      name: "火腿蛋吐司",
      price: 40,
      category: "餐點",
      description: "現煎雞蛋搭配火腿與生菜。",
      image_url: "/imgs/menu/ham-egg-toast.webp",
      displayOrder: 1,
      isCurrentVersion: true,
    });

    expect(parsed.id).toBe("001-01");
    expect(parsed.logicalId).toBe("001");
  });

  test("order updates require a versioned menu item id", () => {
    expect(() =>
      updateOrderBodySchema.parse({ itemId: "001-01", qty: 2 }),
    ).not.toThrow();

    expect(() =>
      updateOrderBodySchema.parse({ itemId: 1, qty: 2 }),
    ).toThrow();
  });

  test("menu management schemas accept V10.2 payloads", () => {
    expect(() =>
      createMenuItemBodySchema.parse({
        logical_id: "099",
        name: "測試新品",
        price: 55,
        category: "測試",
        description: "期末展示用新品",
        image_url: "/imgs/menu/test.webp",
        change_reason: "新增展示品項",
      }),
    ).not.toThrow();

    expect(() =>
      updateMenuItemBodySchema.parse({
        price: 60,
        change_reason: "原物料調價",
      }),
    ).not.toThrow();
  });

  test("menu history response returns versioned items newest first", () => {
    expect(getMenuHistoryParamsSchema.parse({ id: "001" }).id).toBe("001");
    expect(getMenuHistoryParamsSchema.parse({ id: "001-02" }).id).toBe(
      "001-02",
    );

    const parsed = menuHistoryResponseSchema.parse({
      data: [
        {
          id: "001-02",
          entityId: "entity-001",
          logicalId: "001",
          version: 2,
          name: "火腿蛋吐司",
          price: 45,
          category: "餐點",
          description: "現煎雞蛋搭配火腿與生菜。",
          image_url: "/imgs/menu/ham-egg-toast.webp",
          displayOrder: 1,
          isCurrentVersion: true,
          supersedes: "001-01",
          changeReason: "原物料調價",
          createdAt: new Date().toISOString(),
        },
        {
          id: "001-01",
          entityId: "entity-001",
          logicalId: "001",
          version: 1,
          name: "火腿蛋吐司",
          price: 40,
          category: "餐點",
          description: "現煎雞蛋搭配火腿與生菜。",
          image_url: "/imgs/menu/ham-egg-toast.webp",
          displayOrder: 1,
          isCurrentVersion: false,
          changeReason: "Initial seed",
          createdAt: new Date(0).toISOString(),
        },
      ],
    });

    expect(parsed.data.map((item) => item.id)).toEqual(["001-02", "001-01"]);
  });
});
