import { useState } from 'react';
import { SupplierService } from '../services/supplierService';
import { useErpContext } from '../context/ErpContext';
import type { Supplier } from '../types/erp.types';

export function useSuppliers(tenantId: string) {
  const { suppliers: contextSuppliers, isLoading: contextLoading, refreshAllData } = useErpContext();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const generateUuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 's' + Date.now().toString(16).padStart(31, '0').slice(0, 31);

  const suppliers = contextSuppliers || [];

  const saveSupplier = async (supplierPayload: Partial<Supplier> & { id?: string }) => {
    setIsSaving(true);
    const supplierId = (supplierPayload.id && isUuid(supplierPayload.id))
      ? supplierPayload.id
      : generateUuid();

    const activeTenantId = (tenantId && isUuid(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';

    const cleanPayload: any = {
      id: supplierId,
      tenant_id: activeTenantId,
      supplier_name: supplierPayload.supplier_name || 'General Supplier',
      phone: supplierPayload.phone || '',
      email: supplierPayload.email || '',
      address: supplierPayload.address || '',
      gstin: (supplierPayload as any).gstin || '',
      outstanding: Number(supplierPayload.outstanding || 0),
      created_at: (supplierPayload as any).created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const isExisting = contextSuppliers.some(s => s.id === supplierId);
      if (isExisting) {
        await SupplierService.updateSupplier(supplierId, cleanPayload);
      } else {
        await SupplierService.createSupplier(cleanPayload);
      }
      await refreshAllData();
    } catch (err) {
      console.warn('Supplier save exception:', err);
    } finally {
      setIsSaving(false);
    }

    return cleanPayload;
  };

  const deleteSupplier = async (supplierId: string) => {
    setIsDeleting(true);
    try {
      await SupplierService.deleteSupplier(supplierId);
      await refreshAllData();
    } catch (err) {
      console.warn('Supplier delete exception:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    suppliers,
    isLoading: contextLoading,
    isSaving,
    isDeleting,
    saveSupplier,
    deleteSupplier,
    refreshSuppliers: refreshAllData
  };
}
