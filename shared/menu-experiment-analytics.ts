import type {
  MenuExperiment,
  MenuExperimentDetail,
  MenuExperimentExposure,
  MenuItem,
  Order,
} from "./contracts.ts";

function getEffectiveMenuPrice(item: MenuItem): number {
  return item.salePrice ?? item.price;
}

function emptyStats(): {
  itemCount: number;
  exposureKeys: Set<string>;
  orderIds: Set<number>;
  quantitySold: number;
  revenue: number;
  lastExposedAt: string | null;
} {
  return {
    itemCount: 0,
    exposureKeys: new Set<string>(),
    orderIds: new Set<number>(),
    quantitySold: 0,
    revenue: 0,
    lastExposedAt: null,
  };
}

export function buildMenuExperiments(
  menuItems: readonly MenuItem[],
  orders: readonly Order[],
  exposures: readonly MenuExperimentExposure[],
): MenuExperiment[] {
  const groups = new Map<string, Map<string, ReturnType<typeof emptyStats>>>();

  for (const item of menuItems.filter((entry) => entry.isCurrentVersion)) {
    if (!item.experimentKey || !item.experimentVariant) continue;
    const variants = groups.get(item.experimentKey) ?? new Map();
    const stats = variants.get(item.experimentVariant) ?? emptyStats();
    stats.itemCount += 1;
    variants.set(item.experimentVariant, stats);
    groups.set(item.experimentKey, variants);
  }

  for (const exposure of exposures) {
    const variants = groups.get(exposure.experimentKey) ?? new Map();
    const stats = variants.get(exposure.experimentVariant) ?? emptyStats();
    stats.exposureKeys.add(
      `${exposure.visitorKey}:${exposure.menuItemId}:${exposure.experimentVariant}`,
    );
    if (
      exposure.exposedAt &&
      (!stats.lastExposedAt || exposure.exposedAt > stats.lastExposedAt)
    ) {
      stats.lastExposedAt = exposure.exposedAt;
    }
    variants.set(exposure.experimentVariant, stats);
    groups.set(exposure.experimentKey, variants);
  }

  for (const order of orders.filter((entry) => entry.status !== "pending")) {
    for (const orderItem of order.items) {
      const key = orderItem.item.experimentKey;
      const variant = orderItem.item.experimentVariant;
      if (!key || !variant) continue;
      const variants = groups.get(key) ?? new Map();
      const stats = variants.get(variant) ?? emptyStats();
      stats.orderIds.add(order.id);
      stats.quantitySold += orderItem.qty;
      stats.revenue += getEffectiveMenuPrice(orderItem.item) * orderItem.qty;
      variants.set(variant, stats);
      groups.set(key, variants);
    }
  }

  return [...groups.entries()]
    .map(([experimentKey, variants]) => ({
      experimentKey,
      variants: [...variants.entries()]
        .map(([variant, stats]) => {
          const exposureCount = stats.exposureKeys.size;
          const orderCount = stats.orderIds.size;
          return {
            variant,
            itemCount: stats.itemCount,
            exposureCount,
            orderCount,
            quantitySold: stats.quantitySold,
            revenue: stats.revenue,
            conversionRate:
              exposureCount > 0 ? Number((orderCount / exposureCount).toFixed(4)) : 0,
            lastExposedAt: stats.lastExposedAt,
          };
        })
        .sort((a, b) => a.variant.localeCompare(b.variant)),
    }))
    .sort((a, b) => a.experimentKey.localeCompare(b.experimentKey));
}

export function buildMenuExperimentDetail(
  experimentKey: string,
  menuItems: readonly MenuItem[],
  orders: readonly Order[],
  exposures: readonly MenuExperimentExposure[],
): MenuExperimentDetail | undefined {
  const summary = buildMenuExperiments(menuItems, orders, exposures).find(
    (entry) => entry.experimentKey === experimentKey,
  );
  if (!summary) return undefined;

  return {
    ...summary,
    exposures: exposures
      .filter((exposure) => exposure.experimentKey === experimentKey)
      .sort((a, b) => (b.exposedAt ?? "").localeCompare(a.exposedAt ?? "")),
  };
}
