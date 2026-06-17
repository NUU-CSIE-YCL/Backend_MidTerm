import type { SessionUser } from "./contracts.ts";
import { hasAnyRole } from "./guards.ts";

const orderViewerRoles = [
  "staff",
  "chef",
  "owner",
  "admin",
] as const;

export const PICKUP_BOARD_REFRESH_INTERVAL_MS = 10_000;
export const WORKBENCH_REFRESH_INTERVAL_MS = 10_000;
export const CUSTOMER_ORDER_REFRESH_INTERVAL_MS = 15_000;

export interface AutoRefreshTargets {
  pickupBoard: true;
  customerOrders: boolean;
  workbench: boolean;
  adminRbac: false;
}

export function getAutoRefreshTargets(
  user: SessionUser | null,
): AutoRefreshTargets {
  return {
    pickupBoard: true,
    customerOrders: user !== null,
    workbench: user ? hasAnyRole(user, orderViewerRoles) : false,
    adminRbac: false,
  };
}
