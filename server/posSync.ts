/**
 * POS Integration & Sync Service
 * Handles real-time price and inventory synchronization from POS systems
 * 
 * Priority System:
 * 1. Manual Admin Edits (highest - never auto-overridden)
 * 2. POS System Data (overrides AI/imports)
 * 3. AI Order Photo Extraction
 * 4. Excel Imports / Default Data (lowest)
 */

import { db } from './db';
import { supplies, pets } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface POSProduct {
  posProductId: string;
  name: string;
  price: number;
  quantity?: number;
  sku?: string;
  barcode?: string;
}

export interface POSSyncResult {
  updated: number;
  skipped: number;
  created: number;
  errors: string[];
}

/**
 * Sync a single supply item from POS
 * Respects manual override flags - won't update if admin manually set price/quantity
 */
export async function syncSupplyFromPOS(posProduct: POSProduct): Promise<'updated' | 'skipped' | 'created'> {
  try {
    // Try to find existing supply by POS product ID
    const existing = await db.query.supplies.findFirst({
      where: eq(supplies.posProductId, posProduct.posProductId)
    });

    if (existing) {
      const updates: any = {
        posLastSyncedAt: new Date()
      };

      // Only update price if NOT manually overridden
      if (!existing.manualPriceOverride) {
        updates.price = posProduct.price.toFixed(2);
        updates.priceSource = 'pos';
      }

      // Only update quantity if NOT manually overridden
      if (!existing.manualQuantityOverride && posProduct.quantity !== undefined) {
        updates.stockQuantity = posProduct.quantity;
        updates.quantitySource = 'pos';
      }

      // If both are manually overridden, just update sync timestamp
      if (existing.manualPriceOverride && existing.manualQuantityOverride) {
        await db.update(supplies)
          .set({ posLastSyncedAt: new Date() })
          .where(eq(supplies.id, existing.id));
        return 'skipped';
      }

      await db.update(supplies)
        .set(updates)
        .where(eq(supplies.id, existing.id));

      return 'updated';
    } else {
      // Create new supply from POS data
      await db.insert(supplies).values({
        name: posProduct.name,
        category: 'general', // Default category, admin can change
        price: posProduct.price.toFixed(2),
        stockQuantity: posProduct.quantity || 0,
        priceSource: 'pos',
        quantitySource: 'pos',
        posProductId: posProduct.posProductId,
        posLastSyncedAt: new Date(),
        isActive: true
      });

      return 'created';
    }
  } catch (error) {
    console.error('Error syncing supply from POS:', error);
    throw error;
  }
}

/**
 * Sync a single pet from POS
 * Respects manual override flag - won't update if admin manually set price
 */
export async function syncPetFromPOS(posProduct: POSProduct): Promise<'updated' | 'skipped' | 'created'> {
  try {
    // Try to find existing pet by POS product ID
    const existing = await db.query.pets.findFirst({
      where: eq(pets.posProductId, posProduct.posProductId)
    });

    if (existing) {
      // Only update price if NOT manually overridden
      if (existing.manualPriceOverride) {
        // Just update sync timestamp
        await db.update(pets)
          .set({ posLastSyncedAt: new Date() })
          .where(eq(pets.id, existing.id));
        return 'skipped';
      }

      await db.update(pets)
        .set({
          price: posProduct.price.toFixed(2),
          priceSource: 'pos',
          posLastSyncedAt: new Date()
        })
        .where(eq(pets.id, existing.id));

      return 'updated';
    } else {
      // Create new pet from POS data
      await db.insert(pets).values({
        name: posProduct.name,
        species: 'Other', // Default, admin should categorize
        price: posProduct.price.toFixed(2),
        priceSource: 'pos',
        posProductId: posProduct.posProductId,
        posLastSyncedAt: new Date(),
        isAvailable: true
      });

      return 'created';
    }
  } catch (error) {
    console.error('Error syncing pet from POS:', error);
    throw error;
  }
}

/**
 * Bulk sync multiple products from POS
 */
export async function bulkSyncFromPOS(
  products: POSProduct[],
  type: 'supply' | 'pet'
): Promise<POSSyncResult> {
  const result: POSSyncResult = {
    updated: 0,
    skipped: 0,
    created: 0,
    errors: []
  };

  for (const product of products) {
    try {
      const syncResult = type === 'supply' 
        ? await syncSupplyFromPOS(product)
        : await syncPetFromPOS(product);

      if (syncResult === 'updated') result.updated++;
      else if (syncResult === 'skipped') result.skipped++;
      else if (syncResult === 'created') result.created++;
    } catch (error: any) {
      result.errors.push(`${product.name}: ${error.message}`);
    }
  }

  return result;
}

/**
 * Mark a supply as manually overridden (prevents POS from updating it)
 */
export async function setSupplyManualOverride(
  supplyId: number,
  overridePrice: boolean,
  overrideQuantity: boolean
): Promise<void> {
  await db.update(supplies)
    .set({
      manualPriceOverride: overridePrice,
      manualQuantityOverride: overrideQuantity,
      priceSource: overridePrice ? 'manual' : undefined,
      quantitySource: overrideQuantity ? 'manual' : undefined
    })
    .where(eq(supplies.id, supplyId));
}

/**
 * Mark a pet as manually overridden (prevents POS from updating it)
 */
export async function setPetManualOverride(
  petId: number,
  overridePrice: boolean
): Promise<void> {
  await db.update(pets)
    .set({
      manualPriceOverride: overridePrice,
      priceSource: overridePrice ? 'manual' : undefined
    })
    .where(eq(pets.id, petId));
}

/**
 * Get POS sync status for supplies
 */
export async function getSuppliesPOSSyncStatus() {
  const allSupplies = await db.query.supplies.findMany();
  
  return {
    total: allSupplies.length,
    syncedFromPOS: allSupplies.filter(s => s.posProductId).length,
    manuallyOverridden: allSupplies.filter(s => s.manualPriceOverride || s.manualQuantityOverride).length,
    neverSynced: allSupplies.filter(s => !s.posLastSyncedAt).length,
    lastSync: allSupplies
      .map(s => s.posLastSyncedAt)
      .filter(Boolean)
      .sort((a, b) => b!.getTime() - a!.getTime())[0] || null
  };
}
