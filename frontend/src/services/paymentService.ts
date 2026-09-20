import { handleServiceCall, ServiceResponse } from './baseService';
import { supabase } from '../api/supabase';
import type { CustomerPaymentRow, CustomerPaymentInsert, SupplierPaymentRow, SupplierPaymentInsert } from '../types/database.types';


export class PaymentService {
  /**
   * Fetch all customer payments for a tenant
   */
  static async fetchCustomerPayments(tenantId: string): Promise<ServiceResponse<CustomerPaymentRow[]>> {
    if (!tenantId) {
      return handleServiceCall(
        supabase.from('customer_payments').select('*').order('payment_date', { ascending: false })
      );
    }

    return handleServiceCall(
      supabase.from('customer_payments').select('*').eq('tenant_id', tenantId).order('payment_date', { ascending: false })
    );
  }

  /**
   * Record a customer payment entry in Supabase
   */
  static async recordCustomerPayment(payload: CustomerPaymentInsert): Promise<ServiceResponse<CustomerPaymentRow>> {
    const cleanPayload = {
      ...payload,
      tenant_id: payload.tenant_id || '00000000-0000-0000-0000-000000000000'
    };

    return handleServiceCall(
      supabase.from('customer_payments').insert(cleanPayload).select().single()
    );
  }

  /**
   * Fetch all supplier payments for a tenant
   */
  static async fetchSupplierPayments(tenantId: string): Promise<ServiceResponse<SupplierPaymentRow[]>> {
    if (!tenantId) {
      return handleServiceCall(
        supabase.from('supplier_payments').select('*').order('payment_date', { ascending: false })
      );
    }

    return handleServiceCall(
      supabase.from('supplier_payments').select('*').eq('tenant_id', tenantId).order('payment_date', { ascending: false })
    );
  }

  /**
   * Record a supplier payment entry in Supabase
   */
  static async recordSupplierPayment(payload: SupplierPaymentInsert): Promise<ServiceResponse<SupplierPaymentRow>> {
    const cleanPayload = {
      ...payload,
      tenant_id: payload.tenant_id || '00000000-0000-0000-0000-000000000000'
    };

    return handleServiceCall(
      supabase.from('supplier_payments').insert(cleanPayload).select().single()
    );
  }
}
