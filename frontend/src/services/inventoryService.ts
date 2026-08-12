import { handleServiceCall, ServiceResponse } from './baseService';
import { supabase } from '../api/supabase';

const isValidUUID = (id: any): boolean => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export class InventoryService {
  /**
   * Adjust stock level for a single product by delta (+ for inflow, - for outflow)
   */
  static async adjustStock(productId: string, deltaQty: number): Promise<ServiceResponse<any>> {
    if (!isValidUUID(productId)) {
      return { data: null, error: 'Invalid product ID' };
    }

    try {
      const { data: prod, error: fetchErr } = await supabase
        .from('products')
        .select('current_stock')
        .eq('id', productId)
        .single();

      if (fetchErr || !prod) {
        return { data: null, error: fetchErr?.message || 'Product not found' };
      }

      const currentStock = Number(prod.current_stock || 0);
      const newStock = Math.max(0, currentStock + deltaQty);

      return handleServiceCall(
        supabase.from('products').update({ current_stock: newStock }).eq('id', productId).select().single()
      );
    } catch (e: any) {
      return { data: null, error: e.message };
    }
  }

  /**
   * Deduct stock for items sold during sale invoice checkout
   */
  static async deductStockForInvoice(
    cartItems: Array<{
      product: { id: string; current_stock?: number; pieces_per_pack?: number | null };
      qty: number;
      isLoose?: boolean;
    }>
  ): Promise<ServiceResponse<boolean>> {
    try {
      const updatePromises = cartItems.map(async (item) => {
        if (!item.product || !item.product.id || !isValidUUID(item.product.id)) return;

        const piecesPerPack = Math.max(1, Number(item.product.pieces_per_pack || 1));
        const totalDeductedBaseUnits = item.isLoose ? item.qty : item.qty * piecesPerPack;
        const currentStock = Number(item.product.current_stock ?? 0);
        const newStock = Math.max(0, currentStock - totalDeductedBaseUnits);

        return supabase.from('products').update({ current_stock: newStock }).eq('id', item.product.id);
      });

      await Promise.all(updatePromises.filter(Boolean));
      return { data: true, error: null };
    } catch (e: any) {
      return { data: false, error: e.message };
    }
  }

  /**
   * Add stock for items received during purchase bill creation
   */
  static async addStockForPurchase(
    preparedItems: Array<{ product_id: string | null; qty: number }>
  ): Promise<ServiceResponse<boolean>> {
    try {
      for (const item of preparedItems) {
        if (!item.product_id || !isValidUUID(item.product_id)) continue;

        const { data: prod } = await supabase
          .from('products')
          .select('current_stock, pieces_per_pack')
          .eq('id', item.product_id)
          .single();

        const currentStock = Number(prod?.current_stock || 0);
        const piecesPerPack = Math.max(1, Number(prod?.pieces_per_pack || 1));
        const addedBaseUnits = Number(item.qty || 0) * piecesPerPack;
        const newStock = currentStock + addedBaseUnits;

        await supabase.from('products').update({ current_stock: newStock }).eq('id', item.product_id);
      }
      return { data: true, error: null };
    } catch (e: any) {
      return { data: false, error: e.message };
    }
  }
}
