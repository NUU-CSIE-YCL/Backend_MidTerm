import { mkdir, rename } from "node:fs/promises";
import type {
  MenuExperiment,
  MenuExperimentDetail,
  MenuExperimentExposure,
  MenuItem,
  MenuPriceAnalysis,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Role,
  MenuVersionLevel,
} from "../../shared/contracts.ts";
import {
  buildMenuExperimentDetail,
  buildMenuExperiments,
} from "../../shared/menu-experiment-analytics.ts";
import { attachMenuSalesStats } from "../../shared/menu-sales-stats.ts";
import type { Store } from "../Store.ts";

interface StoredUser {
  id: string;
  email: string;
  name: string;
  password: string;
}

interface DataStore {
  users: StoredUser[];
  menu: MenuItem[];
  orders: Order[];
  menuExperimentExposures: MenuExperimentExposure[];
  userIdCounter: number;
  menuIdCounter: number;
  orderIdCounter: number;
}

interface JsonFileStoreOptions {
  dataFilePath: string;
}

const defaultMenu: MenuItem[] = [
  createInitialMenuItem("001", "火腿蛋吐司", 40, "餐點", "現煎雞蛋搭配火腿與生菜，使用微烤白吐司，口感清爽不油膩。", "/imgs/menu/ham-egg-toast.webp"),
  createInitialMenuItem("002", "起司豬排堡", 65, "餐點", "厚切豬排搭配起司與生菜，外酥內嫩，適合喜歡有咬勁的你。", "/imgs/menu/cheese-pork-burger.webp"),
  createInitialMenuItem("003", "鮪魚蛋吐司", 45, "餐點", "自調鮪魚沙拉配上煎蛋與生菜，口味濃郁但不會太鹹。", "/imgs/menu/tuna-egg-toast.webp"),
  createInitialMenuItem("004", "培根蛋餅", 45, "餐點", "煎到微酥的蛋餅皮包裹煙燻培根與雞蛋，是經典台式早餐選擇。", "/imgs/menu/bacon-egg-roll.webp"),
];

function cloneDefaultMenu(): MenuItem[] {
  return defaultMenu.map((item) => ({ ...item }));
}

function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, orderItem) => {
    const unitPrice = orderItem.item.salePrice ?? orderItem.item.price;
    const addonPrice = orderItem.addEgg ? 15 : 0;
    return sum + (unitPrice + addonPrice) * orderItem.qty;
  }, 0);
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

function normalizePaymentStatus(value: unknown): PaymentStatus {
  return value === "paid" || value === "refunded" ? value : "unpaid";
}

function compareMenuItems(a: MenuItem, b: MenuItem): number {
  return a.displayOrder - b.displayOrder || a.id.localeCompare(b.id);
}

function normalizeSalePrice(
  salePrice: number | null | undefined,
  price: number,
): number | null {
  if (salePrice === undefined || salePrice === null) return null;
  if (!Number.isInteger(salePrice) || salePrice <= 0 || salePrice >= price) {
    throw new Error("SALE_PRICE_INVALID");
  }
  return salePrice;
}

function normalizeExistingSalePrice(
  salePrice: number | null | undefined,
  price: number,
): number | null {
  return salePrice === undefined || salePrice === null
    ? null
    : normalizeSalePrice(salePrice, price);
}

function getEffectiveMenuPrice(item: MenuItem): number {
  return item.salePrice ?? item.price;
}

function createPriceAnalysisVersion(
  version: MenuItem,
  orders: readonly Order[],
): MenuPriceAnalysis["versions"][number] {
  const orderIds = new Set<number>();
  let quantitySold = 0;
  let revenue = 0;

  for (const order of orders) {
    if (order.status === "pending") continue;

    for (const orderItem of order.items) {
      if (orderItem.item.id !== version.id) continue;
      orderIds.add(order.id);
      quantitySold += orderItem.qty;
      revenue += getEffectiveMenuPrice(orderItem.item) * orderItem.qty;
    }
  }

  return {
    id: version.id,
    logicalId: version.logicalId,
    version: version.version,
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
    price: version.price,
    salePrice: version.salePrice,
    orderCount: orderIds.size,
    quantitySold,
    revenue,
    averageUnitPrice: quantitySold > 0 ? Math.round(revenue / quantitySold) : 0,
    isCurrentVersion: version.isCurrentVersion,
  };
}

