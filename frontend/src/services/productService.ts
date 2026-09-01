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
      .or(`product_name.ilike.${term},category_name.ilike.${term},barcode.ilike.${term},product_code.ilike.${term}`)
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
    try {
      if (!productData.product_code) {
        let query = supabase
          .from('products')
          .select('product_code')
          .not('product_code', 'is', null)
          .order('product_code', { ascending: false })
          .limit(1);
          
        if (productData.tenant_id) {
          query = query.eq('tenant_id', productData.tenant_id);
        }

        const { data: codeData, error: codeError } = await query.maybeSingle();
        
        let nextNumber = 1;
        if (codeData && codeData.product_code) {
          const match = codeData.product_code.match(/PRD-(\d+)/);
          if (match && match[1]) {
            nextNumber = parseInt(match[1], 10) + 1;
          }
        }
        productData.product_code = `PRD-${nextNumber.toString().padStart(4, '0')}`;
      }

      return handleServiceCall(
        supabase.from('products').insert([productData as any]).select().single()
      );
    } catch (error: any) {
      return { data: null, error };
    }
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
    try {
      await supabase.from('purchase_items').update({ product_id: null }).eq('product_id', id);
      await supabase.from('sales_items').update({ product_id: null }).eq('product_id', id);
    } catch (e) {}

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

  /**
   * Fetch all unit conversions for a specific product
   */
  static async fetchProductConversions(productId: string): Promise<ServiceResponse<any[]>> {
    return handleServiceCall(
      supabase.from('product_unit_conversions').select('*').eq('product_id', productId)
    );
  }

  /**
   * Fetch all unit conversions globally
   */
  static async fetchAllConversions(tenantId?: string): Promise<ServiceResponse<any[]>> {
    let query = supabase.from('product_unit_conversions').select('*');
    if (tenantId) query = query.eq('tenant_id', tenantId);
    return handleServiceCall(query);
  }

  /**
   * Replace all product conversions safely
   */
  static async saveProductConversions(productId: string, conversions: any[]): Promise<ServiceResponse<null>> {
    try {
      // First delete existing ones
      await supabase.from('product_unit_conversions').delete().eq('product_id', productId);
      
      if (conversions && conversions.length > 0) {
        await supabase.from('product_unit_conversions').insert(conversions);
      }
      return { data: null, error: null };
    } catch (e: any) {
      return { data: null, error: e.message || 'Failed to save conversions' };
    }
  }
}
