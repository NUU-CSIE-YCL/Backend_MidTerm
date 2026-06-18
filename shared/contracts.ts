import { z } from "zod";

// API business schemas: single source of truth for route contracts and TS types.
export const roleSchema = z.enum([
  "customer",
  "staff",
  "chef",
  "owner",
  "admin",
]);

export const requestableRoleSchema = z.enum(["staff", "chef"]);

export const roleRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export const roleAuditActionSchema = z.enum([
  "role_request_approved",
  "role_request_rejected",
  "admin_roles_updated",
]);

export const orderStatusSchema = z.enum([
  "pending",
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

export const paymentStatusSchema = z.enum(["unpaid", "paid", "refunded"]);

export const operationsSummaryRangeSchema = z.enum(["today", "all"]);
export const menuVersionLevelSchema = z.enum(["minor", "major"]);

export const menuItemSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().min(1),
  logicalId: z.string().min(1),
  version: z.number().int().min(1),
  majorVersion: z.number().int().min(1),
  minorVersion: z.number().int().min(0),
  versionNote: z.string(),
  name: z.string().min(1),
  price: z.number().min(0),
  salePrice: z.number().int().min(1).nullable(),
  promotionLabel: z.string(),
  category: z.string().min(1),
  description: z.string(),
  image_url: z.string().min(1),
  displayOrder: z.number().int().min(0),
  isSoldOut: z.boolean(),
  isHidden: z.boolean(),
  experimentKey: z.string(),
  experimentVariant: z.string(),
  purchaseCountToday: z.number().int().min(0).optional(),
  purchaseCountThisWeek: z.number().int().min(0).optional(),
  isCurrentVersion: z.boolean(),
  supersedes: z.string().min(1).nullable().optional(),
  changeReason: z.string().nullable().optional(),
  createdAt: z.string().min(1).optional(),
  createdBy: z.string().min(1).optional(),
});

export const sessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(3),
  name: z.string().min(1),
  roles: z.array(roleSchema).min(1).default(["customer"]),
});

export const adminUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(3),
  roles: z.array(roleSchema).min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const orderItemSchema = z.object({
  item: menuItemSchema,
  qty: z.number().min(0),
  addEgg: z.boolean().optional(),
});

export const orderSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  items: z.array(orderItemSchema),
  total: z.number().min(0),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  paidBy: z.string().min(1).nullable().optional(),
  paidAt: z.string().min(1).optional(),
  refundReason: z.string(),
  refundedBy: z.string().min(1).nullable().optional(),
  refundedAt: z.string().min(1).optional(),
  customerNote: z.string(),
  pickupTime: z.string().optional().default(""),
  cancelReason: z.string(),
  cancelledBy: z.string().min(1).nullable().optional(),
  cancelledAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
});

export const operationsSummarySchema = z.object({
  range: operationsSummaryRangeSchema,
  generatedAt: z.string().min(1),
  generatedAtTaipei: z.string().min(1),
  orderCount: z.number().int().min(0),
  activeOrderCount: z.number().int().min(0),
  completedOrderCount: z.number().int().min(0),
  cancelledOrderCount: z.number().int().min(0),
  paidOrderCount: z.number().int().min(0),
  refundedOrderCount: z.number().int().min(0),
  grossRevenue: z.number().min(0),
  refundedAmount: z.number().min(0),
  netRevenue: z.number().min(0),
  unpaidAmount: z.number().min(0),
  byStatus: z.object({
    pending: z.number().int().min(0),
    submitted: z.number().int().min(0),
    preparing: z.number().int().min(0),
    ready: z.number().int().min(0),
    completed: z.number().int().min(0),
    cancelled: z.number().int().min(0),
  }),
});

