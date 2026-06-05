import { z } from "zod";

// ─── API Business Schemas（Single Source of Truth）──────────────────────────
// 這裡是前後端共用的業務型別定義。
// 型別（TypeScript type）由 Zod schema 自動推導，不需要手動維護兩份。

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
  // 注意：password 不在 API 業務層，只存在 DB 層（db/schema.ts）
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
  status: z.enum(["pending", "submitted"]),
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

// ─── Derived TypeScript Types（自動推導，永不過時）───────────────────────────
export type Role = z.infer<typeof roleSchema>;
export type RequestableRole = z.infer<typeof requestableRoleSchema>;
export type RoleRequestStatus = z.infer<typeof roleRequestStatusSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type User = SessionUser; // 與 SessionUser 相同（API 層不含 password）
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type RoleRequest = z.infer<typeof roleRequestSchema>;

export interface ApiDataResponse<T> {
  data: T;
}
