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

export const paymentStatusSchema = z.enum(["unpaid", "paid"]);

export const menuItemSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().min(1),
  logicalId: z.string().min(1),
  version: z.number().int().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  category: z.string().min(1),
  description: z.string(),
  image_url: z.string().min(1),
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
  customerNote: z.string(),
  cancelReason: z.string(),
  cancelledBy: z.string().min(1).nullable().optional(),
  cancelledAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
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
export type MenuItem = z.infer<typeof menuItemSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type User = SessionUser;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type RoleRequest = z.infer<typeof roleRequestSchema>;
export type RoleAuditLog = z.infer<typeof roleAuditLogSchema>;

export interface ApiDataResponse<T> {
  data: T;
}
