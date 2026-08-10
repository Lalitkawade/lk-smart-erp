import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '../api/supabase';
import type { SalesInvoice, PurchaseBill, Expense, Product, Customer, Supplier } from '../types/erp.types';
import { useAuth } from '../hooks/useAuth';
import { perfTracker } from '../utils/perfTracker';

interface ErpContextType {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  salesInvoices: SalesInvoice[];
  sales: SalesInvoice[];
  purchaseBills: PurchaseBill[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  customerPayments: any[];
  supplierPayments: any[];
  settings: any | null;
  isLoading: boolean;
  isRealtimeConnected: boolean;
  refreshAllData: () => Promise<void>;
}

const ErpContext = createContext<ErpContextType | undefined>(undefined);

export const ErpDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { tenant } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<PurchaseBill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);

  const tenantId = tenant?.id;
  const inFlightRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const hydratedTenantIdRef = useRef<string | null>(null);

  const refreshAllData = async () => {
    if (inFlightRefreshPromiseRef.current) {
      return inFlightRefreshPromiseRef.current;
    }

    const promise = perfTracker.trackFunction('refreshAllData()', false, async () => {
      if (products.length === 0 && salesInvoices.length === 0) {
        setIsLoading(true);
      }
      try {
        const [salesRes, purchRes, expRes, prodRes, custRes, supRes, custPayRes, supPayRes, settingsRes] = await Promise.allSettled([
          perfTracker.logQuery('sales_invoices', 'refreshAllData()', supabase.from('sales_invoices').select('*, sales_items(*)').order('sale_date', { ascending: false })),
          perfTracker.logQuery('purchase_bills', 'refreshAllData()', supabase.from('purchase_bills').select('*, purchase_items(*)').order('purchase_date', { ascending: false })),
          perfTracker.logQuery('expenses', 'refreshAllData()', supabase.from('expenses').select('*').order('expense_date', { ascending: false })),
          perfTracker.logQuery('products', 'refreshAllData()', supabase.from('products').select('*').order('product_name', { ascending: true })),
          perfTracker.logQuery('customers', 'refreshAllData()', supabase.from('customers').select('*').order('customer_name', { ascending: true })),
          perfTracker.logQuery('suppliers', 'refreshAllData()', supabase.from('suppliers').select('*').order('supplier_name', { ascending: true })),
          perfTracker.logQuery('customer_payments', 'refreshAllData()', supabase.from('customer_payments').select('*').order('payment_date', { ascending: false })),
          perfTracker.logQuery('supplier_payments', 'refreshAllData()', supabase.from('supplier_payments').select('*').order('payment_date', { ascending: false })),
          perfTracker.logQuery('settings', 'refreshAllData()', supabase.from('settings').select('*').limit(1).maybeSingle())
        ]);

        if (salesRes.status === 'fulfilled' && !salesRes.value.error && salesRes.value.data) {
          const cleanSales = (salesRes.value.data as any[]).map(s => ({
            ...s,
            items: s.items || s.sales_items || []
          }));
          setSalesInvoices(cleanSales as SalesInvoice[]);
        }
        if (purchRes.status === 'fulfilled' && !purchRes.value.error && purchRes.value.data) {
          const cleanPurchases = (purchRes.value.data as any[]).map(p => ({
            ...p,
            items: p.items || p.purchase_items || []
          }));
          console.log('⚡ [ErpContext Hydration] Fetched purchase_bills from Supabase:', cleanPurchases.length, cleanPurchases);
          setPurchaseBills(cleanPurchases as PurchaseBill[]);
        } else if (purchRes.status === 'fulfilled' && purchRes.value.error) {
          console.error('❌ [ErpContext Hydration] Error fetching purchase_bills:', purchRes.value.error);
        }
        if (expRes.status === 'fulfilled' && !expRes.value.error && expRes.value.data) {
          setExpenses(expRes.value.data as Expense[]);
        }
        if (prodRes.status === 'fulfilled' && !prodRes.value.error && prodRes.value.data) {
          setProducts(prodRes.value.data as Product[]);
        }
        if (custRes.status === 'fulfilled' && !custRes.value.error && custRes.value.data) {
          setCustomers(custRes.value.data as Customer[]);
        }
        if (supRes.status === 'fulfilled' && !supRes.value.error && supRes.value.data) {
          setSuppliers(supRes.value.data as Supplier[]);
        }
        if (custPayRes.status === 'fulfilled' && !custPayRes.value.error && custPayRes.value.data) {
          setCustomerPayments(custPayRes.value.data);
        }
        if (supPayRes.status === 'fulfilled' && !supPayRes.value.error && supPayRes.value.data) {
          setSupplierPayments(supPayRes.value.data);
        }
        if (settingsRes.status === 'fulfilled' && !settingsRes.value.error && settingsRes.value.data) {
          setSettings(settingsRes.value.data);
        }
      } catch (err) {
        console.warn('⚡ ErpContext hydration error:', err);
      } finally {
        setIsLoading(false);
        inFlightRefreshPromiseRef.current = null;
      }
    });

    inFlightRefreshPromiseRef.current = promise;
    return promise;
  };

  // 1. Initial Cloud Data Hydration on Authentication (runs exactly once after tenantId is available)
  useEffect(() => {
    if (!tenantId) {
      hydratedTenantIdRef.current = null;
      return;
    }
    if (hydratedTenantIdRef.current === tenantId) return;
    hydratedTenantIdRef.current = tenantId;
    refreshAllData();
  }, [tenantId]);

  // 2. Single Centralized Supabase Realtime Subscription Channel
  useEffect(() => {
    if (!tenantId) return;

    const channelId = `realtime-erp-sync-${tenantId}-${Date.now()}`;
    const realtimeChannel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log(`⚡ Real-time Postgres change on table [${payload.table}]:`, payload.eventType);

          // Reactive local state dispatch based on event type
          const table = payload.table;
          const eventType = payload.eventType;

          if (table === 'products') {
            if (eventType === 'INSERT' && payload.new) {
              setProducts(prev => [payload.new as Product, ...prev.filter(p => p.id !== payload.new.id)]);
            } else if (eventType === 'UPDATE' && payload.new) {
              setProducts(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
            } else if (eventType === 'DELETE' && payload.old) {
              setProducts(prev => prev.filter(p => p.id !== payload.old.id));
            }
          } else if (table === 'customers') {
            if (eventType === 'INSERT' && payload.new) {
              setCustomers(prev => [payload.new as Customer, ...prev.filter(c => c.id !== payload.new.id)]);
            } else if (eventType === 'UPDATE' && payload.new) {
              setCustomers(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
            } else if (eventType === 'DELETE' && payload.old) {
              setCustomers(prev => prev.filter(c => c.id !== payload.old.id));
            }
          } else if (table === 'suppliers') {
            if (eventType === 'INSERT' && payload.new) {
              setSuppliers(prev => [payload.new as Supplier, ...prev.filter(s => s.id !== payload.new.id)]);
            } else if (eventType === 'UPDATE' && payload.new) {
              setSuppliers(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s));
            } else if (eventType === 'DELETE' && payload.old) {
              setSuppliers(prev => prev.filter(s => s.id !== payload.old.id));
            }
          } else if (table === 'expenses') {
            if (eventType === 'INSERT' && payload.new) {
              setExpenses(prev => [payload.new as Expense, ...prev.filter(e => e.id !== payload.new.id)]);
            } else if (eventType === 'UPDATE' && payload.new) {
              setExpenses(prev => prev.map(e => e.id === payload.new.id ? { ...e, ...payload.new } : e));
            } else if (eventType === 'DELETE' && payload.old) {
              setExpenses(prev => prev.filter(e => e.id !== payload.old.id));
            }
          } else {
            // For complex transaction tables (sales_invoices, purchase_bills), refresh dataset
            refreshAllData();
          }
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [tenantId]);

  return (
    <ErpContext.Provider
      value={{
        products,
        customers,
        suppliers,
        salesInvoices,
        sales: salesInvoices,
        purchaseBills,
        purchases: purchaseBills,
        expenses,
        customerPayments,
        supplierPayments,
        settings,
        isLoading,
        isRealtimeConnected,
        refreshAllData
      }}
    >
      {children}
    </ErpContext.Provider>
  );
};

export const useErpContext = () => {
  const context = useContext(ErpContext);
  if (!context) {
    throw new Error('useErpContext must be used within an ErpDataProvider');
  }
  return context;
};
