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

        // Deduplicate and merge local and remote products cleanly
        const finalMap = new Map<string, Product>();
        const nameIndex = new Map<string, string>(); // normName -> canonical ID

        // 1. Index local products
        localList.forEach(p => {
          if (p && p.id) {
            finalMap.set(p.id, p);
            if (p.product_name) {
              nameIndex.set(p.product_name.trim().toUpperCase(), p.id);
            }
          }
        });

        // 2. Merge remote products, deleting old temp local keys if matched by name
        remoteProducts.forEach(rp => {
          if (!rp || !rp.id) return;
          const normName = rp.product_name ? rp.product_name.trim().toUpperCase() : '';
          const existingId = finalMap.has(rp.id) ? rp.id : (normName ? nameIndex.get(normName) : undefined);

          if (existingId && finalMap.has(existingId)) {
            const localItem = finalMap.get(existingId)!;
            if (existingId !== rp.id) {
              finalMap.delete(existingId);
            }
            const stockVal = Math.max(Number(localItem.current_stock || 0), Number(rp.current_stock ?? 0));
            const merged: Product = {
              ...rp,
              ...localItem,
              id: rp.id,
              current_stock: stockVal
            };
            finalMap.set(rp.id, merged);
            if (normName) nameIndex.set(normName, rp.id);
          } else {
            finalMap.set(rp.id, rp);
            if (normName) nameIndex.set(normName, rp.id);
          }
        });

        // 3. Final safety deduplication by normalized product name
        const uniqueByName = new Map<string, Product>();
        Array.from(finalMap.values()).forEach(p => {
          if (!p || !p.id) return;
          const key = p.product_name ? p.product_name.trim().toUpperCase() : p.id;
          if (uniqueByName.has(key)) {
            const prev = uniqueByName.get(key)!;
            const mergedStock = Math.max(Number(prev.current_stock || 0), Number(p.current_stock || 0));
            uniqueByName.set(key, {
              ...prev,
              ...p,
              current_stock: mergedStock
            });
          } else {
            uniqueByName.set(key, p);
          }
        });

        const mergedProducts = Array.from(uniqueByName.values());

        // Read local purchase and sales ledgers to calculate live accurate stock levels
        let purchasesLedger: any[] = [];
        let salesLedger: any[] = [];
        try { purchasesLedger = JSON.parse(localStorage.getItem('lk_purchases') || '[]'); } catch(e) {}
        try { salesLedger = JSON.parse(localStorage.getItem('lk_sales') || '[]'); } catch(e) {}

        // Collect unique products by ID with dynamically computed ledger stock
        const uniqueProductsMap = new Map<string, Product>();
        mergedProducts.forEach(p => {
          if (p && p.id) {
            const pId = p.id;
            const pName = p.product_name ? p.product_name.trim().toLowerCase() : '';

            // Calculate total purchases from ledger
            let totalPurchased = 0;
            purchasesLedger.forEach(bill => {
              const items = bill.items || bill.purchase_items || [];
              if (!items || items.length === 0) {
                const matchId = bill.product_id && String(bill.product_id) === String(pId);
                const matchName = bill.product_name && pName && bill.product_name.trim().toLowerCase() === pName;
                if (matchId || matchName) {
                  totalPurchased += Number(bill.qty || bill.quantity || 1);
                }
              } else {
                items.forEach((item: any) => {
                  const itemProdId = item.product_id || item.product?.id;
                  const itemProdName = item.product_name || item.product?.product_name;
                  const matchId = itemProdId && String(itemProdId) === String(pId);
                  const matchName = itemProdName && pName && itemProdName.trim().toLowerCase() === pName;
                  if (matchId || matchName) {
                    totalPurchased += Number(item.qty || item.quantity || 1);
                  }
                });
              }
            });

            // Calculate total sales from ledger
            let totalSold = 0;
            salesLedger.forEach(inv => {
              const items = inv.items || inv.sales_items || [];
              if (!items || items.length === 0) {
                const matchId = inv.product_id && String(inv.product_id) === String(pId);
                const matchName = inv.product_name && pName && inv.product_name.trim().toLowerCase() === pName;
                if (matchId || matchName) {
                  totalSold += Number(inv.qty || inv.quantity || 1);
                }
              } else {
                items.forEach((item: any) => {
                  const itemProdId = item.product_id || item.product?.id;
                  const itemProdName = item.product_name || item.product?.product_name;
                  const matchId = itemProdId && String(itemProdId) === String(pId);
                  const matchName = itemProdName && pName && itemProdName.trim().toLowerCase() === pName;
                  if (matchId || matchName) {
                    totalSold += Number(item.qty || item.quantity || 1);
                  }
                });
              }
            });

            const baseStock = Number(p.current_stock || 0);
            const liveStock = totalPurchased > 0 
              ? Math.max(baseStock, totalPurchased - totalSold) 
              : Math.max(0, baseStock - totalSold);

            const pPrice = Number(p.purchase_price || 0);
            const sPrice = Number(p.selling_price || 0);
            const rawPack = Number(p.pieces_per_pack || 0);
            const isBulkLeak = pPrice > sPrice * 2 && rawPack <= 1;

            uniqueProductsMap.set(p.id, {
              ...p,
              p_unit: isBulkLeak ? (p.p_unit && p.p_unit !== p.s_unit ? p.p_unit : 'Box') : (p.p_unit || 'Pcs'),
              s_unit: isBulkLeak ? (p.s_unit && p.s_unit !== 'Box' && p.s_unit !== 'PCS' ? p.s_unit : 'Nos') : (p.s_unit || 'Pcs'),
              unit: isBulkLeak ? (p.s_unit && p.s_unit !== 'Box' && p.s_unit !== 'PCS' ? p.s_unit : 'Nos') : (p.unit || p.s_unit || 'Pcs'),
              pieces_per_pack: isBulkLeak ? 100 : (rawPack || 1),
              current_stock: liveStock
            });
          }
        });
        const combined = Array.from(uniqueProductsMap.values());
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
    window.addEventListener('lk_inventory_updated', fetchProducts);
    return () => {
      window.removeEventListener('storage', fetchProducts);
      window.removeEventListener('lk_inventory_updated', fetchProducts);
    };
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
      created_at: (productPayload as any).created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pieces_per_pack: Number(productPayload.pieces_per_pack || 1),
      piece_selling_price: Number(productPayload.piece_selling_price || 0),
      allow_decimal: Boolean(productPayload.allow_decimal),
      allow_purchase_unit_selling: productPayload.allow_purchase_unit_selling !== undefined ? Boolean(productPayload.allow_purchase_unit_selling) : true,
      track_base_unit: productPayload.track_base_unit !== undefined ? Boolean(productPayload.track_base_unit) : true
    };

    // 1. Instant local cache and UI state update (0ms latency!)
    try {
      const localStr = localStorage.getItem('lk_products') || '[]';
      const localList: Product[] = JSON.parse(localStr);
      const existingIdx = localList.findIndex(p => p.id === productId);
      if (existingIdx >= 0) {
        const updatedItem = { ...localList[existingIdx], ...cleanPayload, updated_at: new Date().toISOString() };
        localList.splice(existingIdx, 1);
        localList.unshift(updatedItem);
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
            tenant_id: activeTenantId,
            product_name: cleanPayload.product_name,
            sku: cleanPayload.sku || null,
            barcode: cleanPayload.barcode || null,
            category_name: cleanPayload.category_name || 'General',
            brand_name: cleanPayload.brand_name || 'Generic',
            unit: cleanPayload.unit || 'Pcs',
            purchase_price: cleanPayload.purchase_price,
            selling_price: cleanPayload.selling_price,
            current_stock: cleanPayload.current_stock,
            min_stock_level: cleanPayload.min_stock_level,
            status: 'Active',
            hsn: cleanPayload.hsn || null
          };
          const { error: coreErr } = await supabase.from('products').upsert(corePayload);
          if (coreErr) {
            const ultraMinimalPayload = {
              id: cleanPayload.id,
              tenant_id: activeTenantId,
              product_name: cleanPayload.product_name,
              purchase_price: cleanPayload.purchase_price,
              selling_price: cleanPayload.selling_price,
              current_stock: cleanPayload.current_stock
            };
            await supabase.from('products').upsert(ultraMinimalPayload);
          }
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
