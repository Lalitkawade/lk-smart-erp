import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';
import type { Product } from '../../types/erp.types';

interface Supplier {
  id: string;
  supplier_name: string;
  phone?: string;
  email?: string;
  address?: string;
  dob?: string;
  establishment_date?: string;
  outstanding: number;
  created_at?: string;
}

interface PurchaseBill {
  id: string;
  bill_number: string;
  supplier_name: string;
  payment_mode: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  purchase_date: string;
  items: Array<{
    product_id: string;
    product_name: string;
    qty: number;
    rate: number;
  }>;
}

interface PurchasesProps {
  autoOpenModal?: boolean;
  onModalClosed?: () => void;
}

export default function Purchases({ autoOpenModal = false, onModalClosed }: PurchasesProps) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || 'default-hardware-erp';

  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  
  // Modals
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (autoOpenModal) {
      setModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenModal]);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [transactionId, setTransactionId] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [isPartialPayment, setIsPartialPayment] = useState(false);

  // Vendor & Product Autocomplete Search States
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const [productRowSearch, setProductRowSearch] = useState<{ [key: number]: string }>({});
  const [openProductRowDropdown, setOpenProductRowDropdown] = useState<number | null>(null);

  const selectedSup = useMemo(() => {
    return suppliers.find(s => s.id === supplierId);
  }, [suppliers, supplierId]);

  const filteredSuppliers = useMemo(() => {
    const query = vendorSearchQuery.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter(s => 
      s.supplier_name.toLowerCase().includes(query) ||
      (s.phone && s.phone.includes(query))
    );
  }, [suppliers, vendorSearchQuery]);

  // Quick Vendor Registration State
  const [quickVendorModalOpen, setQuickVendorModalOpen] = useState(false);
  const [quickVendorFormData, setQuickVendorFormData] = useState({
    supplier_name: '',
    phone: '',
    email: '',
    address: '',
    dob: '',
    establishment_date: ''
  });

  // Dynamic rows of items
  const [billItems, setBillItems] = useState<Array<{ product_id: string; qty: number; rate: number }>>([
    { product_id: '', qty: 1, rate: 0 }
  ]);

  // Math totals
  const totalAmount = billItems.reduce((acc, curr) => acc + curr.qty * curr.rate, 0);
  const effectivePaid = isPartialPayment ? Math.min(totalAmount, Math.max(0, paidAmount)) : totalAmount;
  const dueAmount = Math.max(0, totalAmount - effectivePaid);

  const handleQuickCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVendorFormData.supplier_name.trim()) return;

    const formattedName = quickVendorFormData.supplier_name.trim().toUpperCase();
    const newSupplierObj: Supplier = {
      id: 'sup-' + Date.now(),
      supplier_name: formattedName,
      phone: quickVendorFormData.phone,
      email: quickVendorFormData.email,
      address: quickVendorFormData.address,
      dob: quickVendorFormData.dob || undefined,
      establishment_date: quickVendorFormData.establishment_date || undefined,
      outstanding: 0,
      created_at: new Date().toISOString()
    };

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
      if (isUuid) {
        const payload: any = {
          tenant_id: tenantId,
          supplier_name: formattedName,
          phone: quickVendorFormData.phone,
          email: quickVendorFormData.email,
          address: quickVendorFormData.address,
          dob: quickVendorFormData.dob || null,
          establishment_date: quickVendorFormData.establishment_date || null,
          outstanding: 0
        };

        let res = await supabase.from('suppliers').insert(payload).select().maybeSingle();
        if (res.error && (res.error.message?.includes('dob') || res.error.message?.includes('establishment_date'))) {
          delete payload.dob;
          delete payload.establishment_date;
          res = await supabase.from('suppliers').insert(payload).select().maybeSingle();
        }

        if (res.data?.id) {
          newSupplierObj.id = res.data.id;
        }
      }
    } catch (e: any) {}

    try {
      const currentLocal = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
      localStorage.setItem('lk_suppliers', JSON.stringify([newSupplierObj, ...currentLocal]));
    } catch (e: any) {}

    setSuppliers(prev => [newSupplierObj, ...prev]);
    setSupplierId(newSupplierObj.id);
    setQuickVendorModalOpen(false);
    setQuickVendorFormData({ supplier_name: '', phone: '', email: '', address: '', dob: '', establishment_date: '' });
    alert(`Vendor "${formattedName}" successfully registered and selected!`);
  };

  const fetchPurchasesData = async () => {
    if (!tenantId) return;
    try {
      // 1. Fetch procurement bills with items
      const { data: billsData } = await supabase
        .from('purchase_bills')
        .select(`
          *,
          items:purchase_items(
            *,
            product:products(*)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('purchase_date', { ascending: false });

      let currentBills: any[] = (billsData || []) as any[];

      // Merge local storage cache if present
      try {
        const localP = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
        if (localP.length > 0) {
          const map = new Map();
          currentBills.forEach(b => {
            const k = b.bill_number || b.id;
            if (k) map.set(k, b);
          });
          localP.forEach((b: any) => {
            const k = b.bill_number || b.id;
            if (k && !map.has(k)) map.set(k, b);
          });
          currentBills = Array.from(map.values());
        }
      } catch (err) {}

      setBills(currentBills);
      localStorage.setItem('lk_purchases', JSON.stringify(currentBills));

      // 2. Fetch suppliers
      const { data: supsData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('supplier_name', { ascending: true });

      let currentSups: Supplier[] = (supsData || []) as Supplier[];
      try {
        const localS = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
        if (localS.length > 0) {
          const map = new Map<string, Supplier>();
          currentSups.forEach(s => map.set(s.supplier_name.toUpperCase().trim(), s));
          localS.forEach((s: any) => {
            if (s && s.supplier_name && !map.has(s.supplier_name.toUpperCase().trim())) {
              map.set(s.supplier_name.toUpperCase().trim(), s);
            }
          });
          currentSups = Array.from(map.values());
        }
      } catch (err) {}
      setSuppliers(currentSups);

      // 3. Fetch products and merge with local storage cache
      const { data: prodsData } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('product_name', { ascending: true });

      let currentProds: Product[] = (prodsData || []) as Product[];
      try {
        const localPStr = localStorage.getItem('lk_products') || '[]';
        const localP: Product[] = JSON.parse(localPStr);
        if (localP.length > 0) {
          const map = new Map<string, Product>();
          currentProds.forEach(p => { if (p && p.id) map.set(p.id, p); });
          localP.forEach(p => {
            if (p && p.id && !map.has(p.id)) map.set(p.id, p);
          });
          currentProds = Array.from(map.values());
        }
      } catch (err) {}
      setProducts(currentProds);
    } catch (e) {
      console.error('Failed to sync purchases records with Supabase:', e);
    }
  };

  useEffect(() => {
    fetchPurchasesData();
    window.addEventListener('storage', fetchPurchasesData);
    return () => window.removeEventListener('storage', fetchPurchasesData);
  }, [tenantId]);

  const handleAddItemRow = () => {
    setBillItems([...billItems, { product_id: '', qty: 1, rate: 0 }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    if (billItems.length === 1) return;
    setBillItems(billItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, val: string | number) => {
    const updated = billItems.map((item, i) => {
      if (i === idx) {
        const newItem = { ...item, [field]: val };
        // Auto set rate if product is selected
        if (field === 'product_id') {
          const match = products.find(p => p.id === val);
          if (match) {
            newItem.rate = Number(match.purchase_price);
          }
        }
        return newItem;
      }
      return item;
    });
    setBillItems(updated);
  };

  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      alert('Please select a supplier!');
      return;
    }

    const selectedSup = suppliers.find(s => s.id === supplierId);
    if (!selectedSup) return;

    const newBillObj = {
      id: 'pb-' + Date.now(),
      bill_number: billNumber || 'PB-' + Date.now().toString().slice(-5),
      supplier_name: selectedSup.supplier_name,
      payment_mode: paymentMode,
      ref_number: transactionId.trim() || null,
      transaction_id: transactionId.trim() || null,
      total_amount: totalAmount,
      paid_amount: effectivePaid,
      due_amount: dueAmount,
      purchase_date: new Date(purchaseDate).toISOString(),
      items: billItems.map(item => {
        const p = products.find(prod => prod.id === item.product_id);
        return {
          product_id: item.product_id,
          product_name: p ? p.product_name : 'Procured Material Item',
          qty: item.qty,
          rate: item.rate
        };
      })
    };

    // 1. Immediate local state and cache updates
    try {
      const localP = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
      localStorage.setItem('lk_purchases', JSON.stringify([newBillObj, ...localP]));

      // Update product stock counts locally
      const localProds: Product[] = JSON.parse(localStorage.getItem('lk_products') || '[]');
      billItems.forEach(item => {
        const pIdx = localProds.findIndex(p => p.id === item.product_id);
        if (pIdx >= 0) {
          localProds[pIdx].current_stock = Number(localProds[pIdx].current_stock || 0) + item.qty;
        }
      });
      localStorage.setItem('lk_products', JSON.stringify(localProds));

      // Update supplier outstanding locally
      if (dueAmount > 0) {
        const localSups = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
        const sIdx = localSups.findIndex((s: any) => s.id === selectedSup.id);
        if (sIdx >= 0) {
          localSups[sIdx].outstanding = Number(localSups[sIdx].outstanding || 0) + dueAmount;
        }
        localStorage.setItem('lk_suppliers', JSON.stringify(localSups));
      }
    } catch (e) {}

    // 2. Background attempt to persist to remote Supabase if UUID
    const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isValidUUID(tenantId)) {
      try {
        const { data: billRes } = await supabase
          .from('purchase_bills')
          .insert({
            tenant_id: tenantId,
            bill_number: newBillObj.bill_number,
            supplier_name: selectedSup.supplier_name,
            payment_mode: paymentMode,
            ref_number: transactionId.trim() || null,
            transaction_id: transactionId.trim() || null,
            total_amount: totalAmount,
            paid_amount: effectivePaid,
            due_amount: dueAmount,
            purchase_date: newBillObj.purchase_date
          })
          .select()
          .single();

        if (billRes && billRes.id) {
          for (const item of billItems) {
            await supabase.from('purchase_items').insert({
              bill_id: billRes.id,
              product_id: item.product_id,
              qty: item.qty,
              rate: item.rate,
              amount: item.qty * item.rate
            });
          }
        }
      } catch (err) {
        console.warn('Remote purchase bill save note (saved locally):', err);
      }
    }

    setBills(prev => [newBillObj, ...prev]);
    window.dispatchEvent(new Event('storage'));

    setModalOpen(false);
    setBillItems([{ product_id: '', qty: 1, rate: 0 }]);
    setBillNumber('');
    setTransactionId('');
    setPaidAmount(0);
    setIsPartialPayment(false);
    alert('Procurement Bill successfully saved! Stock levels incremented and vendor ledgers adjusted.');
  };

  // Material receipts are computed dynamically below
  const purchaseLines = useMemo(() => {
    const lines: any[] = [];
    bills.forEach(b => {
      const items = b.items || (b as any).purchase_items || [];
      if (items.length === 0) {
        lines.push({
          id: b.id || b.bill_number,
          hsn: (b as any).hsn || '-',
          product_name: (b as any).product_name || (b.bill_number?.startsWith('STOCK-IN') ? 'Direct Inflow Stock' : 'Procurement Bill'),
          vendor_name: b.supplier_name || 'Vendor Supplier',
          date: b.purchase_date || (b as any).created_at || new Date().toISOString(),
          qty: 1,
          rate: Number(b.total_amount || 0),
          amount: Number(b.total_amount || 0),
          rawBill: b
        });
      } else {
        items.forEach((item: any) => {
          const matchProd = products.find(p => p.id === (item.product_id || item.product?.id));
          lines.push({
            id: `${b.id}-${item.product_id || Math.random()}`,
            hsn: item.product?.hsn || matchProd?.hsn || item.hsn || '-',
            product_name: item.product?.product_name || matchProd?.product_name || item.product_name || 'Custom Item',
            vendor_name: b.supplier_name || 'Vendor Supplier',
            date: b.purchase_date || (b as any).created_at || new Date().toISOString(),
            qty: Number(item.qty || 1),
            rate: Number(item.rate || 0),
            amount: Number(item.amount || (item.qty * item.rate) || 0),
            rawBill: b
          });
        });
      }
    });
    return lines.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [bills, products]);

  const filteredLines = purchaseLines.filter((line: any) => {
    return (
      line.product_name.toLowerCase().includes(search.toLowerCase()) ||
      line.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
      line.hsn.includes(search)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6 bg-secondary border border-border p-4 sm:p-6 rounded-xl shadow-md">
        <div>
          <h2 className="text-xl font-bold text-foreground">Purchase</h2>
          <p className="text-xs text-textMuted mt-1">Log supplier purchase bills and manage material receipts</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={() => setModalOpen(true)}>
          Log Procurement Bill
        </button>
      </div>

      <div className="mb-4">
        <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-lg p-3 text-sm focus:outline-none focus:border-primary font-semibold"
          placeholder="Search by product name, vendor name or HSN..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg overflow-x-auto">
        <table className="w-full text-left text-sm text-textSecondary">
          <thead>
            <tr className="border-b border-border text-textPrimary font-extrabold uppercase tracking-wider text-xs">
              <th className="py-3">HSN Code of Product</th>
              <th className="py-3">Product Name</th>
              <th className="py-3">Vendor Name</th>
              <th className="py-3">Date</th>
              <th className="py-3 text-center">Units</th>
              <th className="py-3 text-right">Cost</th>
              <th className="py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-textMuted">No matching purchase records found.</td>
              </tr>
            ) : filteredLines.map((line: any, idx: number) => (
              <tr key={idx} className="border-b border-border hover:bg-slate-100/10 dark:hover:bg-slate-800/10">
                <td className="py-4 font-mono font-bold text-emerald-450">{line.hsn}</td>
                <td className="py-4 font-semibold text-foreground uppercase">{line.product_name}</td>
                <td className="py-4 font-bold text-foreground uppercase">{line.vendor_name}</td>
                <td className="py-4">{new Date(line.date).toLocaleDateString()}</td>
                <td className="py-4 text-center font-bold text-foreground">{line.qty}</td>
                <td className="py-4 text-right font-mono">₹{line.rate.toFixed(2)}</td>
                <td className="py-4 text-right font-mono font-bold text-foreground">₹{line.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Log Bill Modal */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-4xl shadow-2xl my-auto max-h-[85vh] flex flex-col gap-4 overflow-hidden">
            
            {/* Sticky Header */}
            <div className="flex justify-between items-center pb-3 border-b border-border shrink-0">
              <div>
                <span className="text-[10px] font-bold text-emerald-450 uppercase tracking-widest">Procurement Desk</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">Log Material Procurement Bill</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setModalOpen(false)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition"
              >
                &times; Close Desk
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmitBill} className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6 scrollbar-thin">
              
              {/* Supplier and info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-textSecondary font-semibold">Select Supplier / Vendor *</label>
                    <button 
                      type="button" 
                      onClick={() => setQuickVendorModalOpen(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-350 font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                    >
                      ➕ Quick Register Vendor
                    </button>
                  </div>

                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-bold uppercase focus:border-emerald-500 focus:outline-none pr-8"
                      value={vendorSearchQuery || selectedSup?.supplier_name || ''} 
                      onFocus={() => setVendorDropdownOpen(true)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVendorSearchQuery(val);
                        setVendorDropdownOpen(true);
                        if (!val.trim()) setSupplierId('');
                      }} 
                      placeholder="🔍 Type to search vendor name..."
                    />
                    {(supplierId || vendorSearchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSupplierId('');
                          setVendorSearchQuery('');
                          setVendorDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textMuted hover:text-foreground text-xs font-bold cursor-pointer"
                        title="Clear vendor selection"
                      >
                        &times;
                      </button>
                    )}

                    {/* Floating Interactive Vendor Autocomplete Dropdown */}
                    {vendorDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-border/40 scrollbar-thin animate-fade-in">
                        {filteredSuppliers.length === 0 ? (
                          <div className="p-3 text-center text-xs space-y-2">
                            <p className="text-textMuted font-medium">No vendors found matching "{vendorSearchQuery}".</p>
                            <button 
                              type="button"
                              onClick={() => {
                                setQuickVendorFormData(prev => ({ ...prev, supplier_name: vendorSearchQuery.toUpperCase() }));
                                setVendorDropdownOpen(false);
                                setQuickVendorModalOpen(true);
                              }}
                              className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 font-extrabold text-xs rounded-lg border border-emerald-500/30 transition hover:bg-emerald-500/30 cursor-pointer"
                            >
                              ➕ Register "{vendorSearchQuery.toUpperCase()}" as New Vendor
                            </button>
                          </div>
                        ) : (
                          filteredSuppliers.map((s) => (
                            <div 
                              key={s.id}
                              onClick={() => {
                                setSupplierId(s.id);
                                setVendorSearchQuery(s.supplier_name);
                                setVendorDropdownOpen(false);
                              }}
                              className={`p-2.5 hover:bg-background/80 cursor-pointer flex justify-between items-center transition ${supplierId === s.id ? 'bg-amber-500/10 font-black text-amber-400' : 'text-foreground'}`}
                            >
                              <div className="space-y-0.5">
                                <div className="text-xs font-bold uppercase">{s.supplier_name}</div>
                                <div className="text-[10px] text-textMuted">Phone: {s.phone || 'N/A'} {s.outstanding ? `| Outstanding Dues: ₹${Number(s.outstanding).toFixed(2)}` : ''}</div>
                              </div>
                              {supplierId === s.id && <span className="text-emerald-400 font-bold text-xs">✓ Selected</span>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-textSecondary mb-1">Supplier Bill Number</label>
                  <input type="text" className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-semibold"
                    value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. IN-98218" />
                </div>
                <div>
                  <label className="block text-xs text-textSecondary mb-1">Billing Date *</label>
                  <input type="date" className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-mono font-semibold"
                    value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs text-textSecondary mb-1">Payment Channel</label>
                  <select className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-semibold"
                    value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                    <option value="UPI">UPI / GPay</option>
                    <option value="Card">Credit / Debit Card</option>
                    <option value="Bank Transfer">Bank Transfer / NEFT</option>
                    <option value="Cash">Cash Voucher</option>
                  </select>
                </div>

                {/* Transaction ID / UTR Input for GPay, Credit Card, Bank Transfer */}
                {paymentMode !== 'Cash' && (
                  <div className="col-span-1 md:col-span-4 animate-fade-in bg-slate-900/60 p-3 rounded-xl border border-emerald-500/40 space-y-1">
                    <label className="block text-xs text-emerald-400 font-extrabold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 uppercase tracking-wide">
                        <i className="fa-solid fa-receipt text-emerald-400"></i> Transaction ID / UTR / Reference No.
                      </span>
                      <span className="text-[10px] text-emerald-500 font-bold uppercase">(GPay / Card / Bank Ref)</span>
                    </label>
                    <input 
                      type="text"
                      className="w-full bg-background border border-emerald-500/60 rounded-lg p-2.5 text-xs text-foreground font-mono font-bold focus:border-emerald-400 focus:outline-none uppercase"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="e.g. UPI-981240192849 / CARD-492019 / GPay Ref ID"
                    />
                    <p className="text-[10px] text-textMuted font-medium">Record payment transaction reference number for vendor GPay, UPI, or Credit Card entries.</p>
                  </div>
                )}
              </div>

              {/* Items row adder */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-textSecondary uppercase tracking-wider">Product Inventory Procured</h4>
                  <button type="button" className="text-xs text-emerald-400 hover:text-emerald-350 font-bold" onClick={handleAddItemRow}>
                    + Add Product Line
                  </button>
                </div>

                {/* Explicit Header Labels */}
                <div className="hidden md:flex gap-3 px-3 text-[11px] font-black uppercase text-slate-900 dark:text-slate-100 tracking-wider border-b border-border/80 pb-1">
                  <div className="flex-1 min-w-[220px]">Product Catalog Item</div>
                  <div className="w-24 text-center">Qty (Units)</div>
                  <div className="w-32 text-right">Purchase Price (₹)</div>
                  <div className="w-32 text-right">Total (₹)</div>
                  <div className="w-6"></div>
                </div>

                <div className="space-y-2">
                  {billItems.map((item, idx) => {
                    const selectedProd = products.find(p => p.id === item.product_id);
                    const rowQuery = (productRowSearch[idx] !== undefined ? productRowSearch[idx] : (selectedProd?.product_name || '')).toLowerCase().trim();
                    const filteredProdsForRow = rowQuery 
                      ? products.filter(p => p.product_name.toLowerCase().includes(rowQuery) || p.sku?.toLowerCase().includes(rowQuery) || p.barcode?.toLowerCase().includes(rowQuery))
                      : products;

                    return (
                      <div key={idx} className="flex gap-3 items-center bg-background/40 p-3 rounded-lg border border-border flex-wrap md:flex-nowrap">
                        {/* Searchable Product Dropdown */}
                        <div className="flex-1 min-w-[220px] relative">
                          <label className="block md:hidden text-[10px] font-extrabold text-slate-900 dark:text-slate-100 uppercase mb-1">Product Catalog Item</label>
                          <div className="relative">
                            <input
                              type="text"
                              className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-bold uppercase focus:border-emerald-500 focus:outline-none pr-7"
                              value={productRowSearch[idx] !== undefined ? productRowSearch[idx] : (selectedProd?.product_name || '')}
                              onFocus={() => setOpenProductRowDropdown(idx)}
                              onChange={(e) => {
                                const val = e.target.value;
                                setProductRowSearch(prev => ({ ...prev, [idx]: val }));
                                setOpenProductRowDropdown(idx);
                                if (!val.trim()) {
                                  handleItemChange(idx, 'product_id', '');
                                }
                              }}
                              placeholder="🔍 Type product name, SKU or scan..."
                            />
                            {(item.product_id || productRowSearch[idx]) && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleItemChange(idx, 'product_id', '');
                                  setProductRowSearch(prev => ({ ...prev, [idx]: '' }));
                                  setOpenProductRowDropdown(null);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted hover:text-foreground text-xs font-bold cursor-pointer"
                                title="Clear product selection"
                              >
                                &times;
                              </button>
                            )}
                          </div>

                          {/* Floating Product Autocomplete Dropdown */}
                          {openProductRowDropdown === idx && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-border/40 scrollbar-thin animate-fade-in">
                              {filteredProdsForRow.length === 0 ? (
                                <div className="p-3 text-center text-xs text-textMuted font-medium">
                                  No matching products found in catalog for "{productRowSearch[idx]}".
                                </div>
                              ) : (
                                filteredProdsForRow.map((p) => (
                                  <div
                                    key={p.id}
                                    onClick={() => {
                                      handleItemChange(idx, 'product_id', p.id);
                                      handleItemChange(idx, 'rate', Number(p.purchase_price || 0));
                                      setProductRowSearch(prev => ({ ...prev, [idx]: p.product_name }));
                                      setOpenProductRowDropdown(null);
                                    }}
                                    className={`p-2.5 hover:bg-background/80 cursor-pointer flex justify-between items-center transition ${item.product_id === p.id ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-foreground'}`}
                                  >
                                    <div>
                                      <div className="text-xs font-bold uppercase">{p.product_name}</div>
                                      <div className="text-[10px] text-textMuted font-semibold">
                                        Stock: <span className="font-bold text-foreground">{p.current_stock}</span> {p.s_unit || p.unit || 'Pcs'} | Cost: ₹{Number(p.purchase_price || 0).toFixed(2)}
                                      </div>
                                    </div>
                                    {item.product_id === p.id && <span className="text-emerald-400 text-xs font-bold">✓ Selected</span>}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      <div className="w-24">
                        <label className="block text-[10px] font-extrabold text-slate-900 dark:text-slate-100 uppercase mb-1">Qty</label>
                        <input type="number" className="w-full bg-background border border-border rounded p-2 text-xs text-center text-foreground font-semibold"
                          value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', parseInt(e.target.value) || 1)} placeholder="Qty" min={1} required />
                      </div>
                      <div className="w-32">
                        <label className="block text-[10px] font-extrabold text-slate-900 dark:text-slate-100 uppercase mb-1">Purchase Price (₹)</label>
                        <input type="number" step="any" className="w-full bg-background border border-border rounded p-2 text-xs text-right text-foreground font-mono font-bold"
                          value={item.rate} onChange={(e) => handleItemChange(idx, 'rate', parseFloat(e.target.value) || 0)} placeholder="Price (₹)" required />
                      </div>
                      <div className="w-32 text-right font-bold text-xs text-textSecondary py-2">
                        <label className="block text-[10px] font-extrabold text-slate-900 dark:text-slate-100 uppercase mb-1">Total Amount</label>
                        ₹{(item.qty * item.rate).toFixed(2)}
                      </div>
                      <button type="button" className="text-rose-500 font-bold px-2 self-end mb-2 md:self-center md:mb-0" onClick={() => handleRemoveItemRow(idx)} title="Remove row">&times;</button>
                    </div>
                  );
                })}
                </div>
              </div>

              {/* Optional Partial Payment / Vendor Dues Checkbox */}
              <div className="border-t border-border/60 pt-3 mt-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-textSecondary select-none">
                  <input 
                    type="checkbox" 
                    checked={isPartialPayment}
                    onChange={(e) => {
                      setIsPartialPayment(e.target.checked);
                      if (e.target.checked && paidAmount === 0) {
                        setPaidAmount(totalAmount);
                      }
                    }}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                  <span>Record Partial Payment / Remaining Vendor Dues</span>
                </label>

                {isPartialPayment && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-background p-3.5 rounded-xl border border-border/80 mt-2.5 animate-fade-in">
                    <div>
                      <label className="block text-xs font-bold text-emerald-400 uppercase mb-1">Amount Paid Now (₹)</label>
                      <input 
                        type="number"
                        step="any"
                        className="w-full bg-background border border-border rounded-lg p-2.5 text-sm font-mono font-bold text-foreground focus:border-emerald-500"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                        placeholder="Enter amount paid"
                        min={0}
                        max={totalAmount}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-rose-400 uppercase mb-1">Remaining Vendor Dues (₹)</label>
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 font-mono font-black text-sm">
                        ₹{dueAmount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Total Purchase Amount Bar */}
              <div className="border-t border-border pt-4 mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 bg-background p-4 rounded-xl">
                <div>
                  <span className="text-xs text-textMuted uppercase font-bold block">Total Purchase Amount</span>
                  <span className="text-xl font-mono font-black text-emerald-400">
                    ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button type="button" className="px-5 py-2.5 border border-border text-textSecondary rounded-lg text-xs font-bold hover:bg-background transition" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-lg text-xs transition shadow-md flex items-center gap-2">
                    <i className="fa-solid fa-check"></i>
                    <span>Save Purchase Bill</span>
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>,
        document.body
      )}

      {/* Quick Vendor Registration Modal */}
      {quickVendorModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-lg shadow-2xl my-auto space-y-4">
            
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Procurement Quick Registration</span>
                <h3 className="text-base font-black text-foreground uppercase mt-0.5">Register New Vendor</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setQuickVendorModalOpen(false)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-2.5 py-1 rounded-lg transition"
              >
                &times; Cancel
              </button>
            </div>

            <form onSubmit={handleQuickCreateVendor} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Supplier / Distributor Name *</label>
                <input 
                  type="text" 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground uppercase font-bold focus:border-emerald-500 focus:outline-none"
                  value={quickVendorFormData.supplier_name} 
                  onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, supplier_name: e.target.value })} 
                  placeholder="e.g. BALAJI TRADERS" 
                  required 
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Mobile Phone Number</label>
                  <input 
                    type="tel" 
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-semibold focus:border-emerald-500 focus:outline-none"
                    value={quickVendorFormData.phone} 
                    onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, phone: e.target.value })} 
                    placeholder="e.g. 9876543210" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Email ID</label>
                  <input 
                    type="email" 
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-semibold focus:border-emerald-500 focus:outline-none"
                    value={quickVendorFormData.email} 
                    onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, email: e.target.value })} 
                    placeholder="vendor@example.com" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Owner / Contact Birthday</label>
                  <input 
                    type="date" 
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-mono font-semibold focus:border-emerald-500 focus:outline-none"
                    value={quickVendorFormData.dob} 
                    onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, dob: e.target.value })} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Establishment Date</label>
                  <input 
                    type="date" 
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-mono font-semibold focus:border-emerald-500 focus:outline-none"
                    value={quickVendorFormData.establishment_date} 
                    onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, establishment_date: e.target.value })} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Office / Godown Address</label>
                <textarea 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none" 
                  rows={2}
                  value={quickVendorFormData.address} 
                  onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, address: e.target.value })} 
                  placeholder="Vendor office address..." 
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-border mt-3">
                <button 
                  type="button" 
                  onClick={() => setQuickVendorModalOpen(false)}
                  className="px-4 py-2 border border-border text-textSecondary rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-lg text-xs transition shadow-sm"
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