function canUseCounterService(actorRoles: readonly Role[]): boolean {
  return actorRoles.some((role) =>
    role === "staff" || role === "owner" || role === "admin",
  );
}

function canCancelOrder(order: Order, actorUserId: string, actorRoles: readonly Role[]): boolean {
  const canCancelOperationalOrder = canUseCounterService(actorRoles);

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

function createInitialMenuItem(
  logicalId: string,
  name: string,
  price: number,
  category: string,
  description: string,
  image_url: string,
): MenuItem {
  return {
    id: `${logicalId}-01`,
    entityId: `json-${logicalId}`,
    logicalId,
    version: 1,
    name,
    price,
    salePrice: null,
    promotionLabel: "",
    majorVersion: 1,
    minorVersion: 0,
    versionNote: "",
    category,
    description,
    image_url,
    displayOrder: Number.parseInt(logicalId, 10) || 0,
    isSoldOut: false,
    isHidden: false,
    experimentKey: "",
    experimentVariant: "",
    purchaseCountToday: 0,
    purchaseCountThisWeek: 0,
    isCurrentVersion: true,
    changeReason: "Initial seed",
    createdAt: new Date(0).toISOString(),
    createdBy: "system",
  };
}

function normalizeLogicalId(rawId: unknown, fallback = 1): string {
  if (typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) {
    return String(rawId).padStart(3, "0");
  }

  if (typeof rawId === "string" && rawId.trim() !== "") {
    const trimmed = rawId.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed.padStart(3, "0");
    }
    return trimmed.includes("-") ? trimmed.split("-")[0]! : trimmed;
  }

  return String(fallback).padStart(3, "0");
}

function normalizeMenuItem(
  item: Partial<MenuItem> & { id?: string | number },
  fallback = 1,
): MenuItem {
  const logicalId = item.logicalId ?? normalizeLogicalId(item.id, fallback);
  const version = item.version ?? 1;
  const id =
    typeof item.id === "string" && item.id.includes("-")
      ? item.id
      : `${logicalId}-${String(version).padStart(2, "0")}`;

  return {
    id,
    entityId: item.entityId ?? `json-${logicalId}`,
    logicalId,
    version,
    majorVersion:
      typeof item.majorVersion === "number" && Number.isFinite(item.majorVersion)
        ? item.majorVersion
        : 1,
    minorVersion:
      typeof item.minorVersion === "number" && Number.isFinite(item.minorVersion)
        ? item.minorVersion
        : 0,
    versionNote: typeof item.versionNote === "string" ? item.versionNote : "",
    name: item.name ?? "",
    price: item.price ?? 0,
    salePrice:
      typeof item.salePrice === "number" && Number.isFinite(item.salePrice)
        ? item.salePrice
        : null,
    promotionLabel:
      typeof item.promotionLabel === "string" ? item.promotionLabel : "",
    category: item.category ?? "",
    description: item.description ?? "",
    image_url: item.image_url ?? "",
    displayOrder:
      typeof item.displayOrder === "number" && Number.isFinite(item.displayOrder)
        ? item.displayOrder
        : fallback,
    isSoldOut: item.isSoldOut ?? false,
    isHidden: item.isHidden ?? false,
    experimentKey:
      typeof item.experimentKey === "string" ? item.experimentKey : "",
    experimentVariant:
      typeof item.experimentVariant === "string" ? item.experimentVariant : "",
    purchaseCountToday:
      typeof item.purchaseCountToday === "number" ? item.purchaseCountToday : 0,
    purchaseCountThisWeek:
      typeof item.purchaseCountThisWeek === "number"
        ? item.purchaseCountThisWeek
        : 0,
    isCurrentVersion: item.isCurrentVersion ?? true,
    supersedes: item.supersedes,
    changeReason: item.changeReason,
    createdAt: item.createdAt ?? new Date().toISOString(),
    createdBy: item.createdBy ?? "system",
  };
}

function normalizeUserId(rawId: unknown): string {
  if (typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) {
    return String(rawId).padStart(4, "0");
  }

  if (typeof rawId === "string" && rawId.trim() !== "") {
    const trimmed = rawId.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed.padStart(4, "0");
    }
    return trimmed;
  }

  return "0001";
}

function normalizeUser(user: Partial<StoredUser>): StoredUser {
  return {
    id: normalizeUserId(user.id),
    email: user.email ?? "",
    name: user.name ?? "",
    password: user.password ?? "",
  };
}

