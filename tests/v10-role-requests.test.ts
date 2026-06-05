import { describe, expect, test } from "bun:test";
import {
  requestableRoleSchema,
  roleRequestSchema,
  roleRequestStatusSchema,
} from "../shared/contracts.ts";
import {
  createRoleRequestBodySchema,
  listRoleRequestsQuerySchema,
  reviewRoleRequestBodySchema,
  roleRequestListResponseSchema,
} from "../shared/route-schemas.ts";

describe("V10.3B role request contracts", () => {
  test("only staff and chef can be self-requested", () => {
    expect(requestableRoleSchema.parse("staff")).toBe("staff");
    expect(requestableRoleSchema.parse("chef")).toBe("chef");

    expect(() => requestableRoleSchema.parse("owner")).toThrow();
    expect(() => requestableRoleSchema.parse("admin")).toThrow();
    expect(() => requestableRoleSchema.parse("customer")).toThrow();
  });

  test("role request status is limited to pending approved rejected", () => {
    expect(roleRequestStatusSchema.parse("pending")).toBe("pending");
    expect(roleRequestStatusSchema.parse("approved")).toBe("approved");
    expect(roleRequestStatusSchema.parse("rejected")).toBe("rejected");

    expect(() => roleRequestStatusSchema.parse("cancelled")).toThrow();
  });

  test("create role request body requires a reason and requestable role", () => {
    expect(() =>
      createRoleRequestBodySchema.parse({
        requestedRole: "staff",
        reason: "我需要協助店內接單與處理訂單。",
      }),
    ).not.toThrow();

    expect(() =>
      createRoleRequestBodySchema.parse({
        requestedRole: "owner",
        reason: "想管理店內菜單",
      }),
    ).toThrow();

    expect(() =>
      createRoleRequestBodySchema.parse({
        requestedRole: "chef",
        reason: "太短",
      }),
    ).toThrow();
  });

  test("admin list query defaults to pending and accepts all", () => {
    expect(listRoleRequestsQuerySchema.parse({}).status).toBe("pending");
    expect(listRoleRequestsQuerySchema.parse({ status: "all" }).status).toBe(
      "all",
    );
    expect(
      listRoleRequestsQuerySchema.parse({ status: "approved" }).status,
    ).toBe("approved");

    expect(() =>
      listRoleRequestsQuerySchema.parse({ status: "archived" }),
    ).toThrow();
  });

  test("review body only accepts approved or rejected", () => {
    expect(() =>
      reviewRoleRequestBodySchema.parse({
        status: "approved",
        reviewNote: "核准協助廚房工作。",
      }),
    ).not.toThrow();

    expect(() =>
      reviewRoleRequestBodySchema.parse({ status: "pending" }),
    ).toThrow();
  });

  test("role request response may include requester display fields", () => {
    const parsed = roleRequestListResponseSchema.parse({
      data: [
        {
          id: 1,
          userId: "user-001",
          requestedRole: "chef",
          reason: "我需要協助廚房處理餐點製作。",
          status: "pending",
          requestedAt: new Date().toISOString(),
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
          requesterName: "Test User",
          requesterEmail: "test@example.com",
        },
      ],
    });

    expect(parsed.data[0]?.requesterEmail).toBe("test@example.com");
    expect(() =>
      roleRequestSchema.parse({
        id: 2,
        userId: "user-002",
        requestedRole: "admin",
        reason: "我想取得系統管理權限。",
        status: "pending",
        requestedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
