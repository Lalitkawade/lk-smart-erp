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
    const billRes = await handleServiceCall<PurchaseBillRow>(
      supabase.from('purchase_bills').insert([billPayload as any]).select().single()
    );

    if (billRes.error || !billRes.data) {
      return billRes as ServiceResponse<any>;
    }

    const createdBill = billRes.data;

    if (itemsPayload.length > 0) {
      const cleanItems = itemsPayload.map(item => ({
        ...item,
        bill_id: createdBill.id
      }));

      const itemsRes = await handleServiceCall<PurchaseItemRow[]>(
        supabase.from('purchase_items').insert(cleanItems as any).select()
      );

      return {
        data: {
          ...createdBill,
          items: itemsRes.data || []
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
  static async updatePurchase(
    id: string,
    billUpdates: Partial<PurchaseBillRow>,
    itemsPayload?: Partial<PurchaseItemRow>[]
  ): Promise<ServiceResponse<PurchaseWithItems>> {
    const billRes = await handleServiceCall<PurchaseBillRow>(
      supabase.from('purchase_bills').update(billUpdates as any).eq('id', id).select().single()
    );

    if (billRes.error || !billRes.data) {
      return billRes as ServiceResponse<any>;
    }

    const updatedBill = billRes.data;

    if (itemsPayload) {
      // Replace existing line items
      await supabase.from('purchase_items').delete().eq('purchase_bill_id' as any, id);

      if (itemsPayload.length > 0) {
        const cleanItems = itemsPayload.map(item => ({
          ...item,
          purchase_bill_id: id,
          tenant_id: updatedBill.tenant_id
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
        items: []
      },
      error: null
    };
  }

  /**
   * Delete a purchase bill and its associated line items
   */
  static async deletePurchase(id: string): Promise<ServiceResponse<null>> {
    await supabase.from('purchase_items').delete().eq('purchase_bill_id' as any, id);
    return handleServiceCall(
      supabase.from('purchase_bills').delete().eq('id', id)
    );
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
