import { useState, useCallback } from 'react';
import { useErpContext } from '../context/ErpContext';
import { SaleService } from '../services/saleService';
import type { SalesInvoiceInsert, SalesInvoiceUpdate, SalesItemInsert } from '../types/database.types';

export function useSales(tenantId: string) {
  const { sales, refreshAllData } = useErpContext();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const saveSale = useCallback(async (
    salePayload: SalesInvoiceInsert,
    itemsPayload: Omit<SalesItemInsert, 'invoice_id'>[]
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const activeTenantId = (tenantId && tenantId.length > 10) ? tenantId : '00000000-0000-0000-0000-000000000000';
      const payload = {
        ...salePayload,
        tenant_id: activeTenantId
      };
      const res = await SaleService.createSale(payload, itemsPayload);
      if (res.error) {
        setError(res.error);
        throw new Error(res.error);
      }
      await refreshAllData();
      return res.data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, refreshAllData]);

  const updateSale = useCallback(async (
    id: string,
    salePayload: SalesInvoiceUpdate,
    itemsPayload?: Omit<SalesItemInsert, 'invoice_id'>[]
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await SaleService.updateSale(id, salePayload, itemsPayload);
      if (res.error) {
        setError(res.error);
        throw new Error(res.error);
      }
      await refreshAllData();
      return res.data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  const deleteSale = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await SaleService.deleteSale(id);
      if (res.error) {
        setError(res.error);
        throw new Error(res.error);
      }
      await refreshAllData();
      return true;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [refreshAllData]);

  return {
    sales: sales || [],
    isLoading,
    error,
    saveSale,
    updateSale,
    deleteSale
  };
}
