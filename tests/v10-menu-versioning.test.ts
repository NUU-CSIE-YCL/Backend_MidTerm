import { describe, expect, test } from "bun:test";
import { menuItemSchema } from "../shared/contracts.ts";
import { updateOrderBodySchema } from "../shared/route-schemas.ts";

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
});