const defaultUsers: StoredUser[] = [
  {
    id: "0001",
    email: "demo@example.com",
    name: "示範使用者",
    password: "1234",
  },
  {
    id: "0002",
    email: "amy@example.com",
    name: "Amy",
    password: "1234",
  },
];

function cloneDefaultUsers(): StoredUser[] {
  return defaultUsers.map((user) => ({ ...user }));
}

export class JsonFileStore implements Store {
  private readonly dataFilePath: string;

  private users: StoredUser[] = [];
  private menu: MenuItem[] = [];
  private orders: Order[] = [];
  private menuExperimentExposures: MenuExperimentExposure[] = [];
  private userIdCounter = 0;
  private menuIdCounter = 0;
  private orderIdCounter = 0;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(options: JsonFileStoreOptions) {
    this.dataFilePath = options.dataFilePath;
  }

  async init(): Promise<void> {
    const file = Bun.file(this.dataFilePath);

    if (!(await file.exists())) {
      const initialStore = this.createInitialStore();
      this.applyStore(initialStore);
      await this.saveStore(initialStore);
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Partial<DataStore>;

      if (!Array.isArray(parsed.menu) || !Array.isArray(parsed.orders)) {
        throw new Error("Invalid store schema");
      }

      const normalizedUsers = Array.isArray(parsed.users)
        ? parsed.users.map((user) => normalizeUser(user))
        : cloneDefaultUsers();

      const fallbackUserId = normalizedUsers[0]?.id ?? "0001";

      this.applyStore({
        users: normalizedUsers,
        menu: parsed.menu.map((item, index) =>
          normalizeMenuItem(item, index + 1),
        ),
        orders: parsed.orders.map((order) => ({
          ...order,
          userId: normalizeUserId(order.userId ?? fallbackUserId),
          customerNote:
            typeof order.customerNote === "string" ? order.customerNote : "",
          pickupTime:
            typeof order.pickupTime === "string" ? order.pickupTime : "",
          paymentStatus: normalizePaymentStatus(order.paymentStatus),
          paidBy:
            typeof order.paidBy === "string" ? order.paidBy : null,
          paidAt:
            typeof order.paidAt === "string" ? order.paidAt : undefined,
          refundReason:
            typeof order.refundReason === "string" ? order.refundReason : "",
          refundedBy:
            typeof order.refundedBy === "string" ? order.refundedBy : null,
          refundedAt:
            typeof order.refundedAt === "string" ? order.refundedAt : undefined,
          cancelReason:
            typeof order.cancelReason === "string" ? order.cancelReason : "",
          cancelledBy:
            typeof order.cancelledBy === "string" ? order.cancelledBy : null,
          cancelledAt:
            typeof order.cancelledAt === "string" ? order.cancelledAt : undefined,
          items: order.items.map((orderItem) => ({
            ...orderItem,
            item: normalizeMenuItem(orderItem.item),
            addEgg: orderItem.addEgg === true,
          })),
          status: normalizeOrderStatus(order.status),
          submittedAt:
            normalizeOrderStatus(order.status) !== "pending"
              ? order.submittedAt
              : undefined,
        })),
        menuExperimentExposures: Array.isArray(
          parsed.menuExperimentExposures,
        )
          ? parsed.menuExperimentExposures
              .filter(
                (exposure): exposure is MenuExperimentExposure =>
                  typeof exposure.visitorKey === "string" &&
                  typeof exposure.experimentKey === "string" &&
                  typeof exposure.experimentVariant === "string" &&
                  typeof exposure.menuItemId === "string",
              )
              .map((exposure, index) => ({
                id:
                  typeof exposure.id === "number" && exposure.id > 0
                    ? exposure.id
                    : index + 1,
                visitorKey: exposure.visitorKey,
                experimentKey: exposure.experimentKey,
                experimentVariant: exposure.experimentVariant,
                menuItemId: exposure.menuItemId,
                exposedAt:
                  typeof exposure.exposedAt === "string"
                    ? exposure.exposedAt
                    : new Date(0).toISOString(),
              }))
          : [],
        userIdCounter: parsed.userIdCounter ?? 0,
        menuIdCounter: parsed.menuIdCounter ?? 0,
        orderIdCounter: parsed.orderIdCounter ?? 0,
      });
    } catch (error) {
      console.warn("[store] load failed, fallback to initial store", error);
      const initialStore = this.createInitialStore();
      this.applyStore(initialStore);
      await this.saveStore(initialStore);
    }
  }

