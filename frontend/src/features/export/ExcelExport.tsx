import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import * as XLSX from 'xlsx';

export default function ExcelExport() {
  const { tenant } = useAuth();
  const currentTenantId = tenant?.id || 'default-hardware-erp';

  // State for record counts and raw arrays
  const [dataState, setDataState] = useState({
    products: [] as any[],
    sales: [] as any[],
    purchases: [] as any[],
    customers: [] as any[],
    suppliers: [] as any[],
    expenses: [] as any[],
    customerPayments: [] as any[],
    supplierPayments: [] as any[],
    settings: {} as any
  });

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Load all local storage tables on mount
  useEffect(() => {
    const prodStr = localStorage.getItem('lk_products') || '[]';
    const salesStr = localStorage.getItem('lk_sales') || '[]';
    const purchasesStr = localStorage.getItem('lk_purchases') || '[]';
    const custStr = localStorage.getItem('lk_customers') || '[]';
    const supStr = localStorage.getItem('lk_suppliers') || '[]';
    const expStr = localStorage.getItem('lk_expenses') || '[]';
    const custPaysStr = localStorage.getItem('lk_customer_payments') || '[]';
    const supPaysStr = localStorage.getItem('lk_supplier_payments') || '[]';
    const settingsStr = localStorage.getItem('lk_settings') || '{}';

    try {
      const allProducts = JSON.parse(prodStr);
      const allSales = JSON.parse(salesStr);
      const allPurchases = JSON.parse(purchasesStr);
      const allCustomers = JSON.parse(custStr);
      const allSuppliers = JSON.parse(supStr);
      const allExpenses = JSON.parse(expStr);
      const allCustPayments = JSON.parse(custPaysStr);
      const allSupPayments = JSON.parse(supPaysStr);
      const settings = JSON.parse(settingsStr);

      // Filter by tenant if applicable, or fallback to all items
      const products = allProducts.filter((p: any) => !p.tenant_id || p.tenant_id === currentTenantId);

      setDataState({
        products,
        sales: allSales,
        purchases: allPurchases,
        customers: allCustomers,
        suppliers: allSuppliers,
        expenses: allExpenses,
        customerPayments: allCustPayments,
        supplierPayments: allSupPayments,
        settings
      });
    } catch (e) {
      console.error('Error loading localStorage data for export', e);
    }
  }, [currentTenantId]);

  // Helper to format data for sheets
  const getProductsSheetData = () => {
    return dataState.products.map(p => ({
      'Product ID': p.id || '',
      'Product Name': p.product_name || '',
      'SKU': p.sku || '',
      'Barcode': p.barcode || '',
      'HSN Code': p.hsn || '',
      'Category': p.category_name || '',
      'Brand': p.brand || '',
      'Purchase Price (₹)': Number(p.purchase_price || 0),
      'Selling Price (₹)': Number(p.selling_price || 0),
      'Current Stock': Number(p.current_stock || 0),
      'Stock Value (₹)': Number(p.purchase_price || 0) * Number(p.current_stock || 0),
      'Warehouse Location': p.warehouse_location || 'Shop shelf'
    }));
  };

  const getSalesSheetData = () => {
    return dataState.sales.map(s => ({
      'Invoice Number': s.invoice_number || '',
      'Sale Date': s.sale_date ? new Date(s.sale_date).toLocaleDateString() : '',
      'Customer Name': s.customer_name || 'Counter Customer',
      'Customer Phone': s.customer_phone || '',
      'Payment Mode': s.payment_mode || 'Cash',
      'Subtotal (₹)': Number(s.subtotal || 0),
      'Discount (₹)': Number(s.discount || 0),
      'GST Tax (₹)': Number(s.tax_amount || 0),
      'Freight (₹)': Number(s.freight || 0),
      'Grand Total (₹)': Number(s.total_amount || 0),
      'Paid Amount (₹)': Number(s.paid_amount || 0),
      'Owed Due (₹)': Number(s.due_amount || 0),
      'Items Sold Summary': (s.items || []).map((i: any) => `${i.product_name} (x${i.qty} @ ₹${i.rate})`).join('; ')
    }));
  };

  const getPurchasesSheetData = () => {
    return dataState.purchases.map(p => ({
      'Bill Number': p.bill_number || '',
      'Purchase Date': p.purchase_date ? new Date(p.purchase_date).toLocaleDateString() : '',
      'Supplier Name': p.supplier_name || '',
      'Payment Mode': p.payment_mode || 'Bank Transfer',
      'Subtotal (₹)': Number(p.subtotal || 0),
      'Discount (₹)': Number(p.discount || 0),
      'GST Tax (₹)': Number(p.tax_amount || 0),
      'Lorry Freight (₹)': Number(p.freight || 0),
      'Grand Total (₹)': Number(p.total_amount || 0),
      'Paid Amount (₹)': Number(p.paid_amount || 0),
      'Outstanding Owed (₹)': Number(p.due_amount || 0),
      'Items Purchased Summary': (p.items || []).map((i: any) => `${i.product_name} (x${i.qty} @ ₹${i.rate})`).join('; ')
    }));
  };

  const getCustomersSheetData = () => {
    return dataState.customers.map(c => ({
      'Customer ID': c.id || '',
      'Customer Name': c.customer_name || '',
      'Phone Number': c.phone || '',
      'Address': c.address || '',
      'Email': c.email || '',
      'Date of Birth': c.dob || '',
      'GSTIN': c.gstin || '',
      'Outstanding Balance Receivable (₹)': Number(c.outstanding || 0)
    }));
  };

  const getSuppliersSheetData = () => {
    return dataState.suppliers.map(s => ({
      'Supplier ID': s.id || '',
      'Supplier Name': s.supplier_name || '',
      'Phone Number': s.phone || '',
      'Address': s.address || '',
      'Email': s.email || '',
      'Contact Birthday': s.dob || '',
      'Establishment Date': s.establishment_date || '',
      'GSTIN': s.gstin || '',
      'Outstanding Balance Payable (₹)': Number(s.outstanding || 0)
    }));
  };

  const getExpensesSheetData = () => {
    return dataState.expenses.map(e => ({
      'Voucher ID': e.id || '',
      'Expense Date': e.expense_date ? new Date(e.expense_date).toLocaleDateString() : '',
      'Category': e.category || 'Others',
      'Description': e.description || '',
      'Outflow Amount (₹)': Number(e.amount || 0),
      'Payment Mode': e.payment_mode || 'Cash',
      'Voucher Ref': e.ref_number || ''
    }));
  };

  const getCustomerPaymentsSheetData = () => {
    return dataState.customerPayments.map(p => {
      const cust = dataState.customers.find((c: any) => c.id === p.customer_id);
      return {
        'Receipt Voucher ID': p.id || '',
        'Payment Date': p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '',
        'Customer Name': cust ? cust.customer_name : 'Unknown Customer',
        'Amount Collected (₹)': Number(p.amount || 0),
        'Payment Channel': p.payment_mode || 'Cash',
        'Transaction Ref': p.ref_number || ''
      };
    });
  };

  const getSupplierPaymentsSheetData = () => {
    return dataState.supplierPayments.map(p => {
      const sup = dataState.suppliers.find((s: any) => s.id === p.supplier_id);
      return {
        'Payout Voucher ID': p.id || '',
        'Payment Date': p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '',
        'Supplier Name': sup ? sup.supplier_name : 'Unknown Supplier',
        'Amount Settled (₹)': Number(p.amount || 0),
        'Payment Channel': p.payment_mode || 'Bank Transfer',
        'Transaction Ref': p.ref_number || ''
      };
    });
  };

  const getSummarySheetData = () => {
    const totalSalesVal = dataState.sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalPurchVal = dataState.purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const totalExpVal = dataState.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const stockVal = dataState.products.reduce((sum, p) => sum + (Number(p.purchase_price || 0) * Number(p.current_stock || 0)), 0);
    const custOwedVal = dataState.customers.reduce((sum, c) => sum + Number(c.outstanding || 0), 0);
    const supOwedVal = dataState.suppliers.reduce((sum, s) => sum + Number(s.outstanding || 0), 0);

    return [
      { 'ERP Financial Metric': 'Business Module Type', 'Value / Stat': dataState.settings.business_type || 'Hardware Shop' },
      { 'ERP Financial Metric': 'Registered Company Name', 'Value / Stat': dataState.settings.company_name || 'LK Hardware ERP' },
      { 'ERP Financial Metric': 'GSTIN ID', 'Value / Stat': dataState.settings.gstin || '27LKSERP401Z2B5' },
      { 'ERP Financial Metric': 'Store Physical Address', 'Value / Stat': dataState.settings.address || '' },
      { 'ERP Financial Metric': 'Total Catalog Products Count', 'Value / Stat': dataState.products.length },
      { 'ERP Financial Metric': 'Total Inventory Stock Asset Value (₹)', 'Value / Stat': stockVal },
      { 'ERP Financial Metric': 'Total Material Sales Value (₹)', 'Value / Stat': totalSalesVal },
      { 'ERP Financial Metric': 'Total Procurements Purchases Value (₹)', 'Value / Stat': totalPurchVal },
      { 'ERP Financial Metric': 'Total Ledger Expenses Outflows (₹)', 'Value / Stat': totalExpVal },
      { 'ERP Financial Metric': 'Customers Outstanding Receivables (₹)', 'Value / Stat': custOwedVal },
      { 'ERP Financial Metric': 'Suppliers Outstanding Payables (₹)', 'Value / Stat': supOwedVal },
      { 'ERP Financial Metric': 'Export Generation Timestamp', 'Value / Stat': new Date().toLocaleString() }
    ];
  };

  const handleExportAll = () => {
    setExporting(true);
    setExportProgress(10);

    setTimeout(() => {
      try {
        setExportProgress(40);
        const wb = XLSX.utils.book_new();

        // 1. Summary
        const wsSummary = XLSX.utils.json_to_sheet(getSummarySheetData());
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

        // 2. Products
        const wsProd = XLSX.utils.json_to_sheet(getProductsSheetData());
        XLSX.utils.book_append_sheet(wb, wsProd, 'Inventory Catalog');

        // 3. Sales
        const wsSales = XLSX.utils.json_to_sheet(getSalesSheetData());
        XLSX.utils.book_append_sheet(wb, wsSales, 'Sales Invoices');

        // 4. Purchases
        const wsPurch = XLSX.utils.json_to_sheet(getPurchasesSheetData());
        XLSX.utils.book_append_sheet(wb, wsPurch, 'Purchase Bills');

        // 5. Customers
        const wsCust = XLSX.utils.json_to_sheet(getCustomersSheetData());
        XLSX.utils.book_append_sheet(wb, wsCust, 'Customer Directory');

        // 6. Suppliers
        const wsSup = XLSX.utils.json_to_sheet(getSuppliersSheetData());
        XLSX.utils.book_append_sheet(wb, wsSup, 'Vendor Directory');

        // 7. Expenses
        const wsExp = XLSX.utils.json_to_sheet(getExpensesSheetData());
        XLSX.utils.book_append_sheet(wb, wsExp, 'Operating Expenses');

        // 8. Collections
        const wsColl = XLSX.utils.json_to_sheet(getCustomerPaymentsSheetData());
        XLSX.utils.book_append_sheet(wb, wsColl, 'Customer Receipts');

        // 9. Payouts
        const wsPayout = XLSX.utils.json_to_sheet(getSupplierPaymentsSheetData());
        XLSX.utils.book_append_sheet(wb, wsPayout, 'Vendor Payouts');

        setExportProgress(80);

        const companySnakeName = (dataState.settings.company_name || 'LK_Hardware_Store')
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '');
        const filename = `${companySnakeName}_full_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`;

        XLSX.writeFile(wb, filename);
        setExportProgress(100);

        setTimeout(() => {
          setExporting(false);
          setExportProgress(0);
        }, 300);
      } catch (err: any) {
        alert('Failed to package spreadsheets: ' + err.message);
        setExporting(false);
        setExportProgress(0);
      }
    }, 600);
  };

  const handleExportIndividual = (key: string, name: string) => {
    let rawData: any[] = [];
    switch (key) {
      case 'products':
        rawData = getProductsSheetData();
        break;
      case 'sales':
        rawData = getSalesSheetData();
        break;
      case 'purchases':
        rawData = getPurchasesSheetData();
        break;
      case 'customers':
        rawData = getCustomersSheetData();
        break;
      case 'suppliers':
        rawData = getSuppliersSheetData();
        break;
      case 'expenses':
        rawData = getExpensesSheetData();
        break;
      case 'payments':
        rawData = [...getCustomerPaymentsSheetData(), ...getSupplierPaymentsSheetData()];
        break;
      default:
        return;
    }

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rawData);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30));
      XLSX.writeFile(wb, `${name.toLowerCase().replace(/\s+/g, '_')}_export.xlsx`);
    } catch (e: any) {
      alert(`Export failed for ${name}: ${e.message}`);
    }
  };

  const categories = [
    {
      key: 'products',
      name: 'Inventory Products',
      desc: 'Catalog list containing SKU, HSN codes, buying/selling rates, and current physical stock numbers.',
      icon: 'fa-boxes-stacked',
      count: dataState.products.length,
      bg: 'bg-indigo-950/20 text-indigo-400 border-indigo-900/30'
    },
    {
      key: 'sales',
      name: 'Sales Invoices',
      desc: 'Ledger of all sales receipts, checkout modes, client tags, and pending invoice dues.',
      icon: 'fa-file-invoice-dollar',
      count: dataState.sales.length,
      bg: 'bg-blue-955 text-blue-400 border-blue-900/30'
    },
    {
      key: 'purchases',
      name: 'Purchase Bills',
      desc: 'Records of supplier procurement vouchers, bill net values, and credit balances.',
      icon: 'fa-cart-shopping',
      count: dataState.purchases.length,
      bg: 'bg-indigo-955 text-indigo-400 border-indigo-900/30'
    },
    {
      key: 'customers',
      name: 'Customer Directory',
      desc: 'Store customer catalog profiles, contact details, email addresses, and active debit outstanding.',
      icon: 'fa-users',
      count: dataState.customers.length,
      bg: 'bg-violet-955 text-violet-400 border-violet-900/30'
    },
    {
      key: 'suppliers',
      name: 'Supplier Directory',
      desc: 'Vendor profiles, physical addresses, tax identifiers, and credit balance ledgers.',
      icon: 'fa-truck-ramp-box',
      count: dataState.suppliers.length,
      bg: 'bg-amber-955 text-amber-400 border-amber-900/30'
    },
    {
      key: 'expenses',
      name: 'Operating Expenses',
      desc: 'Aggregated store cash-outflow vouchers covering salaries, main warehouse rent, and fuel logs.',
      icon: 'fa-hand-holding-dollar',
      count: dataState.expenses.length,
      bg: 'bg-rose-955 text-rose-400 border-rose-900/30'
    },
    {
      key: 'payments',
      name: 'Payments Registry',
      desc: 'Collection receipts from client entries combined with vendor settlement vouchers.',
      icon: 'fa-receipt',
      count: dataState.customerPayments.length + dataState.supplierPayments.length,
      bg: 'bg-sky-955 text-sky-400 border-sky-900/30'
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6 bg-secondary border border-border p-4 sm:p-6 rounded-xl shadow-md">
        <div>
          <h2 className="text-xl font-bold text-foreground">Spreadsheet Data Export Hub</h2>
          <p className="text-xs text-textMuted mt-1">
            Export structured business datasets from local store ledger tables into high-compatibility Microsoft Excel workbooks
          </p>
        </div>
        <div className="text-[10px] font-bold text-primary border border-primary/40 bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
          Format: .xlsx (Excel)
        </div>
      </div>

      {/* Unified Workbook Export Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-2xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 hover:shadow-2xl hover:scale-[1.005] transition-all duration-300">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none"></div>
        <div className="space-y-2 flex-1 z-10">
          <div className="flex items-center space-x-3 text-white">
            <div className="p-2.5 bg-white/20 rounded-xl">
              <i className="fa-solid fa-file-excel text-3xl text-blue-100"></i>
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-black tracking-tight text-white uppercase">Export Unified Business Workbook</h3>
              <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest mt-0.5">Recommended Action</p>
            </div>
          </div>
          <p className="text-blue-50 text-xs max-w-2xl leading-relaxed font-semibold">
            Generates a multi-sheet spreadsheet containing separate tabs for the Executive Summary, Products Catalog, Sales Invoices, Purchase Bills, Customer Directory, Supplier Registry, Expenses Ledger, and Payment vouchers.
          </p>
        </div>
        <div className="shrink-0 z-10 w-full md:w-auto">
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="w-full md:w-auto bg-slate-950 hover:bg-slate-900 text-white font-black px-8 py-4 rounded-xl flex items-center justify-center space-x-3 shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-all duration-150 border border-primary/40 cursor-pointer"
          >
            {exporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs uppercase tracking-wider">Packaging Data ({exportProgress}%)</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-cloud-arrow-down text-sm"></i>
                <span className="text-xs uppercase tracking-wider">Download Full Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grid of Individual Sections */}
      <div className="space-y-3">
        <div className="border-b border-border/40 pb-2">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Export Individual Ledger Tables</h3>
          <p className="text-[10px] text-textMuted mt-0.5">Download standalone spreadsheet logs for specific ERP modules</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map(cat => (
            <div
              key={cat.key}
              className="bg-secondary border border-border hover:border-slate-350 dark:hover:border-slate-700 shadow-md hover:shadow-lg p-5 rounded-xl flex flex-col justify-between space-y-4 hover:scale-[1.01] transition-all duration-200"
            >
              <div className="flex items-start space-x-3.5">
                <div className={`p-3 rounded-lg ${cat.bg} border shrink-0`}>
                  <i className={`fa-solid ${cat.icon} text-lg`}></i>
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider truncate">{cat.name}</h4>
                    <span className="text-[9px] px-2 py-0.5 bg-background border border-border text-textMuted rounded-full font-mono font-bold">
                      {cat.count} {cat.count === 1 ? 'row' : 'rows'}
                    </span>
                  </div>
                  <p className="text-[10px] text-textSecondary leading-relaxed">{cat.desc}</p>
                </div>
              </div>

              <button
                onClick={() => handleExportIndividual(cat.key, cat.name)}
                className="group w-full flex items-center justify-center space-x-2 py-2.5 bg-secondary hover:bg-primary border border-border hover:border-primary text-foreground hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-all duration-200 cursor-pointer active:scale-95"
              >
                <i className="fa-solid fa-download text-xs text-amber-500 group-hover:text-amber-200 transition-colors"></i>
                <span>Download Sheet</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
