import { handleServiceCall, ServiceResponse } from './baseService';
import { supabase } from '../api/supabase';
import type { 
  SalesReturnRow, 
  SalesReturnInsert, 
  SalesReturnItemRow, 
  SalesReturnItemInsert
} from '../types/database.types';

export interface SalesReturnWithItems extends SalesReturnRow {
  items?: SalesReturnItemRow[];
}


export class SalesReturnService {
  /**
   * Fetch all returns for a specific invoice
   */
  static async fetchReturnsForInvoice(invoiceId: string): Promise<ServiceResponse<SalesReturnWithItems[]>> {
    return handleServiceCall(
      supabase
        .from('sales_returns')
        .select('*, items:sales_return_items(*, product:products(*))')
        .eq('invoice_id', invoiceId)
        .order('return_date', { ascending: false })
    );
  }

  /**
   * Create a new sales return, update product stock, and adjust customer balance
   */
  static async createSalesReturn(
    returnPayload: SalesReturnInsert,
    itemsPayload: Omit<SalesReturnItemInsert, 'return_id'>[],
    customerId?: string | null // Pass customer ID if known, to update outstanding
  ): Promise<ServiceResponse<SalesReturnWithItems>> {
    // 1. Insert Sales Return
    const returnRes = await handleServiceCall<SalesReturnRow>(
      supabase.from('sales_returns').insert(returnPayload).select().single()
    );

    if (returnRes.error || !returnRes.data) {
      return returnRes as ServiceResponse<any>;
    }

    const newReturn = returnRes.data;

    // 2. Insert Sales Return Items
    const cleanItems = itemsPayload.map(item => {
      const { stock_return_qty, ...dbItem } = item as any;
      return {
        ...dbItem,
        return_id: newReturn.id
      };
    });

    const itemsRes = await handleServiceCall<SalesReturnItemRow[]>(
      supabase.from('sales_return_items').insert(cleanItems as any).select()
    );

    if (itemsRes.error || !itemsRes.data) {
       return itemsRes as ServiceResponse<any>;
    }

    // 3. Update Product Stock
    for (const item of itemsPayload) {
      const stockIncrement = (item as any).stock_return_qty !== undefined ? Number((item as any).stock_return_qty) : Number(item.return_qty);
      if (item.product_id && stockIncrement > 0) {
        // Get current stock
        const { data: productData } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', item.product_id)
          .single();

        if (productData) {
          const newStock = (Number(productData.current_stock) || 0) + stockIncrement;
          const { error: stockErr } = await supabase
            .from('products')
            .update({ current_stock: newStock })
            .eq('id', item.product_id);
            
          if (stockErr) {
             console.error('Failed to update stock:', stockErr);
          }
        }
      }
    }

    // 4. Note: Customer ledger and outstanding balance are calculated dynamically 
    // in real-time from sales_returns, invoices, and payments. We do NOT mutate 
    // customers.outstanding here because that field represents the initial opening balance.

    // 5. Update Original Invoice Status
    if (returnPayload.invoice_id) {
      await supabase
        .from('sales_invoices')
        .update({ status: 'Returned' })
        .eq('id', returnPayload.invoice_id);
    }

    return {
      data: {
        ...newReturn,
        items: itemsRes.data || []
      },
      error: null
    };
  }

  /**
   * Generate a unique return number
   */
  static async generateReturnNumber(tenantId: string): Promise<string> {
    let query = supabase
      .from('sales_returns')
      .select('return_number')
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (tenantId) {
      query = query.eq('tenant_id', tenantId) as any;
    }

    const { data } = await query;

    let nextNumber = 1;
    if (data && data.length > 0 && data[0].return_number) {
      const match = data[0].return_number.match(/\d+$/);
      if (match) {
        nextNumber = parseInt(match[0], 10) + 1;
      }
    }

    return `RET-${nextNumber.toString().padStart(4, '0')}`;
  }
}
