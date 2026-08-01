import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import type { Product } from '../types/erp.types';

export function useInventory(tenantId: string, businessType?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const fetchProducts = async () => {
    let remoteProducts: Product[] = [];
    if (tenantId && isUuid(tenantId)) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('product_name', { ascending: true });

        if (!error && data) {
          remoteProducts = data as Product[];
        }
      } catch (e) {
        console.warn('Remote product sync note:', e);
      }
    }

    // Merge with local storage cache for offline/resilient access
    try {
      const localStr = localStorage.getItem('lk_products') || '[]';
      const localList: Product[] = JSON.parse(localStr);
      const prodMap = new Map<string, Product>();

      remoteProducts.forEach(p => prodMap.set(p.id, p));
      localList.forEach(p => {
        if (!prodMap.has(p.id)) prodMap.set(p.id, p);
      });

      const combined = Array.from(prodMap.values());
      setProducts(combined);
      localStorage.setItem('lk_products', JSON.stringify(combined));
    } catch (e) {
      setProducts(remoteProducts);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    window.addEventListener('storage', fetchProducts);
    return () => window.removeEventListener('storage', fetchProducts);
  }, [tenantId, businessType]);

  const saveProduct = async (productPayload: Omit<Product, 'created_at'> & { id?: string }) => {
    const cleanPayload = { ...productPayload };
    const productId = cleanPayload.id || 'prod-' + Date.now();
    
    const newProdObj: Product = {
      ...cleanPayload,
      id: productId,
      tenant_id: tenantId || 'default-hardware-erp',
      product_name: cleanPayload.product_name || 'General Product',
      purchase_price: Number(cleanPayload.purchase_price || 0),
      selling_price: Number(cleanPayload.selling_price || 0),
      current_stock: Number(cleanPayload.current_stock || 0),
      min_stock_level: Number(cleanPayload.min_stock_level || 10),
      created_at: new Date().toISOString()
    } as Product;

    // 1. Immediate local cache and state persistence
    try {
      const localStr = localStorage.getItem('lk_products') || '[]';
      const localList: Product[] = JSON.parse(localStr);
      const existingIdx = localList.findIndex(p => p.id === productId);
      if (existingIdx >= 0) {
        localList[existingIdx] = { ...localList[existingIdx], ...newProdObj };
      } else {
        localList.unshift(newProdObj);
      }
      localStorage.setItem('lk_products', JSON.stringify(localList));
      setProducts(localList);
    } catch (err) {}

    // 2. Attempt remote Supabase database insert/update if valid UUID
    if (tenantId && isUuid(tenantId)) {
      try {
        if (cleanPayload.id) {
          const { error } = await supabase.from('products').update(cleanPayload).eq('id', cleanPayload.id);
          if (error && (error.message?.includes('column') || (error as any).code === 'PGRST204')) {
            delete (cleanPayload as any).dealer_price;
            delete (cleanPayload as any).mrp;
            delete (cleanPayload as any).gst;
            delete (cleanPayload as any).godown;
            delete (cleanPayload as any).rack_number;
            delete (cleanPayload as any).shelf_number;
            await supabase.from('products').update(cleanPayload).eq('id', cleanPayload.id);
          }
        } else {
          const { error } = await supabase.from('products').insert({ ...cleanPayload, tenant_id: tenantId });
          if (error && (error.message?.includes('column') || (error as any).code === 'PGRST204')) {
            delete (cleanPayload as any).dealer_price;
            delete (cleanPayload as any).mrp;
            delete (cleanPayload as any).gst;
            delete (cleanPayload as any).godown;
            delete (cleanPayload as any).rack_number;
            delete (cleanPayload as any).shelf_number;
            await supabase.from('products').insert({ ...cleanPayload, tenant_id: tenantId });
          }
        }
      } catch (err) {
        console.warn('Supabase remote save note (saving locally):', err);
      }
    }

    window.dispatchEvent(new Event('storage'));
    return newProdObj;
  };

  const deleteProduct = async (productId: string) => {
    // 1. Immediate local cache deletion
    try {
      const localStr = localStorage.getItem('lk_products') || '[]';
      const localList: Product[] = JSON.parse(localStr);
      const updated = localList.filter(p => p.id !== productId);
      localStorage.setItem('lk_products', JSON.stringify(updated));
      setProducts(updated);
    } catch (err) {}

    // 2. Attempt remote Supabase deletion
    if (tenantId && isUuid(tenantId)) {
      try {
        await supabase.from('products').delete().eq('id', productId);
      } catch (err) {}
    }

    window.dispatchEvent(new Event('storage'));
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
