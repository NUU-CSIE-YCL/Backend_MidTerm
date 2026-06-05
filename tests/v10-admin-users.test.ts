import { describe, expect, test } from "bun:test";
import { adminUserSchema } from "../shared/contracts.ts";
import {
  adminUserListResponseSchema,
  updateAdminUserRolesBodySchema,
} from "../shared/route-schemas.ts";
import { normalizeRoles } from "../shared/guards.ts";

describe("V10.3C admin user role management contracts", () => {
  test("admin user response schema includes roles and timestamps", () => {
    const parsed = adminUserSchema.parse({
      id: "user-admin",
      name: "Admin User",
      email: "admin@example.com",
      roles: ["customer", "admin"],
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T01:00:00.000Z",
    });

    expect(parsed.roles).toContain("admin");
    expect(parsed.createdAt).toBe("2026-06-05T00:00:00.000Z");
    expect(parsed.updatedAt).toBe("2026-06-05T01:00:00.000Z");
  });

  test("admin users list response validates a user array", () => {
    const parsed = adminUserListResponseSchema.parse({
      data: [
        {
          id: "user-customer",
          name: "Customer",
          email: "customer@example.com",
          roles: ["customer"],
          createdAt: "2026-06-05T00:00:00.000Z",
          updatedAt: "2026-06-05T00:00:00.000Z",
        },
      ],
    });

    expect(parsed.data).toHaveLength(1);
  });

  test("update roles body accepts legal roles only and rejects empty roles", () => {
    expect(
      updateAdminUserRolesBodySchema.safeParse({
        roles: ["customer", "staff", "chef", "owner", "admin"],
      }).success,
    ).toBe(true);

    expect(
      updateAdminUserRolesBodySchema.safeParse({
        roles: ["customer", "superadmin"],
      }).success,
    ).toBe(false);

    expect(updateAdminUserRolesBodySchema.safeParse({ roles: [] }).success).toBe(
      false,
    );
  });

  test("role normalization preserves customer and removes duplicates", () => {
    expect(normalizeRoles(["staff", "staff", "owner"])).toEqual([
      "customer",
      "staff",
      "owner",
    ]);
  });
});