export const menuPriceAnalysisVersionSchema = z.object({
  id: z.string().min(1),
  logicalId: z.string().min(1),
  version: z.number().int().min(1),
  majorVersion: z.number().int().min(1),
  minorVersion: z.number().int().min(0),
  price: z.number().min(0),
  salePrice: z.number().int().min(1).nullable(),
  orderCount: z.number().int().min(0),
  quantitySold: z.number().int().min(0),
  revenue: z.number().min(0),
  averageUnitPrice: z.number().min(0),
  isCurrentVersion: z.boolean(),
});

export const menuPriceAnalysisSchema = z.object({
  logicalId: z.string().min(1),
  name: z.string().min(1),
  totalOrderCount: z.number().int().min(0),
  totalQuantitySold: z.number().int().min(0),
  totalRevenue: z.number().min(0),
  versions: z.array(menuPriceAnalysisVersionSchema),
});

export const menuExperimentSchema = z.object({
  experimentKey: z.string().min(1),
  variants: z.array(
    z.object({
      variant: z.string().min(1),
      itemCount: z.number().int().min(0),
      exposureCount: z.number().int().min(0),
      orderCount: z.number().int().min(0),
      quantitySold: z.number().int().min(0),
      revenue: z.number().min(0),
      conversionRate: z.number().min(0),
      lastExposedAt: z.string().min(1).nullable().optional(),
    }),
  ),
});

export const menuExperimentExposureSchema = z.object({
  id: z.number().int().min(1).optional(),
  visitorKey: z.string().min(1),
  experimentKey: z.string().min(1),
  experimentVariant: z.string().min(1),
  menuItemId: z.string().min(1),
  exposedAt: z.string().min(1).optional(),
});

export const menuExperimentDetailSchema = menuExperimentSchema.extend({
  exposures: z.array(menuExperimentExposureSchema),
});

export const roleRequestSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  requestedRole: requestableRoleSchema,
  reason: z.string().min(10),
  status: roleRequestStatusSchema,
  requestedAt: z.string().min(1),
  reviewedBy: z.string().min(1).nullable().optional(),
  reviewedAt: z.string().min(1).nullable().optional(),
  reviewNote: z.string().nullable().optional(),
  requesterName: z.string().nullable().optional(),
  requesterEmail: z.string().nullable().optional(),
});

export const roleAuditLogSchema = z.object({
  id: z.number().int().min(1),
  actorUserId: z.string().min(1).nullable(),
  targetUserId: z.string().min(1),
  action: roleAuditActionSchema,
  oldRoles: z.array(roleSchema),
  newRoles: z.array(roleSchema),
  source: z.string().min(1),
  roleRequestId: z.number().int().min(1).nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string().min(1),
  actorName: z.string().nullable().optional(),
  actorEmail: z.string().nullable().optional(),
  targetName: z.string().nullable().optional(),
  targetEmail: z.string().nullable().optional(),
});

export type Role = z.infer<typeof roleSchema>;
export type RequestableRole = z.infer<typeof requestableRoleSchema>;
export type RoleRequestStatus = z.infer<typeof roleRequestStatusSchema>;
export type RoleAuditAction = z.infer<typeof roleAuditActionSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type OperationsSummaryRange = z.infer<
  typeof operationsSummaryRangeSchema
>;
export type MenuVersionLevel = z.infer<typeof menuVersionLevelSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type User = SessionUser;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OperationsSummary = z.infer<typeof operationsSummarySchema>;
export type MenuPriceAnalysis = z.infer<typeof menuPriceAnalysisSchema>;
export type MenuPriceAnalysisVersion = z.infer<
  typeof menuPriceAnalysisVersionSchema
>;
export type MenuExperiment = z.infer<typeof menuExperimentSchema>;
export type MenuExperimentExposure = z.infer<
  typeof menuExperimentExposureSchema
>;
export type MenuExperimentDetail = z.infer<typeof menuExperimentDetailSchema>;
export type RoleRequest = z.infer<typeof roleRequestSchema>;
export type RoleAuditLog = z.infer<typeof roleAuditLogSchema>;

export interface ApiDataResponse<T> {
  data: T;
}
