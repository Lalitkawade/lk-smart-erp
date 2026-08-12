import { useState, useMemo } from 'react';
import { useInventory } from '../../hooks/useInventory';
import { useErpContext } from '../../context/ErpContext';
import type { SalesInvoice, PurchaseBill, Expense } from '../../types/erp.types';
import { t } from '../../utils/i18n';

interface DashboardProps {
  tenantId: string;
  sales: SalesInvoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  onNavigate: (tab: string) => void;
}

type TimeRange = '10days' | 'month' | 'year' | 'all' | 'custom';

export default function Dashboard({ tenantId, sales, purchases, expenses, onNavigate }: DashboardProps) {

  const { products } = useInventory(tenantId);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const { 
    customers: contextCustomers, 
    suppliers: contextSuppliers, 
    purchases: contextPurchases, 
    sales: contextSales,
    supplierPayments: contextSupplierPayments,
    customerPayments: contextCustomerPayments
  } = useErpContext();
  const customers = contextCustomers || [];
  const suppliers = contextSuppliers || [];
  const supplierPayments = contextSupplierPayments || [];
  const customerPayments = contextCustomerPayments || [];
  const activePurchases = (purchases && purchases.length > 0) ? purchases : (contextPurchases || []);
  const [selectedTxDetail, setSelectedTxDetail] = useState<any | null>(null);





  // 1. Filter arrays dynamically based on selected TimeRange / Calendar Date
  const filteredData = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // Last 10 days
    const startOf10Days = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    startOf10Days.setHours(0, 0, 0, 0);

    // Last 30 days (Month)
    const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    startOfMonth.setHours(0, 0, 0, 0);

    // Last 365 days (Year)
    const startOfYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    startOfYear.setHours(0, 0, 0, 0);

    const customStart = startDate ? new Date(startDate + 'T00:00:00') : null;
    const customEnd = endDate ? new Date(endDate + 'T23:59:59') : null;

    const filterByDate = (item: any) => {
      const dateStr = item?.sale_date || item?.purchase_date || item?.expense_date || item?.created_at || item?.date;
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;

      if (timeRange === '10days') return d >= startOf10Days && d <= todayEnd;
      if (timeRange === 'month') return d >= startOfMonth && d <= todayEnd;
      if (timeRange === 'year') return d >= startOfYear && d <= todayEnd;
      if (timeRange === 'custom') {
        if (customStart && d < customStart) return false;
        if (customEnd && d > customEnd) return false;
        return true;
      }
      return true; // All Time ('all')
    };

    const localCachedSales = (() => {
      try {
        const cached = localStorage.getItem('lk_sales_invoices') || localStorage.getItem('lk_sales');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
      return [];
    })();

    const effectiveSales = (sales && sales.length > 0) 
      ? sales 
      : (contextSales && contextSales.length > 0 ? contextSales : localCachedSales);

    const effectivePurchases = activePurchases;
    const effectiveExpenses = expenses || [];

    return {
      sales: effectiveSales.filter(s => filterByDate(s)),
      purchases: effectivePurchases.filter(p => filterByDate(p)),
      expenses: effectiveExpenses.filter(e => filterByDate(e))
    };
  }, [sales, contextSales, activePurchases, expenses, timeRange, startDate, endDate]);

  // 2. Calculate Financial stats based on filtered data
  const stats = useMemo(() => {
    const totalSales = filteredData.sales.reduce((acc, s) => acc + Number(s.total_amount || (s as any).amount || (s as any).grand_total || 0), 0);
    const rawPurchases = filteredData.purchases.reduce((acc, p) => acc + Number(p.total_amount || (p as any).amount || (p as any).grand_total || 0), 0);
    const totalExpenses = filteredData.expenses.reduce((acc, e) => acc + Number(e.amount || (e as any).total_amount || 0), 0);
    
    // Total Inventory Valuation (Current Unsold Physical Stock Value in Base Stock Units)
    const stockValuation = products.reduce(
      (acc, p) => {
        const piecesPerPack = Math.max(1, Number(p.pieces_per_pack || 1));
        const purchasePrice = Number(p.purchase_price || 0);
        const baseCost = piecesPerPack > 0 ? (purchasePrice / piecesPerPack) : purchasePrice;
        const stockInBaseUnit = Number(p.current_stock || 0);
        return acc + (baseCost * stockInBaseUnit);
      },
      0
    );

    // Calculate itemized COGS (Cost of Goods Sold) for sold inventory items in Base Stock Units
    const itemizedCOGS = filteredData.sales.reduce((acc, s) => {
      const items = (s as any).items || (s as any).sales_items || [];
      const billCogs = items.reduce((iAcc: number, item: any) => {
        const qty = Number(item.qty || 1);
        const prod = products.find(p => p.id === (item.product_id || item.product?.id));
        const piecesPerPack = Math.max(1, Number(item.pieces_per_pack || prod?.pieces_per_pack || 1));
        const purchasePrice = Number(item.purchase_price || prod?.purchase_price || 0);
        
        let baseCost = 0;
        if (purchasePrice > 0) {
          baseCost = purchasePrice / piecesPerPack;
        } else if (prod && Number((prod as any).base_unit_cost || 0) > 0) {
          baseCost = Number((prod as any).base_unit_cost);
        } else {
          // Fallback if item cost not explicitly set: estimate cost at 70% of retail rate
          const rate = Number(item.rate || 0);
          baseCost = rate > 0 ? (rate * 0.70) : 0;
        }
        
        const isLoose = item.isLoose ?? true;
        const totalBaseUnits = isLoose ? qty : (qty * piecesPerPack);
        return iAcc + (totalBaseUnits * baseCost);
      }, 0);

      // Fallback for legacy sales bills without items breakdown: estimate COGS at 70% of bill total
      const effectiveBillCogs = items.length === 0 && Number(s.total_amount || (s as any).amount || 0) > 0
        ? Number(s.total_amount || (s as any).amount || 0) * 0.70
        : billCogs;

      return acc + effectiveBillCogs;
    }, 0);

    const syncedPurchases = Math.max(rawPurchases, stockValuation);
    const cogs = itemizedCOGS;
    
    // Net Profit calculation: Gross Profit (Revenue - COGS) minus Expenses
    const grossProfit = totalSales - cogs;
    const netProfit = totalSales > 0 ? (grossProfit - totalExpenses) : (0 - totalExpenses);

    const supplierDues = suppliers.reduce((acc, s) => acc + Number(s.outstanding || (s as any).due_amount || (s as any).balance || 0), 0);
    const purchaseDues = filteredData.purchases.reduce((acc, p) => acc + Number(p.due_amount || (p as any).pending_amount || 0), 0);
    
    // Calculate total vendor pending dues matching Vendors Desk (Suppliers.tsx) logic
    const allPurchasesList = (purchases && purchases.length > 0) ? purchases : (contextPurchases || []);
    const allSupplierPaymentsList = supplierPayments;

    const vendorPending = suppliers.length > 0
      ? suppliers.reduce((acc, s) => {
          const nameKey = (s.supplier_name || '').toUpperCase().trim();
          const suppBills = allPurchasesList.filter((b: any) => 
            (b.supplier_id && b.supplier_id === s.id) ||
            (b.supplier_name && b.supplier_name.toUpperCase().trim() === nameKey)
          );
          const suppPays = allSupplierPaymentsList.filter((p: any) => 
            p.supplier_id === s.id ||
            ((p as any).supplier_name && (p as any).supplier_name.toUpperCase().trim() === nameKey)
          );

          const totalPurch = suppBills.reduce((bAcc: number, b: any) => bAcc + Number(b.total_amount || 0), 0);
          const totalBillPaid = suppBills.reduce((bAcc: number, b: any) => bAcc + Number(b.paid_amount || 0), 0);
          const totalVoucherPaid = suppPays.reduce((pAcc: number, p: any) => pAcc + Number(p.amount || 0), 0);
          const totalPaid = totalBillPaid + totalVoucherPaid;

          const vendorOutstanding = Math.max(0, totalPurch - totalPaid);
          return acc + vendorOutstanding;
        }, 0)
      : Math.max(0, 
          allPurchasesList.reduce((acc: number, p: any) => acc + Number(p.total_amount || 0), 0) -
          allPurchasesList.reduce((acc: number, p: any) => acc + Number(p.paid_amount || 0), 0) -
          allSupplierPaymentsList.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0)
        );

    // Calculate total customer pending dues matching Customers Desk logic
    const allSalesList = (filteredData.sales && filteredData.sales.length > 0) ? filteredData.sales : (contextSales || []);
    const allCustomerPaymentsList = customerPayments;

    const customerPending = customers.length > 0
      ? customers.reduce((acc, c) => {
          const nameKey = (c.customer_name || '').toUpperCase().trim();
          const custSales = allSalesList.filter((s: any) => 
            (s.customer_id && s.customer_id === c.id) ||
            (s.customer_name && s.customer_name.toUpperCase().trim() === nameKey)
          );
          const custPays = allCustomerPaymentsList.filter((p: any) => 
            p.customer_id === c.id ||
            ((p as any).customer_name && (p as any).customer_name.toUpperCase().trim() === nameKey)
          );

          const totalBilled = custSales.reduce((sAcc: number, s: any) => sAcc + Number(s.total_amount || (s as any).amount || 0), 0);
          const totalBillPaid = custSales.reduce((sAcc: number, s: any) => sAcc + Number(s.paid_amount || 0), 0);
          const totalVoucherCollected = custPays.reduce((pAcc: number, p: any) => pAcc + Number(p.amount || 0), 0);
          const totalCollected = totalBillPaid + totalVoucherCollected;

          const custOutstanding = Math.max(0, totalBilled - totalCollected);
          return acc + custOutstanding;
        }, 0)
      : Math.max(0, 
          allSalesList.reduce((acc: number, s: any) => acc + Number((s as any).due_amount || 0), 0)
        );

    return {
      sales: totalSales,
      purchases: syncedPurchases,
      expenses: totalExpenses,
      stockValue: stockValuation,
      netProfit,
      vendorPending,
      customerPending
    };
  }, [filteredData, products, suppliers, customers, contextPurchases, contextSales, supplierPayments, customerPayments]);

  // 4. Identify Low Stock items and link them with Supplier Contact info
  const lowStockAlerts = useMemo(() => {
    return products
      .filter(p => (p.current_stock || 0) <= (p.min_stock_level || 10))
      .map(p => {
        let phone = p.supplier_phone || '';
        let vendorName = p.supplier_name || 'Vendor N/A';

        if (!phone) {
          const match = suppliers.find(s => s.supplier_name?.toLowerCase() === vendorName.toLowerCase());
          if (match && match.phone) phone = match.phone;
        }

        return {
          ...p,
          vendorName,
          vendorPhone: phone || 'N/A'
        };
      });
  }, [products, suppliers]);

  // 5. Calculate Top Selling Products across ALL catalog items (Top 100)
  const topSellingProducts = useMemo(() => {
    const map: { [key: string]: { id: string; name: string; qty: number; total: number; hsn: string } } = {};

    // 1. Populate map with all unique products from inventory catalog first
    (products || []).forEach(p => {
      const key = p.id || p.product_name;
      if (key) {
        map[key] = {
          id: p.id,
          name: p.product_name || 'Product Item',
          qty: 0,
          total: 0,
          hsn: p.hsn || 'N/A'
        };
      }
    });

    // 2. Accumulate sales by product_id with fallback to name match
    (sales || []).forEach(s => {
      const items = (s as any).items || (s as any).sales_items || [];
      items.forEach((item: any) => {
        const prodId = item.product_id || item.product?.id;
        const rawName = item.product_name || item.product?.product_name || 'Product Item';
        
        let key = prodId && map[prodId] ? prodId : null;
        if (!key) {
          const matchEntry = Object.entries(map).find(([_, v]) => v.name.toLowerCase() === rawName.toLowerCase());
          if (matchEntry) {
            key = matchEntry[0];
          } else {
            key = prodId || rawName;
          }
        }

        const qty = Number(item.qty || 1);
        const rate = Number(item.rate || item.price || 0);
        const amt = item.amount || (qty * rate);
        const hsn = item.hsn || item.product?.hsn || 'N/A';

        if (!map[key]) {
          map[key] = { id: key, name: rawName, qty: 0, total: 0, hsn };
        }
        map[key].qty += qty;
        map[key].total += amt;
      });
    });

    return Object.values(map)
      .sort((a, b) => b.qty - a.qty || b.total - a.total)
      .slice(0, 100);
  }, [products, sales]);

  const barChartData = useMemo(() => {
    const dateMap: { [dateStr: string]: { date: Date; label: string; sales: number; purchases: number } } = {};

    // Pre-populate continuous 10 daily slots if Last 10 Days is selected
    if (timeRange === '10days') {
      const now = new Date();
      for (let i = 9; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dStr = d.toDateString();
        dateMap[dStr] = {
          date: d,
          label: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          sales: 0,
          purchases: 0
        };
      }
    }
    
    filteredData.sales.forEach(s => {
      const dateVal = s.sale_date || (s as any).created_at;
      if (!dateVal) return;
      const dObj = new Date(dateVal);
      if (isNaN(dObj.getTime())) return;
      const dStr = dObj.toDateString();
      if (!dateMap[dStr]) {
        dateMap[dStr] = {
          date: dObj,
          label: dObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          sales: 0,
          purchases: 0
        };
      }
      dateMap[dStr].sales += Number(s.total_amount || 0);
    });

    filteredData.purchases.forEach(p => {
      const dateVal = p.purchase_date || (p as any).created_at;
      if (!dateVal) return;
      const dObj = new Date(dateVal);
      if (isNaN(dObj.getTime())) return;
      const dStr = dObj.toDateString();
      if (!dateMap[dStr]) {
        dateMap[dStr] = {
          date: dObj,
          label: dObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          sales: 0,
          purchases: 0
        };
      }
      dateMap[dStr].purchases += Number(p.total_amount || 0);
    });

    const items = Object.values(dateMap).sort((a, b) => a.date.getTime() - b.date.getTime());
    
    const maxVal = Math.max(
      ...items.map(i => i.sales),
      ...items.map(i => i.purchases),
      1000
    );

    return { items, maxVal };
  }, [filteredData, timeRange]);

  const getTransactionLineItems = (tx: any, productsList: any[]) => {
    if (!tx) return [];

    // 1. Direct items array on object
    const rawItems = tx.items || tx.purchase_items || tx.sales_items || [];
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      return rawItems.map((it: any) => {
        const matchedProd = (productsList || []).find((p: any) => p.id === (it.product_id || it.product?.id));
        const name = it.product_name || it.product?.product_name || matchedProd?.product_name || 'Procured Material Item';
        const qty = Number(it.qty || it.quantity || 1);
        const rate = Number(it.rate || it.price || it.unit_price || matchedProd?.purchase_price || matchedProd?.selling_price || 0);
        const amount = Number(it.amount || (qty * rate));
        return {
          product_name: name,
          qty,
          rate,
          amount
        };
      });
    }

    // 2. Check localStorage cache for saved items by bill id or bill/invoice number
    try {
      const keysToTry: string[] = [];
      if (tx.type === 'Purchase') {
        if (tx.id) keysToTry.push(`pb_items_${tx.id}`);
        if (tx.invoice_number && tx.invoice_number !== 'N/A') keysToTry.push(`pb_items_${tx.invoice_number}`);
      } else {
        if (tx.id) keysToTry.push(`si_items_${tx.id}`);
        if (tx.invoice_number && tx.invoice_number !== 'N/A') keysToTry.push(`si_items_${tx.invoice_number}`);
      }

      for (const key of keysToTry) {
        const cachedStr = localStorage.getItem(key);
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((it: any) => ({
              product_name: it.product_name || 'Procured Material Item',
              qty: Number(it.qty || 1),
              rate: Number(it.rate || 0),
              amount: Number(it.amount || (Number(it.qty || 1) * Number(it.rate || 0)))
            }));
          }
        }
      }
    } catch (e) {
      console.warn('Error reading transaction items from storage:', e);
    }

    // 3. Catalog matching by vendor name for Purchases
    if (tx.type === 'Purchase') {
      const supName = (tx.party_name || '').trim().toUpperCase();
      if (supName && supName !== 'VENDOR' && supName !== 'GENERAL VENDOR') {
        const vendorProducts = (productsList || []).filter((p: any) => {
          return p.supplier_name && p.supplier_name.trim().toUpperCase() === supName;
        });

        if (vendorProducts.length > 0) {
          const mapped = vendorProducts.map((p: any) => {
            const pPrice = Number(p.purchase_price || 0);
            const piecesPerPack = Math.max(1, Number(p.pieces_per_pack || 1));
            const baseStock = Number(p.current_stock || 0);
            const purchasePackQty = piecesPerPack > 1 ? Math.max(1, Math.round(baseStock / piecesPerPack)) : Math.max(1, baseStock);
            return {
              product_name: p.product_name || 'Procured Product Item',
              qty: purchasePackQty,
              rate: pPrice,
              amount: purchasePackQty * pPrice
            };
          });

          const totalMappedCost = mapped.reduce((sum: number, item: any) => sum + item.amount, 0);
          const txCost = Number(tx.amount || 0);

          if (mapped.length === 1 || Math.abs(totalMappedCost - txCost) < 1.0) {
            return mapped;
          }
        }
      }
    }

    // 4. Fallback line item matching the transaction total amount
    const txTotal = Number(tx.amount || 0);
    if (txTotal > 0) {
      return [
        {
          product_name: tx.type === 'Purchase'
            ? (tx.party_name ? `Procured Material (${tx.party_name})` : 'Procured Material Item')
            : (tx.party_name ? `Retail Material (${tx.party_name})` : 'Sales Product Item'),
          qty: 1,
          rate: txTotal,
          amount: txTotal
        }
      ];
    }

    return [];
  };

  const recentTransactions = useMemo(() => {
    const combined: any[] = [];
    
    sales.forEach(s => {
      combined.push({
        id: s.id,
        invoice_number: s.invoice_number,
        party_name: s.customer_name || 'Cash Customer',
        type: 'Sale',
        date: s.sale_date,
        amount: s.total_amount,
        status: s.payment_status || 'Paid',
        payment_mode: s.payment_mode || 'Cash',
        items: (s as any).items || (s as any).sales_items || []
      });
    });

    purchases.forEach(p => {
      combined.push({
        id: p.id,
        invoice_number: p.bill_number || 'N/A',
        party_name: p.supplier_name || 'Vendor',
        type: 'Purchase',
        date: p.purchase_date,
        amount: p.total_amount,
        status: Number(p.due_amount || 0) > 0 ? 'Pending' : 'Paid',
        payment_mode: (p as any).payment_mode || 'Bank / Credit',
        items: (p as any).items || (p as any).purchase_items || []
      });
    });

    return combined
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, purchases]);

  const totalProductsCount = products.length;
  const lowStockCount = lowStockAlerts.length;
  const outOfStockCount = products.filter(p => (p.current_stock || 0) <= 0).length;
  const inStockCount = Math.max(0, totalProductsCount - lowStockCount - outOfStockCount);

  const inStockPercent = totalProductsCount > 0 ? (inStockCount / totalProductsCount) * 100 : 0;
  const lowStockPercent = totalProductsCount > 0 ? (lowStockCount / totalProductsCount) * 100 : 0;
  const outOfStockPercent = totalProductsCount > 0 ? (outOfStockCount / totalProductsCount) * 100 : 0;

  const paymentRatio = (stats.customerPending + stats.vendorPending) > 0 
    ? (stats.customerPending / (stats.customerPending + stats.vendorPending)) * 100 
    : 50;

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      
      {/* 1. Header & Time Filter Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-secondary p-4 rounded-xl border border-border">
        <div>
          <h1 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <i className="fa-solid fa-chart-line text-primary"></i> {t('executiveDashboard')}
          </h1>
          <p className="text-xs text-textMuted mt-0.5">Live store financials, inventory velocity, and operational ledger summary.</p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center overflow-x-auto max-w-full bg-background border border-border rounded-lg p-1 text-xs font-semibold scrollbar-none flex-nowrap shrink-0">
            <button
              onClick={() => setTimeRange('10days')}
              className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${timeRange === '10days' ? 'bg-primary text-white font-bold' : 'text-textSecondary hover:text-foreground'}`}
            >
              {t('tenDays')}
            </button>
            <button
              onClick={() => setTimeRange('month')}
              className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${timeRange === 'month' ? 'bg-primary text-white font-bold' : 'text-textSecondary hover:text-foreground'}`}
            >
              {t('month')}
            </button>
            <button
              onClick={() => setTimeRange('year')}
              className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${timeRange === 'year' ? 'bg-primary text-white font-bold' : 'text-textSecondary hover:text-foreground'}`}
            >
              {t('year')}
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${timeRange === 'all' ? 'bg-primary text-white font-bold' : 'text-textSecondary hover:text-foreground'}`}
            >
              {t('allTime')}
            </button>
            <button
              onClick={() => setTimeRange('custom')}
              className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${timeRange === 'custom' ? 'bg-primary text-white font-bold' : 'text-textSecondary hover:text-foreground'}`}
            >
              {t('custom')}
            </button>
          </div>

          {/* Custom Date Inputs */}
          {timeRange === 'custom' && (
            <div className="flex items-center gap-2 bg-background border border-border px-2 py-1 rounded-lg text-xs">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none font-mono"
              />
              <span className="text-textMuted">-</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. Primary 4-Stat Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Total Sales */}
        <div
          onClick={() => onNavigate('sales')}
          className="bento-card relative overflow-hidden group cursor-pointer hover:border-primary/60 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          title="Click to view Sales & Billing"
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10.5px] font-bold text-textMuted uppercase tracking-wider flex items-center gap-1 group-hover:text-primary transition">
                {t('totalSales')} <i className="fa-solid fa-arrow-up-right text-[9px] opacity-0 group-hover:opacity-100 transition"></i>
              </span>
              <div className="text-xl font-black text-foreground font-mono mt-1">₹{stats.sales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <span className="text-[10px] text-primary font-bold mt-1 inline-flex items-center gap-1">
                <i className="fa-solid fa-arrow-up-right"></i> {filteredData.sales.length} Invoices
              </span>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl border border-primary/20 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition duration-300">
              <i className="fa-solid fa-file-invoice-dollar text-lg"></i>
            </div>
          </div>
        </div>

        {/* Total Purchases */}
        <div
          onClick={() => onNavigate('inventory-stock')}
          className="bento-card relative overflow-hidden group cursor-pointer hover:border-purple-500/60 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          title="Click to view Procurement & Inventory Stock"
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10.5px] font-bold text-textMuted uppercase tracking-wider flex items-center gap-1 group-hover:text-purple-400 transition">
                {t('totalPurchases')} <i className="fa-solid fa-arrow-up-right text-[9px] opacity-0 group-hover:opacity-100 transition"></i>
              </span>
              <div className="text-xl font-black text-foreground font-mono mt-1">₹{stats.purchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <span className="text-[10px] text-purple-400 font-bold mt-1 inline-flex items-center gap-1">
                <i className="fa-solid fa-boxes-stacked"></i> {filteredData.purchases.length} Procurement Bills
              </span>
            </div>
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition duration-300">
              <i className="fa-solid fa-cart-shopping text-lg"></i>
            </div>
          </div>
        </div>

        {/* Shop Expenses */}
        <div
          onClick={() => onNavigate('expenses')}
          className="bento-card relative overflow-hidden group cursor-pointer hover:border-rose-500/60 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          title="Click to view Shop Expenses"
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10.5px] font-bold text-textMuted uppercase tracking-wider flex items-center gap-1 group-hover:text-rose-400 transition">
                {t('shopExpenses')} <i className="fa-solid fa-arrow-up-right text-[9px] opacity-0 group-hover:opacity-100 transition"></i>
              </span>
              <div className="text-xl font-black text-foreground font-mono mt-1">₹{stats.expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <span className="text-[10px] text-rose-400 font-bold mt-1 inline-flex items-center gap-1">
                <i className="fa-solid fa-receipt"></i> {filteredData.expenses.length} Logged Entries
              </span>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20 group-hover:scale-110 group-hover:bg-rose-500 group-hover:text-white transition duration-300">
              <i className="fa-solid fa-hand-holding-dollar text-lg"></i>
            </div>
          </div>
        </div>

        {/* Net Profit */}
        <div className="bento-card relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10.5px] font-bold text-textMuted uppercase tracking-wider">{t('netProfit')}</span>
              <div className={`text-xl font-black font-mono mt-1 ${stats.netProfit >= 0 ? 'text-primary' : 'text-rose-400'}`}>
                ₹{stats.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-textMuted font-semibold mt-1 block">Revenue - COGS - Expenses</span>
            </div>
            <div className={`p-3 rounded-xl border group-hover:scale-110 transition duration-300 ${stats.netProfit >= 0 ? 'bg-primary/10 text-primary border-primary/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              <i className="fa-solid fa-sack-dollar text-lg"></i>
            </div>
          </div>
        </div>

      </div>

      {/* 3. Secondary 2-Stat Row (Stock Value + Supplier Pending Dues) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Total Stock Value */}
        <div
          onClick={() => onNavigate('inventory-stock')}
          className="bento-card p-4 flex items-center justify-between cursor-pointer group hover:border-amber-500/60 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          title="Click to view Inventory Stock"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition duration-300">
              <i className="fa-solid fa-warehouse text-lg"></i>
            </div>
            <div>
              <span className="text-[10px] font-bold text-textMuted uppercase group-hover:text-amber-500 transition">Total Catalog Stock Valuation</span>
              <div className="text-lg font-black text-foreground font-mono">₹{stats.stockValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate('inventory-stock'); }}
            className="text-xs text-primary font-extrabold hover:underline group-hover:translate-x-1 transition cursor-pointer"
          >
            View Inventory &rarr;
          </button>
        </div>

        {/* Vendor Pending Dues */}
        <div
          onClick={() => onNavigate('suppliers')}
          className="bento-card p-4 flex items-center justify-between cursor-pointer group hover:border-orange-500/60 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          title="Click to view Suppliers & Vendors"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-500/10 text-orange-400 rounded-xl border border-orange-500/20 group-hover:scale-110 group-hover:bg-orange-500 group-hover:text-white transition duration-300">
              <i className="fa-solid fa-truck-ramp-box text-lg"></i>
            </div>
            <div>
              <span className="text-[10px] font-bold text-textMuted uppercase group-hover:text-orange-400 transition">Supplier Payables (Outstanding Dues)</span>
              <div className="text-lg font-black text-orange-400 font-mono">₹{stats.vendorPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate('suppliers'); }}
            className="text-xs text-primary font-extrabold hover:underline group-hover:translate-x-1 transition cursor-pointer"
          >
            View Vendors &rarr;
          </button>
        </div>

      </div>

      {/* 5. Visual Revenue Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sales vs Purchase Bar Chart (2/3 width) */}
        <div className="lg:col-span-2 bento-card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Revenue & Purchase Velocity</h3>
              <p className="text-[10px] text-textMuted mt-0.5">Comparative bar chart across chosen date range</p>
            </div>
            
            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] font-bold">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary"></span>
                <span className="text-textSecondary">Sales (₹)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-purple-500"></span>
                <span className="text-textSecondary">Purchases (₹)</span>
              </div>
            </div>
          </div>

          {/* Mobile Series View (sm:hidden) */}
          <div className="sm:hidden w-full bg-background border border-border rounded-xl p-3 max-h-[380px] overflow-y-auto space-y-3 scrollbar-thin">
            {barChartData.items.length === 0 ? (
              <div className="py-6 text-center text-textMuted text-xs font-semibold">
                No sales or purchases recorded for this date range.
              </div>
            ) : (
              barChartData.items.map((item, idx) => {
                const salesWidthPct = Math.min(100, Math.max(item.sales > 0 ? 5 : 0, (item.sales / barChartData.maxVal) * 100));
                const purWidthPct = Math.min(100, Math.max(item.purchases > 0 ? 5 : 0, (item.purchases / barChartData.maxVal) * 100));

                return (
                  <div key={idx} className="bg-secondary/60 border border-border/80 p-2.5 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-[11px] font-bold font-mono">
                      <span className="text-foreground uppercase tracking-wide">{item.label}</span>
                      <div className="flex gap-2 text-[10px]">
                        <span className="text-primary">Sales: ₹{item.sales.toLocaleString('en-IN')}</span>
                        <span className="text-purple-500 dark:text-purple-400">Purchases: ₹{item.purchases.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-0.5">
                      {/* Horizontal Sales Bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-textMuted w-14 shrink-0 font-bold">Sales</span>
                        <div className="flex-1 bg-background h-2 rounded-full overflow-hidden border border-border/40">
                          <div 
                            className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${salesWidthPct}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Horizontal Purchases Bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-textMuted w-14 shrink-0 font-bold">Purchases</span>
                        <div className="flex-1 bg-background h-2 rounded-full overflow-hidden border border-border/40">
                          <div 
                            className="bg-gradient-to-r from-purple-600 to-purple-400 h-full rounded-full transition-all duration-300"
                            style={{ width: `${purWidthPct}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Column View (hidden sm:flex) */}
          <div className="hidden sm:flex w-full h-56 relative bg-background border border-border rounded-xl p-4 flex-col justify-end">
            {barChartData.items.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-textMuted text-xs font-semibold">
                No sales or purchases recorded for this date range.
              </div>
            ) : (
              <div className="flex-1 flex items-end justify-around gap-2 overflow-x-auto pb-2 pt-6 scrollbar-thin">
                {barChartData.items.map((item, idx) => {
                  const salesHeightPct = Math.min(100, Math.max(item.sales > 0 ? 6 : 2, (item.sales / barChartData.maxVal) * 100));
                  const purHeightPct = Math.min(100, Math.max(item.purchases > 0 ? 6 : 2, (item.purchases / barChartData.maxVal) * 100));

                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 min-w-[44px] max-w-[72px] h-full justify-end group relative">
                      
                      {/* Interactive Tooltip on hover */}
                      <div className="absolute -top-12 z-30 hidden group-hover:flex flex-col items-center bg-slate-900 text-white text-[10px] font-bold p-1.5 rounded-lg shadow-xl border border-slate-700 whitespace-nowrap pointer-events-none animate-fade-in">
                        <span>{item.label}</span>
                        <span className="text-primary">Sales: ₹{item.sales.toLocaleString('en-IN')}</span>
                        <span className="text-purple-400">Purchases: ₹{item.purchases.toLocaleString('en-IN')}</span>
                      </div>

                      {/* Bar Group */}
                      <div className="w-full flex justify-center items-end gap-1.5 flex-1 border-b border-border/60 pb-1">
                        {/* Sales Bar (Primary Indigo/Blue) */}
                        <div 
                          className="w-1/2 bg-gradient-to-t from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 rounded-t-sm transition-all duration-300 relative group/bar"
                          style={{ height: `${salesHeightPct}%` }}
                          title={`${item.label} Sales: ₹${item.sales}`}
                        >
                          {item.sales > 0 && (
                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-primary opacity-0 group-hover/bar:opacity-100 transition">
                              ₹{item.sales >= 1000 ? `${(item.sales / 1000).toFixed(1)}k` : item.sales}
                            </span>
                          )}
                        </div>

                        {/* Purchases Bar (Purple) */}
                        <div 
                          className="w-1/2 bg-gradient-to-t from-purple-600 to-purple-400 hover:from-purple-500 hover:to-purple-300 rounded-t-sm transition-all duration-300 relative group/bar"
                          style={{ height: `${purHeightPct}%` }}
                          title={`${item.label} Purchases: ₹${item.purchases}`}
                        >
                          {item.purchases > 0 && (
                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-purple-400 opacity-0 group-hover/bar:opacity-100 transition">
                              ₹{item.purchases >= 1000 ? `${(item.purchases / 1000).toFixed(1)}k` : item.purchases}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Day Label */}
                      <span className="text-[9px] font-mono font-bold text-textMuted mt-1.5 truncate max-w-full">
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Payment Overview Progress card (1/3 width) */}
        <div className="bento-card p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Payment Overview</h3>
            <p className="text-[10px] text-textMuted mt-0.5">Dues and pending bills breakdown</p>
          </div>

          <div className="space-y-4 my-auto">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-textSecondary font-semibold">Receivables</span>
                <span className="font-mono font-bold text-foreground">₹{stats.customerPending.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-textSecondary font-semibold">Payables</span>
                <span className="font-mono font-bold text-foreground">₹{stats.vendorPending.toLocaleString()}</span>
              </div>
            </div>

            {/* Visual ratio bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden flex border border-border/40">
              <div className="bg-primary h-full" style={{ width: `${paymentRatio}%` }} title="Receivables"></div>
              <div className="bg-purple-500 h-full flex-grow" title="Payables"></div>
            </div>
            
            <div className="flex justify-between text-[10px] text-textMuted font-bold">
              <span>{paymentRatio.toFixed(0)}% Owed to you</span>
              <span>{(100 - paymentRatio).toFixed(0)}% Owed by you</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-border/80">
            <button onClick={() => onNavigate('customers')} className="py-2 px-2.5 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-foreground font-bold rounded-lg text-center text-xs transition duration-150 active:scale-95">
              Customers
            </button>
            <button onClick={() => onNavigate('suppliers')} className="py-2 px-2.5 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-foreground font-bold rounded-lg text-center text-xs transition duration-150 active:scale-95">
              Vendors
            </button>
          </div>
        </div>

      </div>

      {/* 6. Operational Section: Inventory Health & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Inventory Health & Low Stock Alerts */}
        <div className="bento-card p-5 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Inventory Health</h3>
            <p className="text-[10px] text-textMuted mt-0.5">Distribution and reorder alerts</p>
          </div>

          {/* Stats Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] text-textSecondary font-bold">
              <span>Total Catalog: {totalProductsCount} items</span>
              <span className="text-primary">{inStockCount} In Stock</span>
              <span className="text-amber-500">{lowStockCount} Low</span>
              <span className="text-rose-500">{outOfStockCount} Out</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 border border-border">
              <div className="bg-primary h-full" style={{ width: `${inStockPercent}%` }} title="In Stock"></div>
              <div className="bg-amber-500 h-full" style={{ width: `${lowStockPercent}%` }} title="Low Stock"></div>
              <div className="bg-rose-500 h-full" style={{ width: `${outOfStockPercent}%` }} title="Out of Stock"></div>
            </div>
          </div>

          {/* Table: Top 5 Low Stock Items */}
          <div className="space-y-3 pt-2">
            <div className="text-xs font-bold text-foreground uppercase tracking-wider">Critical Restock Checklist</div>
            <div className="overflow-x-auto bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200 border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
                    <th className="py-2.5 px-3 text-center">Product</th>
                    <th className="py-2.5 px-3 text-center">Stock</th>
                    <th className="py-2.5 px-3 text-center">Min. Warning</th>
                    <th className="py-2.5 px-3 text-center">Vendor</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {lowStockAlerts.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-slate-400">No products under warning. Stock looks healthy!</td></tr>
                  ) : lowStockAlerts.slice(0, 5).map(p => (
                    <tr key={p.id} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-900 dark:text-slate-100 uppercase truncate max-w-[120px]" title={p.product_name}>{p.product_name}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">{p.current_stock}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{p.min_stock_level}</td>
                      <td className="py-2.5 px-3 text-center truncate max-w-[100px] text-slate-700 dark:text-slate-300 uppercase font-medium">{p.vendorName}</td>
                      <td className="py-2.5 px-3 text-center">
                        <a href={`tel:${p.vendorPhone}`} className="px-2.5 py-1 bg-primary hover:bg-primary/90 text-white font-bold rounded text-[10px] uppercase transition shadow-md inline-flex items-center gap-1 cursor-pointer">
                          <i className="fa-solid fa-phone"></i> Call
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Quick Actions & Business Insights */}
        <div className="grid grid-cols-1 gap-6">
          
          {/* Quick Actions */}
          <div className="bento-card p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Quick Actions</h3>
              <p className="text-[10px] text-textMuted mt-0.5">Frequently used operational modules</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-4">
              <button onClick={() => onNavigate('sales')} className="py-2.5 px-4 bg-primary hover:bg-primary-hover text-white font-extrabold rounded-lg text-center text-xs transition uppercase flex items-center justify-center gap-2 shadow-sm active:scale-95">
                <i className="fa-solid fa-file-invoice-dollar text-xs"></i>
                <span>Open POS Desk</span>
              </button>
              <button onClick={() => onNavigate('purchases')} className="py-2.5 px-4 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-foreground font-bold rounded-lg text-center text-xs transition uppercase flex items-center justify-center gap-2 shadow-sm active:scale-95">
                <i className="fa-solid fa-cart-shopping text-xs"></i>
                <span>+ New Purchase</span>
              </button>
              <button onClick={() => onNavigate('products')} className="py-2.5 px-4 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-foreground font-bold rounded-lg text-center text-xs transition uppercase flex items-center justify-center gap-2 shadow-sm active:scale-95">
                <i className="fa-solid fa-circle-plus text-xs"></i>
                <span>+ Add Product</span>
              </button>
              <button onClick={() => onNavigate('expenses')} className="py-2.5 px-4 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-foreground font-bold rounded-lg text-center text-xs transition uppercase flex items-center justify-center gap-2 shadow-sm active:scale-95">
                <i className="fa-solid fa-hand-holding-dollar text-xs"></i>
                <span>+ Add Expense</span>
              </button>
            </div>
          </div>

          {/* Business Insights */}
          <div className="bento-card p-5 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Business Insights</h3>
              <p className="text-[10px] text-textMuted mt-0.5">Automated retail parameters check</p>
            </div>

            <div className="space-y-2.5">
              <div className="flex gap-2.5 p-2 rounded bg-background border border-border/40 text-xs">
                <i className="fa-solid fa-chart-line text-primary mt-0.5"></i>
                <p className="text-textSecondary leading-normal">
                  Total Sales generated: <strong className="text-foreground">₹{stats.sales.toLocaleString()}</strong> across {filteredData.sales.length} invoices.
                </p>
              </div>
              {lowStockCount > 0 && (
                <div className="flex gap-2.5 p-2 rounded bg-background border border-border/40 text-xs">
                  <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5"></i>
                  <p className="text-textSecondary leading-normal">
                    <strong className="text-foreground">{lowStockCount} products</strong> require immediate procurement restocking.
                  </p>
                </div>
              )}
              {stats.customerPending > 0 && (
                <div className="flex gap-2.5 p-2 rounded bg-background border border-border/40 text-xs">
                  <i className="fa-solid fa-users text-orange-500 mt-0.5"></i>
                  <p className="text-textSecondary leading-normal">
                    Customer pending dues currently total <strong className="text-foreground">₹{stats.customerPending.toLocaleString()}</strong>.
                  </p>
                </div>
              )}
              {stats.expenses > 0 && stats.sales > 0 && (
                <div className="flex gap-2.5 p-2 rounded bg-background border border-border/40 text-xs">
                  <i className="fa-solid fa-hand-holding-dollar text-rose-500 mt-0.5"></i>
                  <p className="text-textSecondary leading-normal">
                    Operating expenses represent <strong className="text-foreground">{((stats.expenses / stats.sales) * 100).toFixed(1)}%</strong> of sales revenue.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* 7. Bottom section: Recent Transactions & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Recent Transactions (2/3 width) */}
        <div className="lg:col-span-2 bento-card p-5 space-y-4 flex flex-col border border-border/80 shadow-sm bg-secondary/80 backdrop-blur-sm rounded-2xl">
          <div className="flex justify-between items-center pb-2 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shadow-xs">
                <i className="fa-solid fa-clock-rotate-left text-sm"></i>
              </div>
              <div>
                <h3 className="text-xs font-black text-foreground uppercase tracking-wider">Recent Transactions</h3>
                <p className="text-[10px] text-textMuted font-medium">Combined chronological log of sales and purchases</p>
              </div>
            </div>
            <button 
              onClick={() => onNavigate('new-entry')} 
              className="text-xs text-primary hover:text-primary-hover font-extrabold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 hover:bg-primary/15 border border-primary/20 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <span>View All Entries</span>
              <i className="fa-solid fa-arrow-right-long text-[10px]"></i>
            </button>
          </div>

          {/* Outer container: Clips all scrolling content at rounded borders */}
          <div className="border border-slate-200/90 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            {/* Inner scroll container: Handles smooth vertical scrolling */}
            <div className="max-h-[265px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200 border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase font-black text-[10px] tracking-wider whitespace-nowrap">
                    <th className="py-3 px-4 text-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Transaction</th>
                    <th className="py-3 px-4 text-left bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Party (Customer/Vendor)</th>
                    <th className="py-3 px-4 text-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Type</th>
                    <th className="py-3 px-4 text-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Date</th>
                    <th className="py-3 px-4 text-right bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Amount</th>
                    <th className="py-3 px-4 text-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {recentTransactions.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-semibold">No recent transactions recorded.</td></tr>
                  ) : recentTransactions.map((tx, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedTxDetail(tx)}
                      className="hover:bg-blue-50/70 dark:hover:bg-slate-800/60 transition-all duration-150 cursor-pointer group border-b border-slate-100 dark:border-slate-800/40"
                      title="Click to view full transaction breakdown"
                    >
                      <td className="py-3 px-4 text-center border-b border-slate-100 dark:border-slate-800/40">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-xs font-bold group-hover:bg-blue-100 dark:group-hover:bg-blue-950/80 group-hover:text-primary transition-colors border border-slate-200/60 dark:border-slate-700/60">
                          <i className="fa-solid fa-receipt text-[10px] text-slate-400 group-hover:text-primary"></i>
                          {tx.invoice_number}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-left border-b border-slate-100 dark:border-slate-800/40">
                        <div className="font-extrabold text-slate-900 dark:text-slate-100 uppercase text-xs truncate max-w-[170px]">{tx.party_name}</div>
                      </td>
                      <td className="py-3 px-4 text-center border-b border-slate-100 dark:border-slate-800/40">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs ${
                          tx.type === 'Sale' 
                            ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60' 
                            : 'bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60'
                        }`}>
                          <i className={`fa-solid ${tx.type === 'Sale' ? 'fa-arrow-up-right text-[8px]' : 'fa-arrow-down-left text-[8px]'}`}></i>
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-800/40">
                        {new Date(tx.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-slate-100 text-xs tracking-tight border-b border-slate-100 dark:border-slate-800/40">
                        ₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-center border-b border-slate-100 dark:border-slate-800/40">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-2xs ${
                          tx.status === 'Paid' 
                            ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60' 
                            : 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'Paid' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Top Selling Products (1/3 width) */}
        <div className="bento-card p-5 space-y-3 flex flex-col">
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Top Selling Products</h3>
            <p className="text-[10px] text-textMuted mt-0.5">Ranking of 100 catalog products by sales volume</p>
          </div>

          <div className="max-h-[255px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {topSellingProducts.length === 0 ? (
              <p className="text-center text-textMuted py-8">No products found in catalog.</p>
            ) : topSellingProducts.map((p, idx) => (
              <div key={idx} className="flex justify-between items-center p-2 bg-background border border-border/80 rounded-lg hover:border-primary/40 transition">
                <div className="truncate pr-2">
                  <div className="font-bold text-foreground truncate uppercase text-xs">{idx + 1}. {p.name}</div>
                  <div className="text-[9px] text-textMuted font-mono">HSN: {p.hsn}</div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`font-extrabold block text-xs ${p.qty > 0 ? 'text-primary' : 'text-textMuted'}`}>{p.qty} sold</span>
                  <span className="font-mono text-[9px] text-textMuted font-bold block mt-0.5">₹{p.total.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Clickable Transaction Invoice Detail Modal */}
      {selectedTxDetail && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh] flex flex-col gap-4">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                    selectedTxDetail.type === 'Sale' ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                  }`}>
                    {selectedTxDetail.type} Invoice
                  </span>
                  <span className="font-mono text-xs text-textMuted font-bold">{selectedTxDetail.invoice_number}</span>
                </div>
                <h3 className="text-lg font-black text-foreground uppercase mt-1">
                  {selectedTxDetail.party_name}
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  Transaction Date: <strong className="text-foreground">{new Date(selectedTxDetail.date).toLocaleString()}</strong>
                </p>
              </div>
              <button 
                onClick={() => setSelectedTxDetail(null)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background border border-border px-3 py-1.5 rounded-lg transition"
              >
                &times; Close
              </button>
            </div>

            {/* Transaction Metadata Grid */}
            <div className="grid grid-cols-3 gap-3 bg-background p-3.5 rounded-xl border border-border/60 text-xs">
              <div>
                <span className="text-[10px] font-bold text-textMuted uppercase block">Payment Method</span>
                <span className="font-bold text-foreground">{selectedTxDetail.payment_mode || 'Cash'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-textMuted uppercase block">Payment Status</span>
                <span className={`font-bold ${selectedTxDetail.status === 'Paid' ? 'text-primary' : 'text-rose-400'}`}>{selectedTxDetail.status}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-textMuted uppercase block">Grand Total</span>
                <span className="font-mono font-black text-primary text-sm">₹{Number(selectedTxDetail.amount || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-extrabold text-foreground uppercase mb-2">Itemized Breakdown</h4>
              <div className="overflow-x-auto bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200 border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
                      <th className="py-2.5 px-3 text-center">Sr.</th>
                      <th className="py-2.5 px-3 text-center">Item Name</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-center">Rate</th>
                      <th className="py-2.5 px-3 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(() => {
                      const displayItems = getTransactionLineItems(selectedTxDetail, products);
                      if (!displayItems || displayItems.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-slate-400">No line items breakdown recorded for this transaction.</td>
                          </tr>
                        );
                      }
                      return displayItems.map((item: any, idx: number) => {
                        const matchedProd = products.find(p => p.id === (item.product_id || item.product?.id));
                        const name = item.product_name || item.product?.product_name || matchedProd?.product_name || `Product Item #${idx + 1}`;
                        const qty = Number(item.qty || item.quantity || 1);
                        const rate = Number(item.rate || item.price || item.unit_price || 0);
                        const total = item.amount ? Number(item.amount) : (qty * rate);
                        return (
                          <tr key={idx} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                            <td className="py-2.5 px-3 text-center font-mono text-slate-900 dark:text-slate-100 font-bold">{idx + 1}</td>
                            <td className="py-2.5 px-3 text-center font-semibold text-slate-900 dark:text-slate-100 uppercase">{name}</td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 dark:text-slate-100">{qty}</td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-900 dark:text-slate-100">₹{rate.toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-primary">₹{total.toFixed(2)}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Summary */}
            <div className="flex justify-between items-center border-t border-border pt-3 mt-1 text-xs">
              <span className="text-textMuted font-medium">Ref ID: {selectedTxDetail.id || 'N/A'}</span>
              <div className="text-right">
                <span className="text-textMuted font-bold">Bill Total: </span>
                <span className="font-mono font-black text-base text-foreground">₹{Number(selectedTxDetail.amount || 0).toFixed(2)}</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
