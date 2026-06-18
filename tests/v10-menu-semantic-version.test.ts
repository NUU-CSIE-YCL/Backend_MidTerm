import { describe, expect, test } from "bun:test";
import { menuItemSchema, menuVersionLevelSchema } from "../shared/contracts.ts";
import { updateMenuItemBodySchema } from "../shared/route-schemas.ts";

function menuItem(id: string, patch: Partial<{
  majorVersion: number;
  minorVersion: number;
  versionNote: string;
}> = {}) {
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
    majorVersion: patch.majorVersion ?? 1,
    minorVersion: patch.minorVersion ?? 0,
    versionNote: patch.versionNote ?? "",
    experimentKey: "",
    experimentVariant: "",
    isCurrentVersion: true,
  };
}

describe("V10.3 semantic menu versions", () => {
  test("version level schema only accepts minor or major", () => {
    expect(menuVersionLevelSchema.parse("minor")).toBe("minor");
    expect(menuVersionLevelSchema.parse("major")).toBe("major");
    expect(menuVersionLevelSchema.safeParse("patch").success).toBe(false);
  });

  test("menu item schema includes semantic version metadata", () => {
    const parsed = menuItemSchema.parse(
      menuItem("001-03", {
        majorVersion: 2,
        minorVersion: 1,
        versionNote: "recipe update",
      }),
    );

    expect(parsed.majorVersion).toBe(2);
    expect(parsed.minorVersion).toBe(1);
    expect(parsed.versionNote).toBe("recipe update");
  });

  test("update body defaults to minor and accepts explicit major", () => {
    expect(updateMenuItemBodySchema.parse({ name: "Toast" }).version_level).toBe(
      "minor",
    );
    expect(
      updateMenuItemBodySchema.parse({
        version_level: "major",
        version_note: "new formula",
      }).version_level,
    ).toBe("major");
  });
});
