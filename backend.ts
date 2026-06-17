import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysia/cors";
import { existsSync } from "node:fs";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import toTaipeiDateTime from "./util.ts";
import {
  apiErrorResponseSchema,
  adminUserListResponseSchema,
  adminUserResponseSchema,
  cancelOrderBodySchema,
  cancelOrderParamsSchema,
  createMenuItemBodySchema,
  createRoleRequestBodySchema,
  currentUserResponseSchema,
  deleteMenuItemParamsSchema,
  getMenuHistoryParamsSchema,
  getOrderByIdParamsSchema,
  healthResponseSchema,
  listRoleAuditLogsQuerySchema,
  listRoleRequestsQuerySchema,
  menuHistoryResponseSchema,
  menuItemResponseSchema,
  menuListResponseSchema,
  nullableOrderResponseEnvelopeSchema,
  orderListResponseSchema,
  operationsSummaryQuerySchema,
  operationsSummaryResponseSchema,
  orderResponseEnvelopeSchema,
  pickupBoardListResponseSchema,
  reviewRoleRequestBodySchema,
  reviewRoleRequestParamsSchema,
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  roleAuditLogListResponseSchema,
  refundOrderBodySchema,
  refundOrderParamsSchema,
  reorderMenuBodySchema,
  reopenOrderBodySchema,
  reopenOrderParamsSchema,
  submitOrderBodySchema,
  submitOrderParamsSchema,
  toPickupBoardOrder,
  toOrderResponse,
  updateAdminUserRolesBodySchema,
  updateAdminUserRolesParamsSchema,
  updateMenuItemBodySchema,
  updateMenuItemParamsSchema,
  updateOrderBodySchema,
  updateOrderParamsSchema,
  updateOrderStatusBodySchema,
  updateOrderStatusParamsSchema,
} from "./shared/route-schemas.ts";
import { createStore } from "./store/index.ts";
import { auth, getCurrentUser } from "./auth/better-auth.ts";
import { db } from "./db/client.ts";
import { user as authUsersTable } from "./db/auth-schema.ts";
import { roleAuditLogsTable, roleRequestsTable } from "./db/schema.ts";
import { hasAnyRole, normalizeRoles, requireAnyRole } from "./shared/guards.ts";
import type {
  AdminUser,
  OperationsSummary,
  OperationsSummaryRange,
  Order,
  OrderStatus,
  Role,
  RoleAuditAction,
  RoleAuditLog,
  RoleRequest,
} from "./shared/contracts.ts";

// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
const store = createStore({ dataFilePath: "./data/store.json" });
const hasPublicAssets =
  existsSync("./public") && existsSync("./public/index.html");
const menuManagerRoles = ["owner", "admin"] as const satisfies readonly Role[];
const adminRoles = ["admin"] as const satisfies readonly Role[];
const orderViewerRoles = [
  "staff",
  "chef",
  "owner",
  "admin",
] as const satisfies readonly Role[];
const kitchenWorkflowRoles = ["chef", "owner", "admin"] as const satisfies readonly Role[];
const counterWorkflowRoles = ["staff", "owner", "admin"] as const satisfies readonly Role[];
const orderCancellationRoles = ["staff", "owner", "admin"] as const satisfies readonly Role[];

