import { describe, expect, test } from "bun:test";
import {
  roleSchema,
  sessionUserSchema,
  type SessionUser,
} from "../shared/contracts.ts";
import { hasAnyRole, hasRole } from "../shared/guards.ts";

describe("V10.3A RBAC contracts and guards", () => {
  test("role schema accepts only the five fixed roles", () => {
    expect(roleSchema.parse("customer")).toBe("customer");
    expect(roleSchema.parse("staff")).toBe("staff");
    expect(roleSchema.parse("chef")).toBe("chef");
    expect(roleSchema.parse("owner")).toBe("owner");
    expect(roleSchema.parse("admin")).toBe("admin");

    expect(() => roleSchema.parse("manager")).toThrow();
    expect(() => roleSchema.parse("superadmin")).toThrow();
  });

  test("session user schema includes at least one role", () => {
    const parsed = sessionUserSchema.parse({
      id: "user-001",
      email: "owner@example.com",
      name: "Owner",
      roles: ["customer", "owner"],
    });

    expect(parsed.roles).toEqual(["customer", "owner"]);
    expect(() =>
      sessionUserSchema.parse({
        id: "user-002",
        email: "empty@example.com",
        name: "Empty",
        roles: [],
      }),
    ).toThrow();
  });

  test("owner and admin can manage menu but customer cannot", () => {
    const customer: SessionUser = {
      id: "customer-001",
      email: "customer@example.com",
      name: "Customer",
      roles: ["customer"],
    };
    const owner: SessionUser = {
      id: "owner-001",
      email: "owner@example.com",
      name: "Owner",
      roles: ["customer", "owner"],
    };
    const admin: SessionUser = {
      id: "admin-001",
      email: "admin@example.com",
      name: "Admin",
      roles: ["customer", "admin"],
    };

    expect(hasRole(admin, "admin")).toBe(true);
    expect(hasAnyRole(owner, ["owner", "admin"])).toBe(true);
    expect(hasAnyRole(admin, ["owner", "admin"])).toBe(true);
    expect(hasAnyRole(customer, ["owner", "admin"])).toBe(false);
  });
});
