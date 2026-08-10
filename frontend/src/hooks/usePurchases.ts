import { useState } from 'react';
import { PurchaseService, PurchaseWithItems } from '../services/purchaseService';
import { useErpContext } from '../context/ErpContext';

export function usePurchases(tenantId: string) {
  const { purchases: contextPurchases, isLoading: contextLoading, refreshAllData } = useErpContext();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const generateUuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'pb-' + Date.now().toString(16).padStart(31, '0').slice(0, 31);

  const purchases = contextPurchases || [];

  const savePurchase = async (
    billPayload: Partial<PurchaseWithItems> & { id?: string },
    itemsPayload: any[] = []
  ) => {
    setIsSaving(true);
    const existingId = (billPayload.id && isUuid(billPayload.id)) ? billPayload.id : undefined;
    const activeTenantId = (tenantId && isUuid(tenantId)) ? tenantId : null;

    const cleanBillPayload: any = {
      ...(existingId && { id: existingId }),
      tenant_id: activeTenantId,
      supplier_id: (billPayload.supplier_id && isUuid(billPayload.supplier_id)) ? billPayload.supplier_id : null,
      bill_number: (billPayload.bill_number && billPayload.bill_number.trim()) ? billPayload.bill_number.trim() : 'N/A',
      supplier_name: (billPayload.supplier_name && billPayload.supplier_name.trim()) ? billPayload.supplier_name.trim() : 'GENERAL VENDOR',
      payment_mode: billPayload.payment_mode || 'Cash',
      ref_number: billPayload.ref_number || (billPayload as any).transaction_id || null,
      total_amount: Number(billPayload.total_amount || 0),
      paid_amount: Number(billPayload.paid_amount || 0),
      due_amount: Number(billPayload.due_amount || 0),
      purchase_date: billPayload.purchase_date || new Date().toISOString(),
      created_at: (billPayload as any).created_at || new Date().toISOString()
    };

    try {
      const isExisting = existingId ? contextPurchases.some(p => p.id === existingId) : false;
      let res;
      if (isExisting && existingId) {
        res = await PurchaseService.updatePurchase(existingId, cleanBillPayload, itemsPayload);
      } else {
        res = await PurchaseService.createPurchase(cleanBillPayload, itemsPayload);
      }

      if (res.error) {
        throw new Error(res.error);
      }
      await refreshAllData();
      return res.data || cleanBillPayload;
    } catch (err: any) {
      console.error('❌ [usePurchases] Purchase save error:', err.message || err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const deletePurchase = async (purchaseId: string) => {
    setIsDeleting(true);
    try {
      await PurchaseService.deletePurchase(purchaseId);
      await refreshAllData();
    } catch (err) {
      console.warn('Purchase delete exception:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    purchases,
    isLoading: contextLoading,
    isSaving,
    isDeleting,
    savePurchase,
    deletePurchase,
    refreshPurchases: refreshAllData
  };
}
