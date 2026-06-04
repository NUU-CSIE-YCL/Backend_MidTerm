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
    name: text("name").notNull(),
    price: integer("price").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url").notNull(),
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
  },
  (table) => ({
    orderItemUniqueIdx: uniqueIndex("order_items_order_menu_item_idx").on(
      table.orderId,
      table.menuItemId,
    ),
  }),
);
