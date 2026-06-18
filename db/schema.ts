import {
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  type AnyPgColumn,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";
import { APP_SCHEMA_NAME } from "./schema-name.ts";

// PostgreSQL namespace 隔離
// V10.1 的 migration 固定建立 bf_v10，因此 runtime 也必須固定指向 bf_v10。
const appSchema = pgSchema(APP_SCHEMA_NAME);

// 對照 shared/contracts.ts：
//   MenuItem { id, entityId, logicalId, version, name, price, category, description, image_url }
//   Order { id, userId: string, total, status, createdAt, submittedAt }
//   OrderItem { item: MenuItem, qty }  → order_items.menu_item_id 指向特定菜單版本
//
// V10 設計：userId 直接對應 Better Auth 的 user.id（text PK）
// 不再維護獨立的 users 表，身份完全由 Better Auth 管理。

export const menuItemsTable = appSchema.table(
  "menu_items",
  {
    id: text("id").primaryKey(),
    entityId: text("entity_id").notNull(),
    logicalId: text("logical_id").notNull(),
    version: integer("version").notNull().default(1),
    majorVersion: integer("major_version").notNull().default(1),
    minorVersion: integer("minor_version").notNull().default(0),
    versionNote: text("version_note").notNull().default(""),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url").notNull(),
    salePrice: integer("sale_price"),
    promotionLabel: text("promotion_label").notNull().default(""),
    displayOrder: integer("display_order").notNull().default(0),
    isSoldOut: boolean("is_sold_out").notNull().default(false),
    isHidden: boolean("is_hidden").notNull().default(false),
    experimentKey: text("experiment_key").notNull().default(""),
    experimentVariant: text("experiment_variant").notNull().default(""),
    isCurrentVersion: boolean("is_current_version").notNull().default(true),
    supersedes: text("supersedes").references(
      (): AnyPgColumn => menuItemsTable.id,
    ),
    changeReason: text("change_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull().default("system"),
  },
  (table) => ({
    entityVersionIdx: uniqueIndex("menu_items_entity_version_idx").on(
      table.entityId,
      table.version,
    ),
    logicalIdIdx: index("menu_items_logical_id_idx").on(table.logicalId),
    currentVersionIdx: index("menu_items_current_version_idx").on(
      table.isCurrentVersion,
    ),
  }),
);

export const ordersTable = appSchema.table("orders", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  total: integer("total").notNull().default(0),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paidBy: text("paid_by").references(() => user.id),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  refundReason: text("refund_reason").notNull().default(""),
  refundedBy: text("refunded_by").references(() => user.id),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  customerNote: text("customer_note").notNull().default(""),
  pickupTime: text("pickup_time").notNull().default(""),
  cancelReason: text("cancel_reason").notNull().default(""),
  cancelledBy: text("cancelled_by").references(() => user.id),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const orderItemsTable = appSchema.table(
  "order_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItemsTable.id),
    qty: integer("qty").notNull(),
    addEgg: boolean("add_egg").notNull().default(false),
  },
  (table) => ({
    orderItemUniqueIdx: uniqueIndex("order_items_order_menu_item_idx").on(
      table.orderId,
      table.menuItemId,
    ),
  }),
);

export const menuExperimentExposuresTable = appSchema.table(
  "menu_experiment_exposures",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    visitorKey: text("visitor_key").notNull(),
    experimentKey: text("experiment_key").notNull(),
    experimentVariant: text("experiment_variant").notNull(),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItemsTable.id, { onDelete: "cascade" }),
    exposedAt: timestamp("exposed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    menuExperimentExposureUniqueIdx: uniqueIndex(
      "menu_experiment_exposures_unique_idx",
    ).on(
      table.visitorKey,
      table.experimentKey,
      table.experimentVariant,
      table.menuItemId,
    ),
    menuExperimentExposureExperimentIdx: index(
      "menu_experiment_exposures_experiment_idx",
    ).on(table.experimentKey),
  }),
);

export const roleRequestsTable = appSchema.table(
  "role_requests",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestedRole: text("requested_role").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (table) => ({
    roleRequestsUserStatusIdx: index("role_requests_user_status_idx").on(
      table.userId,
      table.status,
    ),
    roleRequestsStatusIdx: index("role_requests_status_idx").on(table.status),
  }),
);

export const roleAuditLogsTable = appSchema.table(
  "role_audit_logs",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    actorUserId: text("actor_user_id").references(() => user.id),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    oldRoles: text("old_roles").array().notNull(),
    newRoles: text("new_roles").array().notNull(),
    source: text("source").notNull(),
    roleRequestId: integer("role_request_id").references(
      () => roleRequestsTable.id,
    ),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roleAuditLogsCreatedAtIdx: index("role_audit_logs_created_at_idx").on(
      table.createdAt,
    ),
    roleAuditLogsActorIdx: index("role_audit_logs_actor_idx").on(
      table.actorUserId,
    ),
    roleAuditLogsTargetIdx: index("role_audit_logs_target_idx").on(
      table.targetUserId,
    ),
    roleAuditLogsActionIdx: index("role_audit_logs_action_idx").on(
      table.action,
    ),
  }),
);
