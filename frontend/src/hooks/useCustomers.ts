import { useState } from 'react';
import { CustomerService } from '../services/customerService';
import { isValidUUID, generateValidUuid } from '../services/baseService';
import { useErpContext } from '../context/ErpContext';
import type { Customer } from '../types/erp.types';

export function useCustomers(tenantId: string) {
  const { customers: contextCustomers, isLoading: contextLoading, refreshAllData } = useErpContext();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const customers = contextCustomers || [];

  const saveCustomer = async (customerPayload: Partial<Customer> & { id?: string }) => {
    setIsSaving(true);
    const customerId = (customerPayload.id && isValidUUID(customerPayload.id))
      ? customerPayload.id
      : generateValidUuid();

    const activeTenantId = (tenantId && isValidUUID(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';

    const cleanPayload: any = {
      id: customerId,
      tenant_id: activeTenantId,
      customer_name: customerPayload.customer_name || 'Walk-in Customer',
      phone: customerPayload.phone || '',
      email: customerPayload.email || '',
      address: customerPayload.address || '',
      dob: customerPayload.dob || null,
      credit_limit: Number(customerPayload.credit_limit || 50000),
      outstanding: Number(customerPayload.outstanding || 0),
      created_at: (customerPayload as any).created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const isExisting = contextCustomers.some(c => c.id === customerId);
      const res = isExisting
        ? await CustomerService.updateCustomer(customerId, cleanPayload)
        : await CustomerService.createCustomer(cleanPayload);

      if (res.error) {
        console.error('Customer save DB error:', res.error);
        alert('⚠️ Customer save failed: ' + res.error);
        throw new Error(res.error);
      }
      await refreshAllData();
    } catch (err: any) {
      console.warn('Customer save exception:', err);
      throw err;
    } finally {
      setIsSaving(false);
    }

    return cleanPayload;
  };

  const deleteCustomer = async (customerId: string) => {
    setIsDeleting(true);
    try {
      await CustomerService.deleteCustomer(customerId);
      await refreshAllData();
    } catch (err) {
      console.warn('Customer delete exception:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    customers,
    isLoading: contextLoading,
    isSaving,
    isDeleting,
    saveCustomer,
    deleteCustomer,
    refreshCustomers: refreshAllData
  };
}
