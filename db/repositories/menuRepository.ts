import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { MenuItem } from "../../shared/contracts.ts";
import { db } from "../client.ts";
import { menuItemsTable } from "../schema.ts";

type MenuRow = typeof menuItemsTable.$inferSelect;
type MenuTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CreateVersionedMenuItemInput {
  logical_id?: string;
  name: string;
  price: number;
  category: string;
  description: string;
  image_url: string;
  display_order?: number;
  is_sold_out?: boolean;
  is_hidden?: boolean;
  change_reason?: string;
}

export interface UpdateVersionedMenuItemInput {
  name?: string;
  price?: number;
  category?: string;
  description?: string;
  image_url?: string;
  is_sold_out?: boolean;
  is_hidden?: boolean;
  change_reason?: string;
}

export function toMenuItem(row: MenuRow): MenuItem {
  return {
    id: row.id,
    entityId: row.entityId,
    logicalId: row.logicalId,
    version: row.version,
    name: row.name,
    price: row.price,
    category: row.category,
    description: row.description,
    image_url: row.imageUrl,
    displayOrder: row.displayOrder,
    isSoldOut: row.isSoldOut,
    isHidden: row.isHidden,
    isCurrentVersion: row.isCurrentVersion,
    supersedes: row.supersedes,
    changeReason: row.changeReason,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    createdBy: row.createdBy,
  };
}

function formatLogicalId(value: number): string {
  return String(value).padStart(3, "0");
}

function versionId(logicalId: string, version: number): string {
  return `${logicalId}-${String(version).padStart(2, "0")}`;
}

