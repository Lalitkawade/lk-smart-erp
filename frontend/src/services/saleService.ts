import { handleServiceCall, ServiceResponse } from './baseService';
import { supabase } from '../api/supabase';
import type { SalesInvoiceRow, SalesInvoiceInsert, SalesInvoiceUpdate, SalesItemRow, SalesItemInsert } from '../types/database.types';

export interface SalesInvoiceWithItems extends SalesInvoiceRow {
  items?: SalesItemRow[];
}

const isValidUUID = (id: any): boolean => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export class SaleService {
  /**
   * Fetch all sales invoices with their line items for a tenant
   */
  static async fetchSales(tenantId: string): Promise<ServiceResponse<SalesInvoiceWithItems[]>> {
    if (!isValidUUID(tenantId)) {
      return handleServiceCall(
        supabase
          .from('sales_invoices')
          .select('*, items:sales_items(*, product:products(*))')
          .order('sale_date', { ascending: false })
      );
    }

    return handleServiceCall(
      supabase
        .from('sales_invoices')
        .select('*, items:sales_items(*, product:products(*))')
        .eq('tenant_id', tenantId)
        .order('sale_date', { ascending: false })
    );
  }

  /**
   * Get a single sales invoice by ID with line items
   */
  static async getSaleById(id: string): Promise<ServiceResponse<SalesInvoiceWithItems>> {
    return handleServiceCall(
      supabase
        .from('sales_invoices')
        .select('*, items:sales_items(*, product:products(*))')
        .eq('id', id)
        .single()
    );
  }

  /**
   * Create a new sales invoice with line items
   */
  static async createSale(
    salePayload: SalesInvoiceInsert,
    itemsPayload: Omit<SalesItemInsert, 'invoice_id'>[]
  ): Promise<ServiceResponse<SalesInvoiceWithItems>> {
    const saleInsert = {
      ...salePayload,
      tenant_id: isValidUUID(salePayload.tenant_id)
        ? salePayload.tenant_id
        : '00000000-0000-0000-0000-000000000000'
    };

    const saleRes = await handleServiceCall<SalesInvoiceRow>(
      supabase.from('sales_invoices').insert(saleInsert).select().single()
    );

    if (saleRes.error || !saleRes.data) {
      return saleRes as ServiceResponse<any>;
    }

    const newSale = saleRes.data;

    if (itemsPayload && itemsPayload.length > 0) {
      const cleanItems = itemsPayload.map(item => ({
        ...item,
        invoice_id: newSale.id,
        tenant_id: newSale.tenant_id
      }));

      const itemsRes = await handleServiceCall<SalesItemRow[]>(
        supabase.from('sales_items').insert(cleanItems as any).select()
      );

      return {
        data: {
          ...newSale,
          items: itemsRes.data || []
        },
        error: null
      };
    }

    return {
      data: {
        ...newSale,
        items: []
      },
      error: null
    };
  }

  /**
   * Update an existing sales invoice and line items
   */
  static async updateSale(
    id: string,
    salePayload: SalesInvoiceUpdate,
    itemsPayload?: Omit<SalesItemInsert, 'invoice_id'>[]
  ): Promise<ServiceResponse<SalesInvoiceWithItems>> {
    const saleRes = await handleServiceCall<SalesInvoiceRow>(
      supabase
        .from('sales_invoices')
        .update(salePayload)
        .eq('id', id)
        .select()
        .single()
    );

    if (saleRes.error || !saleRes.data) {
      return saleRes as ServiceResponse<any>;
    }

    const updatedSale = saleRes.data;

    if (itemsPayload) {
      // Replace existing line items
      await supabase.from('sales_items').delete().eq('invoice_id' as any, id);

      if (itemsPayload.length > 0) {
        const cleanItems = itemsPayload.map(item => ({
          ...item,
          invoice_id: id,
          tenant_id: updatedSale.tenant_id
        }));

        const itemsRes = await handleServiceCall<SalesItemRow[]>(
          supabase.from('sales_items').insert(cleanItems as any).select()
        );

        return {
          data: {
            ...updatedSale,
            items: itemsRes.data || []
          },
          error: null
        };
      }
    }

    return {
      data: {
        ...updatedSale,
        items: []
      },
      error: null
    };
  }

  /**
   * Delete a sales invoice and its line items
   */
  static async deleteSale(id: string): Promise<ServiceResponse<null>> {
    await supabase.from('sales_items').delete().eq('invoice_id' as any, id);
    return handleServiceCall(
      supabase.from('sales_invoices').delete().eq('id', id)
    );
  }

  /**
   * Validate duplicate invoice number
   */
  static async validateDuplicateInvoiceNumber(invoiceNumber: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!invoiceNumber || !invoiceNumber.trim()) return false;

    let query = supabase
      .from('sales_invoices')
      .select('id')
      .ilike('invoice_number', invoiceNumber.trim());

    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    if (tenantId && isValidUUID(tenantId)) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }
}
