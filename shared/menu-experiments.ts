import type { MenuItem } from "./contracts.ts";

export function stableExperimentHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectExperimentedMenuItems(
  menuItems: readonly MenuItem[],
  visitorKey: string,
): MenuItem[] {
  const passthroughItems: MenuItem[] = [];
  const groups = new Map<string, MenuItem[]>();

  for (const item of menuItems) {
    if (!item.experimentKey || !item.experimentVariant) {
      passthroughItems.push(item);
      continue;
    }

    const group = groups.get(item.experimentKey) ?? [];
    group.push(item);
    groups.set(item.experimentKey, group);
  }

  const selectedItems = [...passthroughItems];
  for (const [experimentKey, variants] of groups) {
    const sortedVariants = [...variants].sort(
      (a, b) =>
        a.experimentVariant.localeCompare(b.experimentVariant) ||
        a.id.localeCompare(b.id),
    );
    const selectedIndex =
      stableExperimentHash(`${visitorKey}:${experimentKey}`) %
      sortedVariants.length;
    const selectedVariant = sortedVariants[selectedIndex];
    if (selectedVariant) {
      selectedItems.push(selectedVariant);
    }
  }

  return selectedItems.sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
  );
}
