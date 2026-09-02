import { supabase, handleServiceCall, ServiceResponse } from './baseService';
import type { Database } from '../types/database.types';

const isValidUUID = (id: any): boolean => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export type PurchaseBillRow = Database['public']['Tables']['purchase_bills']['Row'];
export type PurchaseItemRow = Database['public']['Tables']['purchase_items']['Row'];

export interface PurchaseWithItems extends PurchaseBillRow {
  items?: PurchaseItemRow[];
}

export class PurchaseService {
  /**
   * Fetch all purchase bills with line items for a given tenant
   */
  static async fetchPurchases(tenantId?: string): Promise<ServiceResponse<PurchaseWithItems[]>> {
    let query = supabase
      .from('purchase_bills')
      .select('*, purchase_items(*)')
      .order('purchase_date', { ascending: false });

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Get a single purchase bill by ID with line items
   */
  static async getPurchaseById(id: string): Promise<ServiceResponse<PurchaseWithItems>> {
    return handleServiceCall(
      supabase.from('purchase_bills').select('*, purchase_items(*)').eq('id', id).single()
    );
  }

  /**
   * Get a single purchase bill by Bill Number
   */
  static async getPurchaseByBillNumber(billNumber: string, tenantId?: string): Promise<ServiceResponse<PurchaseWithItems>> {
    let query = supabase.from('purchase_bills').select('*, purchase_items(*)').eq('bill_number', billNumber.trim());
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query.maybeSingle());
  }

