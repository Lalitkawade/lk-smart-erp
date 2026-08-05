import { supabase, handleServiceCall, ServiceResponse } from './baseService';
import type { Customer } from '../types/erp.types';

export class CustomerService {
  /**
   * Fetch all customers for a given tenant ordered by customer_name
   */
  static async fetchCustomers(tenantId?: string): Promise<ServiceResponse<Customer[]>> {
    let query = supabase.from('customers').select('*').order('customer_name', { ascending: true });
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(id: string): Promise<ServiceResponse<Customer>> {
    return handleServiceCall(
      supabase.from('customers').select('*').eq('id', id).single()
    );
  }

  /**
   * Get customer by Phone number
   */
  static async getCustomerByPhone(phone: string, tenantId?: string): Promise<ServiceResponse<Customer>> {
    let query = supabase.from('customers').select('*').eq('phone', phone.trim());
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query.maybeSingle());
  }

  /**
   * Search customers by name, phone, or email
   */
  static async searchCustomers(queryStr: string, tenantId?: string): Promise<ServiceResponse<Customer[]>> {
    const term = `%${queryStr.trim()}%`;
    let query = supabase
      .from('customers')
      .select('*')
      .or(`customer_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
      .order('customer_name', { ascending: true });

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Create a new customer preserving provided ID or generated UUID
   */
  static async createCustomer(customerData: Partial<Customer>): Promise<ServiceResponse<Customer>> {
    return handleServiceCall(
      supabase.from('customers').insert([customerData as any]).select().single()
    );
  }

  /**
   * Update an existing customer by ID
   */
  static async updateCustomer(id: string, updates: Partial<Customer>): Promise<ServiceResponse<Customer>> {
    return handleServiceCall(
      supabase.from('customers').update(updates as any).eq('id', id).select().single()
    );
  }

  /**
   * Delete a customer by ID
   */
  static async deleteCustomer(id: string): Promise<ServiceResponse<null>> {
    return handleServiceCall(
      supabase.from('customers').delete().eq('id', id)
    );
  }

  /**
   * Validate duplicate phone number
   */
  static async validateDuplicatePhone(phone: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!phone || !phone.trim()) return false;
    let query = supabase.from('customers').select('id').eq('phone', phone.trim());
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }
}
