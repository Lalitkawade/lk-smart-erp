import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useInventory } from '../../hooks/useInventory';
import { useBilling } from '../../hooks/useBilling';
import { useDemandTracker } from '../../hooks/useDemandTracker';
import { supabase } from '../../api/supabase';
import type { Product } from '../../types/erp.types';
import { t, Language } from '../../utils/i18n';

interface SalesProps {
  tenantId: string;
  tenantName: string;
  autoCustomerName?: string | null;
  onAutoCustomerConsumed?: () => void;
  autoOpenModal?: boolean;
  onModalClosed?: () => void;
}

export default function Sales({ tenantId, tenantName, autoCustomerName, onAutoCustomerConsumed, autoOpenModal, onModalClosed }: SalesProps) {
  const { products, isLoading: prodLoading } = useInventory(tenantId);
  const { logDemand } = useDemandTracker(tenantId);
  const activeLang: Language = (localStorage.getItem('lk_lang') as Language) || 'en';
  const {
    cart,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    paymentMode,
    setPaymentMode,
    transactionId,
    setTransactionId,
    addToCart,
    updateCartQty,
    removeFromCart,
    processCheckout,
    sales
  } = useBilling(tenantId);

  // Billing & Print Modals
  const [billingModal, setBillingModal] = useState(false);

  useEffect(() => {
    if (autoOpenModal) {
      setBillingModal(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenModal]);
  const [printInvoice, setPrintInvoice] = useState<any | null>(null);
  const [posSearch, setPosSearch] = useState('');
  const [registeredCustomers, setRegisteredCustomers] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const fetchRegisteredCustomers = async () => {
    if (!tenantId) return;
    try {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('customer_name', { ascending: true });

      if (data) {
        setRegisteredCustomers(data);
        localStorage.setItem('lk_customers', JSON.stringify(data));
      } else {
        const cached = localStorage.getItem('lk_customers');
        if (cached) setRegisteredCustomers(JSON.parse(cached));
      }
    } catch (e) {
      const cached = localStorage.getItem('lk_customers');
      if (cached) try { setRegisteredCustomers(JSON.parse(cached)); } catch(err) {}
    }
  };

  useEffect(() => {
    fetchRegisteredCustomers();
    window.addEventListener('storage', fetchRegisteredCustomers);
    return () => window.removeEventListener('storage', fetchRegisteredCustomers);
  }, [tenantId]);

  useEffect(() => {
    if (autoCustomerName) {
      setCustomerName(autoCustomerName);
      const found = registeredCustomers.find(c => c.customer_name?.toUpperCase() === autoCustomerName.toUpperCase());
      if (found && found.phone) {
        setCustomerPhone(found.phone);
      }
      setBillingModal(true);
      if (onAutoCustomerConsumed) onAutoCustomerConsumed();
    }
  }, [autoCustomerName, registeredCustomers]);

  const [amountCollectedInput, setAmountCollectedInput] = useState<string>('');
  const [manualDiscountInput, setManualDiscountInput] = useState<string>('');
  const [repayUdharInput, setRepayUdharInput] = useState<string>('');

  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, curr) => acc + curr.qty * curr.rate, 0);
  }, [cart]);

  const manualDiscount = useMemo(() => {
    const parsed = parseFloat(manualDiscountInput);
    if (isNaN(parsed) || parsed < 0) return 0;
    return Math.min(cartSubtotal, parsed);
  }, [manualDiscountInput, cartSubtotal]);

  const totalAmount = useMemo(() => {
    return Math.max(0, cartSubtotal - manualDiscount);
  }, [cartSubtotal, manualDiscount]);
  const [custSearchQuery, setCustSearchQuery] = useState<string>('');
  const [custDropdownOpen, setCustDropdownOpen] = useState<boolean>(false);
  const [quickCustModalOpen, setQuickCustModalOpen] = useState(false);
  const [quickCustFormData, setQuickCustFormData] = useState({
    customer_name: '',
    phone: '',
    email: '',
    address: '',
    dob: '',
    credit_limit: 50000
  });

  // Combined list of registered customers + non-registered customers from past sales invoices
  const allSearchableCustomers = useMemo(() => {
    const list: Array<{ id?: string; customer_name: string; phone?: string; outstanding: number; isRegistered: boolean; invCount: number }> = [];
    const seenNames = new Set<string>();

    // 1. Registered Customers
    registeredCustomers.forEach(c => {
      const nameUpper = (c.customer_name || '').toUpperCase();
      if (!nameUpper) return;
      seenNames.add(nameUpper);

      const invs = (sales as any[]).filter(s => s.customer_name && s.customer_name.toUpperCase() === nameUpper);

      list.push({
        id: c.id,
        customer_name: c.customer_name,
        phone: c.phone || '',
        outstanding: Number(c.outstanding || 0),
        isRegistered: true,
        invCount: invs.length
      });
    });

    // 2. Add non-registered past invoice customers
    (sales as any[]).forEach(s => {
      const nameUpper = (s.customer_name || '').toUpperCase();
      if (!nameUpper || nameUpper === 'CASH CUSTOMER' || seenNames.has(nameUpper)) return;

      seenNames.add(nameUpper);
      const invs = (sales as any[]).filter(inv => inv.customer_name && inv.customer_name.toUpperCase() === nameUpper);

      list.push({
        customer_name: s.customer_name,
        phone: s.customer_phone || '',
        outstanding: 0,
        isRegistered: false,
        invCount: invs.length
      });
    });

    return list;
  }, [registeredCustomers, sales]);

  const matchedCustomer = useMemo(() => {
    if (!customerName || customerName.trim().toUpperCase() === 'CASH CUSTOMER') return null;
    const nameUpper = customerName.trim().toUpperCase();
    const phoneVal = customerPhone.trim();

    // 1. Search registered customers first
    const foundReg = registeredCustomers.find(
      c => (c.customer_name && c.customer_name.trim().toUpperCase() === nameUpper) ||
           (phoneVal && c.phone && c.phone.trim() === phoneVal)
    );
    if (foundReg) return foundReg;

    // 2. Search all searchable customers (which includes past sales invoice customers!)
    const foundSearchable = allSearchableCustomers.find(
      c => (c.customer_name && c.customer_name.trim().toUpperCase() === nameUpper) ||
           (phoneVal && c.phone && c.phone.trim() === phoneVal)
    );

    if (foundSearchable) {
      return {
        id: foundSearchable.id || ('CUST-' + nameUpper.slice(0, 8)),
        customer_name: foundSearchable.customer_name,
        phone: foundSearchable.phone || '',
        email: '',
        address: '',
        credit_limit: 50000,
        outstanding: Number(foundSearchable.outstanding || 0)
      };
    }

    return null;
  }, [registeredCustomers, allSearchableCustomers, sales, customerName, customerPhone]);

  const filteredSearchableCustomers = useMemo(() => {
    const q = custSearchQuery.trim().toLowerCase();
    if (!q) return allSearchableCustomers;
    return allSearchableCustomers.filter(
      c => c.customer_name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [allSearchableCustomers, custSearchQuery]);

  // Auto pre-fill phone number when an existing customer is matched/selected
  useEffect(() => {
    if (matchedCustomer && matchedCustomer.phone && !customerPhone) {
      setCustomerPhone(matchedCustomer.phone);
    }
  }, [matchedCustomer]);

  const matchedCustomerInvoices = useMemo(() => {
    if (!matchedCustomer) return [];
    return (sales as any[]).filter(s =>
      s.customer_name &&
      s.customer_name.toUpperCase() === matchedCustomer.customer_name.toUpperCase()
    );
  }, [sales, matchedCustomer]);

  const lastCreditDate = useMemo(() => {
    if (!matchedCustomerInvoices || matchedCustomerInvoices.length === 0) return null;
    const unpaidInv = matchedCustomerInvoices.find(s => s.payment_status === 'Unpaid' || s.payment_status === 'Partial');
    const latest = unpaidInv || matchedCustomerInvoices[0];
    return latest?.sale_date || latest?.created_at || null;
  }, [matchedCustomerInvoices]);

  const previousOutstanding = Number(matchedCustomer?.outstanding || 0);

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustFormData.customer_name.trim()) return;

    const formattedName = quickCustFormData.customer_name.trim().toUpperCase();
    const newCustObj: any = {
      id: 'cust-' + Date.now(),
      customer_name: formattedName,
      phone: quickCustFormData.phone,
      email: quickCustFormData.email,
      address: quickCustFormData.address,
      dob: quickCustFormData.dob || undefined,
      credit_limit: quickCustFormData.credit_limit,
      outstanding: 0,
      created_at: new Date().toISOString()
    };

    // 1. Save to local storage cache immediately
    try {
      const currentLocal = JSON.parse(localStorage.getItem('lk_customers') || '[]');
      localStorage.setItem('lk_customers', JSON.stringify([newCustObj, ...currentLocal]));
    } catch (err) {}

    // 2. Persist to Supabase with schema fallback for dob
    try {
      const payload: any = {
        tenant_id: tenantId,
        customer_name: formattedName,
        phone: quickCustFormData.phone,
        email: quickCustFormData.email,
        address: quickCustFormData.address,
        dob: quickCustFormData.dob || null,
        credit_limit: quickCustFormData.credit_limit,
        outstanding: 0
      };

      let res = await supabase.from('customers').insert(payload).select().maybeSingle();
      if (res.error && res.error.message?.includes('dob')) {
        delete payload.dob;
        res = await supabase.from('customers').insert(payload).select().maybeSingle();
      }

      if (res.data?.id) {
        newCustObj.id = res.data.id;
      }
    } catch (err: any) {
      console.warn('Remote quick customer creation sync warning:', err);
    }

    await fetchRegisteredCustomers();
    window.dispatchEvent(new Event('storage'));

    setCustomerName(newCustObj.customer_name);
    if (newCustObj.phone) setCustomerPhone(newCustObj.phone);
    setCustSearchQuery(newCustObj.customer_name);
    setCustDropdownOpen(false);

    setQuickCustModalOpen(false);
    setQuickCustFormData({ customer_name: '', phone: '', email: '', address: '', dob: '', credit_limit: 50000 });
    alert(`Customer "${newCustObj.customer_name}" successfully registered and selected!`);
  };

  // Auto-sync amountCollectedInput with totalAmount when cart contents change or modal opens
  useEffect(() => {
    if (!billingModal) {
      setAmountCollectedInput('');
      setManualDiscountInput('');
      return;
    }
    if (paymentMode === 'Credit') {
      setAmountCollectedInput('0');
    } else if (!amountCollectedInput || amountCollectedInput === '0' || amountCollectedInput === totalAmount.toString()) {
      setAmountCollectedInput(totalAmount.toString());
    }
  }, [totalAmount, billingModal, paymentMode]);

  // Filter products for POS
  const filteredPOSProducts = useMemo(() => {
    return products.filter(p => {
      const name = p?.product_name || '';
      const sku = p?.sku || '';
      const barcode = p?.barcode || '';
      return (
        name.toLowerCase().includes(posSearch.toLowerCase()) ||
        sku.toLowerCase().includes(posSearch.toLowerCase()) ||
        barcode.includes(posSearch)
      );
    });
  }, [products, posSearch]);

  // Barcode scanner keydown listener (Enter key triggers auto-cart add)
  const handlePOSSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = posSearch.trim();
      if (!query) return;

      const exactMatch = products.find(
        p => p.barcode === query || (p.sku && p.sku.toUpperCase() === query.toUpperCase())
      );

      if (exactMatch) {
        handleCartAdd(exactMatch);
        setPosSearch(''); // clear search input for the next item scan!
      } else {
        alert(`No product matches barcode or SKU code: "${query}"`);
      }
    }
  };

  const handleCartAdd = (p: Product, isLoose: boolean = false) => {
    try {
      addToCart(p, isLoose);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleQtyChange = (productId: string, qty: number, isLoose: boolean = false) => {
    try {
      updateCartQty(productId, qty, isLoose);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    const collectedNum = amountCollectedInput.trim() !== ''
      ? parseFloat(amountCollectedInput) || 0
      : undefined;

    const repayNum = repayUdharInput.trim() !== ''
      ? parseFloat(repayUdharInput) || 0
      : 0;

    try {
      const bill = await processCheckout({
        amountCollected: collectedNum,
        repayUdharAmount: repayNum,
        paymentMode,
        transactionId: transactionId.trim(),
        discountAmount: manualDiscount
      });
      alert('Invoice successfully billed, inventory stock decremented.');
      setBillingModal(false);
      setRepayUdharInput('');
      setAmountCollectedInput('');
      setManualDiscountInput('');
      // Auto open print modal for the newly generated bill!
      setPrintInvoice(bill);
    } catch (err: any) {
      alert('Checkout failed: ' + err.message);
    }
  };

  const saleLines = useMemo(() => {
    const lines: any[] = [];
    (sales as any[]).forEach((s: any) => {
      const items = s.items || s.sales_items || [];
      if (items.length === 0) {
        lines.push({
          id: s.id || s.invoice_number,
          hsn: s.hsn || '-',
          product_name: s.product_name || 'Sale Invoice',
          customer_name: s.customer_name || 'Cash Customer',
          date: s.sale_date || s.created_at || new Date().toISOString(),
          stock: 0,
          price: Number(s.total_amount || 0),
          qty: 1,
          amount: Number(s.total_amount || 0),
          rawSaleObj: s
        });
      } else {
        items.forEach((item: any) => {
          const matchProd = products.find(p => p.id === (item.product_id || item.product?.id));
          lines.push({
            id: `${s.id}-${item.product_id || Math.random()}`,
            hsn: item.product?.hsn || matchProd?.hsn || item.hsn || '-',
            product_name: item.product?.product_name || matchProd?.product_name || item.product_name || 'Item',
            customer_name: s.customer_name || 'Cash Customer',
            date: s.sale_date || s.created_at || new Date().toISOString(),
            stock: matchProd ? matchProd.current_stock : 0,
            price: Number(item.rate || 0),
            qty: Number(item.qty || 1),
            amount: Number(item.amount || (item.qty * item.rate) || 0),
            rawSaleObj: s
          });
        });
      }
    });
    return lines.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, products]);

  const [searchQuery, setSearchQuery] = useState('');
  const filteredSaleLines = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return saleLines.filter(line => 
      line.product_name.toLowerCase().includes(q) || 
      line.hsn.includes(q) ||
      (line.customer_name && line.customer_name.toLowerCase().includes(q))
    );
  }, [saleLines, searchQuery]);

  return (
    <div className="bg-secondary border border-border rounded-xl p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Sales</h2>
          <p className="text-xs text-textMuted mt-1">Audit customer material sales and POS receipts</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={() => setBillingModal(true)}>
          New Invoice Billing
        </button>
      </div>

      <div className="mb-4">
        <input type="text" className="w-full bg-background border border-border text-foreground rounded-lg p-3 text-sm focus:outline-none focus:border-primary font-semibold"
          placeholder="Search sales by product name, HSN, or Customer Name..."
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
              <th className="py-2.5 px-3 text-center whitespace-nowrap">HSN Code</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Product Name</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Customer Billed To</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Date & Time</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Qty (Units)</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Unit Price (₹)</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Total Amount (₹)</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredSaleLines.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-medium">
                  <i className="fa-solid fa-file-invoice-dollar text-2xl text-slate-400 mb-2 block"></i>
                  No sales invoices recorded yet matching "{searchQuery}". Click 'New Invoice Billing' to check out.
                </td>
              </tr>
            ) : filteredSaleLines.map((line, idx) => (
              <tr key={idx} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                <td className="py-2.5 px-3 text-center font-mono text-xs">
                  <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-bold">
                    {line.hsn}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center text-xs font-bold text-slate-900 dark:text-slate-100 uppercase">{line.product_name}</td>
                <td className="py-2.5 px-3 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                  {line.customer_name}
                </td>
                <td className="py-2.5 px-3 text-center text-xs">
                  <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold">{new Date(line.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  <span className="text-[10px] font-mono text-slate-400 ml-1.5">
                    {new Date(line.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100">{line.qty}</td>
                <td className="py-2.5 px-3 text-center text-xs font-mono text-slate-900 dark:text-slate-100">₹{line.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="py-2.5 px-3 text-center text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{line.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <button className="text-xs bg-primary/10 hover:bg-primary hover:text-white border border-primary/20 text-primary px-2.5 py-1 rounded-lg font-bold transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1"
                    onClick={() => setPrintInvoice(line.rawSaleObj)}>
                    <i className="fa-solid fa-print text-[10px]"></i> Print
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* POS Billing Modal */}
      {billingModal && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-7xl shadow-2xl my-auto max-h-[90vh] flex flex-col gap-4 overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-border shrink-0">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">POS Billing & Cash Desk</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">New Customer Sale Billing</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setBillingModal(false)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition"
              >
                &times; Close Desk
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-thin">
              
              {/* Products Selector List (Reduced to 5/12 width) */}
              <div className="w-full md:w-5/12 pr-2 border-r border-border/60">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-md font-bold text-foreground">Select Products</h3>
                  <span className="text-[10px] text-textMuted font-bold">Items: {filteredPOSProducts.length}</span>
                </div>
                
                {/* Search bar / Barcode scanner input */}
                <input type="text" className="w-full bg-background border border-border text-foreground rounded-lg p-2.5 text-xs focus:outline-none focus:border-primary mb-4 font-semibold"
                  placeholder="🔍 Search items by name, SKU, or scan barcode..."
                  value={posSearch} onChange={(e) => setPosSearch(e.target.value)} onKeyDown={handlePOSSearchKeyDown} />

                {prodLoading ? (
                  <div className="text-sm text-textMuted font-semibold">Loading catalog items...</div>
                ) : filteredPOSProducts.length === 0 ? (
                  <div className="text-xs text-textMuted text-center py-8 bg-background/20 rounded-xl border border-dashed border-border/70 space-y-3">
                    <i className="fa-solid fa-box-open text-2xl text-textMuted/40"></i>
                    <p className="font-semibold text-textMuted">No matching products found in catalog.</p>
                    {posSearch.trim() && (
                      <button 
                        type="button" 
                        onClick={async () => {
                          await logDemand(posSearch.trim());
                          alert(`Logged customer request for "${posSearch.trim()}". High demand alerts (5+ requests) will trigger in notification bell!`);
                        }}
                        className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold text-xs rounded-xl transition flex items-center gap-1.5 mx-auto"
                      >
                        <i className="fa-solid fa-clipboard-list text-xs"></i> 📝 Note Demand for "{posSearch.trim()}"
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
                    {filteredPOSProducts.map(p => {
                      const piecesPerPack = Number((p as any).pieces_per_pack || 1);
                      const hasLoose = piecesPerPack > 1;
                      const stockVal = Number(p.current_stock || 0);
                      const unitLabel = p.s_unit || p.unit || 'Pcs';
                      return (
                        <div key={p.id} className="p-3 bg-background/40 border border-border rounded-lg flex justify-between items-center transition gap-2 hover:border-primary/40">
                          <div>
                            <div className="text-xs font-bold text-foreground uppercase truncate max-w-[180px]" title={p.product_name}>{p.product_name}</div>
                            <div className="flex gap-2 items-center text-[10px] text-textMuted font-semibold mt-0.5">
                              <span>Stock: <span className="font-bold text-foreground">{stockVal.toFixed(2).replace(/\.00$/, '')}</span> {unitLabel}</span>
                            </div>
                            <div className="flex gap-2 text-xs font-extrabold mt-1">
                              <span className="text-primary">Pack: ₹{Number(p.selling_price).toFixed(2)}</span>
                              {hasLoose && (
                                <span className="text-blue-400 text-[10px]">Pce: ₹{Number((p as any).piece_selling_price || 0).toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button type="button" className="py-1 px-2.5 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-lg text-[10px] uppercase transition shadow-sm active:scale-95 cursor-pointer"
                              onClick={() => handleCartAdd(p, false)}>
                              + Pack
                            </button>
                            {hasLoose && (
                              <button type="button" className="py-1 px-2 bg-blue-500 hover:bg-blue-400 text-slate-950 font-extrabold rounded-lg text-[10px] uppercase transition shadow-sm active:scale-95"
                                onClick={() => handleCartAdd(p, true)}>
                                + Pce
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cart & Invoice Desk Panel (Expanded to 7/12 width) */}
              <div className="w-full md:w-7/12 flex flex-col justify-between pl-0 md:pl-2">
                <div>
                  <h3 className="text-md font-bold text-foreground mb-3 flex justify-between items-center">
                    <span>Invoice Cart & Customer Desk</span>
                    <span className="text-xs text-textMuted font-semibold">{cart.length} item(s) selected</span>
                  </h3>
                  
                  <div className="space-y-2 overflow-y-auto max-h-[42vh] pr-1 scrollbar-thin border-b border-border/60 pb-3 mb-4">
                    {cart.length === 0 ? (
                      <p className="text-xs text-textMuted text-center py-4 bg-background/20 rounded-lg border border-dashed border-border/50">No items selected yet. Click items on the left panel to add to cart.</p>
                    ) : cart.map((item) => {
                      const compoundKey = `${item.product.id}-${item.isLoose ? 'loose' : 'pack'}`;
                      const unitLabel = item.isLoose ? 'Piece' : (item.product.s_unit || item.product.unit || 'Pack');
                      return (
                        <div key={compoundKey} className="flex justify-between items-center bg-background/60 p-2.5 rounded-lg border border-border">
                          <div className="flex-grow pr-2">
                            <div className="text-xs font-bold text-foreground truncate max-w-[240px] uppercase">{item.product.product_name}</div>
                            <div className="flex gap-3 items-center text-[10px] text-textSecondary mt-0.5 font-semibold">
                              <span>₹{item.rate.toFixed(2)} / {unitLabel}</span>
                              <span className="font-mono text-[9px] text-textMuted">HSN: {item.product.hsn || '-'}</span>
                              <span className="text-primary font-bold">Total: ₹{(item.rate * item.qty).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold text-slate-900 dark:text-slate-100 uppercase">Qty:</span>
                            <input type="number" className="w-14 bg-background border border-border rounded text-center text-xs text-foreground p-1 font-mono font-bold focus:outline-none focus:border-primary"
                              value={item.qty} onChange={(e) => handleQtyChange(item.product.id, parseInt(e.target.value) || 1, !!item.isLoose)} title="Quantity" />
                            <button type="button" className="text-rose-500 hover:text-rose-400 text-sm font-bold px-1" onClick={() => removeFromCart(item.product.id, !!item.isLoose)} title="Remove item">&times;</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              {/* Checkout Form */}
              <form onSubmit={handleCheckoutSubmit} className="mt-6 pt-4 border-t border-border space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-textSecondary font-semibold">Select / Search Customer</label>
                    <div className="flex gap-2 items-center">
                      <button 
                        type="button"
                        onClick={() => {
                          const query = custSearchQuery.trim();
                          const isPhone = /^\d+$/.test(query);
                          setQuickCustFormData({
                            customer_name: isPhone ? '' : query.toUpperCase(),
                            phone: isPhone ? query : '',
                            email: '',
                            address: '',
                            dob: '',
                            credit_limit: 50000
                          });
                          setQuickCustModalOpen(true);
                        }}
                        className="text-[10px] text-primary font-bold bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded border border-primary/30 transition flex items-center gap-1 active:scale-95 cursor-pointer"
                      >
                        ➕ Register New Customer
                      </button>
                      {matchedCustomer && (
                        <button
                          type="button"
                          onClick={() => setShowHistoryModal(true)}
                          className="text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-500/30 transition flex items-center gap-1 active:scale-95"
                        >
                          📜 History ({matchedCustomerInvoices.length})
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold focus:border-primary focus:outline-none uppercase pr-8"
                      value={custSearchQuery || customerName} 
                      onFocus={() => setCustDropdownOpen(true)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustSearchQuery(val);
                        setCustomerName(val);
                        setCustDropdownOpen(true);
                      }} 
                      placeholder="🔍 Search existing customer by Name or Mobile Phone..."
                    />
                    {(customerName || custSearchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerName('');
                          setCustomerPhone('');
                          setCustSearchQuery('');
                          setCustDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textMuted hover:text-foreground text-xs font-bold"
                        title="Clear customer selection"
                      >
                        &times;
                      </button>
                    )}

                    {/* Floating Interactive Autocomplete Dropdown */}
                    {custDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-border/40 scrollbar-thin animate-fade-in">
                        <div 
                          onClick={() => {
                            setCustomerName('');
                            setCustomerPhone('');
                            setCustSearchQuery('');
                            setCustDropdownOpen(false);
                          }}
                          className="p-2.5 text-xs font-bold text-textMuted hover:bg-background/80 cursor-pointer flex justify-between items-center"
                        >
                          <span>🛒 Walk-in Cash Customer (Default)</span>
                          <span className="text-[10px] text-textMuted">No profile required</span>
                        </div>

                        {filteredSearchableCustomers.length === 0 ? (
                          <div className="p-3 text-center text-xs text-textMuted font-semibold">
                            No matching existing customers found for "{custSearchQuery}".
                          </div>
                        ) : (
                          filteredSearchableCustomers.map((c, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setCustomerName(c.customer_name);
                                setCustomerPhone(c.phone || '');
                                setCustSearchQuery(c.customer_name);
                                setCustDropdownOpen(false);
                              }}
                              className="p-2.5 hover:bg-primary/10 cursor-pointer flex justify-between items-center text-xs transition"
                            >
                              <div>
                                <div className="font-extrabold text-foreground uppercase flex items-center gap-1.5">
                                  {c.customer_name}
                                  {c.isRegistered ? (
                                    <span className="text-[9px] bg-primary/20 text-primary font-bold px-1.5 py-0.2 rounded border border-primary/30">✓ Registered</span>
                                  ) : (
                                    <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.2 rounded border border-blue-500/30">📜 Past Buyer</span>
                                  )}
                                </div>
                                <div className="text-[10.5px] text-textMuted font-mono mt-0.5">
                                  {c.phone ? `Phone: ${c.phone}` : 'No Phone'} • {c.invCount} Bills
                                </div>
                              </div>

                              <div className="text-right font-mono">
                                {c.outstanding > 0 ? (
                                  <span className="text-amber-400 font-extrabold text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                                    ₹{c.outstanding.toFixed(2)} Udhar
                                  </span>
                                ) : (
                                  <span className="text-primary font-bold text-[10px]">
                                    ✓ No Dues
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}

                        {/* Quick Register Action Button at bottom of Dropdown */}
                        {custSearchQuery.trim() && (
                          <div
                            onClick={() => {
                              const query = custSearchQuery.trim();
                              const isPhone = /^\d+$/.test(query);
                              setQuickCustFormData({
                                customer_name: isPhone ? '' : query.toUpperCase(),
                                phone: isPhone ? query : '',
                                email: '',
                                address: '',
                                dob: '',
                                credit_limit: 50000
                              });
                              setCustDropdownOpen(false);
                              setQuickCustModalOpen(true);
                            }}
                            className="p-2.5 bg-primary/10 hover:bg-primary/20 text-primary font-extrabold text-xs cursor-pointer flex items-center justify-between border-t border-primary/30 transition"
                          >
                            <span>➕ Register New Customer Profile for "{custSearchQuery.toUpperCase()}"</span>
                            <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded font-black">Register Now &rarr;</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-textSecondary mb-1 font-semibold">Customer Mobile Number</label>
                  <input type="tel" className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-semibold"
                    value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="e.g. 9876543210" />
                </div>

                {/* Outstanding Balance Display Card */}
                {matchedCustomer && (
                  <div className={`border-2 rounded-xl p-3.5 text-xs space-y-2.5 shadow-sm ${previousOutstanding > 0 ? 'bg-amber-500/15 border-amber-500/50 text-slate-900 dark:text-slate-100' : 'bg-primary/10 border-primary/30 text-slate-900 dark:text-slate-100'}`}>
                    <div className="flex justify-between items-center font-bold">
                      <span className="flex items-center gap-1.5 uppercase text-[11px] font-black tracking-wider text-amber-950 dark:text-amber-300">
                        {previousOutstanding > 0 ? '📌 Udhar Account Status:' : '✓ Customer Account Status:'}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${previousOutstanding > 0 ? 'bg-amber-500 text-slate-950 border border-amber-600' : 'bg-primary text-white border border-primary/40'}`}>
                        {previousOutstanding > 0 ? '⚠️ Pending Dues' : '✓ No Dues'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-amber-500/30 font-semibold">
                      <div>
                        <span className="text-slate-700 dark:text-slate-300 block text-[10px] font-bold">Previous Outstanding:</span>
                        <span className="font-mono text-base font-black text-rose-700 dark:text-rose-400">₹{previousOutstanding.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-700 dark:text-slate-300 block text-[10px] font-bold">Last Credit Date:</span>
                        <span className="font-mono text-xs font-black text-slate-900 dark:text-slate-100">
                          {lastCreditDate ? new Date(lastCreditDate).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Explicit Previous Udhar Repayment Field */}
                    {previousOutstanding > 0 && (
                      <div className="mt-2 pt-2 border-t border-amber-500/30 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <label className="font-black text-amber-950 dark:text-amber-300 text-[11px]">Repay Previous Udhar (₹):</label>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRepayUdharInput(previousOutstanding.toString())}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10.5px] font-black rounded-md border border-amber-700 shadow-sm transition active:scale-95"
                            >
                              Repay Full Udhar (₹{previousOutstanding.toFixed(2)})
                            </button>
                            {repayUdharInput && (
                              <button
                                type="button"
                                onClick={() => setRepayUdharInput('')}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-md border border-slate-600 transition"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>

                        <input
                          type="number"
                          min="0"
                          max={previousOutstanding}
                          step="any"
                          value={repayUdharInput}
                          onChange={(e) => setRepayUdharInput(e.target.value)}
                          placeholder={`Enter amount to repay previous udhar (e.g. ₹${previousOutstanding.toFixed(2)})`}
                          className="w-full bg-slate-900 border-2 border-amber-600 rounded-lg p-2.5 text-xs text-amber-300 font-mono font-bold placeholder-slate-400 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-textSecondary mb-1 font-semibold">Payment Mode</label>
                    <select className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-semibold"
                      value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI / GPay</option>
                      <option value="Card">Credit / Debit Card</option>
                      <option value="Bank">Bank Transfer / NEFT</option>
                      <option value="Credit">Credit (Udhar Account)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs text-textSecondary font-semibold">Manual Discount (₹)</label>
                      {manualDiscount > 0 && (
                        <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/30">
                          -₹{manualDiscount.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <input 
                      type="number"
                      step="any"
                      min="0"
                      max={cartSubtotal}
                      className="w-full bg-background border border-border rounded p-2 text-xs text-rose-500 font-mono font-bold focus:border-rose-500 focus:outline-none"
                      value={manualDiscountInput}
                      onChange={(e) => setManualDiscountInput(e.target.value)}
                      placeholder="e.g. 50 (Flat ₹ off)"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs text-textSecondary font-semibold">Amount Collected (₹)</label>
                      <button
                        type="button"
                        onClick={() => setAmountCollectedInput(totalAmount.toString())}
                        className="text-[10px] font-bold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded border border-primary/30 transition cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        ⚡ Auto-Fill Full (₹{totalAmount.toFixed(2)})
                      </button>
                    </div>
                    <input 
                      type="number"
                      step="any"
                      min="0"
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-mono font-bold focus:border-primary focus:outline-none"
                      value={amountCollectedInput}
                      onChange={(e) => setAmountCollectedInput(e.target.value)}
                      placeholder={`₹${totalAmount.toFixed(2)} (Default full)`}
                    />
                  </div>
                </div>

                {/* Transaction ID / UTR Input for GPay, Credit Card, Bank Transfer, etc. */}
                {(paymentMode === 'UPI' || paymentMode === 'Card' || paymentMode === 'Bank' || (paymentMode !== 'Cash' && paymentMode !== 'Credit')) && (
                  <div className="animate-fade-in bg-slate-900/60 p-3 rounded-xl border border-primary/40 space-y-1">
                    <label className="block text-xs text-primary font-extrabold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 uppercase tracking-wide">
                        <i className="fa-solid fa-receipt text-primary"></i> Transaction ID / UTR / Ref No.
                      </span>
                      <span className="text-[10px] text-primary font-bold uppercase">(GPay / Card / Bank Ref)</span>
                    </label>
                    <input 
                      type="text"
                      className="w-full bg-background border border-primary/60 rounded-lg p-2.5 text-xs text-foreground font-mono font-bold focus:border-primary focus:outline-none uppercase"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="e.g. UPI-981240192849 / CARD-492019 / GPay Ref ID"
                    />
                    <p className="text-[10px] text-textMuted font-medium">Record reference / transaction ID for GPay, UPI, or Credit Card entries.</p>
                  </div>
                )}

                {/* Smart Real-Time Payment Allocation Calculator Breakdown */}
                {(() => {
                  const currentCollected = amountCollectedInput.trim() !== '' 
                    ? parseFloat(amountCollectedInput) || 0 
                    : (paymentMode === 'Credit' ? 0 : totalAmount);

                  const explicitRepay = repayUdharInput.trim() !== ''
                    ? parseFloat(repayUdharInput) || 0
                    : 0;

                  const appliedToBill = Math.min(currentCollected, totalAmount);
                  const excessToUdhar = Math.max(0, currentCollected - totalAmount);
                  const totalUdharRepaid = Math.min(previousOutstanding, explicitRepay + excessToUdhar);
                  const unpaidCurrentBill = Math.max(0, totalAmount - currentCollected);
                  const newUdharBalance = Math.max(0, previousOutstanding - totalUdharRepaid + unpaidCurrentBill);
                  const grandTotalCollected = currentCollected + explicitRepay;

                  return (
                    <div className="bg-background/60 p-3 sm:p-4 rounded-xl border border-border space-y-2.5 text-xs shadow-inner">
                      <div className="flex justify-between items-center text-textSecondary font-semibold">
                        <span className="truncate pr-1">{t('cartSubTotal', activeLang)}</span>
                        <span className="font-mono text-foreground font-bold shrink-0 text-right">₹{cartSubtotal.toFixed(2)}</span>
                      </div>

                      {manualDiscount > 0 && (
                        <div className="flex justify-between items-center text-rose-500 font-semibold">
                          <span className="truncate pr-1 flex items-center gap-1">
                            <i className="fa-solid fa-tag text-[10px]"></i> Manual Flat Discount (₹)
                          </span>
                          <span className="font-mono font-bold shrink-0 text-right">-₹{manualDiscount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-textSecondary font-semibold border-t border-border/30 pt-1.5">
                        <span className="truncate pr-1 font-extrabold text-foreground">Final Bill Total Cost</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black shrink-0 text-right text-xs sm:text-sm">₹{totalAmount.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between items-center text-textSecondary font-semibold">
                        <span className="truncate pr-1">{t('todayBillCollected', activeLang)}</span>
                        <span className="font-mono font-bold text-primary shrink-0 text-right">₹{currentCollected.toFixed(2)}</span>
                      </div>

                      {explicitRepay > 0 && (
                        <div className="flex justify-between items-center text-amber-300 font-semibold">
                          <span className="truncate pr-1">{t('previousUdharRepaid', activeLang)}</span>
                          <span className="font-mono font-bold text-amber-400 shrink-0 text-right">-₹{explicitRepay.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-foreground font-extrabold border-t border-border/40 pt-1.5">
                        <span className="text-[11px] sm:text-xs tracking-tight uppercase">{t('totalCashCollected', activeLang)}</span>
                        <span className="font-mono text-primary text-xs sm:text-sm font-black shrink-0 text-right ml-1">₹{grandTotalCollected.toFixed(2)}</span>
                      </div>

                      <div className="pt-1.5 border-t border-border/60 space-y-1.5 text-[11px]">
                        <div className="flex justify-between items-center text-foreground font-bold">
                          <span className="text-[10.5px] sm:text-xs">{t('currentBillStatus', activeLang)}</span>
                          <span className={`${unpaidCurrentBill === 0 ? 'text-primary font-extrabold' : (appliedToBill > 0 ? 'text-amber-400 font-extrabold' : 'text-rose-400 font-extrabold')} shrink-0 text-right ml-1`}>
                            {unpaidCurrentBill === 0 ? `✓ ${t('paid', activeLang)}` : (appliedToBill > 0 ? `${t('partial', activeLang)} (₹${unpaidCurrentBill.toFixed(2)} Unpaid)` : t('unpaid', activeLang))}
                          </span>
                        </div>

                        {totalUdharRepaid > 0 && (
                          <div className="flex justify-between items-center text-primary font-bold">
                            <span className="text-[10.5px] sm:text-xs">{t('appliedToPreviousUdhar', activeLang)}</span>
                            <span className="font-mono shrink-0 text-right">-₹{totalUdharRepaid.toFixed(2)}</span>
                          </div>
                        )}

                        {unpaidCurrentBill > 0 && matchedCustomer && (
                          <div className="flex justify-between items-center text-rose-400 font-bold">
                            <span className="text-[10.5px] sm:text-xs">{t('unpaidAddedToUdhar', activeLang)}</span>
                            <span className="font-mono shrink-0 text-right">+₹{unpaidCurrentBill.toFixed(2)}</span>
                          </div>
                        )}

                        {matchedCustomer && (
                          <div className="flex justify-between items-center text-amber-300 font-black pt-1.5 border-t border-dashed border-border/40 text-xs">
                            <span className="text-[10.5px] sm:text-xs truncate pr-1">{t('newUdharBalance', activeLang)}</span>
                            <span className="font-mono text-amber-400 shrink-0 text-right font-black">₹{newUdharBalance.toFixed(2)} {newUdharBalance > 0 ? `(${t('pending', activeLang)})` : '(Cleared)'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2.5 pt-1">
                  <button type="button" className="w-1/3 sm:flex-1 py-2.5 px-3 border border-border hover:bg-background/80 text-textSecondary font-bold rounded-xl text-xs transition active:scale-95 cursor-pointer text-center" onClick={() => setBillingModal(false)}>{t('cancel', activeLang)}</button>
                  <button type="submit" className="w-2/3 sm:flex-1 py-2.5 px-4 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-xl text-xs sm:text-sm transition shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5">
                    <i className="fa-solid fa-check-double text-xs"></i>
                    <span>{t('checkoutAndBill', activeLang)}</span>
                  </button>
                </div>
              </form>

            </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Branded 2-Copy A4 Printable Invoice Modal */}
      {printInvoice && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] overflow-y-auto print:p-0 print:bg-white animate-backdrop-fade">
          
          {/* Print A4 CSS Overrides */}
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 5mm 8mm;
              }
              body * {
                visibility: hidden !important;
              }
              #invoice-print-area, #invoice-print-area * {
                visibility: visible !important;
              }
              #invoice-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                background: white !important;
                color: black !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
                border: none !important;
              }
              .print-no-break {
                page-break-inside: avoid !important;
              }
            }
          `}</style>

          <div className="bg-white text-black p-3 sm:p-6 rounded-2xl w-[96vw] sm:w-full max-w-4xl shadow-2xl print:p-0 print:max-w-none print:shadow-none print:bg-white my-auto max-h-[95vh] print:max-h-none overflow-y-auto print:overflow-visible">
            
            {/* Action Bar (Hidden during print) */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 pb-3 mb-3 border-b border-slate-200 print:hidden">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="bg-primary/10 text-primary text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                  A4 Print Invoice (2 Copies)
                </span>
                <span className="text-[10px] sm:text-xs text-slate-500 font-bold">Customer Copy + Shop Copy</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPrintInvoice(null)}
                  className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition text-center"
                >
                  Close
                </button>
                <button 
                  onClick={() => window.print()}
                  className="flex-2 sm:flex-none px-4 py-2 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <i className="fa-solid fa-print"></i>
                  <span>Print Invoice (Ctrl+P)</span>
                </button>
              </div>
            </div>

            {/* Print Container Area - Smooth Mobile Scroll Wrapper */}
            <div className="w-full overflow-x-auto p-1 scrollbar-thin print:overflow-visible">
              <div id="invoice-print-area" className="min-w-[620px] sm:min-w-0 space-y-4 print:space-y-2 print:min-w-0">
              
              {/* Render 2 Copies: CUSTOMER COPY and SHOP COPY */}
              {['CUSTOMER COPY', 'SHOP COPY'].map((copyType, copyIdx) => {
                const totalAmount = Number(printInvoice.total_amount || 0);

                return (
                  <div key={copyType} className={`border border-slate-300 print:border-slate-400 p-4 rounded-lg print:rounded-none bg-white text-black print-no-break ${copyIdx > 0 ? 'mt-4 print:mt-3' : ''}`}>
                    
                    {/* Invoice Header Block */}
                    <div className="flex justify-between items-start pb-3 border-b-2 border-slate-800">
                      <div>
                        <h1 className="text-lg font-black tracking-tight uppercase text-slate-900">{tenantName || 'LK Hardware Store'}</h1>
                        <p className="text-[10px] text-slate-600 font-medium">Retail & Wholesale Hardware Merchant</p>
                        <p className="text-[10px] text-slate-600 font-medium">Market Road, Pune, Maharashtra - 411001 | 📞 +91 98765 43210</p>
                        <p className="text-[10px] font-mono font-bold text-slate-800 mt-0.5">GSTIN: 27LKSERP401Z2B5</p>
                      </div>

                      <div className="text-right">
                        <div className="inline-block border-2 border-slate-900 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider mb-1 bg-slate-100">
                          {copyType === 'CUSTOMER COPY' ? 'ORIGINAL - CUSTOMER COPY' : 'DUPLICATE - SHOP COPY'}
                        </div>
                        <h2 className="text-sm font-extrabold uppercase text-slate-800">INVOICE / BILL OF SALE</h2>
                      </div>
                    </div>

                    {/* Metadata Grid (Invoice #, Date, Customer Details) */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] my-2 bg-slate-50 print:bg-white p-2 border border-slate-200">
                      <div className="space-y-0.5">
                        <div className="flex"><span className="w-24 text-slate-500 font-semibold">Invoice No:</span> <span className="font-mono font-black">{printInvoice.invoice_number}</span></div>
                        <div className="flex"><span className="w-24 text-slate-500 font-semibold">Date & Time:</span> <span className="font-semibold">{new Date(printInvoice.sale_date).toLocaleString()}</span></div>
                        <div className="flex">
                          <span className="w-24 text-slate-500 font-semibold">Payment Mode:</span> 
                          <span className="font-bold uppercase text-primary">
                            {printInvoice.payment_mode || 'Cash'}
                            {(printInvoice.transaction_id || printInvoice.ref_number) ? ` (Txn ID: ${printInvoice.transaction_id || printInvoice.ref_number})` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex"><span className="w-28 text-slate-500 font-semibold">Billed To:</span> <span className="font-bold uppercase">{printInvoice.customer_name || 'Cash Customer'}</span></div>
                        <div className="flex"><span className="w-28 text-slate-500 font-semibold">Contact Phone:</span> <span>{printInvoice.customer_phone || 'N/A'}</span></div>
                        <div className="flex"><span className="w-28 text-slate-500 font-semibold">Payment Status:</span> <span className="font-bold uppercase">{printInvoice.payment_status || 'Paid'}</span></div>
                      </div>
                    </div>

                    {/* Itemized Products Table */}
                    <table className="w-full text-left text-[10px] border-collapse border border-slate-300 my-2">
                      <thead>
                        <tr className="bg-slate-100 print:bg-slate-200 border-b border-slate-300 uppercase font-black">
                          <th className="p-1 border-r border-slate-300 text-center w-8">S.No</th>
                          <th className="p-1 border-r border-slate-300">Item Description</th>
                          <th className="p-1 border-r border-slate-300 text-center w-16">HSN</th>
                          <th className="p-1 border-r border-slate-300 text-center w-12">Qty</th>
                          <th className="p-1 border-r border-slate-300 text-right w-16">Rate (₹)</th>
                          <th className="p-1 text-right w-20">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!printInvoice.items || printInvoice.items.length === 0) ? (
                          <tr>
                            <td colSpan={6} className="p-2 text-center text-slate-400">No items logged.</td>
                          </tr>
                        ) : printInvoice.items.map((item: any, idx: number) => {
                          const itemName = item.product?.product_name || item.product_name || 'Item';
                          const hsn = item.product?.hsn || item.hsn || '-';
                          const qty = Number(item.qty || 1);
                          const rate = Number(item.rate || item.price || 0);
                          const amt = item.amount || (qty * rate);

                          return (
                            <tr key={idx} className="border-b border-slate-200">
                              <td className="p-1 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                              <td className="p-1 border-r border-slate-200 font-semibold uppercase">{itemName}</td>
                              <td className="p-1 border-r border-slate-200 text-center font-mono text-slate-600">{hsn}</td>
                              <td className="p-1 border-r border-slate-200 text-center font-mono font-bold">{qty}</td>
                              <td className="p-1 border-r border-slate-200 text-right font-mono">₹{rate.toFixed(2)}</td>
                              <td className="p-1 text-right font-mono font-bold">₹{amt.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                      {/* Financial Summary & Footer Terms */}
                      <div className="grid grid-cols-12 gap-2 text-[10px] pt-1">
                        
                        {/* Terms & Amount in Words */}
                        <div className="col-span-6 space-y-1.5 border-r border-slate-200 pr-2">
                          <div>
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">Amount in Words:</span>
                            <span className="font-bold text-slate-900 italic">
                              {formatNumberToIndianWords(totalAmount)}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-slate-200">
                            <span className="text-[9px] font-bold text-slate-500 uppercase block">Terms & Conditions:</span>
                            <ol className="list-decimal list-inside text-[8.5px] text-slate-600 space-y-0.5">
                              <li>Goods once sold will not be taken back or exchanged.</li>
                              <li>Subject to local jurisdiction only. Warranty as per manufacturer terms.</li>
                            </ol>
                          </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="col-span-6 space-y-1 text-right pl-1">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Current Cart Sub Total:</span>
                            <span className="font-mono font-bold">₹{totalAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t-2 border-slate-900 pt-1 text-xs font-black">
                            <span>CURRENT BILL TOTAL:</span>
                            <span className="font-mono text-primary">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>

                          {/* Customer Account Udhar & Payment Ledger Summary Box */}
                          {(() => {
                            const isNamedCustomer = printInvoice.customer_name && printInvoice.customer_name.trim().toUpperCase() !== 'CASH CUSTOMER';
                            const nameUpper = (printInvoice.customer_name || '').trim().toUpperCase();
                            
                            // Look up registered customer or past sales invoices to get active account balance prior to this bill
                            const regCust = registeredCustomers.find(c => 
                              c.customer_name?.toUpperCase() === nameUpper
                            );

                            const pastInvoices = (sales as any[]).filter(s => 
                              s.customer_name && s.customer_name.trim().toUpperCase() === nameUpper && s.invoice_number !== printInvoice.invoice_number
                            );
                            const pastUnpaidDue = pastInvoices.reduce((acc, curr) => acc + Number(curr.due_amount || 0), 0);

                            const appliedUdhar = Number(printInvoice.applied_to_udhar || printInvoice.repay_udhar_amount || 0);

                            const prevUdhar = printInvoice.previous_outstanding && Number(printInvoice.previous_outstanding) > 0
                              ? Number(printInvoice.previous_outstanding)
                              : (appliedUdhar > 0 ? (Number(regCust?.outstanding || 0) + appliedUdhar) : (Number(regCust?.outstanding || 0) > 0 ? Number(regCust?.outstanding) : pastUnpaidDue));

                            const unpaidBill = printInvoice.unpaid_current_bill !== undefined
                              ? Number(printInvoice.unpaid_current_bill || 0)
                              : Number(printInvoice.due_amount || 0);

                            const currentBillPaid = printInvoice.amount_collected !== undefined
                              ? Math.min(Number(printInvoice.amount_collected || 0), totalAmount)
                              : Math.min(Number(printInvoice.paid_amount || 0), totalAmount);

                            // Remaining Udhar balance after this transaction
                            const remUdhar = printInvoice.remaining_outstanding !== undefined
                              ? Number(printInvoice.remaining_outstanding)
                              : Math.max(0, prevUdhar - appliedUdhar + unpaidBill);

                            if (!isNamedCustomer && prevUdhar <= 0 && remUdhar <= 0 && appliedUdhar <= 0 && unpaidBill <= 0) {
                              return null;
                            }

                            return (
                              <div className="mt-2 pt-1 border-t-2 border-slate-400 text-[9px] bg-slate-50 p-2 rounded space-y-1 text-left shadow-sm">
                                <div className="font-black text-slate-900 uppercase text-[9px] border-b border-slate-300 pb-1 mb-1 flex justify-between items-center">
                                  <span>CUSTOMER ACCOUNT CREDIT LEDGER</span>
                                  <span className="text-amber-900 font-extrabold bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                    {remUdhar > 0 ? '⚠️ Udhar Pending' : '✓ Account Cleared'}
                                  </span>
                                </div>

                                {/* 1. Previous Outstanding */}
                                <div className="flex justify-between text-slate-700">
                                  <span>1. Previous Outstanding Udhar:</span>
                                  <span className="font-mono font-bold text-amber-900">₹{prevUdhar.toFixed(2)}</span>
                                </div>

                                {/* 2. Paid Today From Previous Udhar */}
                                <div className="flex justify-between text-primary font-bold">
                                  <span>2. Paid Today From Previous Udhar:</span>
                                  <span className="font-mono text-primary">
                                    {appliedUdhar > 0 ? `-₹${appliedUdhar.toFixed(2)} (REPAID)` : '₹0.00'}
                                  </span>
                                </div>

                                {/* 3. Paid Today For Current Bill */}
                                <div className="flex justify-between text-slate-700">
                                  <span>3. Paid Today For Current Bill:</span>
                                  <span className="font-mono font-bold text-primary">₹{currentBillPaid.toFixed(2)}</span>
                                </div>

                                {/* 4. Unpaid Bill Added to Udhar */}
                                {unpaidBill > 0 && (
                                  <div className="flex justify-between text-rose-800 font-bold">
                                    <span>4. Unpaid Bill Added to Udhar:</span>
                                    <span className="font-mono text-rose-700">+₹{unpaidBill.toFixed(2)}</span>
                                  </div>
                                )}

                                {/* 5. Net Remaining Outstanding */}
                                <div className="flex justify-between font-black text-slate-900 border-t-2 border-slate-400 pt-1 mt-1 text-[9.5px]">
                                  <span>NET REMAINING OUTSTANDING UDHAR:</span>
                                  <span className={remUdhar > 0 ? "font-mono text-rose-900 font-black text-[10px]" : "font-mono text-primary font-bold"}>
                                    ₹{remUdhar.toFixed(2)} {remUdhar > 0 ? '(PENDING)' : '(CLEARED)'}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Signatory Box */}
                          <div className="pt-3 text-center">
                            <div className="text-[8.5px] font-bold text-slate-500 uppercase">For {tenantName || 'LK Hardware Store'}</div>
                            <div className="h-5"></div>
                            <div className="text-[8.5px] font-semibold text-slate-700 border-t border-slate-300 inline-block px-4">Authorized Signatory</div>
                          </div>
                        </div>

                      </div>

                  </div>
                );
              })}

              {/* Scissor Cut Line Separator (Printed between top and bottom copy) */}
              <div className="relative my-2 py-1 text-center text-[9px] text-slate-400 font-mono flex items-center justify-center gap-2 select-none print:my-1">
                <div className="border-b border-dashed border-slate-400 flex-1"></div>
                <span>✂ ---------------- Cut Along This Line ---------------- ✂</span>
                <div className="border-b border-dashed border-slate-400 flex-1"></div>
              </div>

              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Customer Purchase History & Audit Modal */}
      {showHistoryModal && matchedCustomer && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-3xl shadow-2xl my-auto max-h-[85vh] flex flex-col gap-4 overflow-hidden text-slate-100">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-700 shrink-0">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Customer Profile & Invoice Audit</span>
                <h3 className="text-lg font-black text-white uppercase mt-0.5">{matchedCustomer.customer_name} — Purchase History</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-300 hover:text-white text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3.5 py-1.5 rounded-lg transition"
              >
                &times; Close
              </button>
            </div>

            {/* Customer Quick Info Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs shrink-0">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Contact Phone</div>
                <div className="font-bold text-white font-mono text-sm mt-0.5">{matchedCustomer.phone || 'N/A'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Total Active Udhar Dues</div>
                <div className="font-extrabold font-mono text-amber-400 text-sm mt-0.5">₹{Number(matchedCustomer.outstanding || 0).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Total Orders Count</div>
                <div className="font-extrabold font-mono text-primary text-sm mt-0.5">{matchedCustomerInvoices.length} Invoices</div>
              </div>
            </div>

            {/* Invoices List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
              {matchedCustomerInvoices.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                  No past purchase invoices recorded for this customer yet.
                </div>
              ) : (
                matchedCustomerInvoices.map((inv: any, idx: number) => {
                  const totalAmt = Number(inv.total_amount || 0);
                  const collectedAmt = inv.amount_collected !== undefined 
                    ? Number(inv.amount_collected || 0)
                    : (inv.paid_amount !== undefined ? Number(inv.paid_amount || 0) : (inv.payment_status === 'Paid' ? totalAmt : 0));

                  const unpaidUdharAmt = inv.unpaid_current_bill !== undefined 
                    ? Number(inv.unpaid_current_bill || 0)
                    : (inv.due_amount !== undefined ? Number(inv.due_amount || 0) : Math.max(0, totalAmt - collectedAmt));

                  const isPending = unpaidUdharAmt > 0 || inv.payment_status === 'Unpaid' || inv.payment_status === 'Partial';

                  return (
                    <div 
                      key={inv.id || idx} 
                      className={`rounded-xl p-4 space-y-3 transition shadow-sm ${
                        isPending 
                          ? 'bg-slate-950 border-2 border-rose-500/70' 
                          : 'bg-slate-950 border border-slate-800'
                      }`}
                    >
                      {/* Card Header Row */}
                      <div className="flex justify-between items-start border-b border-slate-800 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-white uppercase">{inv.invoice_number}</span>
                            <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded border border-slate-700 uppercase">
                              {inv.payment_mode || 'Cash'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium mt-1">
                            🗓️ {new Date(inv.sale_date || inv.created_at).toLocaleString()}
                          </div>
                        </div>

                        <div className="text-right">
                          {isPending ? (
                            <div className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/50 px-2.5 py-1 rounded-lg">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                              <span className="font-mono font-black text-xs text-rose-300">
                                ⚠️ ₹{unpaidUdharAmt.toFixed(2)} Udhar Pending
                              </span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg text-primary text-xs font-extrabold">
                              ✓ Fully Paid
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Payment Ledger Amounts Breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-900/90 p-2.5 rounded-lg text-xs font-semibold border border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Bill Total</span>
                          <span className="font-mono font-extrabold text-slate-100">₹{totalAmt.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Amount Paid</span>
                          <span className="font-mono font-extrabold text-primary">₹{collectedAmt.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Udhar Pending</span>
                          <span className={`font-mono font-extrabold ${unpaidUdharAmt > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {unpaidUdharAmt > 0 ? `+₹${unpaidUdharAmt.toFixed(2)}` : '₹0.00'}
                          </span>
                        </div>
                      </div>

                      {/* Items purchased line items */}
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Items Billed:</div>
                        {(!inv.items || inv.items.length === 0) ? (
                          <div className="text-[11px] text-slate-400 italic">Standard billing line items</div>
                        ) : (
                          <div className="grid grid-cols-1 gap-1.5">
                            {inv.items.map((item: any, i: number) => {
                              const name = item.product?.product_name || item.product_name || 'Item';
                              const qty = Number(item.qty || 1);
                              const rate = Number(item.rate || 0);
                              return (
                                <div key={i} className="flex justify-between items-center text-xs bg-slate-900 p-2 rounded-lg border border-slate-800">
                                  <span className="text-slate-200 font-bold uppercase truncate max-w-[280px]">{name} x {qty}</span>
                                  <span className="font-mono text-primary font-bold">₹{(qty * rate).toFixed(2)} <span className="text-slate-400 text-[10px] font-normal">(₹{rate}/unit)</span></span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Quick Customer Registration Modal (In-POS) */}
      {quickCustModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-lg shadow-2xl my-auto space-y-4">
            
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">In-POS Quick Registration</span>
                <h3 className="text-base font-black text-foreground uppercase mt-0.5">Register New Customer</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setQuickCustModalOpen(false)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-2.5 py-1 rounded-lg transition"
              >
                &times; Cancel
              </button>
            </div>

            <form onSubmit={handleQuickCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Customer Full Name *</label>
                <input 
                  type="text" 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground uppercase font-bold focus:border-primary focus:outline-none"
                  value={quickCustFormData.customer_name} 
                  onChange={(e) => setQuickCustFormData({ ...quickCustFormData, customer_name: e.target.value })} 
                  placeholder="e.g. RAMESH KUMAR" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Mobile Phone Number *</label>
                <input 
                  type="tel" 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-semibold focus:border-primary focus:outline-none"
                  value={quickCustFormData.phone} 
                  onChange={(e) => setQuickCustFormData({ ...quickCustFormData, phone: e.target.value })} 
                  placeholder="e.g. 9876543210" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Date of Birth (Birthday)</label>
                <input 
                  type="date" 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-mono font-semibold focus:border-primary focus:outline-none"
                  value={quickCustFormData.dob} 
                  onChange={(e) => setQuickCustFormData({ ...quickCustFormData, dob: e.target.value })} 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Credit Limit (₹)</label>
                <input 
                  type="number" 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-mono font-bold"
                  value={quickCustFormData.credit_limit === 0 ? '' : quickCustFormData.credit_limit} 
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setQuickCustFormData({ ...quickCustFormData, credit_limit: e.target.value === '' ? 0 : (parseInt(e.target.value) || 0) })} 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Billing Address</label>
                <textarea 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground" 
                  rows={2}
                  value={quickCustFormData.address} 
                  onChange={(e) => setQuickCustFormData({ ...quickCustFormData, address: e.target.value })} 
                  placeholder="Customer address..." 
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-border mt-3">
                <button 
                  type="button" 
                  onClick={() => setQuickCustModalOpen(false)}
                  className="px-4 py-2 border border-border text-textSecondary rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer"
                >
                  Save & Auto-Select
                </button>
              </div>
            </form>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Indian Currency Number to Words converter helper
function formatNumberToIndianWords(amount: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const num = Math.floor(Math.abs(amount));
  if (num === 0) return 'Rupees Zero Only';

  function convertChunk(n: number): string {
    if (n === 0) return '';
    if (n < 20) return units[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
    return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertChunk(n % 100) : '');
  }

  let result = '';
  let rem = num;

  if (Math.floor(rem / 10000000) > 0) {
    result += convertChunk(Math.floor(rem / 10000000)) + ' Crore ';
    rem %= 10000000;
  }
  if (Math.floor(rem / 100000) > 0) {
    result += convertChunk(Math.floor(rem / 100000)) + ' Lakh ';
    rem %= 100000;
  }
  if (Math.floor(rem / 1000) > 0) {
    result += convertChunk(Math.floor(rem / 1000)) + ' Thousand ';
    rem %= 1000;
  }
  if (rem > 0) {
    result += convertChunk(rem);
  }

  return `Rupees ${result.trim()} Only`;
}
