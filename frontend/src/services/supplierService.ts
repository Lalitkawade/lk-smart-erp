import { supabase, handleServiceCall, ServiceResponse } from './baseService';
import type { Supplier } from '../types/erp.types';

export class SupplierService {
  /**
   * Fetch all suppliers for a given tenant ordered by supplier_name
   */
  static async fetchSuppliers(tenantId?: string): Promise<ServiceResponse<Supplier[]>> {
    let query = supabase.from('suppliers').select('*').order('supplier_name', { ascending: true });
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Get supplier by ID
   */
  static async getSupplierById(id: string): Promise<ServiceResponse<Supplier>> {
    return handleServiceCall(
      supabase.from('suppliers').select('*').eq('id', id).single()
    );
  }

  /**
   * Get supplier by Phone number
   */
  static async getSupplierByPhone(phone: string, tenantId?: string): Promise<ServiceResponse<Supplier>> {
    let query = supabase.from('suppliers').select('*').eq('phone', phone.trim());
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query.maybeSingle());
  }

  /**
   * Search suppliers by name, phone, or email
   */
  static async searchSuppliers(queryStr: string, tenantId?: string): Promise<ServiceResponse<Supplier[]>> {
    const term = `%${queryStr.trim()}%`;
    let query = supabase
      .from('suppliers')
      .select('*')
      .or(`supplier_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
      .order('supplier_name', { ascending: true });

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Create a new supplier preserving provided ID or generated UUID
   */
  static async createSupplier(supplierData: Partial<Supplier>): Promise<ServiceResponse<Supplier>> {
    return handleServiceCall(
      supabase.from('suppliers').insert([supplierData as any]).select().single()
    );
  }

  /**
   * Update an existing supplier by ID
   */
  static async updateSupplier(id: string, updates: Partial<Supplier>): Promise<ServiceResponse<Supplier>> {
    return handleServiceCall(
      supabase.from('suppliers').update(updates as any).eq('id', id).select().single()
    );
  }

  /**
   * Delete a supplier by ID
   */
  static async deleteSupplier(id: string): Promise<ServiceResponse<null>> {
    return handleServiceCall(
      supabase.from('suppliers').delete().eq('id', id)
    );
  }

  /**
   * Validate duplicate supplier name
   */
  static async validateDuplicateSupplier(name: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!name || !name.trim()) return false;
    let query = supabase.from('suppliers').select('id').ilike('supplier_name', name.trim());
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }

  /**
   * Validate duplicate phone number
   */
  static async validatePhone(phone: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!phone || !phone.trim()) return false;
    let query = supabase.from('suppliers').select('id').eq('phone', phone.trim());
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }

  /**
   * Validate GST number format if provided
   */
  static validateGST(gstin: string): boolean {
    if (!gstin || !gstin.trim()) return true;
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gstin.trim().toUpperCase());
  }
}
