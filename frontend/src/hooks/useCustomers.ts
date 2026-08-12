import { useState } from 'react';
import { CustomerService } from '../services/customerService';
import { useErpContext } from '../context/ErpContext';
import type { Customer } from '../types/erp.types';

export function useCustomers(tenantId: string) {
  const { customers: contextCustomers, isLoading: contextLoading, refreshAllData, setCustomers } = useErpContext();
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const generateUuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'c' + Date.now().toString(16).padStart(31, '0').slice(0, 31);

  const customers = contextCustomers || [];

  const saveCustomer = async (customerPayload: Partial<Customer> & { id?: string }) => {
    setIsSaving(true);
    const customerId = (customerPayload.id && isUuid(customerPayload.id))
      ? customerPayload.id
      : generateUuid();

    const activeTenantId = (tenantId && isUuid(tenantId)) ? tenantId : '00000000-0000-0000-0000-000000000000';

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
      let res;
      if (isExisting) {
        res = await CustomerService.updateCustomer(customerId, cleanPayload);
      } else {
        res = await CustomerService.createCustomer(cleanPayload);
      }
      if (res.error) {
        throw new Error(res.error);
      }
      await refreshAllData();
      return res.data || cleanPayload;
    } catch (err: any) {
      console.error('Customer save error:', err.message || err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCustomer = async (customerId: string) => {
    // Optimistically remove ONLY the deleted row from state immediately (0ms UI latency, no table flicker)
    if (setCustomers) {
      setCustomers(prev => prev.filter(c => c.id !== customerId));
    }
    try {
      const res = await CustomerService.deleteCustomer(customerId);
      if (res.error) {
        throw new Error(res.error);
      }
    } catch (err: any) {
      console.error('Customer delete error:', err.message || err);
      // Rollback context state on network/API failure
      await refreshAllData();
      throw err;
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