export class MenuRepository {
  async getCurrentMenu(): Promise<MenuItem[]> {
    const rows = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.isCurrentVersion, true))
      .orderBy(asc(menuItemsTable.displayOrder), asc(menuItemsTable.id));

    return rows.map(toMenuItem);
  }

  async getPublicMenu(): Promise<MenuItem[]> {
    const rows = await db
      .select()
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.isCurrentVersion, true),
          eq(menuItemsTable.isHidden, false),
        ),
      )
      .orderBy(asc(menuItemsTable.displayOrder), asc(menuItemsTable.id));

    return rows.map(toMenuItem);
  }

  async getMenuVersion(id: string): Promise<MenuItem | null> {
    const [row] = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, id))
      .limit(1);

    return row ? toMenuItem(row) : null;
  }

  async getMenuHistory(idOrLogicalId: string): Promise<MenuItem[]> {
    const [lookup] = await db
      .select({ logicalId: menuItemsTable.logicalId })
      .from(menuItemsTable)
      .where(
        or(
          eq(menuItemsTable.logicalId, idOrLogicalId),
          eq(menuItemsTable.id, idOrLogicalId),
        ),
      )
      .limit(1);

    if (!lookup) return [];

    const rows = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.logicalId, lookup.logicalId))
      .orderBy(desc(menuItemsTable.version));

    return rows.map(toMenuItem);
  }

  async createMenuItem(
    input: CreateVersionedMenuItemInput,
    createdBy = "system",
  ): Promise<MenuItem> {
    return await db.transaction(async (tx) => {
      const logicalId = input.logical_id ?? (await this.nextLogicalId(tx));
      const [existing] = await tx
        .select({ id: menuItemsTable.id })
        .from(menuItemsTable)
        .where(eq(menuItemsTable.logicalId, logicalId))
        .limit(1);

      if (existing) {
        throw new Error(`Menu logicalId ${logicalId} already exists`);
      }

      const [inserted] = await tx
        .insert(menuItemsTable)
        .values({
          id: versionId(logicalId, 1),
          entityId: crypto.randomUUID(),
          logicalId,
          version: 1,
          name: input.name,
          price: input.price,
          category: input.category,
          description: input.description,
          imageUrl: input.image_url,
          displayOrder:
            input.display_order ?? (await this.nextDisplayOrder(tx)),
          isSoldOut: input.is_sold_out ?? false,
          isHidden: input.is_hidden ?? false,
          isCurrentVersion: true,
          changeReason: input.change_reason ?? "Initial creation",
          createdBy,
        })
        .returning();

      if (!inserted) throw new Error("Failed to insert menu item");
      return toMenuItem(inserted);
    });
  }

  async updateMenuItemVersion(
    idOrLogicalId: string,
    patch: UpdateVersionedMenuItemInput,
    updatedBy = "system",
  ): Promise<MenuItem | null> {
    return await db.transaction(async (tx) => {
      const current = await this.findCurrentVersion(tx, idOrLogicalId);
      if (!current) return null;

      await tx
        .update(menuItemsTable)
        .set({ isCurrentVersion: false })
        .where(eq(menuItemsTable.id, current.id));

      const nextVersion = current.version + 1;
      const [inserted] = await tx
        .insert(menuItemsTable)
        .values({
          id: versionId(current.logicalId, nextVersion),
          entityId: current.entityId,
          logicalId: current.logicalId,
          version: nextVersion,
          name: patch.name ?? current.name,
          price: patch.price ?? current.price,
          category: patch.category ?? current.category,
          description: patch.description ?? current.description,
          imageUrl: patch.image_url ?? current.imageUrl,
          displayOrder: current.displayOrder,
          isSoldOut: patch.is_sold_out ?? current.isSoldOut,
          isHidden: patch.is_hidden ?? current.isHidden,
          isCurrentVersion: true,
          supersedes: current.id,
          changeReason: patch.change_reason ?? "Menu item updated",
          createdBy: updatedBy,
        })
        .returning();

      return inserted ? toMenuItem(inserted) : null;
    });
  }

  async retireCurrentVersion(
    idOrLogicalId: string,
  ): Promise<MenuItem | null> {
    return await db.transaction(async (tx) => {
      const current = await this.findCurrentVersion(tx, idOrLogicalId);
      if (!current) return null;

      const [updated] = await tx
        .update(menuItemsTable)
        .set({
          isCurrentVersion: false,
          changeReason: current.changeReason ?? "Retired from current menu",
        })
        .where(eq(menuItemsTable.id, current.id))
        .returning();

      return updated ? toMenuItem(updated) : null;
    });
  }

  async validateMenuItemsAreCurrent(menuItemIds: string[]): Promise<{
    valid: boolean;
    outdatedIds: string[];
  }> {
    const uniqueIds = [...new Set(menuItemIds)];
    if (uniqueIds.length === 0) return { valid: true, outdatedIds: [] };

    const rows = await db
      .select({
        id: menuItemsTable.id,
        isCurrentVersion: menuItemsTable.isCurrentVersion,
        isSoldOut: menuItemsTable.isSoldOut,
        isHidden: menuItemsTable.isHidden,
      })
      .from(menuItemsTable)
      .where(inArray(menuItemsTable.id, uniqueIds));

    const foundIds = new Set(rows.map((row) => row.id));
    const outdatedIds = [
      ...rows
        .filter((row) => !row.isCurrentVersion || row.isSoldOut || row.isHidden)
        .map((row) => row.id),
      ...uniqueIds.filter((id) => !foundIds.has(id)),
    ];

    return {
      valid: outdatedIds.length === 0,
      outdatedIds,
    };
  }

  async reorderCurrentMenu(
    items: Array<{ id: string; displayOrder: number }>,
  ): Promise<MenuItem[] | null> {
    return await db.transaction(async (tx) => {
      const ids = items.map((item) => item.id);
      const rows = await tx
        .select()
        .from(menuItemsTable)
        .where(inArray(menuItemsTable.id, ids));

      if (rows.length !== ids.length) return null;
      if (rows.some((row) => !row.isCurrentVersion)) return null;

      for (const item of items) {
        await tx
          .update(menuItemsTable)
          .set({ displayOrder: item.displayOrder })
          .where(eq(menuItemsTable.id, item.id));
      }

      const currentRows = await tx
        .select()
        .from(menuItemsTable)
        .where(eq(menuItemsTable.isCurrentVersion, true))
        .orderBy(asc(menuItemsTable.displayOrder), asc(menuItemsTable.id));

      return currentRows.map(toMenuItem);
    });
  }

  private async nextLogicalId(tx: MenuTx): Promise<string> {
    const rows = await tx
      .select({ logicalId: menuItemsTable.logicalId })
      .from(menuItemsTable)
      .orderBy(desc(menuItemsTable.logicalId));

    const max = rows.reduce((currentMax, row) => {
      const numeric = Number.parseInt(row.logicalId, 10);
      return Number.isFinite(numeric) ? Math.max(currentMax, numeric) : currentMax;
    }, 0);

    return formatLogicalId(max + 1);
  }

  private async nextDisplayOrder(tx: MenuTx): Promise<number> {
    const rows = await tx
      .select({ displayOrder: menuItemsTable.displayOrder })
      .from(menuItemsTable)
      .where(eq(menuItemsTable.isCurrentVersion, true))
      .orderBy(desc(menuItemsTable.displayOrder));

    return (rows[0]?.displayOrder ?? 0) + 1;
  }

  private async findCurrentVersion(
    tx: MenuTx,
    idOrLogicalId: string,
  ): Promise<MenuRow | null> {
    const [byLogicalId] = await tx
      .select()
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.logicalId, idOrLogicalId),
          eq(menuItemsTable.isCurrentVersion, true),
        ),
      )
      .limit(1);

    if (byLogicalId) return byLogicalId;

    const [byVersionId] = await tx
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, idOrLogicalId))
      .limit(1);

    if (!byVersionId) return null;

    const [current] = await tx
      .select()
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.logicalId, byVersionId.logicalId),
          eq(menuItemsTable.isCurrentVersion, true),
        ),
      )
      .limit(1);

    return current ?? null;
  }
}

export const menuRepository = new MenuRepository();