  getMenu(): ReadonlyArray<MenuItem> {
    return attachMenuSalesStats(
      this.menu
        .filter((item) => item.isCurrentVersion && !item.isHidden)
        .sort(compareMenuItems),
      this.orders,
    );
  }

  getAdminMenu(): ReadonlyArray<MenuItem> {
    return attachMenuSalesStats(
      this.menu.filter((item) => item.isCurrentVersion).sort(compareMenuItems),
      this.orders,
    );
  }

  async createMenuItem(input: {
    logical_id?: string;
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
    sale_price?: number | null;
    promotion_label?: string;
    version_note?: string;
    experiment_key?: string;
    experiment_variant?: string;
    display_order?: number;
    is_sold_out?: boolean;
    is_hidden?: boolean;
    change_reason?: string;
  }): Promise<MenuItem> {
    const logicalId =
      input.logical_id ?? String(++this.menuIdCounter).padStart(3, "0");
    const newMenuItem: MenuItem = {
      id: `${logicalId}-01`,
      entityId: crypto.randomUUID(),
      logicalId,
      version: 1,
      majorVersion: 1,
      minorVersion: 0,
      versionNote: input.version_note?.trim() ?? "",
      name: input.name,
      price: input.price,
      salePrice: normalizeSalePrice(input.sale_price, input.price),
      promotionLabel: input.promotion_label?.trim() ?? "",
      category: input.category,
      description: input.description,
      image_url: input.image_url,
      displayOrder: input.display_order ?? this.nextDisplayOrder(),
      isSoldOut: input.is_sold_out ?? false,
      isHidden: input.is_hidden ?? false,
      experimentKey: input.experiment_key?.trim() ?? "",
      experimentVariant: input.experiment_variant?.trim() ?? "",
      isCurrentVersion: true,
      changeReason: input.change_reason ?? "Initial creation",
      createdAt: new Date().toISOString(),
      createdBy: "system",
    };

    this.menu.push(newMenuItem);
    await this.persist();

    return newMenuItem;
  }

