import { supabase, handleServiceCall, ServiceResponse } from './baseService';
import type { Product } from '../types/erp.types';

export class ProductService {
  /**
   * Fetch all products for a given tenant ordered by product_name
   */
  static async fetchProducts(tenantId?: string): Promise<ServiceResponse<Product[]>> {
    let query = supabase.from('products').select('*').order('product_name', { ascending: true });
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Get product by ID
   */
  static async getProductById(id: string): Promise<ServiceResponse<Product>> {
    return handleServiceCall(
      supabase.from('products').select('*').eq('id', id).single()
    );
  }

  /**
   * Get product by Barcode
   */
  static async getProductByBarcode(barcode: string, tenantId?: string): Promise<ServiceResponse<Product>> {
    let query = supabase.from('products').select('*').eq('barcode', barcode);
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query.maybeSingle());
  }

  /**
   * Search products by name, category, or barcode
   */
  static async searchProducts(queryStr: string, tenantId?: string): Promise<ServiceResponse<Product[]>> {
    const term = `%${queryStr.trim()}%`;
    let query = supabase
      .from('products')
      .select('*')
      .or(`product_name.ilike.${term},category_name.ilike.${term},barcode.ilike.${term}`)
      .order('product_name', { ascending: true });

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    return handleServiceCall(query);
  }

  /**
   * Create a new product preserving provided ID or generated UUID
   */
  static async createProduct(productData: Partial<Product>): Promise<ServiceResponse<Product>> {
    return handleServiceCall(
      supabase.from('products').insert([productData as any]).select().single()
    );
  }

  /**
   * Update an existing product by ID
   */
  static async updateProduct(id: string, updates: Partial<Product>): Promise<ServiceResponse<Product>> {
    return handleServiceCall(
      supabase.from('products').update(updates as any).eq('id', id).select().single()
    );
  }

  /**
   * Delete a product by ID
   */
  static async deleteProduct(id: string): Promise<ServiceResponse<null>> {
    return handleServiceCall(
      supabase.from('products').delete().eq('id', id)
    );
  }

  /**
   * Validate duplicate product name
   */
  static async validateDuplicateProduct(name: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!name || !name.trim()) return false;
    let query = supabase.from('products').select('id').ilike('product_name', name.trim());
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }

  /**
   * Validate duplicate SKU
   */
  static async validateSKU(sku: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!sku || !sku.trim()) return false;
    let query = supabase.from('products').select('id').eq('sku', sku.trim());
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }

  /**
   * Validate duplicate Barcode
   */
  static async validateBarcode(barcode: string, excludeId?: string, tenantId?: string): Promise<boolean> {
    if (!barcode || !barcode.trim()) return false;
    let query = supabase.from('products').select('id').eq('barcode', barcode.trim());
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query;
    return Boolean(data && data.length > 0);
  }
}
