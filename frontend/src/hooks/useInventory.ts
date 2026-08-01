import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import type { Product } from '../types/erp.types';

const DEFAULT_HARDWARE_PRODUCTS: Product[] = [
  {
    id: 'prod-seed-1',
    tenant_id: 'default-hardware-erp',
    product_name: 'ULTRATECH CEMENT BAG (50KG)',
    hsn: '2523',
    purchase_price: 340,
    selling_price: 390,
    current_stock: 120,
    min_stock_level: 25,
    unit: 'Bags',
    p_unit: 'Bags',
    s_unit: 'Bags',
    warehouse_location: 'Godown A - Rack 1'
  },
  {
    id: 'prod-seed-2',
    tenant_id: 'default-hardware-erp',
    product_name: 'STAINLESS STEEL DOOR HINGES (4 INCH)',
    hsn: '8302',
    purchase_price: 45,
    selling_price: 75,
    current_stock: 350,
    min_stock_level: 50,
    unit: 'Pairs',
    p_unit: 'Box',
    s_unit: 'Pairs',
    warehouse_location: 'Shelf 3B'
  },
  {
    id: 'prod-seed-3',
    tenant_id: 'default-hardware-erp',
    product_name: 'SUPREME PVC PIPE 110MM (6 METER)',
    hsn: '3917',
    purchase_price: 420,
    selling_price: 540,
    current_stock: 45,
    min_stock_level: 10,
    unit: 'Pcs',
    p_unit: 'Bundle',
    s_unit: 'Pcs',
    warehouse_location: 'Outside Pipe Yard'
  },
  {
    id: 'prod-seed-4',
    tenant_id: 'default-hardware-erp',
    product_name: 'GALVANIZED IRON WIRE NAILS (2 INCH)',
    hsn: '7317',
    purchase_price: 65,
    selling_price: 90,
    current_stock: 80,
    min_stock_level: 15,
    unit: 'Kg',
    p_unit: 'Box (20kg)',
    s_unit: 'Kg',
    warehouse_location: 'Counter Drawer 1'
  },
  {
    id: 'prod-seed-5',
    tenant_id: 'default-hardware-erp',
    product_name: 'ASIAN PAINTS TRACTOR EMULSION (20 LITRE)',
    hsn: '3209',
    purchase_price: 2100,
    selling_price: 2650,
    current_stock: 18,
    min_stock_level: 5,
    unit: 'Buckets',
    p_unit: 'Buckets',
    s_unit: 'Buckets',
    warehouse_location: 'Paint Section Shelf A'
  },
  {
    id: 'prod-seed-6',
    tenant_id: 'default-hardware-erp',
    product_name: 'ANCHOR ROMA 6A 1-WAY MODULAR SWITCH',
    hsn: '8536',
    purchase_price: 22,
    selling_price: 38,
    current_stock: 200,
    min_stock_level: 30,
    unit: 'Pcs',
    p_unit: 'Box (20pcs)',
    s_unit: 'Pcs',
    warehouse_location: 'Electrical Rack 2'
  }
];

export function useInventory(tenantId: string, businessType?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const fetchProducts = async () => {
    let remoteProducts: Product[] = [];
    const activeTenantId = (tenantId && isUuid(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`tenant_id.eq.${activeTenantId},tenant_id.eq.default-hardware-erp`)
        .order('product_name', { ascending: true });

      if (!error && data) {
        remoteProducts = data as Product[];
      }
    } catch (e) {
      console.warn('Remote product sync note:', e);
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

      let combined = Array.from(prodMap.values());
      if (combined.length === 0) {
        combined = DEFAULT_HARDWARE_PRODUCTS;
      }

      setProducts(combined);
      localStorage.setItem('lk_products', JSON.stringify(combined));
    } catch (e) {
      setProducts(remoteProducts.length > 0 ? remoteProducts : DEFAULT_HARDWARE_PRODUCTS);
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

    // 2. Attempt remote Supabase database insert/update
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
      console.warn('Supabase remote save note (saving locally):', err);
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
