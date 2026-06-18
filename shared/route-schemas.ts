import { z } from "zod";
import type { Order } from "./contracts.ts";
import {
  adminUserSchema,
  menuExperimentSchema,
  menuItemSchema,
  menuPriceAnalysisSchema,
  menuVersionLevelSchema,
  operationsSummaryRangeSchema,
  operationsSummarySchema,
  orderSchema,
  requestableRoleSchema,
  roleAuditActionSchema,
  roleAuditLogSchema,
  roleSchema,
  roleRequestSchema,
  roleRequestStatusSchema,
  sessionUserSchema,
} from "./contracts.ts";
import toTaipeiDateTime from "../util.ts";

export type { Order };

// ─── API Layer Error Response（API 層錯誤格式定義）────────────────────────

export const apiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

// ─── API Layer Current User Response ───────────────────────────────────

export const currentUserResponseSchema = z.object({
  user: sessionUserSchema,
});

export const roleRequestResponseSchema = z.object({
  data: roleRequestSchema,
});

export const roleRequestListResponseSchema = z.object({
  data: z.array(roleRequestSchema),
});

export const adminUserResponseSchema = z.object({
  data: adminUserSchema,
});

export const adminUserListResponseSchema = z.object({
  data: z.array(adminUserSchema),
});

export const roleAuditLogListResponseSchema = z.object({
  data: z.array(roleAuditLogSchema),
});

export const operationsSummaryResponseSchema = z.object({
  data: operationsSummarySchema,
});

export const menuPriceAnalysisResponseSchema = z.object({
  data: menuPriceAnalysisSchema,
});

export const menuExperimentListResponseSchema = z.object({
  data: z.array(menuExperimentSchema),
});

export const ordersCsvQuerySchema = z.object({
  range: operationsSummaryRangeSchema.optional().default("today"),
});

// ─── API Layer Order Response（Order 的 API 層呈現）──────────────────────

export const orderResponseSchema = orderSchema.extend({
  createdAtTaipei: z.string().min(1),
  pickupCode: z.string().min(1),
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const pickupBoardOrderSchema = z.object({
  id: z.number().int().min(1),
  pickupCode: z.string().min(1),
  status: z.literal("ready"),
  createdAt: z.string().min(1),
  createdAtTaipei: z.string().min(1),
});

export type PickupBoardOrder = z.infer<typeof pickupBoardOrderSchema>;

/**
 * 將數據庫/內部 Order 轉換為 API 響應格式
 * 添加台北時區時間戳
 */
export function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
    pickupCode: `A-${String(order.id).padStart(4, "0")}`,
  };
}

export function toPickupBoardOrder(order: Order): PickupBoardOrder {
  return {
    id: order.id,
    pickupCode: `A-${String(order.id).padStart(4, "0")}`,
    status: "ready",
    createdAt: order.createdAt,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

// ─── Request Schemas（按 route 分組）────────────────────────────────────

/** POST /api/menu */
export const createMenuItemBodySchema = z.object({
  logical_id: z.string().min(1).optional(),
  name: z.string().min(1),
  price: z.number().int().min(0),
  category: z.string().min(1),
  description: z.string().min(1),
  image_url: z.string().min(1),
  sale_price: z.number().int().min(1).nullable().optional(),
  promotion_label: z.string().trim().max(40).optional(),
  version_note: z.string().trim().max(120).optional(),
  experiment_key: z.string().trim().max(80).optional(),
  experiment_variant: z.string().trim().max(40).optional(),
  display_order: z.number().int().min(0).optional(),
  is_sold_out: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  change_reason: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.sale_price !== undefined && value.sale_price !== null && value.sale_price >= value.price) {
    context.addIssue({
      code: "custom",
      path: ["sale_price"],
      message: "sale_price must be lower than price",
    });
  }
});

/** PATCH /api/menu/:id */
export const updateMenuItemParamsSchema = z.object({
  id: z.string().min(1),
});

export const updateMenuItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().int().min(0).optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  image_url: z.string().min(1).optional(),
  sale_price: z.number().int().min(1).nullable().optional(),
  promotion_label: z.string().trim().max(40).optional(),
  version_level: menuVersionLevelSchema.optional().default("minor"),
  version_note: z.string().trim().max(120).optional(),
  experiment_key: z.string().trim().max(80).optional(),
  experiment_variant: z.string().trim().max(40).optional(),
  is_sold_out: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  change_reason: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (
    value.price !== undefined &&
    value.sale_price !== undefined &&
    value.sale_price !== null &&
    value.sale_price >= value.price
  ) {
    context.addIssue({
      code: "custom",
      path: ["sale_price"],
      message: "sale_price must be lower than price",
    });
  }
});

