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
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => products.length === 0);

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const generateUuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'f' + Date.now().toString(16).padStart(31, '0').slice(0, 31);

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
    const productId = (productPayload.id && isUuid(productPayload.id)) 
      ? productPayload.id 
      : generateUuid();

    const activeTenantId = (tenantId && isUuid(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';

    const cleanPayload: any = {
      id: productId,
      tenant_id: activeTenantId,
      product_name: productPayload.product_name || 'General Product',
      sku: productPayload.sku || null,
      barcode: productPayload.barcode || null,
      category_name: productPayload.category_name || 'General',
      brand_name: productPayload.brand_name || 'Generic',
      unit: productPayload.s_unit || productPayload.unit || 'Pcs',
      purchase_price: Number(productPayload.purchase_price || 0),
      selling_price: Number(productPayload.selling_price || 0),
      dealer_price: Number(productPayload.dealer_price || 0),
      mrp: Number(productPayload.mrp || 0),
      current_stock: Number(productPayload.current_stock || 0),
      min_stock_level: Number(productPayload.min_stock_level || 10),
      status: 'Active',
      hsn: productPayload.hsn || null,
      size: productPayload.size || null,
      weight: productPayload.weight || null,
      description: productPayload.description || null,
      godown: productPayload.godown || null,
      rack_number: productPayload.rack_number || null,
      shelf_number: productPayload.shelf_number || null,
      warehouse_location: productPayload.warehouse_location || null,
      p_unit: productPayload.p_unit || 'Pcs',
      s_unit: productPayload.s_unit || 'Pcs',
      pieces_per_pack: Number(productPayload.pieces_per_pack || 1),
      piece_selling_price: Number(productPayload.piece_selling_price || 0)
    };

    // 1. Instant local cache and UI state update (0ms latency!)
    try {
      const localStr = localStorage.getItem('lk_products') || '[]';
      const localList: Product[] = JSON.parse(localStr);
      const existingIdx = localList.findIndex(p => p.id === productId);
      if (existingIdx >= 0) {
        localList[existingIdx] = { ...localList[existingIdx], ...cleanPayload };
      } else {
        localList.unshift(cleanPayload);
      }
      localStorage.setItem('lk_products', JSON.stringify(localList));
      setProducts(localList);
    } catch (err) {}

    // 2. Non-blocking asynchronous remote Supabase upsert in background
    (async () => {
      try {
        const { error } = await supabase.from('products').upsert(cleanPayload);
        if (error) {
          console.warn('Supabase product upsert note:', error.message);
          // Fallback core fields if extra custom columns fail schema check
          const corePayload = {
            id: cleanPayload.id,
            product_name: cleanPayload.product_name,
            purchase_price: cleanPayload.purchase_price,
            selling_price: cleanPayload.selling_price,
            current_stock: cleanPayload.current_stock,
            min_stock_level: cleanPayload.min_stock_level,
            unit: cleanPayload.unit || 'Pcs',
            hsn: cleanPayload.hsn || null
          };
          await supabase.from('products').upsert(corePayload);
        }
      } catch (err) {
        console.warn('Supabase remote background save note:', err);
      }
    })();

    window.dispatchEvent(new Event('storage'));
    return cleanPayload;
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
