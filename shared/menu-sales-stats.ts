import type { MenuItem, Order } from "./contracts.ts";

function getTaipeiDateKey(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getTaipeiWeekKey(value: string): string {
  const dateKey = getTaipeiDateKey(value);
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return getTaipeiDateKey(date.toISOString());
}

export function attachMenuSalesStats(
  menuItems: readonly MenuItem[],
  orders: readonly Order[],
  now = new Date(),
): MenuItem[] {
  const todayKey = getTaipeiDateKey(now.toISOString());
  const weekKey = getTaipeiWeekKey(now.toISOString());
  const todayCounts = new Map<string, number>();
  const weekCounts = new Map<string, number>();

  for (const order of orders) {
    if (order.status === "pending") continue;
    const time = order.submittedAt ?? order.createdAt;
    const orderDay = getTaipeiDateKey(time);
    const orderWeek = getTaipeiWeekKey(time);

    for (const orderItem of order.items) {
      const logicalId = orderItem.item.logicalId;
      if (orderDay === todayKey) {
        todayCounts.set(
          logicalId,
          (todayCounts.get(logicalId) ?? 0) + orderItem.qty,
        );
      }
      if (orderWeek === weekKey) {
        weekCounts.set(
          logicalId,
          (weekCounts.get(logicalId) ?? 0) + orderItem.qty,
        );
      }
    }
  }

  return menuItems.map((item) => ({
    ...item,
    purchaseCountToday: todayCounts.get(item.logicalId) ?? 0,
    purchaseCountThisWeek: weekCounts.get(item.logicalId) ?? 0,
  }));
}
