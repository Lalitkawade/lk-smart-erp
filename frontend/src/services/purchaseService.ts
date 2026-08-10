import { supabase, handleServiceCall, ServiceResponse } from './baseService';
import type { Database } from '../types/database.types';

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
    const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const cleanBillNumber = (billPayload.bill_number && billPayload.bill_number.trim()) ? billPayload.bill_number.trim() : 'N/A';
    const cleanSupplierName = (billPayload.supplier_name && billPayload.supplier_name.trim()) ? billPayload.supplier_name.trim() : 'GENERAL VENDOR';

    const billPayloadToSave: any = {
      bill_number: cleanBillNumber,
      supplier_name: cleanSupplierName,
      supplier_phone: billPayload.supplier_phone || null,
      payment_mode: billPayload.payment_mode || 'Cash',
      ref_number: billPayload.ref_number || null,
      total_amount: Number(billPayload.total_amount || 0),
      paid_amount: Number(billPayload.paid_amount || 0),
      due_amount: Number(billPayload.due_amount || 0),
      purchase_date: billPayload.purchase_date || new Date().toISOString(),
      tenant_id: (billPayload.tenant_id && isValidUUID(billPayload.tenant_id)) ? billPayload.tenant_id : null
    };

    if (billPayload.id && isValidUUID(billPayload.id)) {
      billPayloadToSave.id = billPayload.id;
    }

    const billRes = await handleServiceCall<PurchaseBillRow>(
      supabase.from('purchase_bills').insert([billPayloadToSave as any]).select().single()
    );

    if (billRes.error || !billRes.data) {
      return billRes as ServiceResponse<any>;
    }

    const createdBill = billRes.data;

    if (itemsPayload.length > 0) {
      const cleanItems = itemsPayload.map(item => ({
        bill_id: createdBill.id,
        product_id: (item.product_id && isValidUUID(item.product_id)) ? item.product_id : null,
        product_name: item.product_name || 'Procured Item',
        qty: Number(item.qty || 1),
        rate: Number(item.rate || 0),
        amount: Number(item.amount || (Number(item.qty || 1) * Number(item.rate || 0)))
      }));

      const itemsRes = await handleServiceCall<PurchaseItemRow[]>(
        supabase.from('purchase_items').insert(cleanItems as any).select()
      );

      return {
        data: {
          ...createdBill,
          items: itemsRes.data || []
        },
        error: itemsRes.error || null
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
          const { data: prod } = await supabase
            .from('products')
            .select('pieces_per_pack')
            .eq('id', item.product_id)
            .single();
          const piecesPerPack = Math.max(1, Number(prod?.pieces_per_pack || 1));
          const baseQty = Number(item.qty || 0) * piecesPerPack;

          const current = productMap.get(item.product_id) || { oldBaseQty: 0, newBaseQty: 0 };
          productMap.set(item.product_id, { ...current, oldBaseQty: current.oldBaseQty + baseQty });
        }

        // Process new items
        for (const item of itemsPayload) {
          if (!item.product_id) continue;
          const { data: prod } = await supabase
            .from('products')
            .select('pieces_per_pack')
            .eq('id', item.product_id)
            .single();
          const piecesPerPack = Math.max(1, Number(prod?.pieces_per_pack || 1));
          const baseQty = Number(item.qty || 0) * piecesPerPack;

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

      // 3. Supplier Balance Reconciliation
      const oldDue = Number(oldBill.due_amount || 0);
      const newDue = Number(billUpdates.due_amount !== undefined ? billUpdates.due_amount : oldBill.due_amount || 0);
      const oldSupId = oldBill.supplier_id;
      const newSupId = billUpdates.supplier_id !== undefined ? billUpdates.supplier_id : oldBill.supplier_id;

      const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      if (oldSupId && newSupId && oldSupId === newSupId) {
        const dueDelta = newDue - oldDue;
        if (dueDelta !== 0 && isValidUUID(oldSupId)) {
          const { data: sup } = await supabase.from('suppliers').select('outstanding').eq('id', oldSupId).single();
          if (sup) {
            const newOutstanding = Math.max(0, Number(sup.outstanding || 0) + dueDelta);
            await supabase.from('suppliers').update({ outstanding: newOutstanding }).eq('id', oldSupId);
          }
        }
      } else {
        // Supplier changed
        if (oldDue > 0 && oldSupId && isValidUUID(oldSupId)) {
          const { data: oldSup } = await supabase.from('suppliers').select('outstanding').eq('id', oldSupId).single();
          if (oldSup) {
            const newOldOutstanding = Math.max(0, Number(oldSup.outstanding || 0) - oldDue);
            await supabase.from('suppliers').update({ outstanding: newOldOutstanding }).eq('id', oldSupId);
          }
        }
        if (newDue > 0 && newSupId && isValidUUID(newSupId)) {
          const { data: newSup } = await supabase.from('suppliers').select('outstanding').eq('id', newSupId).single();
          if (newSup) {
            const newNewOutstanding = Number(newSup.outstanding || 0) + newDue;
            await supabase.from('suppliers').update({ outstanding: newNewOutstanding }).eq('id', newSupId);
          }
        }
      }

      // 4. Update Header Row
      const cleanUpdates: any = { ...billUpdates };
      delete cleanUpdates.id;
      if ('tenant_id' in cleanUpdates && (!cleanUpdates.tenant_id || !isValidUUID(cleanUpdates.tenant_id))) {
        cleanUpdates.tenant_id = null;
      }
      if ('supplier_id' in cleanUpdates && (!cleanUpdates.supplier_id || !isValidUUID(cleanUpdates.supplier_id))) {
        cleanUpdates.supplier_id = null;
      }

      const billRes = await handleServiceCall<PurchaseBillRow>(
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
            product_name: item.product_name || 'Procured Item',
            qty: Number(item.qty || 1),
            rate: Number(item.rate || 0),
            amount: Number(item.amount || (Number(item.qty || 1) * Number(item.rate || 0)))
          }));

          const itemsRes = await handleServiceCall<PurchaseItemRow[]>(
            supabase.from('purchase_items').insert(cleanItems as any).select()
          );

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
      const isValidUUID = (idVal: any) => typeof idVal === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idVal);

      for (const item of items) {
        if (!item.product_id || !isValidUUID(item.product_id)) continue;

        const { data: prod } = await supabase
          .from('products')
          .select('current_stock, product_name, pieces_per_pack')
          .eq('id', item.product_id)
          .single();

        if (prod) {
          const currentStock = Number(prod.current_stock || 0);
          const piecesPerPack = Math.max(1, Number(prod.pieces_per_pack || 1));
          const reversalBaseUnits = Number(item.qty || 0) * piecesPerPack;

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
          .select('current_stock, pieces_per_pack')
          .eq('id', item.product_id)
          .single();

        if (prod) {
          const currentStock = Number(prod.current_stock || 0);
          const piecesPerPack = Math.max(1, Number(prod.pieces_per_pack || 1));
          const reversalBaseUnits = Number(item.qty || 0) * piecesPerPack;
          const newStock = Math.max(0, currentStock - reversalBaseUnits);

          await supabase.from('products').update({ current_stock: newStock }).eq('id', item.product_id);
        }
      }

      // 4. Reverse Supplier Outstanding Balance
      const dueAmount = Number(bill.due_amount || 0);
      if (dueAmount > 0 && bill.supplier_id && isValidUUID(bill.supplier_id)) {
        const { data: sup } = await supabase
          .from('suppliers')
          .select('outstanding')
          .eq('id', bill.supplier_id)
          .single();

        if (sup) {
          const currentOutstanding = Number(sup.outstanding || 0);
          const newOutstanding = Math.max(0, currentOutstanding - dueAmount);
          await supabase.from('suppliers').update({ outstanding: newOutstanding }).eq('id', bill.supplier_id);
        }
      }

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
