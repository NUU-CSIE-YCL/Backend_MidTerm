import type { MenuItem, Order, OrderStatus } from "../shared/contracts.ts";

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

export interface Store {
  init(): Promise<void>;

  getMenu(): ReadonlyArray<MenuItem>;
  createMenuItem(input: {
    logical_id?: string;
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
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
      change_reason?: string;
    },
  ): Promise<MenuItem | null>;
  deleteMenuItem(menuId: string): Promise<MenuItem | null>;
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
    input: { userId: string },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: SubmitOrderErrorCode }
  >;
  updateOrderStatus(
    orderId: number,
    nextStatus: Exclude<OrderStatus, "pending" | "submitted">,
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderStatusErrorCode }
  >;
}
