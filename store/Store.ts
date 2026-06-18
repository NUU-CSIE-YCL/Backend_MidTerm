import type { MenuItem, Order, OrderStatus, Role } from "../shared/contracts.ts";

export type UpdateOrderItemErrorCode =
  | "ORDER_NOT_FOUND"
  | "MENU_ITEM_NOT_FOUND"
  | "MENU_ITEM_NOT_CURRENT"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE";

export type SubmitOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE"
  | "EMPTY_ORDER"
  | "MENU_ITEM_NOT_CURRENT";

export type UpdateOrderStatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_STATUS_NOT_EDITABLE"
  | "INVALID_ORDER_STATUS_TRANSITION";

export type CancelOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_CANCEL_FORBIDDEN"
  | "ORDER_STATUS_NOT_CANCELLABLE";

export type RefundOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_REFUND_FORBIDDEN"
  | "ORDER_NOT_REFUNDABLE";

export type ReopenOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_REOPEN_FORBIDDEN"
  | "ORDER_NOT_REOPENABLE";

export interface Store {
  init(): Promise<void>;

  getMenu(): ReadonlyArray<MenuItem>;
  getAdminMenu(): ReadonlyArray<MenuItem>;
  createMenuItem(input: {
    logical_id?: string;
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
    sale_price?: number | null;
    promotion_label?: string;
    display_order?: number;
    is_sold_out?: boolean;
    is_hidden?: boolean;
    change_reason?: string;
  }): Promise<MenuItem>;
  updateMenuItem(
    menuId: string,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      image_url?: string;
      sale_price?: number | null;
      promotion_label?: string;
      is_sold_out?: boolean;
      is_hidden?: boolean;
      change_reason?: string;
    },
  ): Promise<MenuItem | null>;
  deleteMenuItem(menuId: string): Promise<MenuItem | null>;
  reorderMenu(
    items: Array<{ id: string; displayOrder: number }>,
  ): Promise<ReadonlyArray<MenuItem> | null>;
  getMenuHistory(menuId: string): Promise<ReadonlyArray<MenuItem>>;

  getOrders(): ReadonlyArray<Order>;
  getWorkbenchOrders(): ReadonlyArray<Order>;
  getCurrentOrderByUserId(userId: string): Order | undefined;
  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order>;
  getOrderById(orderId: number): Order | undefined;
  createOrder(input: { userId: string }): Promise<Order>;
  updateOrderItem(
    orderId: number,
    input: {
      userId: string;
      itemId: string;
      qty: number;
    },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: UpdateOrderItemErrorCode }
  >;
  submitOrder(
    orderId: number,
    input: { userId: string; customerNote?: string },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: SubmitOrderErrorCode }
  >;
  updateOrderStatus(
    orderId: number,
    nextStatus: Exclude<OrderStatus, "pending" | "submitted" | "cancelled">,
    input: { actorUserId: string },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderStatusErrorCode }
  >;
  cancelOrder(
    orderId: number,
    input: {
      actorUserId: string;
      actorRoles: readonly Role[];
      reason?: string;
    },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: CancelOrderErrorCode }
  >;
  refundOrder(
    orderId: number,
    input: {
      actorUserId: string;
      actorRoles: readonly Role[];
      reason?: string;
    },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: RefundOrderErrorCode }
  >;
  reopenOrder(
    orderId: number,
    input: {
      actorUserId: string;
      actorRoles: readonly Role[];
      reason?: string;
    },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: ReopenOrderErrorCode }
  >;
}