  async updateMenuItem(
    menuId: string,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      image_url?: string;
      sale_price?: number | null;
      promotion_label?: string;
      version_level?: MenuVersionLevel;
      version_note?: string;
      experiment_key?: string;
      experiment_variant?: string;
      is_sold_out?: boolean;
      is_hidden?: boolean;
      change_reason?: string;
    },
  ): Promise<MenuItem | null> {
    const current = this.findCurrentMenuItem(menuId);
    if (!current) {
      return null;
    }

    current.isCurrentVersion = false;

    const nextVersion = current.version + 1;
    const versionLevel = patch.version_level ?? "minor";
    const nextMajorVersion =
      versionLevel === "major" ? current.majorVersion + 1 : current.majorVersion;
    const nextMinorVersion =
      versionLevel === "major" ? 0 : current.minorVersion + 1;
    const nextPrice = patch.price ?? current.price;
    const nextSalePrice =
      patch.sale_price === undefined
        ? normalizeExistingSalePrice(current.salePrice, nextPrice)
        : normalizeSalePrice(patch.sale_price, nextPrice);
    const nextMenuItem: MenuItem = {
      ...current,
      id: `${current.logicalId}-${String(nextVersion).padStart(2, "0")}`,
      version: nextVersion,
      majorVersion: nextMajorVersion,
      minorVersion: nextMinorVersion,
      versionNote:
        patch.version_note !== undefined
          ? patch.version_note.trim()
          : current.versionNote,
      name: patch.name ?? current.name,
      price: nextPrice,
      salePrice: nextSalePrice,
      promotionLabel:
        patch.promotion_label !== undefined
          ? patch.promotion_label.trim()
          : current.promotionLabel,
      category: patch.category ?? current.category,
      description: patch.description ?? current.description,
      image_url: patch.image_url ?? current.image_url,
      displayOrder: current.displayOrder,
      isSoldOut: patch.is_sold_out ?? current.isSoldOut,
      isHidden: patch.is_hidden ?? current.isHidden,
      experimentKey:
        patch.experiment_key !== undefined
          ? patch.experiment_key.trim()
          : current.experimentKey,
      experimentVariant:
        patch.experiment_variant !== undefined
          ? patch.experiment_variant.trim()
          : current.experimentVariant,
      isCurrentVersion: true,
      supersedes: current.id,
      changeReason: patch.change_reason ?? "Menu item updated",
      createdAt: new Date().toISOString(),
      createdBy: "system",
    };

    this.menu.push(nextMenuItem);

    await this.persist();

    return nextMenuItem;
  }

  async deleteMenuItem(menuId: string): Promise<MenuItem | null> {
    const menuItem = this.findCurrentMenuItem(menuId);
    if (!menuItem) {
      return null;
    }

    menuItem.isCurrentVersion = false;
    menuItem.changeReason = menuItem.changeReason ?? "Retired from current menu";
    await this.persist();

    return menuItem;
  }

  async reorderMenu(
    items: Array<{ id: string; displayOrder: number }>,
  ): Promise<ReadonlyArray<MenuItem> | null> {
    const currentItems = this.menu.filter((item) => item.isCurrentVersion);
    const currentById = new Map(currentItems.map((item) => [item.id, item]));

    for (const item of items) {
      const target = currentById.get(item.id);
      if (!target) return null;
    }

    for (const item of items) {
      const target = currentById.get(item.id);
      if (target) target.displayOrder = item.displayOrder;
    }

    this.sortMenu();
    await this.persist();

    return this.getMenu();
  }

  async getMenuHistory(menuId: string): Promise<ReadonlyArray<MenuItem>> {
    const target = this.menu.find(
      (item) => item.logicalId === menuId || item.id === menuId,
    );
    if (!target) return [];

    return this.menu
      .filter((item) => item.logicalId === target.logicalId)
      .sort((a, b) => b.version - a.version);
  }

  async getMenuPriceAnalysis(menuId: string): Promise<MenuPriceAnalysis | null> {
    const target = this.menu.find(
      (item) => item.logicalId === menuId || item.id === menuId,
    );
    if (!target) return null;

    const versions = this.menu
      .filter((item) => item.logicalId === target.logicalId)
      .sort((a, b) => b.version - a.version);
    const versionRows = versions.map((version) =>
      createPriceAnalysisVersion(version, this.orders),
    );

    return {
      logicalId: target.logicalId,
      name: target.name,
      totalOrderCount: versionRows.reduce((sum, row) => sum + row.orderCount, 0),
      totalQuantitySold: versionRows.reduce(
        (sum, row) => sum + row.quantitySold,
        0,
      ),
      totalRevenue: versionRows.reduce((sum, row) => sum + row.revenue, 0),
      versions: versionRows,
    };
  }

  getMenuExperiments(): ReadonlyArray<MenuExperiment> {
    return buildMenuExperiments(
      this.menu,
      this.orders,
      this.menuExperimentExposures,
    );
  }

  getMenuExperimentDetail(
    experimentKey: string,
  ): MenuExperimentDetail | undefined {
    return buildMenuExperimentDetail(
      experimentKey,
      this.menu,
      this.orders,
      this.menuExperimentExposures,
    );
  }

  async recordMenuExperimentExposures(
    visitorKey: string,
    menuItems: readonly MenuItem[],
  ): Promise<ReadonlyArray<MenuExperimentExposure>> {
    const now = new Date().toISOString();
    const created: MenuExperimentExposure[] = [];

    for (const item of menuItems) {
      if (!item.experimentKey || !item.experimentVariant) continue;
      const exists = this.menuExperimentExposures.some(
        (exposure) =>
          exposure.visitorKey === visitorKey &&
          exposure.experimentKey === item.experimentKey &&
          exposure.experimentVariant === item.experimentVariant &&
          exposure.menuItemId === item.id,
      );
      if (exists) continue;

      const exposure: MenuExperimentExposure = {
        id: this.menuExperimentExposures.length + created.length + 1,
        visitorKey,
        experimentKey: item.experimentKey,
        experimentVariant: item.experimentVariant,
        menuItemId: item.id,
        exposedAt: now,
      };
      created.push(exposure);
    }

    if (created.length === 0) return [];
    this.menuExperimentExposures.push(...created);
    await this.persist();
    return created;
  }

  getOrders(): ReadonlyArray<Order> {
    return this.orders;
  }

  getWorkbenchOrders(): ReadonlyArray<Order> {
    return this.orders
      .filter((order) => order.status !== "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    const pendingOrders = this.orders.filter(
      (order) => order.userId === userId && order.status === "pending",
    );

    if (pendingOrders.length === 0) {
      return undefined;
    }

    // 取最新 pending（id 越大越新），避免拿到舊的空購物車訂單。
    return pendingOrders.reduce((latest, current) =>
      current.id > latest.id ? current : latest,
    );
  }

  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order> {
    return this.orders
      .filter((order) => order.userId === userId && order.status !== "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrderById(orderId: number): Order | undefined {
    return this.orders.find((order) => order.id === orderId);
  }

  async createOrder(input: { userId: string }): Promise<Order> {
    const existingOrder = this.getCurrentOrderByUserId(input.userId);
    if (existingOrder) {
      return existingOrder;
    }

    const newOrder: Order = {
      id: ++this.orderIdCounter,
      userId: input.userId,
      items: [],
      total: 0,
      status: "pending",
      paymentStatus: "unpaid",
      paidBy: null,
      refundReason: "",
      refundedBy: null,
      customerNote: "",
      pickupTime: "",
      cancelReason: "",
      cancelledBy: null,
      createdAt: new Date().toISOString(),
    };

    this.orders.push(newOrder);
    await this.persist();

    return newOrder;
  }

  async updateOrderItem(
    orderId: number,
    input: {
      userId: string;
      itemId: string;
      qty: number;
      addEgg?: boolean;
    },
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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    const existingItemIndex = order.items.findIndex(
      (orderItem) => orderItem.item.id === input.itemId,
    );

    if (input.qty === 0) {
      if (existingItemIndex !== -1) {
        order.items.splice(existingItemIndex, 1);
      }
      order.total = calculateOrderTotal(order.items);
      await this.persist();

      return { ok: true, order };
    }

    const menuItem = this.menu.find((item) => item.id === input.itemId);
    if (!menuItem) {
      return { ok: false, code: "MENU_ITEM_NOT_FOUND" };
    }
    if (!menuItem.isCurrentVersion || menuItem.isSoldOut || menuItem.isHidden) {
      return { ok: false, code: "MENU_ITEM_NOT_CURRENT" };
    }

    if (existingItemIndex !== -1) {
      const existingOrderItem = order.items[existingItemIndex];

      if (existingOrderItem) {
        existingOrderItem.qty = input.qty;
        existingOrderItem.addEgg = input.addEgg ?? false;
      }
    } else {
      order.items.push({
        item: menuItem,
        qty: input.qty,
        addEgg: input.addEgg ?? false,
      });
    }

    order.total = calculateOrderTotal(order.items);
    await this.persist();

    return { ok: true, order };
  }

  async submitOrder(
    orderId: number,
    input: { userId: string; customerNote?: string; pickupTime?: string },
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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    if (order.items.length === 0) {
      return { ok: false, code: "EMPTY_ORDER" };
    }

    const hasOutdatedItem = order.items.some((orderItem) => {
      const latest = this.menu.find((item) => item.id === orderItem.item.id);
      return !latest?.isCurrentVersion || latest.isSoldOut || latest.isHidden;
    });
    if (hasOutdatedItem) {
      return { ok: false, code: "MENU_ITEM_NOT_CURRENT" };
    }

    order.status = "submitted";
    order.customerNote = (input.customerNote ?? "").trim();
    order.pickupTime = (input.pickupTime ?? "").trim();
    order.submittedAt = new Date().toISOString();
    await this.persist();

    return { ok: true, order };
  }

  async updateOrderStatus(
    orderId: number,
    nextStatus: Exclude<OrderStatus, "pending" | "submitted" | "cancelled">,
    input: { actorUserId: string },
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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.status === "pending" || order.status === "completed") {
      return { ok: false, code: "ORDER_STATUS_NOT_EDITABLE" };
    }

    if (!isValidWorkbenchTransition(order.status, nextStatus)) {
      return { ok: false, code: "INVALID_ORDER_STATUS_TRANSITION" };
    }

    order.status = nextStatus;
    if (nextStatus === "completed") {
      order.paymentStatus = "paid";
      order.paidBy = input.actorUserId;
      order.paidAt = new Date().toISOString();
    }
    await this.persist();

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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

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

    order.status = "cancelled";
    order.cancelReason = (input.reason ?? "").trim();
    order.cancelledBy = input.actorUserId;
    order.cancelledAt = new Date().toISOString();
    await this.persist();

    return { ok: true, order };
  }

  async refundOrder(
    orderId: number,
    input: { actorUserId: string; actorRoles: readonly Role[]; reason?: string },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_REFUND_FORBIDDEN"
          | "ORDER_NOT_REFUNDABLE";
      }
  > {
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (!canUseCounterService(input.actorRoles)) {
      return { ok: false, code: "ORDER_REFUND_FORBIDDEN" };
    }

    if (order.status !== "completed" || order.paymentStatus !== "paid") {
      return { ok: false, code: "ORDER_NOT_REFUNDABLE" };
    }

    order.paymentStatus = "refunded";
    order.refundReason = (input.reason ?? "").trim();
    order.refundedBy = input.actorUserId;
    order.refundedAt = new Date().toISOString();
    await this.persist();

    return { ok: true, order };
  }

  async reopenOrder(
    orderId: number,
    input: { actorUserId: string; actorRoles: readonly Role[]; reason?: string },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_REOPEN_FORBIDDEN"
          | "ORDER_NOT_REOPENABLE";
      }
  > {
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (!canUseCounterService(input.actorRoles)) {
      return { ok: false, code: "ORDER_REOPEN_FORBIDDEN" };
    }

    if (order.status !== "cancelled") {
      return { ok: false, code: "ORDER_NOT_REOPENABLE" };
    }

    order.status = "submitted";
    order.paymentStatus = "unpaid";
    order.cancelReason = "";
    order.cancelledBy = null;
    order.cancelledAt = undefined;
    order.submittedAt = new Date().toISOString();
    await this.persist();

    return { ok: true, order };
  }

  private createInitialStore(): DataStore {
    return {
      users: cloneDefaultUsers(),
      menu: cloneDefaultMenu(),
      orders: [],
      menuExperimentExposures: [],
      userIdCounter: defaultUsers.length,
      menuIdCounter: defaultMenu.length,
      orderIdCounter: 0,
    };
  }

  private applyStore(store: DataStore): void {
    this.users = store.users;
    this.menu = store.menu;
    this.orders = store.orders;
    this.menuExperimentExposures = store.menuExperimentExposures;
    this.sortMenu();

    const maxUserId = this.users.reduce((max, user) => {
      const asNumber = Number.parseInt(user.id, 10);
      return Number.isFinite(asNumber) ? Math.max(max, asNumber) : max;
    }, 0);

    const maxMenuId = this.menu.reduce((max, item) => {
      const asNumber = Number.parseInt(item.logicalId, 10);
      return Number.isFinite(asNumber) ? Math.max(max, asNumber) : max;
    }, 0);
    const maxOrderId = this.orders.reduce(
      (max, order) => Math.max(max, order.id),
      0,
    );

    this.userIdCounter = Math.max(store.userIdCounter || 0, maxUserId);
    this.menuIdCounter = Math.max(store.menuIdCounter || 0, maxMenuId);
    this.orderIdCounter = Math.max(store.orderIdCounter || 0, maxOrderId);
  }

  private sortMenu(): void {
    this.menu.sort(compareMenuItems);
  }

  private nextDisplayOrder(): number {
    return (
      this.menu
        .filter((item) => item.isCurrentVersion)
        .reduce((max, item) => Math.max(max, item.displayOrder), 0) + 1
    );
  }

  private buildStoreSnapshot(): DataStore {
    return {
      users: this.users,
      menu: this.menu,
      orders: this.orders,
      menuExperimentExposures: this.menuExperimentExposures,
      userIdCounter: this.userIdCounter,
      menuIdCounter: this.menuIdCounter,
      orderIdCounter: this.orderIdCounter,
    };
  }

  private async saveStore(snapshot: DataStore): Promise<void> {
    await mkdir("./data", { recursive: true });
    const tmpPath = `${this.dataFilePath}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(snapshot, null, 2));
    await rename(tmpPath, this.dataFilePath);
  }

  private async persist(): Promise<void> {
    const snapshot = this.buildStoreSnapshot();

    this.persistQueue = this.persistQueue.then(async () => {
      await this.saveStore(snapshot);
    });

    await this.persistQueue;
  }

  private findCurrentMenuItem(idOrLogicalId: string): MenuItem | undefined {
    const byLogicalId = this.menu.find(
      (item) => item.logicalId === idOrLogicalId && item.isCurrentVersion,
    );
    if (byLogicalId) return byLogicalId;

    const byVersionId = this.menu.find((item) => item.id === idOrLogicalId);
    if (!byVersionId) return undefined;

    return this.menu.find(
      (item) =>
        item.logicalId === byVersionId.logicalId && item.isCurrentVersion,
    );
  }
}
