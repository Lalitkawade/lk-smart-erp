import { useState } from 'react';
import { PurchaseService, PurchaseWithItems } from '../services/purchaseService';
import { isValidUUID, generateValidUuid } from '../services/baseService';
import { useErpContext } from '../context/ErpContext';

export function usePurchases(tenantId: string) {
  const { purchases: contextPurchases, isLoading: contextLoading, refreshAllData } = useErpContext();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const purchases = contextPurchases || [];

  const savePurchase = async (
    billPayload: Partial<PurchaseWithItems> & { id?: string },
    itemsPayload: any[] = []
  ) => {
    setIsSaving(true);
    const purchaseId = (billPayload.id && isValidUUID(billPayload.id))
      ? billPayload.id
      : generateValidUuid();

    const activeTenantId = (tenantId && isValidUUID(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';

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
      if (isExisting) {
        await PurchaseService.updatePurchase(purchaseId, cleanBillPayload, itemsPayload);
      } else {
        await PurchaseService.createPurchase(cleanBillPayload, itemsPayload);
      }
      await refreshAllData();
    } catch (err) {
      console.warn('Purchase save exception:', err);
    } finally {
      setIsSaving(false);
    }

    return cleanBillPayload;
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