  /**
   * Search purchase bills by bill number or supplier name
   */
  static async searchPurchases(queryStr: string, tenantId?: string): Promise<ServiceResponse<PurchaseWithItems[]>> {
    const term = `%${queryStr.trim()}%`;
    let query = supabase
      .from('purchase_bills')
      .select('*, purchase_items(*)')
      .or(`bill_number.ilike.${term},supplier_name.ilike.${term}`)
      .order('purchase_date', { ascending: false });

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Create a new purchase bill and insert line items
   */
  static async createPurchase(
    billPayload: Partial<PurchaseBillRow>,
    itemsPayload: Partial<PurchaseItemRow>[] = []
  ): Promise<ServiceResponse<PurchaseWithItems>> {
    const cleanBillNumber = (billPayload.bill_number && billPayload.bill_number.trim()) ? billPayload.bill_number.trim() : 'N/A';
    const cleanSupplierName = (billPayload.supplier_name && billPayload.supplier_name.trim()) ? billPayload.supplier_name.trim() : 'GENERAL VENDOR';

    const billPayloadToSave: any = {
      bill_number: cleanBillNumber,
      supplier_name: cleanSupplierName,
      supplier_phone: billPayload.supplier_phone || null,
      supplier_id: (billPayload.supplier_id && isValidUUID(billPayload.supplier_id)) ? billPayload.supplier_id : null,
      payment_mode: billPayload.payment_mode || 'Cash',
      ref_number: billPayload.ref_number || null,
      total_amount: Number(billPayload.total_amount || 0),
      paid_amount: Number(billPayload.paid_amount || 0),
      due_amount: Number(billPayload.due_amount || 0),
      purchase_date: billPayload.purchase_date || new Date().toISOString(),
      tenant_id: billPayload.tenant_id || null,
      status: billPayload.status || 'Completed'
    };

    if (billPayload.id && isValidUUID(billPayload.id)) {
      billPayloadToSave.id = billPayload.id;
    }

    let billRes = await handleServiceCall<PurchaseBillRow>(
      supabase.from('purchase_bills').insert([billPayloadToSave as any]).select().single()
    );

    if (billRes.error && (billRes.error.includes('supplier_id') || billRes.error.includes('schema cache'))) {
      console.warn("⚠️ purchase_bills table does not have 'supplier_id' column in schema cache, retrying insert without supplier_id...");
      const payloadWithoutSupId = { ...billPayloadToSave };
      delete payloadWithoutSupId.supplier_id;
      billRes = await handleServiceCall<PurchaseBillRow>(
        supabase.from('purchase_bills').insert([payloadWithoutSupId as any]).select().single()
      );
    }

    if (billRes.error || !billRes.data) {
      return billRes as ServiceResponse<any>;
    }

    const createdBill = billRes.data;

    // Supplier outstanding balance updates are now calculated in real-time by the frontend

    if (itemsPayload.length > 0) {
      const cleanItems = itemsPayload.map(item => ({
        bill_id: createdBill.id,
        product_id: (item.product_id && isValidUUID(item.product_id)) ? item.product_id : null,
        product_name: item.product_name || 'Procured Item',
        qty: Number(item.qty || 1),
        rate: Number(item.rate || 0),
        amount: Number(item.amount || (Number(item.qty || 1) * Number(item.rate || 0))),
        unit: item.unit || 'Nos',
        base_quantity: Number(item.base_quantity || item.qty || 1),
        base_unit: item.base_unit || 'Nos',
        conversion_factor: Number(item.conversion_factor || 1)
      }));

      let itemsRes = await handleServiceCall<PurchaseItemRow[]>(
        supabase.from('purchase_items').insert(cleanItems as any).select()
      );

      if (itemsRes.error && (itemsRes.error.includes('Could not find') || itemsRes.error.includes('column'))) {
        console.warn("⚠️ Database schema is missing new columns (run migration script!). Falling back to legacy insert...");
        const legacyItems = cleanItems.map(it => {
          const { base_quantity, base_unit, conversion_factor, ...rest } = it as any;
          return rest;
        });
        itemsRes = await handleServiceCall<PurchaseItemRow[]>(
          supabase.from('purchase_items').insert(legacyItems as any).select()
        );
        if (itemsRes.error) console.error("Legacy insert failed:", itemsRes.error);
      }

      if (itemsRes.error) {
        console.warn("⚠️ Error inserting purchase_items, retrying without product_id...", itemsRes.error);
        const safeItems = cleanItems.map(it => ({ ...it, product_id: null }));
        itemsRes = await handleServiceCall<PurchaseItemRow[]>(
          supabase.from('purchase_items').insert(safeItems as any).select()
        );
      }

      if (itemsRes.error) {
        return {
          data: null,
          error: 'Items insert failed: ' + itemsRes.error
        };
      }

      return {
        data: {
          ...createdBill,
          items: itemsRes.data as PurchaseItemRow[]
        },
        error: null
      };
    }

    return {
      data: {
        ...createdBill,
        items: []
      },
      error: null
    };
  }

  /**
   * Update an existing purchase bill and line items
   */
  /**
   * Update an existing purchase bill, reconcile product stock deltas, and reconcile supplier outstanding balance
   */
  static async updatePurchase(
    id: string,
    billUpdates: Partial<PurchaseBillRow>,
    itemsPayload?: Partial<PurchaseItemRow>[]
  ): Promise<ServiceResponse<PurchaseWithItems>> {
    try {
      // 1. Fetch existing bill and items
      const oldBillRes = await this.getPurchaseById(id);
      if (oldBillRes.error || !oldBillRes.data) {
        return { data: null as any, error: oldBillRes.error || 'Purchase bill not found.' };
      }

      const oldBill = oldBillRes.data;
      const oldItems = oldBill.items || [];

      // 2. Stock Delta Reconciliation if itemsPayload is provided
      if (itemsPayload) {
        const productMap = new Map<string, { oldBaseQty: number; newBaseQty: number }>();

        // Process old items
        for (const item of oldItems) {
          if (!item.product_id) continue;
          const baseQty = Number(item.base_quantity || item.qty || 0);

          const current = productMap.get(item.product_id) || { oldBaseQty: 0, newBaseQty: 0 };
          productMap.set(item.product_id, { ...current, oldBaseQty: current.oldBaseQty + baseQty });
        }

        // Process new items
        for (const item of itemsPayload) {
          if (!item.product_id) continue;
          const baseQty = Number(item.base_quantity || item.qty || 0);

          const current = productMap.get(item.product_id) || { oldBaseQty: 0, newBaseQty: 0 };
          productMap.set(item.product_id, { ...current, newBaseQty: current.newBaseQty + baseQty });
        }

        // Pre-validate stock availability for negative deltas
        for (const [prodId, qtyData] of productMap.entries()) {
          const delta = qtyData.newBaseQty - qtyData.oldBaseQty;
          if (delta < 0) {
            const { data: prod } = await supabase
              .from('products')
              .select('current_stock, product_name')
              .eq('id', prodId)
              .single();

            const currentStock = Number(prod?.current_stock || 0);
            const requiredReduction = Math.abs(delta);

            if (currentStock < requiredReduction) {
              const pName = prod?.product_name || 'Product';
              return {
                data: null as any,
                error: `Cannot update purchase bill: Product "${pName}" does not have enough available stock (${currentStock} available) for the requested reduction of ${requiredReduction} base units.`
              };
            }
          }
        }

        // Apply stock updates for all products
        for (const [prodId, qtyData] of productMap.entries()) {
          const delta = qtyData.newBaseQty - qtyData.oldBaseQty;
          if (delta !== 0) {
            const { data: prod } = await supabase
              .from('products')
              .select('current_stock')
              .eq('id', prodId)
              .single();

            const currentStock = Number(prod?.current_stock || 0);
            const newStock = Math.max(0, currentStock + delta);
            await supabase.from('products').update({ current_stock: newStock }).eq('id', prodId);
          }
        }
      }

      // Supplier Balance Reconciliation is now calculated in real-time by the frontend

      // 4. Update Header Row
      const cleanUpdates: any = { ...billUpdates };
      delete cleanUpdates.id;
      if ('tenant_id' in cleanUpdates && (!cleanUpdates.tenant_id || !isValidUUID(cleanUpdates.tenant_id))) {
        cleanUpdates.tenant_id = null;
      }
      if ('supplier_id' in cleanUpdates && (!cleanUpdates.supplier_id || !isValidUUID(cleanUpdates.supplier_id))) {
        cleanUpdates.supplier_id = null;
      }

      let billRes = await handleServiceCall<PurchaseBillRow>(
        supabase.from('purchase_bills').update(cleanUpdates).eq('id', id).select().single()
      );

      if (billRes.error && (billRes.error.includes('supplier_id') || billRes.error.includes('schema cache'))) {
        console.warn("⚠️ purchase_bills table does not have 'supplier_id' column in schema cache, retrying update without supplier_id...");
        const updatesWithoutSupId = { ...cleanUpdates };
        delete updatesWithoutSupId.supplier_id;

        billRes = await handleServiceCall<PurchaseBillRow>(
          supabase.from('purchase_bills').update(updatesWithoutSupId).eq('id', id).select().single()
        );
      }

      if (billRes.error || !billRes.data) {
        console.error('❌ [PurchaseService.updatePurchase] Header update error:', billRes.error);
        return billRes as ServiceResponse<any>;
      }

      const updatedBill = billRes.data;

      // 5. Replace Line Items if payload provided
      if (itemsPayload) {
        await supabase.from('purchase_items').delete().eq('bill_id', id);

        if (itemsPayload.length > 0) {
          const cleanItems = itemsPayload.map(item => ({
            bill_id: id,
            product_id: (item.product_id && isValidUUID(item.product_id)) ? item.product_id : null,
            qty: Number(item.qty || 1),
            rate: Number(item.rate || 0),
            amount: Number(item.amount || (Number(item.qty || 1) * Number(item.rate || 0))),
            unit: item.unit || 'Nos',
            base_quantity: Number(item.base_quantity || item.qty || 1),
            base_unit: item.base_unit || 'Nos',
            conversion_factor: Number(item.conversion_factor || 1)
          }));

          let itemsRes = await handleServiceCall<PurchaseItemRow[]>(
            supabase.from('purchase_items').insert(cleanItems as any).select()
          );

          if (itemsRes.error && (itemsRes.error.includes('Could not find') || itemsRes.error.includes('column'))) {
            console.warn("⚠️ Database schema is missing new columns (run migration script!). Falling back to legacy insert...");
            const legacyItems = cleanItems.map(it => {
              const { base_quantity, base_unit, conversion_factor, ...rest } = it as any;
              return rest;
            });
            itemsRes = await handleServiceCall<PurchaseItemRow[]>(
              supabase.from('purchase_items').insert(legacyItems as any).select()
            );
          }

          if (itemsRes.error) {
            console.warn("⚠️ Error updating purchase_items, retrying without product_id...", itemsRes.error);
            const safeItems = cleanItems.map(it => ({ ...it, product_id: null }));
            itemsRes = await handleServiceCall<PurchaseItemRow[]>(
              supabase.from('purchase_items').insert(safeItems as any).select()
            );
          }

          return {
            data: {
              ...updatedBill,
              items: itemsRes.data || []
            },
            error: null
          };
        }
      }

      return {
        data: {
          ...updatedBill,
          items: oldItems
        },
        error: null
      };
    } catch (e: any) {
      return { data: null as any, error: e.message || 'Error updating purchase bill.' };
    }
  }

  /**
   * Delete a purchase bill and its associated line items with stock and supplier balance reversal
   */
  static async deletePurchase(id: string): Promise<ServiceResponse<null>> {
    try {
      // 1. Idempotency Check & Fetch existing bill with items
      const billRes = await this.getPurchaseById(id);
      if (billRes.error || !billRes.data) {
        // Bill no longer exists; return idempotent success
        return { data: null, error: null };
      }

      const bill = billRes.data;
      const items = bill.items || [];

      // 2. Pre-validate stock availability for all items before any database mutations

      for (const item of items) {
        if (!item.product_id || !isValidUUID(item.product_id)) continue;

        const { data: prod } = await supabase
          .from('products')
          .select('current_stock, product_name, pieces_per_pack')
          .eq('id', item.product_id)
          .single();

        if (prod) {
          const currentStock = Number(prod.current_stock || 0);
          const reversalBaseUnits = Number(item.base_quantity || item.qty || 0);

          if (currentStock < reversalBaseUnits) {
            const prodName = prod.product_name || item.product_name || 'Product';
            return {
              data: null,
              error: `Cannot delete purchase bill "${bill.bill_number || id}": Product "${prodName}" has ${currentStock} base units in stock, but reversing this bill requires ${reversalBaseUnits} base units. Some stock may have already been sold or moved.`
            };
          }
        }
      }

      // 3. Validation passed: Execute Stock Reversal for all products
      for (const item of items) {
        if (!item.product_id || !isValidUUID(item.product_id)) continue;

        const { data: prod } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', item.product_id)
          .single();

        if (prod) {
          const currentStock = Number(prod.current_stock || 0);
          const reversalBaseUnits = Number(item.base_quantity || item.qty || 0);
          const newStock = Math.max(0, currentStock - reversalBaseUnits);

          await supabase.from('products').update({ current_stock: newStock }).eq('id', item.product_id);
        }
      }

      // 4. Supplier Outstanding Balance Reversal is now handled in real-time by the frontend

      // 5. Delete Database Rows
      await supabase.from('purchase_items').delete().eq('bill_id', id);
      return handleServiceCall(
        supabase.from('purchase_bills').delete().eq('id', id)
      );
    } catch (e: any) {
      return { data: null, error: e.message || 'Error deleting purchase bill.' };
    }
  }

  /**
   * Validate duplicate purchase bill number
   */
  static async validateDuplicateBillNumber(billNumber: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!billNumber || !billNumber.trim()) return false;
    let query = supabase.from('purchase_bills').select('id').ilike('bill_number', billNumber.trim());
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }
}