/** DELETE /api/menu/:id */
export const deleteMenuItemParamsSchema = z.object({
  id: z.string().min(1),
});

/** PATCH /api/menu/reorder */
export const reorderMenuBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        displayOrder: z.number().int().min(0),
      }),
    )
    .min(1),
});

/** GET /api/menu/:id/history */
export const getMenuHistoryParamsSchema = z.object({
  id: z.string().min(1),
});

/** GET /api/menu/:id/price-analysis */
export const getMenuPriceAnalysisParamsSchema = z.object({
  id: z.string().min(1),
});

/** GET /api/orders/:id */
export const getOrderByIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** PATCH /api/orders/:id */
export const updateOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderBodySchema = z.object({
  itemId: z.string().min(1),
  qty: z.number().min(0),
});

/** POST /api/orders/:id/submit */
export const submitOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const submitOrderBodySchema = z
  .object({
    customerNote: z.string().trim().max(120).optional(),
  })
  .optional()
  .default({});

/** PATCH /api/orders/:id/status */
export const updateOrderStatusParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderStatusBodySchema = z.object({
  status: z.enum(["preparing", "ready", "completed"]),
});

/** PATCH /api/orders/:id/cancel */
export const cancelOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const cancelOrderBodySchema = z
  .object({
    reason: z.string().trim().max(120).optional(),
  })
  .optional()
  .default({});

/** PATCH /api/orders/:id/refund */
export const refundOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const refundOrderBodySchema = z
  .object({
    reason: z.string().trim().max(120).optional(),
  })
  .optional()
  .default({});

/** PATCH /api/orders/:id/reopen */
export const reopenOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const reopenOrderBodySchema = z
  .object({
    reason: z.string().trim().max(120).optional(),
  })
  .optional()
  .default({});

/** POST /api/users/me/role-request */
export const createRoleRequestBodySchema = z.object({
  requestedRole: requestableRoleSchema,
  reason: z.string().min(10),
});

/** GET /api/admin/role-requests */
export const listRoleRequestsQuerySchema = z.object({
  status: z
    .union([roleRequestStatusSchema, z.literal("all")])
    .optional()
    .default("pending"),
});

/** PATCH /api/admin/role-requests/:id */
export const reviewRoleRequestParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const reviewRoleRequestBodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().optional(),
});

/** PATCH /api/admin/users/:userId/roles */
export const updateAdminUserRolesParamsSchema = z.object({
  userId: z.string().min(1),
});

export const updateAdminUserRolesBodySchema = z.object({
  roles: z.array(roleSchema).min(1),
});

/** GET /api/admin/role-audit-logs */
export const listRoleAuditLogsQuerySchema = z.object({
  targetUserId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
  action: roleAuditActionSchema.optional(),
});

/** GET /api/orders/operations-summary */
export const operationsSummaryQuerySchema = z.object({
  range: operationsSummaryRangeSchema.optional().default("today"),
});

// ─── Response Schemas（API envelope 層）─────────────────────────────────

export const menuListResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

export const menuItemResponseSchema = z.object({
  data: menuItemSchema,
});

export const menuHistoryResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

export const orderListResponseSchema = z.object({
  data: z.array(orderResponseSchema),
});

export const pickupBoardListResponseSchema = z.object({
  data: z.array(pickupBoardOrderSchema),
});

export const orderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema,
});

export const nullableOrderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema.nullable(),
});

export const healthResponseSchema = z.object({
  status: z.string(),
});
