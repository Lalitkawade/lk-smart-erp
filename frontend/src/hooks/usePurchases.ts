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
    const purchaseId = (billPayload.id && isUuid(billPayload.id))
      ? billPayload.id
      : generateUuid();

    const activeTenantId = (tenantId && isUuid(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';

    const cleanBillPayload: any = {
      id: purchaseId,
      tenant_id: activeTenantId,
      bill_number: billPayload.bill_number || ('PB-' + Date.now().toString().slice(-5)),
      supplier_name: billPayload.supplier_name || 'General Vendor',
      payment_mode: billPayload.payment_mode || 'Cash',
      ref_number: billPayload.ref_number || billPayload.transaction_id || null,
      transaction_id: billPayload.transaction_id || billPayload.ref_number || null,
      total_amount: Number(billPayload.total_amount || 0),
      paid_amount: Number(billPayload.paid_amount || 0),
      due_amount: Number(billPayload.due_amount || 0),
      purchase_date: billPayload.purchase_date || new Date().toISOString(),
      created_at: (billPayload as any).created_at || new Date().toISOString()
    };

    try {
      const isExisting = contextPurchases.some(p => p.id === purchaseId);
      let res;
      if (isExisting) {
        res = await PurchaseService.updatePurchase(purchaseId, cleanBillPayload, itemsPayload);
      } else {
        res = await PurchaseService.createPurchase(cleanBillPayload, itemsPayload);
      }
      if (res.error) {
        throw new Error(res.error);
      }
      await refreshAllData();
      return res.data || cleanBillPayload;
    } catch (err: any) {
      console.error('Purchase save error:', err.message || err);
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