const operationalStatuses = [
  "pending",
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const satisfies readonly OrderStatus[];

function getTaipeiDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function createOperationsSummary(
  orders: readonly Order[],
  range: OperationsSummaryRange,
): OperationsSummary {
  const now = new Date();
  const todayKey = getTaipeiDateKey(now.toISOString());
  const byStatus = Object.fromEntries(
    operationalStatuses.map((status) => [status, 0]),
  ) as OperationsSummary["byStatus"];

  let orderCount = 0;
  let activeOrderCount = 0;
  let completedOrderCount = 0;
  let cancelledOrderCount = 0;
  let paidOrderCount = 0;
  let refundedOrderCount = 0;
  let grossRevenue = 0;
  let refundedAmount = 0;
  let unpaidAmount = 0;

  for (const order of orders) {
    if (order.status === "pending") continue;
    if (range === "today" && getTaipeiDateKey(order.createdAt) !== todayKey) {
      continue;
    }

    orderCount += 1;
    byStatus[order.status] += 1;

    if (
      order.status === "submitted" ||
      order.status === "preparing" ||
      order.status === "ready"
    ) {
      activeOrderCount += 1;
    }
    if (order.status === "completed") completedOrderCount += 1;
    if (order.status === "cancelled") cancelledOrderCount += 1;

    if (order.paymentStatus === "paid") {
      paidOrderCount += 1;
      grossRevenue += order.total;
    } else if (order.paymentStatus === "refunded") {
      refundedOrderCount += 1;
      grossRevenue += order.total;
      refundedAmount += order.total;
    } else if (order.status !== "cancelled") {
      unpaidAmount += order.total;
    }
  }

  return {
    range,
    generatedAt: now.toISOString(),
    generatedAtTaipei: toTaipeiDateTime(now.toISOString()),
    orderCount,
    activeOrderCount,
    completedOrderCount,
    cancelledOrderCount,
    paidOrderCount,
    refundedOrderCount,
    grossRevenue,
    refundedAmount,
    netRevenue: Math.max(grossRevenue - refundedAmount, 0),
    unpaidAmount,
    byStatus,
  };
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────
// 簡化的 helper 函數，用於保護路由並獲取 user，失敗時拋出 401 錯誤
async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

async function requireUserWithAnyRole(
  request: Request,
  roles: readonly Role[],
) {
  const user = await requireUser(request);
  requireAnyRole(user, roles);
  return user;
}

function toRoleRequestResponse(row: {
  id: number;
  userId: string;
  requestedRole: string;
  reason: string;
  status: string;
  requestedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
}): RoleRequest {
  return {
    id: row.id,
    userId: row.userId,
    requestedRole:
      row.requestedRole === "chef" || row.requestedRole === "staff"
        ? row.requestedRole
        : "staff",
    reason: row.reason,
    status:
      row.status === "approved" || row.status === "rejected"
        ? row.status
        : "pending",
    requestedAt: row.requestedAt.toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    requesterName: row.requesterName ?? null,
    requesterEmail: row.requesterEmail ?? null,
  };
}

function toAdminUserResponse(row: {
  id: string;
  name: string;
  email: string;
  roles: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roles: normalizeRoles(row.roles),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRoleAuditLogResponse(row: {
  id: number;
  actorUserId: string | null;
  targetUserId: string;
  action: string;
  oldRoles: unknown;
  newRoles: unknown;
  source: string;
  roleRequestId: number | null;
  note: string | null;
  createdAt: Date;
  actorName?: string | null;
  actorEmail?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
}): RoleAuditLog {
  const action = [
    "role_request_approved",
    "role_request_rejected",
    "admin_roles_updated",
  ].includes(row.action)
    ? (row.action as RoleAuditAction)
    : "admin_roles_updated";

  return {
    id: row.id,
    actorUserId: row.actorUserId,
    targetUserId: row.targetUserId,
    action,
    oldRoles: normalizeRoles(row.oldRoles),
    newRoles: normalizeRoles(row.newRoles),
    source: row.source,
    roleRequestId: row.roleRequestId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    actorName: row.actorName ?? null,
    actorEmail: row.actorEmail ?? null,
    targetName: row.targetName ?? null,
    targetEmail: row.targetEmail ?? null,
  };
}

async function createRoleAuditLog(input: {
  actorUserId: string | null;
  targetUserId: string;
  action: RoleAuditAction;
  oldRoles: Role[];
  newRoles: Role[];
  source: string;
  roleRequestId?: number | null;
  note?: string | null;
}) {
  await db.insert(roleAuditLogsTable).values({
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    action: input.action,
    oldRoles: normalizeRoles(input.oldRoles),
    newRoles: normalizeRoles(input.newRoles),
    source: input.source,
    roleRequestId: input.roleRequestId ?? null,
    note: input.note?.trim() || null,
  });
}

const app = new Elysia();

// ─── CORS Plugin ──────────────────────────────────────────────────────────────
app.use(
  cors({
    origin:
      allowedOrigin === "*" ? "*" : allowedOrigin || "http://localhost:5173",
    credentials: allowedOrigin !== "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Better Auth Routes ───────────────────────────────────────────────────────
// ⚠️ 注意：不能使用 app.mount("/api/auth", auth.handler)
// 原因：Better Auth handler 是標準的 fetch handler function，
//       但 Elysia 的 .mount() 期望的是 Elysia instance 或特定格式的 handler。
//       測試結果：.mount() 會導致 404 錯誤。
//
// ✅ 正確做法：使用 wildcard 路由明確處理 GET 和 POST
// 必須在其他 API 路由之前定義，確保 Better Auth 路由優先匹配
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));

// ─── OpenAPI Plugin ───────────────────────────────────────────────────────────
app.use(
  openapi({
    path: "/openapi",
    specPath: "/openapi/json",
    documentation: {
      info: {
        title: "Breakfast Demo API",
        version: "0.2.3",
        description:
          "Breakfast ordering demo API for teaching route schema, contract-first design, and future database/auth upgrades. V9-clean-better-auth-v3: optimized static handling, CORS plugin, and Better Auth macro integration.",
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "menu", description: "Menu management endpoints" },
        { name: "orders", description: "Order query and mutation endpoints" },
        { name: "system", description: "System and health check endpoints" },
      ],
    },
    exclude: {
      staticFile: true,
      paths: ["/openapi", "/openapi/json"],
    },
  }),
);

// 請求記錄中間件
// ─── Request Logger ───────────────────────────────────────────────────────────
app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

// API 路由

// ─── Sign-out Proxy ───────────────────────────────────────────────────────────
// Better Auth 的 /api/auth/sign-out 有 CSRF origin 驗證（比對 trustedOrigins）。
// production 環境若 BETTER_AUTH_URL 設定錯誤（如仍是 localhost），
// 瀏覽器送出的 Origin（正式網址）不在白名單，導致 sign-out 回 403 但前端不知道，
// 造成「看似登出，實際 session 仍在」的假登出。
//
// 解法：在 Elysia 層加一個 proxy，以 server 信任的 baseURL 當 Origin 轉發給 Better Auth。
// 安全性：session 識別仍靠 cookie，CSRF bypass 只在 server 端發生，不降低安全性。
app.post("/api/sign-out", async ({ request }) => {
  const baBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  // 複製原始 headers，強制覆寫 origin 為 Better Auth 信任的 baseURL
  const proxiedHeaders = new Headers(request.headers);
  proxiedHeaders.set("origin", baBaseUrl);

  const proxiedRequest = new Request(`${baBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: proxiedHeaders,
  });

  const res = await auth.handler(proxiedRequest);
  if (!res.ok) {
    const body = await res
      .clone()
      .text()
      .catch(() => "(unreadable)");
    console.error(`[sign-out proxy] Better Auth returned ${res.status}:`, body);
  }
  return res;
});

app.get(
  "/api/users/me",
  async ({ request }) => {
    const user = await requireUser(request);
    return { user };
  },
  {
    detail: {
      tags: ["auth"],
      summary: "Get current application user",
      description: "Return the current signed-in user with application roles.",
    },
    response: {
      200: currentUserResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

app.post(
  "/api/users/me/role-request",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    const requestBody = body as {
      requestedRole: "staff" | "chef";
      reason: string;
    };

    if (user.roles.includes(requestBody.requestedRole)) {
      set.status = 409;
      return { error: "Role already granted" };
    }

    const [existingPendingRequest] = await db
      .select({ id: roleRequestsTable.id })
      .from(roleRequestsTable)
      .where(
        and(
          eq(roleRequestsTable.userId, user.id),
          eq(roleRequestsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (existingPendingRequest) {
      set.status = 409;
      return { error: "You already have a pending role request" };
    }

    const [newRequest] = await db
      .insert(roleRequestsTable)
      .values({
        userId: user.id,
        requestedRole: requestBody.requestedRole,
        reason: requestBody.reason,
      })
      .returning();

    set.status = 201;
    return { data: toRoleRequestResponse(newRequest!) };
  },
  {
    body: createRoleRequestBodySchema,
    detail: {
      tags: ["auth"],
      summary: "Request a staff or chef role",
      description:
        "Create a pending role request for the signed-in user. Only staff and chef can be self-requested.",
    },
    response: {
      201: roleRequestResponseSchema,
      401: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/users/me/role-requests",
  async ({ request }) => {
    const user = await requireUser(request);

    const requests = await db
      .select()
      .from(roleRequestsTable)
      .where(eq(roleRequestsTable.userId, user.id))
      .orderBy(desc(roleRequestsTable.requestedAt));

    return {
      data: requests.map((row) =>
        toRoleRequestResponse({
          ...row,
          requesterName: user.name,
          requesterEmail: user.email,
        }),
      ),
    };
  },
  {
    detail: {
      tags: ["auth"],
      summary: "List my role requests",
      description: "Return role requests submitted by the signed-in user.",
    },
    response: {
      200: roleRequestListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/role-requests",
  async ({ query, request }) => {
    await requireUserWithAnyRole(request, adminRoles);
    const status = (query.status ?? "pending") as
      | "pending"
      | "approved"
      | "rejected"
      | "all";

    const selectRoleRequests = () =>
      db
        .select({
          id: roleRequestsTable.id,
          userId: roleRequestsTable.userId,
          requestedRole: roleRequestsTable.requestedRole,
          reason: roleRequestsTable.reason,
          status: roleRequestsTable.status,
          requestedAt: roleRequestsTable.requestedAt,
          reviewedBy: roleRequestsTable.reviewedBy,
          reviewedAt: roleRequestsTable.reviewedAt,
          reviewNote: roleRequestsTable.reviewNote,
          requesterName: authUsersTable.name,
          requesterEmail: authUsersTable.email,
        })
        .from(roleRequestsTable)
        .leftJoin(
          authUsersTable,
          eq(roleRequestsTable.userId, authUsersTable.id),
        );

    const rows =
      status === "all"
        ? await selectRoleRequests().orderBy(desc(roleRequestsTable.requestedAt))
        : await selectRoleRequests()
            .where(eq(roleRequestsTable.status, status))
            .orderBy(desc(roleRequestsTable.requestedAt));

    return { data: rows.map(toRoleRequestResponse) };
  },
  {
    query: listRoleRequestsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "List role requests",
      description: "Return role requests for admin review.",
    },
    response: {
      200: roleRequestListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/role-requests/:id",
  async ({ params, body, request, set }) => {
    const reviewer = await requireUserWithAnyRole(request, adminRoles);
    const requestId = parseInt(params.id, 10);
    const reviewBody = body as {
      status: "approved" | "rejected";
      reviewNote?: string;
    };

    const [existingRequest] = await db
      .select()
      .from(roleRequestsTable)
      .where(eq(roleRequestsTable.id, requestId))
      .limit(1);

    if (!existingRequest) {
      set.status = 404;
      return { error: "Role request not found" };
    }

    if (existingRequest.status !== "pending") {
      set.status = 409;
      return { error: "This request has already been reviewed" };
    }

    const [targetUserBeforeReview] = await db
      .select({
        roles: authUsersTable.roles,
      })
      .from(authUsersTable)
      .where(eq(authUsersTable.id, existingRequest.userId))
      .limit(1);
    const oldRoles = normalizeRoles(targetUserBeforeReview?.roles);
    const nextRoles =
      reviewBody.status === "approved"
        ? normalizeRoles([...oldRoles, existingRequest.requestedRole])
        : oldRoles;

    const [updatedRequest] = await db
      .update(roleRequestsTable)
      .set({
        status: reviewBody.status,
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
        reviewNote: reviewBody.reviewNote?.trim() || null,
      })
      .where(eq(roleRequestsTable.id, requestId))
      .returning();

    if (reviewBody.status === "approved" && targetUserBeforeReview) {
      await db
        .update(authUsersTable)
        .set({
          roles: nextRoles,
          updatedAt: new Date(),
        })
        .where(eq(authUsersTable.id, existingRequest.userId));
    }

    await createRoleAuditLog({
      actorUserId: reviewer.id,
      targetUserId: existingRequest.userId,
      action:
        reviewBody.status === "approved"
          ? "role_request_approved"
          : "role_request_rejected",
      oldRoles,
      newRoles: nextRoles,
      source: "role_request_review",
      roleRequestId: existingRequest.id,
      note: reviewBody.reviewNote ?? existingRequest.reason,
    });

    const [requestWithUser] = await db
      .select({
        id: roleRequestsTable.id,
        userId: roleRequestsTable.userId,
        requestedRole: roleRequestsTable.requestedRole,
        reason: roleRequestsTable.reason,
        status: roleRequestsTable.status,
        requestedAt: roleRequestsTable.requestedAt,
        reviewedBy: roleRequestsTable.reviewedBy,
        reviewedAt: roleRequestsTable.reviewedAt,
        reviewNote: roleRequestsTable.reviewNote,
        requesterName: authUsersTable.name,
        requesterEmail: authUsersTable.email,
      })
      .from(roleRequestsTable)
      .leftJoin(authUsersTable, eq(roleRequestsTable.userId, authUsersTable.id))
      .where(eq(roleRequestsTable.id, updatedRequest!.id))
      .limit(1);

    return { data: toRoleRequestResponse(requestWithUser!) };
  },
  {
    params: reviewRoleRequestParamsSchema,
    body: reviewRoleRequestBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Review a role request",
      description: "Approve or reject a pending role request as admin.",
    },
    response: {
      200: roleRequestResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
    },
  },
);

// 菜單路由
app.get(
  "/api/admin/users",
  async ({ request }) => {
    await requireUserWithAnyRole(request, adminRoles);

    const users = await db
      .select({
        id: authUsersTable.id,
        name: authUsersTable.name,
        email: authUsersTable.email,
        roles: authUsersTable.roles,
        createdAt: authUsersTable.createdAt,
        updatedAt: authUsersTable.updatedAt,
      })
      .from(authUsersTable)
      .orderBy(asc(authUsersTable.email));

    return { data: users.map(toAdminUserResponse) };
  },
  {
    detail: {
      tags: ["admin"],
      summary: "List users for role management",
      description: "Return application users and roles for admin management.",
    },
    response: {
      200: adminUserListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/users/:userId/roles",
  async ({ params, body, request, set }) => {
    const adminUser = await requireUserWithAnyRole(request, adminRoles);
    const roleBody = body as { roles: Role[] };
    const nextRoles = normalizeRoles(roleBody.roles);

    const [targetUser] = await db
      .select({
        id: authUsersTable.id,
        name: authUsersTable.name,
        email: authUsersTable.email,
        roles: authUsersTable.roles,
        createdAt: authUsersTable.createdAt,
        updatedAt: authUsersTable.updatedAt,
      })
      .from(authUsersTable)
      .where(eq(authUsersTable.id, params.userId))
      .limit(1);

    if (!targetUser) {
      set.status = 404;
      return { error: "User not found" };
    }

    if (targetUser.id === adminUser.id && !nextRoles.includes("admin")) {
      set.status = 409;
      return { error: "Cannot remove your own admin role" };
    }

    const oldRoles = normalizeRoles(targetUser.roles);
    const [updatedUser] = await db
      .update(authUsersTable)
      .set({
        roles: nextRoles,
        updatedAt: new Date(),
      })
      .where(eq(authUsersTable.id, targetUser.id))
      .returning({
        id: authUsersTable.id,
        name: authUsersTable.name,
        email: authUsersTable.email,
        roles: authUsersTable.roles,
        createdAt: authUsersTable.createdAt,
        updatedAt: authUsersTable.updatedAt,
      });

    await createRoleAuditLog({
      actorUserId: adminUser.id,
      targetUserId: targetUser.id,
      action: "admin_roles_updated",
      oldRoles,
      newRoles: nextRoles,
      source: "admin_user_roles",
      note: "Admin updated user roles directly.",
    });

    return { data: toAdminUserResponse(updatedUser!) };
  },
  {
    params: updateAdminUserRolesParamsSchema,
    body: updateAdminUserRolesBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Update a user's roles",
      description:
        "Set roles for a user. Customer is always preserved, and admins cannot remove their own admin role.",
    },
    response: {
      200: adminUserResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/role-audit-logs",
  async ({ query, request }) => {
    await requireUserWithAnyRole(request, adminRoles);
    const filters = query as {
      targetUserId?: string;
      actorUserId?: string;
      action?: RoleAuditAction;
    };
    const conditions: SQL[] = [];

    if (filters.targetUserId) {
      conditions.push(eq(roleAuditLogsTable.targetUserId, filters.targetUserId));
    }
    if (filters.actorUserId) {
      conditions.push(eq(roleAuditLogsTable.actorUserId, filters.actorUserId));
    }
    if (filters.action) {
      conditions.push(eq(roleAuditLogsTable.action, filters.action));
    }

    const selectLogs = () => db.select().from(roleAuditLogsTable);
    const logs =
      conditions.length > 0
        ? await selectLogs()
            .where(and(...conditions))
            .orderBy(desc(roleAuditLogsTable.createdAt))
            .limit(100)
        : await selectLogs()
            .orderBy(desc(roleAuditLogsTable.createdAt))
            .limit(100);

    const users = await db
      .select({
        id: authUsersTable.id,
        name: authUsersTable.name,
        email: authUsersTable.email,
      })
      .from(authUsersTable);
    const userById = new Map(users.map((user) => [user.id, user]));

    return {
      data: logs.map((log) => {
        const actor = log.actorUserId ? userById.get(log.actorUserId) : null;
        const target = userById.get(log.targetUserId);
        return toRoleAuditLogResponse({
          ...log,
          actorName: actor?.name ?? null,
          actorEmail: actor?.email ?? null,
          targetName: target?.name ?? null,
          targetEmail: target?.email ?? null,
        });
      }),
    };
  },
  {
    query: listRoleAuditLogsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "List role audit logs",
      description:
        "Return the latest role audit logs for admin review, with optional actor, target, and action filters.",
    },
    response: {
      200: roleAuditLogListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get("/api/menu", () => ({ data: [...store.getMenu()] }), {
  detail: {
    tags: ["menu"],
    summary: "List menu items",
    description: "Return all available breakfast menu items.",
  },
  response: {
    200: menuListResponseSchema,
  },
});

app.post(
  "/api/menu",
  async ({ body, request, set }) => {
    await requireUserWithAnyRole(request, menuManagerRoles);
    const newMenuItem = await store.createMenuItem(
      body as Parameters<typeof store.createMenuItem>[0],
    );
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: createMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Create a menu item",
      description: "Add a new menu item into the breakfast menu.",
    },
    response: {
      201: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/reorder",
  async ({ body, request, set }) => {
    await requireUserWithAnyRole(request, menuManagerRoles);
    const result = await store.reorderMenu(
      (body as { items: Array<{ id: string; displayOrder: number }> }).items,
    );

    if (!result) {
      set.status = 400;
      return { error: "Invalid menu reorder payload" };
    }

    return { data: [...result] };
  },
  {
    body: reorderMenuBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Reorder menu items",
      description: "Update display order for current menu item versions.",
    },
    response: {
      200: menuListResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/menu/:id/history",
  async ({ params, set }) => {
    const history = await store.getMenuHistory(params.id);

    if (history.length === 0) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: [...history] };
  },
  {
    params: getMenuHistoryParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "List menu item version history",
      description:
        "Return all versions of a menu item, newest first, by logical id or version id.",
    },
    response: {
      200: menuHistoryResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id",
  async ({ params, body, request, set }) => {
    await requireUserWithAnyRole(request, menuManagerRoles);
    const menuItem = await store.updateMenuItem(params.id, body);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: menuItem };
  },
  {
    params: updateMenuItemParamsSchema,
    body: updateMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Update a menu item",
      description: "Update fields of an existing menu item.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id",
  async ({ params, request, set }) => {
    await requireUserWithAnyRole(request, menuManagerRoles);
    const removedMenuItem = await store.deleteMenuItem(params.id);

    if (!removedMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: removedMenuItem };
  },
  {
    params: deleteMenuItemParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "Delete a menu item",
      description: "Remove a menu item by id.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 訂單列表路由
app.get(
  "/api/orders",
  async ({ request }) => {
    await requireUserWithAnyRole(request, orderViewerRoles);

    return {
      data: store.getOrders().map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "List all orders",
      description: "Return all orders for staff, chef, owner, and admin users.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/orders/workbench",
  async ({ request }) => {
    await requireUserWithAnyRole(request, orderViewerRoles);

    return {
      data: store.getWorkbenchOrders().map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "List workbench orders",
      description:
        "Return non-pending orders for staff, chef, owner, and admin workbench users.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

// 取得使用者目前進行中的訂單
app.get(
  "/api/orders/operations-summary",
  async ({ query, request }) => {
    await requireUserWithAnyRole(request, counterWorkflowRoles);
    const summaryQuery = query as { range?: OperationsSummaryRange };

    return {
      data: createOperationsSummary(
        store.getOrders(),
        summaryQuery.range ?? "today",
      ),
    };
  },
  {
    query: operationsSummaryQuerySchema,
    detail: {
      tags: ["orders"],
      summary: "Get operations summary",
      description:
        "Return order and revenue summary for staff, owner, and admin users.",
    },
    response: {
      200: operationsSummaryResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/orders/pickup-board",
  () => ({
    data: store
      .getWorkbenchOrders()
      .filter((order) => order.status === "ready")
      .slice(0, 20)
      .map(toPickupBoardOrder),
  }),
  {
    detail: {
      tags: ["orders"],
      summary: "List pickup board orders",
      description:
        "Return public pickup codes for ready orders without customer details.",
    },
    response: {
      200: pickupBoardListResponseSchema,
    },
  },
);

app.get(
  "/api/orders/current",
  async ({ request }) => {
    const user = await requireUser(request);
    const currentOrder = store.getCurrentOrderByUserId(user.id);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get current order",
      description:
        "Return the current pending order of a user, or null if none exists.",
    },
    response: {
      200: nullableOrderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 取得使用者歷史訂單
app.get(
  "/api/orders/history",
  async ({ request }) => {
    const user = await requireUser(request);
    return {
      data: store.getOrderHistoryByUserId(user.id).map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get order history",
      description: "Return submitted orders belonging to a user.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 創建新訂單
app.post(
  "/api/orders",
  async ({ request, set }) => {
    const user = await requireUser(request);
    const existingOrder = store.getCurrentOrderByUserId(user.id);
    if (existingOrder) {
      return { data: toOrderResponse(existingOrder) };
    }

    const newOrder = await store.createOrder({ userId: user.id });
    set.status = 201;
    return { data: toOrderResponse(newOrder) };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Create or reuse current order",
      description:
        "Create a new pending order, or return the existing pending order for the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      201: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 獲取單筆訂單
app.get(
  "/api/orders/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (order.userId !== user.id) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    return { data: toOrderResponse(order) };
  },
  {
    params: getOrderByIdParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Get order by id",
      description:
        "Return a single order when it belongs to the requested user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/status",
  async ({ params, body, request, set }) => {
    const user = await requireUserWithAnyRole(request, orderViewerRoles);
    const orderId = parseInt(params.id, 10);
    const nextStatus = (
      body as {
        status: Exclude<OrderStatus, "pending" | "submitted" | "cancelled">;
      }
    ).status;

    const canUseKitchenFlow =
      nextStatus === "preparing" || nextStatus === "ready";
    const allowedForStatus = canUseKitchenFlow
      ? hasAnyRole(user, kitchenWorkflowRoles)
      : hasAnyRole(user, counterWorkflowRoles);

    if (!allowedForStatus) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const result = await store.updateOrderStatus(orderId, nextStatus, {
      actorUserId: user.id,
    });
    if (result.ok === true) {
      return { data: toOrderResponse(result.order) };
    }

    if (result.ok === false) {
      switch (result.code) {
        case "ORDER_NOT_FOUND":
          set.status = 404;
          return { error: "Order not found" };
        case "ORDER_STATUS_NOT_EDITABLE":
        case "INVALID_ORDER_STATUS_TRANSITION":
          set.status = 409;
          return { error: result.code };
        default:
          set.status = 500;
          return { error: "Unknown order status error" };
      }
    }

    set.status = 500;
    return { error: "Unknown order status error" };
  },
  {
    params: updateOrderStatusParamsSchema,
    body: updateOrderStatusBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Advance order workbench status",
      description:
        "Advance a submitted order through preparing, ready, and completed states.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 更新訂單項目
app.patch(
  "/api/orders/:id/cancel",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const cancelBody = (body ?? {}) as { reason?: string };
    const canCancelOperationalOrder = hasAnyRole(user, orderCancellationRoles);
    const canAttemptCancellation =
      canCancelOperationalOrder || user.roles.includes("customer");

    if (!canAttemptCancellation) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const result = await store.cancelOrder(orderId, {
      actorUserId: user.id,
      actorRoles: user.roles,
      reason: cancelBody.reason,
    });

    if (result.ok === true) {
      return { data: toOrderResponse(result.order) };
    }

    switch (result.code) {
      case "ORDER_NOT_FOUND":
        set.status = 404;
        return { error: "Order not found" };
      case "ORDER_CANCEL_FORBIDDEN":
        set.status = 403;
        return { error: "Forbidden" };
      case "ORDER_STATUS_NOT_CANCELLABLE":
        set.status = 409;
        return { error: "Order status cannot be cancelled" };
      default:
        set.status = 500;
        return { error: "Unknown order cancel error" };
    }
  },
  {
    params: cancelOrderParamsSchema,
    body: cancelOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Cancel an order",
      description:
        "Cancel a submitted order by its customer, or an operational order by staff, owner, or admin.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/refund",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    if (!hasAnyRole(user, counterWorkflowRoles)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const orderId = parseInt(params.id, 10);
    const refundBody = (body ?? {}) as { reason?: string };
    const result = await store.refundOrder(orderId, {
      actorUserId: user.id,
      actorRoles: user.roles,
      reason: refundBody.reason,
    });

    if (result.ok === true) {
      return { data: toOrderResponse(result.order) };
    }

    switch (result.code) {
      case "ORDER_NOT_FOUND":
        set.status = 404;
        return { error: "Order not found" };
      case "ORDER_REFUND_FORBIDDEN":
        set.status = 403;
        return { error: "Forbidden" };
      case "ORDER_NOT_REFUNDABLE":
        set.status = 409;
        return { error: "Order is not refundable" };
      default:
        set.status = 500;
        return { error: "Unknown order refund error" };
    }
  },
  {
    params: refundOrderParamsSchema,
    body: refundOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Refund a completed order",
      description:
        "Refund a completed and paid order without changing the order status.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id/reopen",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    if (!hasAnyRole(user, counterWorkflowRoles)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    const orderId = parseInt(params.id, 10);
    const reopenBody = (body ?? {}) as { reason?: string };
    const result = await store.reopenOrder(orderId, {
      actorUserId: user.id,
      actorRoles: user.roles,
      reason: reopenBody.reason,
    });

    if (result.ok === true) {
      return { data: toOrderResponse(result.order) };
    }

    switch (result.code) {
      case "ORDER_NOT_FOUND":
        set.status = 404;
        return { error: "Order not found" };
      case "ORDER_REOPEN_FORBIDDEN":
        set.status = 403;
        return { error: "Forbidden" };
      case "ORDER_NOT_REOPENABLE":
        set.status = 409;
        return { error: "Order is not reopenable" };
      default:
        set.status = 500;
        return { error: "Unknown order reopen error" };
    }
  },
  {
    params: reopenOrderParamsSchema,
    body: reopenOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Reopen a cancelled order",
      description:
        "Move a cancelled order back to the submitted workbench flow.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/orders/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id);
    const orderPatch = body as { itemId: string; qty: number };
    const result = await store.updateOrderItem(orderId, {
      userId: user.id,
      itemId: orderPatch.itemId,
      qty: orderPatch.qty,
    });

    if (!("code" in result)) {
      return { data: toOrderResponse(result.order) };
    }

    switch (result.code) {
      case "ORDER_NOT_FOUND":
        set.status = 404;
        return { error: "Order not found" };
      case "MENU_ITEM_NOT_FOUND":
        set.status = 404;
        return { error: "Menu item not found" };
      case "MENU_ITEM_NOT_CURRENT":
        set.status = 409;
        return {
          error: "Menu item is no longer current",
          message: "Please refresh the menu and update your cart.",
        };
      case "ORDER_NOT_OWNED":
        set.status = 403;
        return { error: "Forbidden" };
      case "ORDER_NOT_EDITABLE":
        set.status = 409;
        return { error: "Order is not editable" };
      default:
        set.status = 500;
        return { error: "Unexpected store state" };
    }
  },
  {
    params: updateOrderParamsSchema,
    body: updateOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update order item quantity",
      description: "Set the quantity of a menu item within a pending order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 送出訂單
app.post(
  "/api/orders/:id/submit",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const submitBody = (body ?? {}) as { customerNote?: string };
    const result = await store.submitOrder(orderId, {
      userId: user.id,
      customerNote: submitBody.customerNote,
    });

    if (!("code" in result)) {
      return { data: toOrderResponse(result.order) };
    }

    switch (result.code) {
      case "ORDER_NOT_FOUND":
        set.status = 404;
        return { error: "Order not found" };
      case "ORDER_NOT_OWNED":
        set.status = 403;
        return { error: "Forbidden" };
      case "ORDER_NOT_EDITABLE":
        set.status = 409;
        return { error: "Order already submitted" };
      case "EMPTY_ORDER":
        set.status = 400;
        return { error: "Empty order cannot be submitted" };
      case "MENU_ITEM_NOT_CURRENT":
        set.status = 409;
        return {
          error: "Cart contains outdated menu items",
          message: "Please refresh the menu and update your cart.",
        };
      default:
        set.status = 500;
        return { error: "Unexpected store state" };
    }
  },
  {
    params: submitOrderParamsSchema,
    body: submitOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Submit order",
      description: "Submit a pending order that belongs to the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 健康檢查路由
app.get("/health", () => ({ status: "ok" }), {
  detail: {
    tags: ["system"],
    summary: "Health check",
    description: "Return API health status.",
  },
  response: {
    200: healthResponseSchema,
  },
});

// ─── Manual Static File & SPA Fallback ────────────────────────────────────────
// 完全手動處理靜態檔案和 SPA fallback，避免 staticPlugin 的路由衝突問題
if (hasPublicAssets) {
  app.get("*", async ({ request }) => {
    const pathname = new URL(request.url).pathname;

    // API 路徑返回 404
    if (pathname.startsWith("/api/") || pathname.startsWith("/openapi")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 嘗試回傳對應的靜態檔案
    const staticFile = Bun.file(`./public${pathname}`);
    if (pathname !== "/" && (await staticFile.exists())) {
      return staticFile;
    }

    // SPA fallback: 回傳 index.html
    return Bun.file("./public/index.html");
  });
}

// 全域錯誤處理
app.onError(({ error, set, code }) => {
  if (error instanceof Response) {
    return error;
  }

  if (code === "VALIDATION") {
    set.status = 400;
    return {
      error: "Validation failed",
      message: "Please check your request parameters",
    };
  }

  set.status = 500;
  return { error: "Internal server error" };
});

// 啟動服務器
await store.init();

app.listen(port, () => {
  console.log(`🍳 早餐店 API 運行在 http://${host}:${port}`);
  console.log(`🌐 Web App: http://${host}:${port}`);
  console.log(`📋 菜單 API: http://${host}:${port}/api/menu`);
  console.log(`📦 訂單 API: http://${host}:${port}/api/orders`);
  console.log(`💚 健康檢查: http://${host}:${port}/health`);
  console.log(`🔐 CORS Origin: ${allowedOrigin}`);
  if (!hasPublicAssets) {
    console.log(
      "⚠️ public/ 不存在，目前只提供 API。若要提供前端頁面，先執行 bun run build:frontend",
    );
  }
});
