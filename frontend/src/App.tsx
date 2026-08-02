import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './hooks/useAuth';
import { supabase } from './api/supabase';

// Features
import Products from './features/products/Products';
import Sales from './features/sales/Sales';
import Dashboard from './features/dashboard/Dashboard';
import Reports from './features/reports/Reports';
import Customers from './features/customers/Customers';
import Suppliers from './features/suppliers/Suppliers';
import Purchases from './features/purchases/Purchases';
import ExcelExport from './features/export/ExcelExport';
import Expenses from './features/expenses/Expenses';
import DemandModal from './features/demands/DemandModal';
import { useDemandTracker } from './hooks/useDemandTracker';
import type { SalesInvoice, PurchaseBill, Expense } from './types/erp.types';

export default function App() {
  const { user, profile, tenant, loading, signIn, signOut } = useAuth();
  const { highDemandAlerts } = useDemandTracker(tenant?.id);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState(localStorage.getItem('lk_theme') || 'light');
  const [businessType, setBusinessType] = useState('Hardware Shop');
  const [purchaseAutoOpen, setPurchaseAutoOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDemandModal, setShowDemandModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getBreadcrumb = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard / Overview';
      case 'customers': return 'Business / Customers';
      case 'suppliers': return 'Business / Vendors';
      case 'products': return 'Business / Products';
      case 'new-entry': return 'Transactions / New Entry';
      case 'purchases': return 'Transactions / Purchase';
      case 'sales': return 'Transactions / Sales';
      case 'expenses': return 'Transactions / Shop Expenses';
      case 'inventory-stock': return 'Inventory / Inventory & Stock';
      case 'reports': return 'Inventory / Material Tracking';
      case 'excel-export': return 'Reports / Excel Export';
      default: return 'Dashboard / Overview';
    }
  };

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good morning 👋';
    if (hrs < 17) return 'Good afternoon 👋';
    return 'Good evening 👋';
  };

  // Dynamic metrics state
  const [sales, setSales] = useState<SalesInvoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseBill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [salesAutoCustomer, setSalesAutoCustomer] = useState<string | null>(null);
  const [salesAutoOpen, setSalesAutoOpen] = useState(false);
  const [productAutoOpen, setProductAutoOpen] = useState(false);
  const [expenseAutoOpen, setExpenseAutoOpen] = useState(false);
  const [customerAutoOpen, setCustomerAutoOpen] = useState(false);
  const [supplierAutoOpen, setSupplierAutoOpen] = useState(false);

  // Auth form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('Owner');
  const [authLoading, setAuthLoading] = useState(false);

  // Safe cache parsing helper
  const safeParseArray = (key: string): any[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  // Atomic local cache updater
  const saveLocalCache = (cacheObj: {
    sales: any[];
    purchases: any[];
    expenses: any[];
    products: any[];
    customers: any[];
    suppliers: any[];
  }) => {
    try {
      const snapshot = {
        lk_sales: JSON.stringify(cacheObj.sales || []),
        lk_purchases: JSON.stringify(cacheObj.purchases || []),
        lk_expenses: JSON.stringify(cacheObj.expenses || []),
        lk_products: JSON.stringify(cacheObj.products || []),
        lk_customers: JSON.stringify(cacheObj.customers || []),
        lk_suppliers: JSON.stringify(cacheObj.suppliers || [])
      };
      Object.entries(snapshot).forEach(([key, val]) => localStorage.setItem(key, val));
    } catch (e) {
      console.warn('Local cache storage write error:', e);
    }
  };

  // Consolidated merge helper that respects remote deletions, entity-specific keys, and preserves offline drafts
  const mergeRemoteWithOfflineDrafts = (
    remoteItems: any[],
    localItems: any[],
    getKey: (item: any) => string | undefined
  ): any[] => {
    const validRemote = Array.isArray(remoteItems) ? remoteItems : [];
    const validLocal = Array.isArray(localItems) ? localItems : [];

    const map = new Map<string, any>();
    validRemote.forEach(item => {
      if (item) {
        const key = getKey(item);
        if (key) map.set(key, item);
      }
    });

    // Only preserve local items that are explicitly flagged as offline drafts
    validLocal.forEach(item => {
      if (item && item.is_offline_draft) {
        const key = getKey(item);
        if (key && !map.has(key)) {
          map.set(key, item);
        }
      }
    });

    return Array.from(map.values());
  };

  // Load metrics and config settings
  const loadAppState = async () => {
    // 1. Load Local settings
    const settingsStr = localStorage.getItem('lk_settings');
    if (!settingsStr) {
      const defaults = {
        company_name: 'LK Hardware ERP',
        logo_url: '',
        gstin: '27LKSERP401Z2B5',
        address: '123 Market Road, Pune, Maharashtra',
        invoice_prefix: 'INV',
        business_type: 'Hardware Shop',
        module_garage: false,
        module_mobile: false,
        module_fertilizer: false
      };
      try { localStorage.setItem('lk_settings', JSON.stringify(defaults)); } catch (e) {}
    }

    let isRemoteSuccessful = false;
    let salesData: SalesInvoice[] | null = null;
    let purchData: PurchaseBill[] | null = null;
    let expData: Expense[] | null = null;
    let prodData: any[] | null = null;
    let custData: any[] | null = null;
    let supData: any[] | null = null;

    try {
      const [salesRes, purchRes, expRes, prodRes, custRes, supRes] = await Promise.allSettled([
        supabase.from('sales_invoices').select('*, items:sales_items(*, product:products(*))').order('sale_date', { ascending: false }),
        supabase.from('purchase_bills').select('*, items:purchase_items(*, product:products(*))').order('purchase_date', { ascending: false }),
        supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('products').select('*').order('product_name', { ascending: true }),
        supabase.from('customers').select('*').order('customer_name', { ascending: true }),
        supabase.from('suppliers').select('*').order('supplier_name', { ascending: true })
      ]);

      if (salesRes.status === 'fulfilled' && !salesRes.value.error && salesRes.value.data) salesData = salesRes.value.data as SalesInvoice[];
      if (purchRes.status === 'fulfilled' && !purchRes.value.error && purchRes.value.data) purchData = purchRes.value.data as PurchaseBill[];
      if (expRes.status === 'fulfilled' && !expRes.value.error && expRes.value.data) expData = expRes.value.data as Expense[];
      if (prodRes.status === 'fulfilled' && !prodRes.value.error && prodRes.value.data) prodData = prodRes.value.data;
      if (custRes.status === 'fulfilled' && !custRes.value.error && custRes.value.data) custData = custRes.value.data;
      if (supRes.status === 'fulfilled' && !supRes.value.error && supRes.value.data) supData = supRes.value.data;

      if (salesData !== null || purchData !== null || expData !== null || prodData !== null || custData !== null || supData !== null) {
        isRemoteSuccessful = true;
      }
    } catch (err) {
      console.warn('Supabase state load note:', err);
    }

    if (isRemoteSuccessful) {
      const localSales = safeParseArray('lk_sales');
      const localPurchases = safeParseArray('lk_purchases');
      const localExpenses = safeParseArray('lk_expenses');
      const localProducts = safeParseArray('lk_products');
      const localCustomers = safeParseArray('lk_customers');
      const localSuppliers = safeParseArray('lk_suppliers');

      const mergedSales = salesData !== null 
        ? mergeRemoteWithOfflineDrafts(salesData, localSales, s => s.invoice_number || s.id)
        : localSales;

      const mergedPurchases = purchData !== null 
        ? mergeRemoteWithOfflineDrafts(purchData, localPurchases, p => p.bill_number || p.id)
        : localPurchases;

      const mergedExpenses = expData !== null 
        ? mergeRemoteWithOfflineDrafts(expData, localExpenses, e => e.id)
        : localExpenses;

      const mergedProducts = prodData !== null 
        ? mergeRemoteWithOfflineDrafts(prodData, localProducts, p => p.id)
        : localProducts;

      const mergedCustomers = custData !== null 
        ? mergeRemoteWithOfflineDrafts(custData, localCustomers, c => c.id)
        : localCustomers;

      const mergedSuppliers = supData !== null 
        ? mergeRemoteWithOfflineDrafts(supData, localSuppliers, s => s.id)
        : localSuppliers;

      setSales(mergedSales);
      setPurchases(mergedPurchases);
      setExpenses(mergedExpenses);
      setProductsList(mergedProducts);
      setCustomersList(mergedCustomers);
      setSuppliersList(mergedSuppliers);

      // Atomic cache update
      saveLocalCache({
        sales: mergedSales,
        purchases: mergedPurchases,
        expenses: mergedExpenses,
        products: mergedProducts,
        customers: mergedCustomers,
        suppliers: mergedSuppliers
      });
    } else {
      // Offline fallback: restore from validated local cache
      const cachedSales = safeParseArray('lk_sales');
      const cachedPurchases = safeParseArray('lk_purchases');
      const cachedExpenses = safeParseArray('lk_expenses');
      const cachedProducts = safeParseArray('lk_products');
      const cachedCustomers = safeParseArray('lk_customers');
      const cachedSuppliers = safeParseArray('lk_suppliers');

      setSales(cachedSales);
      setPurchases(cachedPurchases);
      setExpenses(cachedExpenses);
      setProductsList(cachedProducts);
      setCustomersList(cachedCustomers);
      setSuppliersList(cachedSuppliers);
    }
  };

  useEffect(() => {
    loadAppState();
    document.body.setAttribute('data-theme', theme);

    // Listen to storage events so child page logs immediately update parent dashboards
    window.addEventListener('storage', loadAppState);
    window.addEventListener('focus', loadAppState);

    // Supabase Real-Time Cross-Device Subscription Channel
    const realtimeChannel = supabase
      .channel('realtime-erp-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log('⚡ Real-time database update received:', payload.table);
          loadAppState();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('storage', loadAppState);
      window.removeEventListener('focus', loadAppState);
      supabase.removeChannel(realtimeChannel);
    };
  }, [theme, tenant, activeTab]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('lk_theme', nextTheme);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      await signIn(email, password, role);
    } catch (err: any) {
      alert('Login failed: ' + err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const isTodayBirthday = (dateStr?: string) => {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
  };

  const todaysBirthdays = useMemo(() => {
    const list: Array<{ id: string; name: string; type: 'Customer' | 'Vendor'; phone: string; title: string; tab: string }> = [];

    if (Array.isArray(customersList)) {
      customersList.forEach((c: any) => {
        if (c && c.dob && isTodayBirthday(c.dob)) {
          const name = c.customer_name || 'Customer';
          list.push({
            id: c.id || name,
            name,
            type: 'Customer',
            phone: c.phone || '',
            title: `🎉 Today is ${name}'s Birthday!`,
            tab: 'customers'
          });
        }
      });
    }

    if (Array.isArray(suppliersList)) {
      suppliersList.forEach((s: any) => {
        if (!s) return;
        const name = s.supplier_name || 'Vendor';
        if (s.dob && isTodayBirthday(s.dob)) {
          list.push({
            id: (s.id || name) + '-dob',
            name,
            type: 'Vendor',
            phone: s.phone || '',
            title: `🎉 Today is ${name}'s Birthday!`,
            tab: 'suppliers'
          });
        }
        if (s.establishment_date && isTodayBirthday(s.establishment_date)) {
          list.push({
            id: (s.id || name) + '-est',
            name,
            type: 'Vendor',
            phone: s.phone || '',
            title: `🏛️ Today is ${name}'s Establishment Day!`,
            tab: 'suppliers'
          });
        }
      });
    }

    return list;
  }, [customersList, suppliersList]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-semibold text-slate-400">Loading LK Hardware ERP...</span>
      </div>
    );
  }

  // Operator Login Panel
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
              <i className="fa-solid fa-toolbox text-emerald-400"></i> LK Hardware ERP
            </h1>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Store Inventory & Billing Suite</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Operator Role</label>
              <select className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="Owner">Owner</option>
                <option value="Manager">Manager</option>
                <option value="Cashier">Cashier</option>
                <option value="Sales Person">Sales Person</option>
                <option value="Store Keeper">Store Keeper</option>
                <option value="Accountant">Accountant</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Operator Email</label>
              <input type="email" className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="operator@shop.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="••••••••" 
                  required 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition p-1"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                </button>
              </div>
            </div>

            <button type="submit" disabled={authLoading} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold p-3 rounded-lg text-sm transition">
              {authLoading ? 'Verifying Credentials...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const lowStockCount = productsList.filter((p: any) => (p.current_stock || 0) <= (p.min_stock_level || 10)).length;
  
  const getCustomerDues = () => {
    try {
      const c = localStorage.getItem('lk_customers');
      if (c) {
        const parsed = JSON.parse(c);
        return parsed.reduce((acc: number, item: any) => acc + Number(item.outstanding || 0), 0);
      }
    } catch(e){}
    return 0;
  };

  const getSupplierDues = () => {
    try {
      const s = localStorage.getItem('lk_suppliers');
      if (s) {
        const parsed = JSON.parse(s);
        return parsed.reduce((acc: number, item: any) => acc + Number(item.outstanding || 0), 0);
      }
    } catch(e){}
    return 0;
  };

  const companyName = tenant?.company_name || 'LK Hardware Store';

  const navSections = [
    {
      title: '',
      items: [
        { tab: 'dashboard', icon: 'fa-chart-line', label: 'Dashboard' }
      ]
    },
    {
      title: 'BUSINESS',
      items: [
        { tab: 'customers', icon: 'fa-users', label: 'Customers' },
        { tab: 'suppliers', icon: 'fa-truck-ramp-box', label: 'Vendors' },
        { tab: 'products', icon: 'fa-boxes-stacked', label: 'Products' }
      ]
    },
    {
      title: 'TRANSACTIONS',
      items: [
        { tab: 'new-entry', icon: 'fa-circle-plus', label: 'New Entry', iconColor: 'text-emerald-400' },
        { tab: 'purchases', icon: 'fa-cart-shopping', label: 'Purchase' },
        { tab: 'sales', icon: 'fa-file-invoice-dollar', label: 'Sales' },
        { tab: 'expenses', icon: 'fa-hand-holding-dollar', label: 'Shop Expenses' }
      ]
    },
    {
      title: 'INVENTORY',
      items: [
        { tab: 'inventory-stock', icon: 'fa-warehouse', label: 'Inventory & Stock' },
        { tab: 'reports', icon: 'fa-chart-pie', label: 'Material Tracking' }
      ]
    },
    {
      title: 'REPORTS',
      items: [
        { tab: 'excel-export', icon: 'fa-file-excel', label: 'Excel Export', iconColor: 'text-amber-500' }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground transition-all duration-300">
      
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)} 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-fade-in"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`bg-sidebar border-r border-border flex flex-col justify-between h-screen fixed md:sticky top-0 left-0 z-50 transition-transform duration-300 md:translate-x-0 ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      } ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="overflow-y-auto flex-1 select-none scrollbar-none">
          {/* Sidebar Top branding */}
          {!sidebarCollapsed ? (
            <div className="p-4 border-b border-border/40 flex justify-between items-center h-16">
              <div className="truncate pr-2">
                <h2 className="text-xs font-black text-sidebar-active truncate uppercase tracking-widest flex items-center gap-2">
                  <i className="fa-solid fa-toolbox text-primary text-sm"></i> {companyName}
                </h2>
                <span className="text-[9px] text-sidebar-text font-bold tracking-widest uppercase block mt-0.5">{businessType}</span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setSidebarCollapsed(true)} 
                  className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs border border-slate-700 shadow-sm transition active:scale-95 cursor-pointer" 
                  title="Collapse sidebar menu"
                >
                  <i className="fa-solid fa-indent"></i>
                  <span className="text-[10px] uppercase font-black tracking-wider">Collapse</span>
                </button>
                <button 
                  onClick={() => setMobileMenuOpen(false)} 
                  className="md:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-extrabold transition" 
                  title="Close menu drawer"
                >
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-border/40 flex flex-col justify-center items-center h-16">
              <button 
                onClick={() => setSidebarCollapsed(false)} 
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-extrabold text-sm border border-slate-700 shadow-sm transition active:scale-95 cursor-pointer flex items-center justify-center" 
                title="Expand sidebar menu"
              >
                <i className="fa-solid fa-outdent"></i>
              </button>
            </div>
          )}

          {/* User Profile Block */}
          {!sidebarCollapsed ? (
            <div className="p-5 flex flex-col items-center text-center border-b border-border/40 my-2">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xl uppercase border-2 border-primary/30 shadow-sm mb-2.5">
                {profile?.username?.slice(0, 2) || 'OP'}
              </div>
              <div className="font-heading font-extrabold text-sm text-sidebar-active uppercase tracking-tight leading-tight truncate max-w-full px-1 w-full" title={profile?.username}>{profile?.username || 'Robert Grant'}</div>
              <div className="text-[10px] text-sidebar-text font-semibold uppercase tracking-wider mt-1">{profile?.role || 'Store Manager'}</div>
            </div>
          ) : (
            <div className="p-3 border-b border-border/40 flex justify-center my-2">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs uppercase border border-primary/30" title={`${profile?.username || 'Owner'} (${profile?.role || 'Staff'})`}>
                {profile?.username?.slice(0, 2) || 'OP'}
              </div>
            </div>
          )}

          {/* Navigation items list */}
          <nav className="p-3 space-y-4">
            {navSections.map((section, sIdx) => {
              const visibleItems = section.items;
              return (
                <div key={sIdx} className="space-y-1">
                  {section.title && (
                    !sidebarCollapsed ? (
                      <span className="px-3 text-[9px] font-black tracking-widest text-textMuted uppercase block pt-2 pb-1">{section.title}</span>
                    ) : (
                      <div className="border-t border-border/40 my-2 mx-2"></div>
                    )
                  )}
                  {visibleItems.map(item => {
                    const isActive = activeTab === item.tab;
                    if (sidebarCollapsed) {
                      return (
                        <button
                          key={item.tab}
                          onClick={() => {
                            setActiveTab(item.tab);
                            setMobileMenuOpen(false);
                          }}
                          title={item.label}
                          className={`relative flex justify-center items-center w-12 h-10 mx-auto rounded-xl transition-all ${
                            isActive
                              ? 'bg-primary text-white shadow-md shadow-primary/20'
                              : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-active'
                          }`}
                        >
                          <i className={`fa-solid ${item.icon} ${item.iconColor || ''} text-sm`}></i>
                          {isActive && <div className="absolute right-1 top-1 w-2 h-2 rounded-full bg-rose-500"></div>}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={item.tab}
                        onClick={() => {
                          setActiveTab(item.tab);
                          setMobileMenuOpen(false);
                        }}
                        className={`relative flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
                          isActive
                            ? 'bg-primary text-white shadow-md shadow-primary/20 font-black'
                            : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-active'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <i className={`fa-solid ${item.icon} ${isActive ? 'text-white' : item.iconColor || ''} w-4 text-sm`}></i>
                          <span className="truncate">{item.label}</span>
                        </div>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Logout button */}
        <div className="p-3 border-t border-border/40 select-none">
          <button 
            onClick={() => {
              setMobileMenuOpen(false);
              signOut();
            }} 
            title="Log out of system" 
            className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-sidebar-text hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition duration-150"
          >
            <i className="fa-solid fa-arrow-right-from-bracket text-xs"></i>
            {!sidebarCollapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="bg-secondary border-b border-border h-16 px-4 md:px-6 flex justify-between items-center select-none shadow-sm sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            {/* Desktop Sidebar Expand / Collapse Toggle Button */}
            <button 
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
              className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs text-foreground bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border rounded-lg transition font-extrabold shadow-xs active:scale-95 cursor-pointer shrink-0"
              title={sidebarCollapsed ? "Expand Sidebar Menu" : "Collapse Sidebar Menu"}
            >
              <i className={`fa-solid ${sidebarCollapsed ? 'fa-outdent text-amber-500' : 'fa-indent text-emerald-500'} text-sm`}></i>
              <span className="text-[11px] uppercase tracking-wider">{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
            </button>

            {/* Mobile Hamburger Drawer Toggle */}
            <button 
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
              className="md:hidden p-2 text-textSecondary hover:text-textPrimary bg-background border border-border rounded-lg transition shrink-0 flex items-center justify-center cursor-pointer"
              title="Open Navigation Menu"
            >
              <i className="fa-solid fa-bars text-sm"></i>
            </button>
            <div className="min-w-0">
              <div className="text-[10px] text-emerald-500 font-black uppercase tracking-widest truncate flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{companyName}</span>
                <span className="text-textMuted">•</span>
                <span className="text-textMuted font-mono">{getBreadcrumb()}</span>
              </div>
              <div className="text-xs sm:text-sm font-black text-textPrimary tracking-tight mt-0.5 flex items-center gap-1.5 truncate">
                {getGreeting()} <span className="font-semibold text-textSecondary text-xs hidden md:inline">| Live Hardware Store Dashboard</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold">
            {/* Live Monospace Date & Time Widget */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-emerald-400 text-[11px] font-extrabold tracking-wide uppercase font-mono shadow-inner">
              <i className="fa-regular fa-clock text-emerald-500 text-xs"></i>
              <span>{currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <span className="text-slate-600">|</span>
              <span>{currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 text-textSecondary hover:text-textPrimary bg-background border border-border rounded-lg transition active:scale-95 cursor-pointer flex items-center justify-center"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
            >
              <i className={`fa-solid ${theme === 'dark' ? 'fa-sun text-amber-400' : 'fa-moon text-indigo-400'} text-xs`}></i>
            </button>
            
            {/* Unstocked Demand Log quick button */}
            <button 
              onClick={() => setShowDemandModal(true)} 
              className="px-3 py-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition flex items-center gap-1.5" 
              title="Log Unstocked Item Requested by Customer"
            >
              <i className="fa-solid fa-clipboard-list text-xs"></i>
              <span className="hidden sm:inline">Demand Log</span>
              {highDemandAlerts.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                  {highDemandAlerts.length}
                </span>
              )}
            </button>

            {/* Search icon */}
            <button onClick={() => { setShowSearchModal(true); setSearchQuery(''); }} className="p-2 text-textSecondary hover:text-textPrimary bg-background border border-border rounded-lg transition" title="Search Everything">
              <i className="fa-solid fa-magnifying-glass text-xs"></i>
            </button>

            {/* Notification bell */}
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-textSecondary hover:text-textPrimary bg-background border border-border rounded-lg transition" title="System Alerts">
                <i className="fa-regular fa-bell text-xs"></i>
                {(lowStockCount > 0 || getCustomerDues() > 0 || getSupplierDues() > 0 || highDemandAlerts.length > 0 || todaysBirthdays.length > 0) && (
                  <>
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                  </>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-secondary border border-border rounded-xl shadow-xl z-50 p-4 space-y-3 animate-fade-in text-foreground">
                  <div className="flex justify-between items-center border-b border-border pb-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider">System Notifications</span>
                    <button onClick={() => setShowNotifications(false)} className="text-[10px] text-textMuted hover:text-textPrimary">Close</button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {/* Birthday & Establishment Alerts with Direct Call Option */}
                    {todaysBirthdays.map((item, idx) => (
                      <div key={idx} onClick={() => { setActiveTab(item.tab); setShowNotifications(false); }} className="p-2.5 rounded bg-pink-500/10 border border-pink-500/30 text-xs space-y-1.5 cursor-pointer hover:bg-pink-500/20 transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex gap-2 items-start">
                            <i className="fa-solid fa-cake-candles text-pink-400 text-sm mt-0.5 animate-bounce"></i>
                            <div>
                              <div className="font-extrabold text-pink-400 uppercase tracking-wide">{item.title}</div>
                              <div className="text-[10px] text-textSecondary mt-0.5">
                                Wish {item.name} ({item.type}) on their special day!
                              </div>
                            </div>
                          </div>
                        </div>

                        {item.phone ? (
                          <div className="pt-1 flex items-center justify-between border-t border-pink-500/20">
                            <span className="text-[10px] font-mono text-textMuted font-bold">📞 {item.phone}</span>
                            <a 
                              href={`tel:${item.phone}`} 
                              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded text-[10px] uppercase transition shadow-sm inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <i className="fa-solid fa-phone"></i> Call Now
                            </a>
                          </div>
                        ) : (
                          <div className="text-[10px] text-textMuted italic">No phone number recorded.</div>
                        )}
                      </div>
                    ))}
                    {/* High Customer Demand Alert (5+ Requests) */}
                    {highDemandAlerts.length > 0 && (
                      <div onClick={() => { setShowDemandModal(true); setShowNotifications(false); }} className="p-2 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 cursor-pointer text-xs flex gap-2">
                        <i className="fa-solid fa-fire text-amber-400 mt-0.5 animate-bounce"></i>
                        <div>
                          <div className="font-extrabold text-amber-400 uppercase tracking-wide">High Customer Demand Alert</div>
                          <div className="text-[10px] text-textSecondary mt-0.5">
                            {highDemandAlerts.length} unstocked item{highDemandAlerts.length > 1 ? 's' : ''} requested 5+ times ({highDemandAlerts.map(d => `"${d.item_name}"`).join(', ')}). Click to order stock.
                          </div>
                        </div>
                      </div>
                    )}
                    {lowStockCount > 0 && (
                      <div onClick={() => { setActiveTab('inventory-stock'); setShowNotifications(false); }} className="p-2 rounded bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 cursor-pointer text-xs flex gap-2">
                        <i className="fa-solid fa-triangle-exclamation text-rose-500 mt-0.5 animate-pulse"></i>
                        <div>
                          <div className="font-bold text-rose-500">Low Stock Warnings</div>
                          <div className="text-[10px] text-textSecondary mt-0.5">{lowStockCount} items require restocking. Click to check.</div>
                        </div>
                      </div>
                    )}
                    {getCustomerDues() > 0 && (
                      <div onClick={() => { setActiveTab('customers'); setShowNotifications(false); }} className="p-2 rounded bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 cursor-pointer text-xs flex gap-2">
                        <i className="fa-solid fa-hand-holding-dollar text-orange-500 mt-0.5"></i>
                        <div>
                          <div className="font-bold text-orange-500">Pending Customer Payments</div>
                          <div className="text-[10px] text-textSecondary mt-0.5">₹{getCustomerDues().toLocaleString()} outstanding dues from customers.</div>
                        </div>
                      </div>
                    )}
                    {getSupplierDues() > 0 && (
                      <div onClick={() => { setActiveTab('suppliers'); setShowNotifications(false); }} className="p-2 rounded bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/10 cursor-pointer text-xs flex gap-2">
                        <i className="fa-solid fa-truck-ramp-box text-purple-500 mt-0.5"></i>
                        <div>
                          <div className="font-bold text-purple-500">Vendor Dues Outstanding</div>
                          <div className="text-[10px] text-textSecondary mt-0.5">₹{getSupplierDues().toLocaleString()} payables to suppliers.</div>
                        </div>
                      </div>
                    )}
                    {lowStockCount === 0 && getCustomerDues() === 0 && getSupplierDues() === 0 && highDemandAlerts.length === 0 && todaysBirthdays.length === 0 && (
                      <div className="text-center py-4 text-xs text-textMuted">
                        <i className="fa-regular fa-bell-slash text-base mb-1 block"></i>
                        No alerts or pending payments.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button className="p-2 text-textSecondary hover:text-textPrimary bg-background border border-border rounded-lg transition" onClick={toggleTheme} title="Switch Theme">
              {theme === 'dark' ? <i className="fa-regular fa-sun text-xs"></i> : <i className="fa-regular fa-moon text-xs"></i>}
            </button>
            
            {/* User Profile */}
            <div className="flex items-center gap-2 border-l border-border pl-4">
              <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-xs uppercase flex items-center justify-center border border-primary/20 shrink-0">
                {profile?.username?.slice(0, 2) || 'OP'}
              </div>
              <div className="hidden lg:block text-left leading-tight truncate max-w-[100px]">
                <div className="font-bold text-textPrimary truncate">{profile?.username || 'Owner'}</div>
                <div className="text-[9px] text-textMuted font-bold uppercase">{profile?.role || 'Staff'}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Views Router */}
        <main className="p-3 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'dashboard' && (
            <Dashboard tenantId={tenant?.id || 'default-hardware-erp'} sales={sales} purchases={purchases} expenses={expenses} onNavigate={setActiveTab} />
          )}
          {activeTab === 'new-entry' && (
            <div className="space-y-6 animate-fade-in max-w-5xl mx-auto my-4">
              <div className="bg-secondary border border-border p-4 sm:p-6 rounded-xl shadow-md">
                <h2 className="text-lg font-black text-foreground uppercase tracking-tight">New Entry Quick Action Desk</h2>
                <p className="text-xs text-textMuted mt-1">Select an entry card below to log new transactions, inventory, vendors, customers, or expenses</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* 1. Sale Entry */}
                <button 
                  onClick={() => {
                    setSalesAutoOpen(true);
                    setActiveTab('sales');
                  }}
                  className="bg-secondary border border-border hover:border-emerald-500 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center text-center gap-3 group transition shadow-md"
                >
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/30 group-hover:scale-110 transition duration-150">
                    <i className="fa-solid fa-file-invoice-dollar text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-emerald-400 transition uppercase">a. POS Sales Invoice</h3>
                    <p className="text-xs text-textMuted mt-1">Checkout shopping cart and create retail sales invoice</p>
                  </div>
                </button>

                {/* 2. Purchase Entry */}
                <button 
                  onClick={() => {
                    setPurchaseAutoOpen(true);
                    setActiveTab('purchases');
                  }}
                  className="bg-secondary border border-border hover:border-blue-500 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center text-center gap-3 group transition shadow-md"
                >
                  <div className="w-14 h-14 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/30 group-hover:scale-110 transition duration-150">
                    <i className="fa-solid fa-cart-shopping text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-blue-400 transition uppercase">b. Procurement Bill</h3>
                    <p className="text-xs text-textMuted mt-1">Record supplier purchase bills and update material stock</p>
                  </div>
                </button>

                {/* 3. Add Product */}
                <button 
                  onClick={() => {
                    setProductAutoOpen(true);
                    setActiveTab('products');
                  }}
                  className="bg-secondary border border-border hover:border-amber-500 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center text-center gap-3 group transition shadow-md"
                >
                  <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/30 group-hover:scale-110 transition duration-150">
                    <i className="fa-solid fa-boxes-stacked text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-amber-400 transition uppercase">c. Add New Product</h3>
                    <p className="text-xs text-textMuted mt-1">Configure new inventory product, price rates, and shelf locations</p>
                  </div>
                </button>

                {/* 4. Log Expense */}
                <button 
                  onClick={() => {
                    setExpenseAutoOpen(true);
                    setActiveTab('expenses');
                  }}
                  className="bg-secondary border border-border hover:border-rose-500 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center text-center gap-3 group transition shadow-md"
                >
                  <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/30 group-hover:scale-110 transition duration-150">
                    <i className="fa-solid fa-hand-holding-dollar text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-rose-400 transition uppercase">d. Log Shop Expense</h3>
                    <p className="text-xs text-textMuted mt-1">Audit daily shop operating costs, rent, electricity, and salaries</p>
                  </div>
                </button>

                {/* 5. Register Customer */}
                <button 
                  onClick={() => {
                    setCustomerAutoOpen(true);
                    setActiveTab('customers');
                  }}
                  className="bg-secondary border border-border hover:border-purple-500 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center text-center gap-3 group transition shadow-md"
                >
                  <div className="w-14 h-14 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/30 group-hover:scale-110 transition duration-150">
                    <i className="fa-solid fa-user-plus text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-purple-400 transition uppercase">e. Register Customer</h3>
                    <p className="text-xs text-textMuted mt-1">Create new customer profile and setup credit limit ledgers</p>
                  </div>
                </button>

                {/* 6. Register Vendor */}
                <button 
                  onClick={() => {
                    setSupplierAutoOpen(true);
                    setActiveTab('suppliers');
                  }}
                  className="bg-secondary border border-border hover:border-teal-500 rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center text-center gap-3 group transition shadow-md"
                >
                  <div className="w-14 h-14 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/30 group-hover:scale-110 transition duration-150">
                    <i className="fa-solid fa-truck-ramp-box text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-teal-400 transition uppercase">f. Register Vendor</h3>
                    <p className="text-xs text-textMuted mt-1">Add material supplier profiles and establishment details</p>
                  </div>
                </button>
              </div>
            </div>
          )}
          {activeTab === 'products' && (
            <Products tenantId={tenant?.id || 'default-hardware-erp'} businessType={businessType as any} autoOpenModal={productAutoOpen} onModalClosed={() => setProductAutoOpen(false)} />
          )}
          {activeTab === 'sales' && (
            <Sales 
              tenantId={tenant?.id || 'default-hardware-erp'} 
              tenantName={companyName} 
              autoCustomerName={salesAutoCustomer}
              onAutoCustomerConsumed={() => setSalesAutoCustomer(null)}
              autoOpenModal={salesAutoOpen}
              onModalClosed={() => setSalesAutoOpen(false)}
            />
          )}
          {activeTab === 'purchases' && (
            <Purchases autoOpenModal={purchaseAutoOpen} onModalClosed={() => setPurchaseAutoOpen(false)} />
          )}
          {activeTab === 'customers' && (
            <Customers 
              onNewInvoice={(custName) => {
                setSalesAutoCustomer(custName);
                setActiveTab('sales');
              }}
              autoOpenModal={customerAutoOpen}
              onModalClosed={() => setCustomerAutoOpen(false)}
            />
          )}
          {activeTab === 'suppliers' && (
            <Suppliers autoOpenModal={supplierAutoOpen} onModalClosed={() => setSupplierAutoOpen(false)} />
          )}
          {activeTab === 'expenses' && (
            <Expenses autoOpenModal={expenseAutoOpen} onModalClosed={() => setExpenseAutoOpen(false)} />
          )}
          {activeTab === 'inventory-stock' && (
            <Products tenantId={tenant?.id || 'default-hardware-erp'} businessType={businessType as any} autoOpenModal={productAutoOpen} onModalClosed={() => setProductAutoOpen(false)} />
          )}
          {activeTab === 'reports' && (
            <Reports tenantId={tenant?.id || 'default-hardware-erp'} sales={sales} purchases={purchases} />
          )}
          {activeTab === 'excel-export' && (
            <ExcelExport />
          )}
        </main>

      </div>

      {showSearchModal && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center border-b border-border pb-3 mb-4">
              <span className="text-sm font-bold text-foreground flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-primary"></i> Universal Search
              </span>
              <button onClick={() => setShowSearchModal(false)} className="text-textSecondary hover:text-textPrimary text-xs font-semibold">✕ Close</button>
            </div>
            
            <input 
              type="text" 
              className="w-full bg-background border border-border rounded-lg p-3 text-foreground focus:outline-none focus:border-primary font-semibold text-sm shadow-inner"
              placeholder="Search products by name/HSN, customers, vendors..."
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="overflow-y-auto flex-1 mt-4 space-y-3 pr-1 scrollbar-thin">
              {searchQuery.trim().length === 0 ? (
                <div className="text-center py-8 text-textMuted text-xs font-medium">
                  Type to search products, customers, and vendors.
                </div>
              ) : (() => {
                const query = searchQuery.toLowerCase();
                const matchedProducts = productsList.filter(p => 
                  p.product_name.toLowerCase().includes(query) || 
                  (p.hsn && p.hsn.toLowerCase().includes(query)) ||
                  (p.sku && p.sku.toLowerCase().includes(query))
                ).slice(0, 5);

                const matchedCustomers = customersList.filter(c => 
                  c.customer_name.toLowerCase().includes(query) ||
                  (c.phone && c.phone.includes(query))
                ).slice(0, 3);

                const matchedSuppliers = suppliersList.filter(s => 
                  s.supplier_name.toLowerCase().includes(query) ||
                  (s.phone && s.phone.includes(query))
                ).slice(0, 3);

                const matchedSales = sales.filter(s => 
                  (s.invoice_number && s.invoice_number.toLowerCase().includes(query)) ||
                  (s.customer_name && s.customer_name.toLowerCase().includes(query))
                ).slice(0, 3);

                const matchedPurchases = purchases.filter(p => 
                  (p.bill_number && p.bill_number.toLowerCase().includes(query)) ||
                  (p.supplier_name && p.supplier_name.toLowerCase().includes(query))
                ).slice(0, 3);

                const hasResults = matchedProducts.length > 0 || matchedCustomers.length > 0 || matchedSuppliers.length > 0 || matchedSales.length > 0 || matchedPurchases.length > 0;

                if (!hasResults) {
                  return (
                    <div className="text-center py-8 text-textMuted text-xs">
                      No matching records found.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {/* Products */}
                    {matchedProducts.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider pl-1">Products</div>
                        {matchedProducts.map(p => (
                          <div 
                            key={p.id}
                            onClick={() => {
                              setActiveTab('products');
                              setShowSearchModal(false);
                            }}
                            className="p-2.5 rounded-lg border border-border bg-background/40 hover:bg-primary/5 hover:border-primary/30 cursor-pointer flex justify-between items-center transition"
                          >
                            <div>
                              <div className="font-bold text-xs text-foreground uppercase">{p.product_name}</div>
                              <div className="text-[9px] text-textMuted font-mono">HSN: {p.hsn || '-'} | SKU: {p.sku || '-'}</div>
                            </div>
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase">Stock: {p.current_stock}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Customers */}
                    {matchedCustomers.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider pl-1">Customers</div>
                        {matchedCustomers.map(c => (
                          <div 
                            key={c.id}
                            onClick={() => {
                              setActiveTab('customers');
                              setShowSearchModal(false);
                            }}
                            className="p-2.5 rounded-lg border border-border bg-background/40 hover:bg-orange-500/5 hover:border-orange-500/30 cursor-pointer flex justify-between items-center transition"
                          >
                            <div>
                              <div className="font-bold text-xs text-foreground uppercase">{c.customer_name}</div>
                              <div className="text-[9px] text-textMuted font-mono">{c.phone || 'No phone'}</div>
                            </div>
                            <span className="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded font-bold uppercase">Balance: ₹{c.outstanding || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Suppliers */}
                    {matchedSuppliers.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider pl-1">Vendors</div>
                        {matchedSuppliers.map(s => (
                          <div 
                            key={s.id}
                            onClick={() => {
                              setActiveTab('suppliers');
                              setShowSearchModal(false);
                            }}
                            className="p-2.5 rounded-lg border border-border bg-background/40 hover:bg-purple-500/5 hover:bg-purple-500/30 cursor-pointer flex justify-between items-center transition"
                          >
                            <div>
                              <div className="font-bold text-xs text-foreground uppercase">{s.supplier_name}</div>
                              <div className="text-[9px] text-textMuted font-mono">{s.phone || 'No phone'}</div>
                            </div>
                            <span className="text-[10px] bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded font-bold uppercase">Payable: ₹{s.outstanding || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sales Invoices */}
                    {matchedSales.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider pl-1">Sales Invoices</div>
                        {matchedSales.map(s => (
                          <div 
                            key={s.id}
                            onClick={() => {
                              setActiveTab('sales');
                              setShowSearchModal(false);
                            }}
                            className="p-2.5 rounded-lg border border-border bg-background/40 hover:bg-emerald-500/5 hover:bg-emerald-500/30 cursor-pointer flex justify-between items-center transition"
                          >
                            <div>
                              <div className="font-bold text-xs text-foreground uppercase">{s.invoice_number}</div>
                              <div className="text-[9px] text-textMuted font-mono">Buyer: {s.customer_name} | Date: {new Date(s.sale_date || '').toLocaleDateString()}</div>
                            </div>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-450 px-2 py-0.5 rounded font-bold uppercase">₹{s.total_amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Purchase Bills */}
                    {matchedPurchases.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-extrabold text-textMuted uppercase tracking-wider pl-1">Purchase Bills</div>
                        {matchedPurchases.map(p => (
                          <div 
                            key={p.id}
                            onClick={() => {
                              setActiveTab('purchases');
                              setShowSearchModal(false);
                            }}
                            className="p-2.5 rounded-lg border border-border bg-background/40 hover:bg-blue-500/5 hover:bg-blue-500/30 cursor-pointer flex justify-between items-center transition"
                          >
                            <div>
                              <div className="font-bold text-xs text-foreground uppercase">{p.bill_number}</div>
                              <div className="text-[9px] text-textMuted font-mono">Vendor: {p.supplier_name} | Date: {new Date(p.purchase_date || '').toLocaleDateString()}</div>
                            </div>
                            <span className="text-[10px] bg-blue-500/10 text-blue-450 px-2 py-0.5 rounded font-bold uppercase">₹{p.total_amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Unstocked Customer Demand Tracker Modal */}
      <DemandModal 
        tenantId={tenant?.id}
        isOpen={showDemandModal}
        onClose={() => setShowDemandModal(false)}
        onNavigateToProducts={() => {
          setActiveTab('products');
        }}
      />
    </div>
  );
}
