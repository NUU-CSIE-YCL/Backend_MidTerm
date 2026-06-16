import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  Role,
} from "../../shared/contracts.ts";
import { db } from "../../db/client.ts";
import {
  menuRepository,
  toMenuItem,
} from "../../db/repositories/menuRepository.ts";
import {
  menuItemsTable,
  orderItemsTable,
  ordersTable,
} from "../../db/schema.ts";
import type { Store } from "../Store.ts";

interface PgStoreOptions {
  dataFilePath?: string;
}

// Seed 用的內部型別（來自 data/store.json）
// V10: 只播 menu，users 由 Better Auth 管理，orders 需真實 session 才能建立
interface SeedMenuItem {
  id?: number | string;
  name: string;
  price: number;
  category: string;
  description: string;
  image_url: string;
}

interface SeedData {
  menu?: SeedMenuItem[];
  orders?: Array<{
    id: number;
    userId: string | number;
    status: OrderStatus;
    total: number;
    createdAt: string;
    submittedAt?: string;
    customerNote?: string;
    cancelReason?: string;
    cancelledBy?: string | null;
    cancelledAt?: string;
    items: Array<{ item: MenuItem; qty: number }>;
  }>;
}

function calculateTotal(items: ReadonlyArray<OrderItem>): number {
  return items.reduce((sum, oi) => sum + oi.item.price * oi.qty, 0);
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  const status = String(value);
  if (
    status === "pending" ||
    status === "submitted" ||
    status === "preparing" ||
    status === "ready" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "pending";
}

function canCancelOrder(order: Order, actorUserId: string, actorRoles: readonly Role[]): boolean {
  const canCancelOperationalOrder = actorRoles.some((role) =>
    role === "staff" || role === "owner" || role === "admin",
  );

  if (canCancelOperationalOrder) {
    return (
      order.status === "submitted" ||
      order.status === "preparing" ||
      order.status === "ready"
    );
  }

  return order.userId === actorUserId && order.status === "submitted";
}

function isValidWorkbenchTransition(
  currentStatus: OrderStatus,
  nextStatus: Exclude<OrderStatus, "pending" | "submitted" | "cancelled">,
): boolean {
  return (
    (currentStatus === "submitted" && nextStatus === "preparing") ||
    (currentStatus === "preparing" && nextStatus === "ready") ||
    (currentStatus === "ready" && nextStatus === "completed")
  );
}

export class PgStore implements Store {
  private readonly dataFilePath: string;
  private menu: MenuItem[] = [];
  private orders: Order[] = [];

  constructor(options: PgStoreOptions = {}) {
    this.dataFilePath = options.dataFilePath ?? "./data/store.json";
  }

  async init(): Promise<void> {
    await db.execute(sql`select 1`);
    await this.seedFromJsonIfEmpty();
    await this.reloadFromDatabase();
  }

  // ── Menu ────────────────────────────────────────────────────

  getMenu(): ReadonlyArray<MenuItem> {
    return this.menu;
  }

  async createMenuItem(input: {
    logical_id?: string;
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
    change_reason?: string;
  }): Promise<MenuItem> {
    const created = await menuRepository.createMenuItem(input, "system");
    this.menu.push(created);
    return created;
  }

  async updateMenuItem(
    menuId: string,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      image_url?: string;
      change_reason?: string;
    },
  ): Promise<MenuItem | null> {
    const next = await menuRepository.updateMenuItemVersion(
      menuId,
      patch,
      "system",
    );
    if (!next) return null;

    const idx = this.menu.findIndex((item) => item.logicalId === next.logicalId);
    if (idx !== -1) this.menu[idx] = next;
    else this.menu.push(next);

    return next;
  }

  async deleteMenuItem(menuId: string): Promise<MenuItem | null> {
    const removedItem = await menuRepository.retireCurrentVersion(menuId);
    if (!removedItem) return null;

    const idx = this.menu.findIndex(
      (item) => item.logicalId === removedItem.logicalId,
    );
    if (idx !== -1) this.menu.splice(idx, 1);

    return removedItem;
  }

  async getMenuHistory(menuId: string): Promise<ReadonlyArray<MenuItem>> {
    return await menuRepository.getMenuHistory(menuId);
  }

  // ── Orders ──────────────────────────────────────────────────

  getOrders(): ReadonlyArray<Order> {
    return this.orders;
  }

  getWorkbenchOrders(): ReadonlyArray<Order> {
    return this.orders
      .filter((o) => o.status !== "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    const pendingOrders = this.orders.filter(
      (o) => o.userId === userId && o.status === "pending",
    );

    if (pendingOrders.length === 0) return undefined;

    // 取最新 pending（id 越大越新），避免使用到舊的空購物車訂單。
    return pendingOrders.reduce((latest, current) =>
      current.id > latest.id ? current : latest,
    );
  }

  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order> {
    return this.orders
      .filter((o) => o.userId === userId && o.status !== "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrderById(orderId: number): Order | undefined {
    return this.orders.find((o) => o.id === orderId);
  }

  async createOrder(input: { userId: string }): Promise<Order> {
    const existingOrder = this.getCurrentOrderByUserId(input.userId);
    if (existingOrder) {
      return existingOrder;
    }

    const createdAt = new Date();

    const [inserted] = await db
      .insert(ordersTable)
      .values({ userId: input.userId, status: "pending", total: 0, createdAt })
      .returning();

    if (!inserted) throw new Error("Failed to create order");

    const order: Order = {
      id: inserted.id,
      userId: input.userId,
      items: [],
      total: inserted.total,
      status: "pending",
      customerNote: inserted.customerNote ?? "",
      cancelReason: inserted.cancelReason ?? "",
      cancelledBy: inserted.cancelledBy,
      cancelledAt: inserted.cancelledAt
        ? inserted.cancelledAt instanceof Date
          ? inserted.cancelledAt.toISOString()
          : new Date(inserted.cancelledAt).toISOString()
        : undefined,
      createdAt:
        inserted.createdAt instanceof Date
          ? inserted.createdAt.toISOString()
          : new Date(inserted.createdAt).toISOString(),
    };

    this.orders.push(order);
    return order;
  }

  async updateOrderItem(
    orderId: number,
    input: { userId: string; itemId: string; qty: number },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "MENU_ITEM_NOT_FOUND"
          | "MENU_ITEM_NOT_CURRENT"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE";
      }
  > {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.userId !== input.userId)
      return { ok: false, code: "ORDER_NOT_OWNED" };
    if (order.status !== "pending")
      return { ok: false, code: "ORDER_NOT_EDITABLE" };

    const existingIdx = order.items.findIndex(
      (oi) => oi.item.id === input.itemId,
    );

    if (input.qty === 0) {
      if (existingIdx !== -1) {
        await db
          .delete(orderItemsTable)
          .where(
            and(
              eq(orderItemsTable.orderId, orderId),
              eq(orderItemsTable.menuItemId, input.itemId),
            ),
          );
        order.items.splice(existingIdx, 1);
      }
      order.total = calculateTotal(order.items);
      await db
        .update(ordersTable)
        .set({ total: order.total })
        .where(eq(ordersTable.id, orderId));

      return { ok: true, order };
    }

    const menuItem = await menuRepository.getMenuVersion(input.itemId);
    if (!menuItem) return { ok: false, code: "MENU_ITEM_NOT_FOUND" };
    if (!menuItem.isCurrentVersion)
      return { ok: false, code: "MENU_ITEM_NOT_CURRENT" };

    if (existingIdx !== -1) {
      await db
        .update(orderItemsTable)
        .set({ qty: input.qty })
        .where(
          and(
            eq(orderItemsTable.orderId, orderId),
            eq(orderItemsTable.menuItemId, input.itemId),
          ),
        );
      const target = order.items[existingIdx];
      if (target) target.qty = input.qty;
    } else {
      await db.insert(orderItemsTable).values({
        orderId,
        menuItemId: menuItem.id,
        qty: input.qty,
      });
      order.items.push({ item: { ...menuItem }, qty: input.qty });
    }

    order.total = calculateTotal(order.items);
    await db
      .update(ordersTable)
      .set({ total: order.total })
      .where(eq(ordersTable.id, orderId));

    return { ok: true, order };
  }

  async submitOrder(
    orderId: number,
    input: { userId: string; customerNote?: string },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE"
          | "EMPTY_ORDER"
          | "MENU_ITEM_NOT_CURRENT";
      }
  > {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    if (order.userId !== input.userId)
      return { ok: false, code: "ORDER_NOT_OWNED" };
    if (order.status !== "pending")
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    if (order.items.length === 0) return { ok: false, code: "EMPTY_ORDER" };

    const validation = await menuRepository.validateMenuItemsAreCurrent(
      order.items.map((item) => item.item.id),
    );
    if (!validation.valid) {
      return { ok: false, code: "MENU_ITEM_NOT_CURRENT" };
    }

    const submittedAt = new Date().toISOString();
    const customerNote = (input.customerNote ?? "").trim();

    await db
      .update(ordersTable)
      .set({
        status: "submitted",
        submittedAt: new Date(submittedAt),
        customerNote,
      })
      .where(eq(ordersTable.id, orderId));

    order.status = "submitted";
    order.submittedAt = submittedAt;
    order.customerNote = customerNote;

    return { ok: true, order };
  }

  // ── Private ─────────────────────────────────────────────────

  async updateOrderStatus(
    orderId: number,
    nextStatus: Exclude<OrderStatus, "pending" | "submitted" | "cancelled">,
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_STATUS_NOT_EDITABLE"
          | "INVALID_ORDER_STATUS_TRANSITION";
      }
  > {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };

    if (order.status === "pending" || order.status === "completed") {
      return { ok: false, code: "ORDER_STATUS_NOT_EDITABLE" };
    }

    if (!isValidWorkbenchTransition(order.status, nextStatus)) {
      return { ok: false, code: "INVALID_ORDER_STATUS_TRANSITION" };
    }

    await db
      .update(ordersTable)
      .set({ status: nextStatus })
      .where(eq(ordersTable.id, orderId));

    order.status = nextStatus;
    return { ok: true, order };
  }

  async cancelOrder(
    orderId: number,
    input: { actorUserId: string; actorRoles: readonly Role[]; reason?: string },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_CANCEL_FORBIDDEN"
          | "ORDER_STATUS_NOT_CANCELLABLE";
      }
  > {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };

    if (
      order.status === "pending" ||
      order.status === "completed" ||
      order.status === "cancelled"
    ) {
      return { ok: false, code: "ORDER_STATUS_NOT_CANCELLABLE" };
    }

    if (!canCancelOrder(order, input.actorUserId, input.actorRoles)) {
      return { ok: false, code: "ORDER_CANCEL_FORBIDDEN" };
    }

    const cancelledAt = new Date().toISOString();
    const cancelReason = (input.reason ?? "").trim();

    await db
      .update(ordersTable)
      .set({
        status: "cancelled",
        cancelReason,
        cancelledBy: input.actorUserId,
        cancelledAt: new Date(cancelledAt),
      })
      .where(eq(ordersTable.id, orderId));

    order.status = "cancelled";
    order.cancelReason = cancelReason;
    order.cancelledBy = input.actorUserId;
    order.cancelledAt = cancelledAt;

    return { ok: true, order };
  }

  private async seedFromJsonIfEmpty(): Promise<void> {
    const [countRow] = await db
      .select({ value: sql<number>`count(*)` })
      .from(menuItemsTable);

    if (Number(countRow?.value ?? 0) > 0) return;

    const file = Bun.file(this.dataFilePath);
    if (!(await file.exists())) return;

    const parsed = JSON.parse(await file.text()) as SeedData;
    const menu = Array.isArray(parsed.menu) ? parsed.menu : [];

    if (menu.length > 0) {
      await db.insert(menuItemsTable).values(
        menu.map((item, index) => {
          const logicalId =
            typeof item.id === "number"
              ? String(item.id).padStart(3, "0")
              : item.id?.includes("-")
                ? item.id.split("-")[0]!
                : item.id ?? String(index + 1).padStart(3, "0");

          return {
            id: `${logicalId}-01`,
            entityId: crypto.randomUUID(),
            logicalId,
            version: 1,
            name: item.name,
            price: item.price,
            category: item.category,
            description: item.description,
            imageUrl: item.image_url,
            isCurrentVersion: true,
            changeReason: "Initial seed",
            createdBy: "system",
          };
        }),
      );
    }

    // V10: 不再播 orders seed data（orders 的 user_id FK 指向 Better Auth user 表，
    // seed JSON 中的舊 userId 在 bf_v10.user 不存在，強制播入會觸發 FK violation）
  }

  private async reloadFromDatabase(): Promise<void> {
    const menuRows = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.isCurrentVersion, true))
      .orderBy(asc(menuItemsTable.id));

    const orderRows = await db
      .select()
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));

    const orderItemRows = await db
      .select({
        id: orderItemsTable.id,
        orderId: orderItemsTable.orderId,
        menuItemId: orderItemsTable.menuItemId,
        qty: orderItemsTable.qty,
        menuId: menuItemsTable.id,
        entityId: menuItemsTable.entityId,
        logicalId: menuItemsTable.logicalId,
        version: menuItemsTable.version,
        name: menuItemsTable.name,
        price: menuItemsTable.price,
        category: menuItemsTable.category,
        description: menuItemsTable.description,
        imageUrl: menuItemsTable.imageUrl,
        isCurrentVersion: menuItemsTable.isCurrentVersion,
        supersedes: menuItemsTable.supersedes,
        changeReason: menuItemsTable.changeReason,
        createdAt: menuItemsTable.createdAt,
        createdBy: menuItemsTable.createdBy,
      })
      .from(orderItemsTable)
      .innerJoin(
        menuItemsTable,
        eq(orderItemsTable.menuItemId, menuItemsTable.id),
      )
      .orderBy(asc(orderItemsTable.id));

    this.menu = menuRows.map(toMenuItem);

    const itemsByOrderId = new Map<number, OrderItem[]>();
    for (const row of orderItemRows) {
      const items = itemsByOrderId.get(row.orderId) ?? [];
      items.push({
        item: {
          id: row.menuId,
          entityId: row.entityId,
          logicalId: row.logicalId,
          version: row.version,
          name: row.name,
          price: row.price,
          category: row.category,
          description: row.description,
          image_url: row.imageUrl,
          isCurrentVersion: row.isCurrentVersion,
          supersedes: row.supersedes,
          changeReason: row.changeReason,
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : new Date(row.createdAt).toISOString(),
          createdBy: row.createdBy,
        },
        qty: row.qty,
      });
      itemsByOrderId.set(row.orderId, items);
    }

    this.orders = orderRows.map((row) => ({
      id: row.id,
      userId: row.userId,
      items: itemsByOrderId.get(row.id) ?? [],
      total: row.total,
      status: normalizeOrderStatus(row.status),
      customerNote: row.customerNote ?? "",
      cancelReason: row.cancelReason ?? "",
      cancelledBy: row.cancelledBy,
      cancelledAt: row.cancelledAt
        ? row.cancelledAt instanceof Date
          ? row.cancelledAt.toISOString()
          : new Date(row.cancelledAt).toISOString()
        : undefined,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString(),
      submittedAt: row.submittedAt
        ? row.submittedAt instanceof Date
          ? row.submittedAt.toISOString()
          : new Date(row.submittedAt).toISOString()
        : undefined,
    }));
  }
}
