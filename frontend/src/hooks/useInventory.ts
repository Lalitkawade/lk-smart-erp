import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import type { Product } from '../types/erp.types';

export function useInventory(tenantId: string, businessType?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProducts = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('product_name', { ascending: true });

      if (error) throw error;

      let currentProducts: Product[] = (data || []) as Product[];

      setProducts(currentProducts);
    } catch (e) {
      console.error('Failed to load inventory from Supabase:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Load products from Supabase on mount/tenant changes
  useEffect(() => {
    fetchProducts();
    // Listen to storage/app events to refresh database state locally
    window.addEventListener('storage', fetchProducts);
    return () => window.removeEventListener('storage', fetchProducts);
  }, [tenantId, businessType]);

  const saveProduct = async (productPayload: Omit<Product, 'created_at'> & { id?: string }) => {
    try {
      let result;
      const cleanPayload = { ...productPayload };

      if (cleanPayload.id) {
        // Edit Product
        const { data, error } = await supabase
          .from('products')
          .update(cleanPayload)
          .eq('id', cleanPayload.id)
          .select()
          .single();

        if (error) {
          if (error.message?.includes('column') || (error as any).code === 'PGRST204') {
            delete (cleanPayload as any).dealer_price;
            delete (cleanPayload as any).mrp;
            delete (cleanPayload as any).gst;
            delete (cleanPayload as any).godown;
            delete (cleanPayload as any).rack_number;
            delete (cleanPayload as any).shelf_number;

            const { data: retryData, error: retryErr } = await supabase
              .from('products')
              .update(cleanPayload)
              .eq('id', cleanPayload.id)
              .select()
              .single();

            if (retryErr) throw retryErr;
            result = retryData;
          } else {
            throw error;
          }
        } else {
          result = data;
        }
      } else {
        // Add Product
        const { data, error } = await supabase
          .from('products')
          .insert({
            ...cleanPayload,
            tenant_id: tenantId
          })
          .select()
          .single();

        if (error) {
          if (error.message?.includes('column') || (error as any).code === 'PGRST204') {
            delete (cleanPayload as any).dealer_price;
            delete (cleanPayload as any).mrp;
            delete (cleanPayload as any).gst;
            delete (cleanPayload as any).godown;
            delete (cleanPayload as any).rack_number;
            delete (cleanPayload as any).shelf_number;

            const { data: retryData, error: retryErr } = await supabase
              .from('products')
              .insert({
                ...cleanPayload,
                tenant_id: tenantId
              })
              .select()
              .single();

            if (retryErr) throw retryErr;
            result = retryData;
          } else {
            throw error;
          }
        } else {
          result = data;
        }
      }

      // Re-fetch list
      await fetchProducts();
      window.dispatchEvent(new Event('storage'));
      return result;
    } catch (e) {
      console.error('Failed to save product in Supabase:', e);
      throw e;
    }
  };

  const deleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      await fetchProducts();
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error('Failed to delete product in Supabase:', e);
      throw e;
    }
  };

  return {
    products,
    isLoading,
    saveProduct,
    deleteProduct,
    isSaving: false,
    isDeleting: false
  };
}

