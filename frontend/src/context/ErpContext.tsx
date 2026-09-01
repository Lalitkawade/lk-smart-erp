import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '../api/supabase';
import type { SalesInvoice, PurchaseBill, Expense, Product, Customer, Supplier } from '../types/erp.types';
import { useAuth } from '../hooks/useAuth';

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
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
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

    const promise = (async () => {
      if (products.length === 0 && salesInvoices.length === 0) {
        setIsLoading(true);
      }
      try {
        const [salesRes, purchRes, expRes, prodRes, custRes, supRes, custPayRes, supPayRes, settingsRes, returnsRes, purchaseItemsRes] = await Promise.allSettled([
          supabase.from('sales_invoices').select('*, items:sales_items(*, product:products(*))').order('sale_date', { ascending: false }),
          supabase.from('purchase_bills').select('*, items:purchase_items(*)').order('purchase_date', { ascending: false }),
          supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
          supabase.from('products').select('*').order('product_name', { ascending: true }),
          supabase.from('customers').select('*').order('customer_name', { ascending: true }),
          supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
          supabase.from('customer_payments').select('*').order('payment_date', { ascending: false }),
          supabase.from('supplier_payments').select('*').order('payment_date', { ascending: false }),
          supabase.from('settings').select('*').limit(1).maybeSingle(),
          supabase.from('sales_returns').select('*, items:sales_return_items(*, product:products(*))'),
          supabase.from('purchase_items').select('*')
        ]);

        const allPurchaseItems = (purchaseItemsRes && purchaseItemsRes.status === 'fulfilled' && !purchaseItemsRes.value.error) ? (purchaseItemsRes.value.data as any[]) : [];
        if (salesRes.status === 'fulfilled' && !salesRes.value.error && salesRes.value.data) {
          const allReturns = (returnsRes.status === 'fulfilled' && !returnsRes.value.error) ? returnsRes.value.data as any[] : [];
          
          const cleanSales = (salesRes.value.data as any[]).map(s => {
            const invoiceReturns = allReturns.filter(r => r.invoice_id === s.id);
            return {
              ...s,
              items: s.items || s.sales_items || [],
              returns: invoiceReturns
            };
          });
          setSalesInvoices(cleanSales as SalesInvoice[]);
          try {
            localStorage.setItem('lk_sales_invoices', JSON.stringify(cleanSales));
          } catch(e) {}
        } else if (salesRes.status === 'fulfilled' && salesRes.value.error) {
          console.error('❌ [ErpContext Hydration] Error fetching sales_invoices:', salesRes.value.error);
        }
        if (purchRes.status === 'fulfilled' && !purchRes.value.error && purchRes.value.data) {
          const allProducts = (prodRes.status === 'fulfilled' && !prodRes.value.error) ? (prodRes.value.data as any[]) : [];
          const cleanPurchases = (purchRes.value.data as any[]).map(p => {
            const myItems = allPurchaseItems.filter(i => i.bill_id === p.id);
            let rawItems = p.items || p.purchase_items || (myItems.length > 0 ? myItems : []);
            
            // Dynamically resolve product names from the product catalog
            const resolvedItems = rawItems.map((item: any) => {
               if (item.product_id) {
                 const matchedProduct = allProducts.find(prod => prod.id === item.product_id);
                 if (matchedProduct) {
                   return { ...item, product_name: matchedProduct.product_name, hsn: item.hsn || matchedProduct.hsn, gst_percent: item.gst_percent ?? matchedProduct.gst };
                 }
               }
               return item;
            });

            return {
              ...p,
              items: resolvedItems
            };
          });
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
    })();

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
        refreshAllData,
        setSuppliers,
        setCustomers,
        setProducts
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
