import { describe, expect, test } from "bun:test";
import { roleAuditActionSchema, roleAuditLogSchema } from "../shared/contracts.ts";
import {
  listRoleAuditLogsQuerySchema,
  roleAuditLogListResponseSchema,
} from "../shared/route-schemas.ts";

describe("V10.3D role audit log contracts", () => {
  test("role audit action is limited to the three fixed actions", () => {
    expect(roleAuditActionSchema.safeParse("role_request_approved").success).toBe(
      true,
    );
    expect(roleAuditActionSchema.safeParse("role_request_rejected").success).toBe(
      true,
    );
    expect(roleAuditActionSchema.safeParse("admin_roles_updated").success).toBe(
      true,
    );
    expect(roleAuditActionSchema.safeParse("menu_updated").success).toBe(false);
  });

  test("role audit log response includes role snapshots and display fields", () => {
    const parsed = roleAuditLogSchema.parse({
      id: 1,
      actorUserId: "admin-1",
      targetUserId: "user-1",
      action: "admin_roles_updated",
      oldRoles: ["customer"],
      newRoles: ["customer", "owner"],
      source: "admin_user_roles",
      roleRequestId: null,
      note: "Admin updated user roles directly.",
      createdAt: "2026-06-16T00:00:00.000Z",
      actorName: "Admin",
      actorEmail: "admin@example.com",
      targetName: "Target",
      targetEmail: "target@example.com",
    });

    expect(parsed.oldRoles).toEqual(["customer"]);
    expect(parsed.newRoles).toEqual(["customer", "owner"]);
    expect(parsed.actorEmail).toBe("admin@example.com");
    expect(parsed.targetEmail).toBe("target@example.com");
  });

  test("role audit log list response validates arrays", () => {
    const parsed = roleAuditLogListResponseSchema.parse({
      data: [
        {
          id: 2,
          actorUserId: "admin-1",
          targetUserId: "user-1",
          action: "role_request_approved",
          oldRoles: ["customer"],
          newRoles: ["customer", "staff"],
          source: "role_request_review",
          roleRequestId: 10,
          note: "Approved for counter duty.",
          createdAt: "2026-06-16T00:00:00.000Z",
          actorName: "Admin",
          actorEmail: "admin@example.com",
          targetName: "Target",
          targetEmail: "target@example.com",
        },
      ],
    });

    expect(parsed.data).toHaveLength(1);
  });

  test("role audit log query accepts actor target and action filters", () => {
    const parsed = listRoleAuditLogsQuerySchema.parse({
      actorUserId: "admin-1",
      targetUserId: "user-1",
      action: "role_request_rejected",
    });

    expect(parsed.action).toBe("role_request_rejected");
    expect(
      listRoleAuditLogsQuerySchema.safeParse({ action: "order_updated" })
        .success,
    ).toBe(false);
  });
});
