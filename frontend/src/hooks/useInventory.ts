import { useState } from 'react';
import { ProductService } from '../services/productService';
import { useErpContext } from '../context/ErpContext';
import type { Product } from '../types/erp.types';

export function useInventory(tenantId: string, _businessType?: string) {
  const { products: contextProducts, isLoading: contextLoading, refreshAllData, setProducts } = useErpContext();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const normalizeProduct = (p: Product): Product => {
    const pPrice = Number(p.purchase_price || 0);
    const sPrice = Number(p.selling_price || 0);
    const rawPack = Number(p.pieces_per_pack || 0);
    const isBulkLeak = pPrice > sPrice * 2 && rawPack <= 1;

    return {
      ...p,
      p_unit: isBulkLeak ? (p.p_unit && p.p_unit !== p.s_unit ? p.p_unit : 'Box') : (p.p_unit || 'Pcs'),
      s_unit: isBulkLeak ? (p.s_unit && p.s_unit !== 'Box' && p.s_unit !== 'PCS' ? p.s_unit : 'Nos') : (p.s_unit || 'Pcs'),
      unit: isBulkLeak ? (p.s_unit && p.s_unit !== 'Box' && p.s_unit !== 'PCS' ? p.s_unit : 'Nos') : (p.unit || p.s_unit || 'Pcs'),
      pieces_per_pack: isBulkLeak ? 100 : (rawPack || 1),
    };
  };

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const generateUuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'f' + Date.now().toString(16).padStart(31, '0').slice(0, 31);

  const products = (contextProducts || []).map(normalizeProduct);

  const saveProduct = async (productPayload: Omit<Product, 'created_at'> & { id?: string }) => {
    setIsSaving(true);
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

    try {
      const isExisting = contextProducts.some(p => p.id === productId);
      let res;
      if (isExisting) {
        res = await ProductService.updateProduct(productId, cleanPayload);
      } else {
        res = await ProductService.createProduct(cleanPayload);
      }
      if (res.error) {
        throw new Error(res.error);
      }
      await refreshAllData();
      return res.data || cleanPayload;
    } catch (err: any) {
      console.error('Product save error:', err.message || err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    // Optimistically remove ONLY the deleted row from state immediately (0ms UI latency, no table flicker)
    if (setProducts) {
      setProducts(prev => prev.filter(p => p.id !== productId));
    }
    try {
      const res = await ProductService.deleteProduct(productId);
      if (res.error) {
        throw new Error(res.error);
      }
    } catch (err: any) {
      console.error('Product delete error:', err.message || err);
      // Rollback context state on network/API failure
      await refreshAllData();
      throw err;
    }
  };

  return {
    products,
    isLoading: contextLoading,
    saveProduct,
    deleteProduct,
    isSaving,
    isDeleting
  };
}
