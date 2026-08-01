import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import type { Product } from '../types/erp.types';

export function useInventory(tenantId: string, businessType?: string) {
  // 1. Instant local initial state load (0ms latency)
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const localStr = localStorage.getItem('lk_products');
      if (localStr) {
        const parsed = JSON.parse(localStr);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => products.length === 0);

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('product_name', { ascending: true });

      if (!error && data && Array.isArray(data)) {
        const remoteProducts = data as Product[];
        const localStr = localStorage.getItem('lk_products') || '[]';
        let localList: Product[] = [];
        try { localList = JSON.parse(localStr); } catch (e) {}

        const prodMap = new Map<string, Product>();
        remoteProducts.forEach(p => { if (p && p.id) prodMap.set(p.id, p); });
        localList.forEach(p => { if (p && p.id && !prodMap.has(p.id)) prodMap.set(p.id, p); });

        const combined = Array.from(prodMap.values());
        setProducts(combined);
        try { localStorage.setItem('lk_products', JSON.stringify(combined)); } catch (e) {}
      }
    } catch (e) {
      console.warn('Remote product sync note:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    window.addEventListener('storage', fetchProducts);
    return () => window.removeEventListener('storage', fetchProducts);
  }, [tenantId, businessType]);

  const saveProduct = (productPayload: Omit<Product, 'created_at'> & { id?: string }) => {
    const cleanPayload = { ...productPayload };
    const productId = cleanPayload.id || 'prod-' + Date.now();
    const activeTenantId = (tenantId && isUuid(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';
    
    const newProdObj: Product = {
      ...cleanPayload,
      id: productId,
      tenant_id: activeTenantId,
      product_name: cleanPayload.product_name || 'General Product',
      purchase_price: Number(cleanPayload.purchase_price || 0),
      selling_price: Number(cleanPayload.selling_price || 0),
      current_stock: Number(cleanPayload.current_stock || 0),
      min_stock_level: Number(cleanPayload.min_stock_level || 10),
      created_at: new Date().toISOString()
    } as Product;

    // 1. Instant local cache and UI state update (0ms latency!)
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

    // 2. Non-blocking asynchronous remote Supabase sync in background
    (async () => {
      try {
        if (cleanPayload.id && isUuid(cleanPayload.id)) {
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
          const insertPayload = { ...cleanPayload, tenant_id: activeTenantId };
          const { error } = await supabase.from('products').insert(insertPayload);
          if (error && (error.message?.includes('column') || (error as any).code === 'PGRST204')) {
            delete (insertPayload as any).dealer_price;
            delete (insertPayload as any).mrp;
            delete (insertPayload as any).gst;
            delete (insertPayload as any).godown;
            delete (insertPayload as any).rack_number;
            delete (insertPayload as any).shelf_number;
            await supabase.from('products').insert(insertPayload);
          }
        }
      } catch (err) {
        console.warn('Supabase remote background save note:', err);
      }
    })();

    window.dispatchEvent(new Event('storage'));
    return newProdObj;
  };

  const deleteProduct = (productId: string) => {
    // 1. Instant local cache deletion (0ms latency!)
    try {
      const localStr = localStorage.getItem('lk_products') || '[]';
      const localList: Product[] = JSON.parse(localStr);
      const updated = localList.filter(p => p.id !== productId);
      localStorage.setItem('lk_products', JSON.stringify(updated));
      setProducts(updated);
    } catch (err) {}

    // 2. Non-blocking asynchronous remote Supabase deletion
    (async () => {
      try {
        await supabase.from('products').delete().eq('id', productId);
      } catch (err) {}
    })();

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
