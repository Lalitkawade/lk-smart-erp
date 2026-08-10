import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { useErpContext } from '../../context/ErpContext';
import { usePurchases } from '../../hooks/usePurchases';
import { SupplierService } from '../../services/supplierService';
import { InventoryService } from '../../services/inventoryService';
import { supabase } from '../../api/supabase';
import type { Product } from '../../types/erp.types';
import { t } from '../../utils/i18n';

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

export interface PurchaseBill {
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

  const { suppliers: contextSuppliers, products: contextProducts, refreshAllData } = useErpContext();
  const suppliers = contextSuppliers || [];
  const products = contextProducts || [];
  const { purchases: bills, savePurchase, deletePurchase } = usePurchases(tenantId);
  const [search, setSearch] = useState('');
  
  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [showInflowBanner, setShowInflowBanner] = useState(true);
  const [autoFilledNotice, setAutoFilledNotice] = useState<string | null>(null);
  const [viewingBill, setViewingBill] = useState<any | null>(null);

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

  // Dynamic rows of items
  const [billItems, setBillItems] = useState<Array<{ product_id: string; qty: number; rate: number }>>([
    { product_id: '', qty: 1, rate: 0 }
  ]);

  const loadTodayStockInflows = () => {
    try {
      const localP = bills || [];

      // Find ONLY unbilled stock inflows that start with 'STOCK-IN-'
      const todayInflows = localP.filter((b: any) => {
        return Boolean(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN'));
      });

      if (todayInflows.length === 0) {
        setAutoFilledNotice(null);
        return false;
      }

      const itemsMap = new Map<string, { product_id: string; qty: number; rate: number }>();
      const searchMap: Record<number, string> = {};
      let autoVendorName = '';

      todayInflows.forEach((bill: any) => {
        if (!autoVendorName && bill.supplier_name && !bill.supplier_name.includes('Direct Stock Inflow')) {
          autoVendorName = bill.supplier_name;
        }
        const lineItems = bill.items || bill.purchase_items || [];
        if (lineItems.length > 0) {
          lineItems.forEach((item: any) => {
            const rawId = item.product_id || item.product?.id;
            const rawName = item.product_name || item.product?.product_name || '';

            // Match product by ID or Name
            const matched = products.find(p => 
              (rawId && p.id === rawId) || 
              (rawName && p.product_name && p.product_name.trim().toLowerCase() === rawName.trim().toLowerCase())
            );

            const canonicalId = matched ? matched.id : (rawId || rawName);
            if (canonicalId) {
              const existing = itemsMap.get(canonicalId);
              const qty = Number(item.qty || item.quantity || 1);
              const rate = Number(item.rate || item.price || (matched ? Number(matched.purchase_price) : 0));
              if (existing) {
                existing.qty += qty;
                if (rate > 0) existing.rate = rate;
              } else {
                itemsMap.set(canonicalId, { product_id: canonicalId, qty, rate });
              }
            }
          });
        }
      });

      const itemsArray = Array.from(itemsMap.values());
      if (itemsArray.length > 0) {
        itemsArray.forEach((it, idx) => {
          const matched = products.find(p => p.id === it.product_id || (p.product_name && p.product_name.trim().toLowerCase() === it.product_id.trim().toLowerCase()));
          searchMap[idx] = matched ? matched.product_name : it.product_id;
        });

        setBillItems(itemsArray);
        setProductRowSearch(searchMap);

        // Auto select supplier if matched
        if (autoVendorName && suppliers.length > 0) {
          const matchSup = suppliers.find(s => s.supplier_name.toUpperCase().trim() === autoVendorName.toUpperCase().trim());
          if (matchSup) {
            setSupplierId(matchSup.id);
            setVendorSearchQuery(matchSup.supplier_name);
          }
        }

        setAutoFilledNotice(`⚡ Auto-loaded ${itemsArray.length} item(s) from today's stock entries! Simply enter Supplier Bill No. and click Save Purchase Bill.`);
        return true;
      }
    } catch (e) {}
    return false;
  };

  useEffect(() => {
    if (autoOpenModal) {
      handleOpenNewBillModal();
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenModal]);

  const handleOpenNewBillModal = () => {
    setBillItems([{ product_id: '', qty: 1, rate: 0 }]);
    setProductRowSearch({});
    setSupplierId('');
    setVendorSearchQuery('');
    setBillNumber('');
    setTransactionId('');
    setPaidAmount(0);
    setIsPartialPayment(false);
    setAutoFilledNotice(null);
    setModalOpen(true);
  };

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

  const todayUnbilledInflows = useMemo(() => {
    try {
      return bills.filter((b: any) => Boolean(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN')));
    } catch (e) {
      return [];
    }
  }, [bills]);

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

      const res = await SupplierService.createSupplier(payload);
      if (res.data?.id) {
        newSupplierObj.id = res.data.id;
      }
      await refreshAllData();
    } catch (e: any) {}

    setSupplierId(newSupplierObj.id);
    setQuickVendorModalOpen(false);
    setQuickVendorFormData({ supplier_name: '', phone: '', email: '', address: '', dob: '', establishment_date: '' });
    alert(`Vendor "${formattedName}" successfully registered and selected!`);
  };



  const handleAddItemRow = () => {
    setBillItems([...billItems, { product_id: '', qty: 1, rate: 0 }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    if (billItems.length === 1) return;
    setBillItems(billItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, val: string | number) => {
    setBillItems(prev => prev.map((item, i) => {
      if (i === idx) {
        const newItem = { ...item, [field]: val };
        // Auto set rate if product is selected
        if (field === 'product_id') {
          const match = products.find(p => p.id === val || (p.product_name && p.product_name.trim().toLowerCase() === String(val).trim().toLowerCase()));
          if (match) {
            newItem.product_id = match.id;
            newItem.rate = Number(match.purchase_price || 0);
            setProductRowSearch(prevSearch => ({ ...prevSearch, [idx]: match.product_name }));
          }
        }
        return newItem;
      }
      return item;
    }));
  };

  const handleSelectProduct = (idx: number, product: Product) => {
    setBillItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return {
          ...item,
          product_id: product.id,
          rate: Number(product.purchase_price || 0)
        };
      }
      return item;
    }));
    setProductRowSearch(prev => ({ ...prev, [idx]: product.product_name }));
    setOpenProductRowDropdown(null);
  };

  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Strictly resolve selected supplier from suppliers list
    const selectedSup: any = suppliers.find(s => s.id === supplierId);
    if (!selectedSup) {
      alert('⚠️ Please select a valid registered Supplier/Vendor for this Purchase Bill.');
      return;
    }

    if (!billNumber || !billNumber.trim()) {
      alert('⚠️ Please enter the Supplier Bill Number.');
      return;
    }

    const rawDate = purchaseDate ? new Date(purchaseDate) : new Date();
    const safeIsoDate = isNaN(rawDate.getTime()) ? new Date().toISOString() : rawDate.toISOString();

    const billPayload = {
      supplier_id: selectedSup.id,
      bill_number: billNumber.trim(),
      supplier_name: selectedSup.supplier_name,
      payment_mode: paymentMode,
      ref_number: transactionId.trim() || null,
      total_amount: totalAmount,
      paid_amount: effectivePaid,
      due_amount: dueAmount,
      purchase_date: safeIsoDate
    };

    const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const preparedItems: any[] = [];

    for (let idx = 0; idx < billItems.length; idx++) {
      const item = billItems[idx];
      const typedName = (productRowSearch[idx] || '').trim();
      let p = products.find(prod => prod.id === item.product_id || (prod.product_name && typedName && prod.product_name.trim().toLowerCase() === typedName.toLowerCase()));

      // Auto-register new product if user typed a new product name that doesn't exist in catalog yet
      if (!p && typedName) {
        try {
          const newProdPayload = {
            tenant_id: tenantId,
            product_name: typedName.toUpperCase(),
            unit: 'Nos',
            p_unit: 'Box',
            s_unit: 'Nos',
            pieces_per_pack: 1,
            purchase_price: Number(item.rate || 0),
            selling_price: Number(item.rate || 0) * 1.2,
            current_stock: 0,
            status: 'Active'
          };
          const { data: createdProd } = await supabase.from('products').insert([newProdPayload as any]).select().single();
          if (createdProd?.id) {
            p = createdProd as any;
          }
        } catch (err) {}
      }

      preparedItems.push({
        product_id: p && isValidUUID(p.id) ? p.id : null,
        product_name: p?.product_name || typedName || 'Procured Material Item',
        hsn: p?.hsn || null,
        gst_percent: Number(p?.gst || 18),
        qty: Number(item.qty || 1),
        rate: Number(item.rate || 0),
        amount: Number(item.qty || 1) * Number(item.rate || 0)
      });
    }

    try {
      const isStockInflowConversion = autoFilledNotice !== null;
      await savePurchase(billPayload as any, preparedItems);

      if (isStockInflowConversion) {
        // Clean up temporary stock-in placeholder entries
        await supabase.from('purchase_bills').delete().ilike('bill_number', 'STOCK-IN%');
      } else {
        // Update product stock via central InventoryService for new purchase bills
        await InventoryService.addStockForPurchase(preparedItems);
      }

      // Update supplier outstanding via SupplierService
      if (dueAmount > 0 && selectedSup?.id) {
        await SupplierService.updateSupplier(selectedSup.id, { outstanding: Number(selectedSup.outstanding || 0) + dueAmount });
      }

      await refreshAllData();
    } catch (err: any) {
      alert('⚠️ Purchase bill save failed: ' + (err.message || err));
      return;
    }

    setModalOpen(false);
    setBillItems([{ product_id: '', qty: 1, rate: 0 }]);
    setProductRowSearch({});
    setSupplierId('');
    setVendorSearchQuery('');
    setBillNumber('');
    setTransactionId('');
    setPaidAmount(0);
    setIsPartialPayment(false);
    setAutoFilledNotice(null);
    alert('Procurement Bill successfully saved! Stock levels incremented and vendor ledgers adjusted.');
  };

  const [vendorFilter, setVendorFilter] = useState<string>('ALL');

  // Filter Purchase Bills directly from purchase_bills table
  const filteredBills = useMemo(() => {
    const q = search.trim().toLowerCase();
    const vFilter = vendorFilter.toUpperCase().trim();

    return (bills || []).filter((b: any) => {
      const supName = (b.supplier_name || '').toUpperCase().trim();
      const matchedVendor = suppliers.find(s => s.id === b.supplier_id);
      const matchedVendorName = matchedVendor ? (matchedVendor.supplier_name || '').toUpperCase().trim() : '';

      const passesVendor = (vFilter === 'ALL') || (supName === vFilter) || (matchedVendorName === vFilter);
      if (!passesVendor) return false;

      if (!q) return true;

      const bNum = (b.bill_number || b.id || '').toLowerCase();
      const items = b.items || b.purchase_items || [];
      const itemNamesMatch = items.some((it: any) => 
        (it.product_name && String(it.product_name).toLowerCase().includes(q)) ||
        (it.product?.product_name && String(it.product.product_name).toLowerCase().includes(q))
      );

      return bNum.includes(q) || supName.toLowerCase().includes(q) || itemNamesMatch;
    });
  }, [bills, search, vendorFilter, suppliers]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6 bg-secondary border border-border p-4 sm:p-6 rounded-xl shadow-md">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t('purchaseBills')}</h2>
          <p className="text-xs text-textMuted mt-1">Log supplier purchase bills and manage material receipts</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={handleOpenNewBillModal}>
          + {t('newPurchaseBill')}
        </button>
      </div>

      {showInflowBanner && todayUnbilledInflows.length > 0 && (
        <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-primary/10 border border-blue-500/30 p-4 rounded-xl shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base shrink-0">
              <i className="fa-solid fa-bolt text-amber-400"></i>
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-foreground">Today's Stock Additions Ready for Billing</h4>
              <p className="text-[11px] text-textMuted mt-0.5">Found stock inflows logged today. Auto-fill them directly into a new purchase bill with 1 click.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={() => {
                setModalOpen(true);
                setTimeout(loadTodayStockInflows, 50);
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-lg shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <i className="fa-solid fa-bolt text-amber-300"></i> Create Purchase Bill with Today's Items
            </button>
            <button
              type="button"
              title="Dismiss stock inflow banner"
              onClick={() => setShowInflowBanner(false)}
              className="px-2.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg transition cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4 bg-background border border-border p-3 rounded-xl">
        <div className="w-full sm:w-1/2">
          <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-lg p-2.5 text-xs focus:outline-none focus:border-primary font-semibold"
            placeholder="Search by Bill No., Vendor Supplier name, or item name..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full sm:w-auto flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Filter Vendor:</span>
          <select
            className="bg-secondary border border-border rounded-lg p-2 text-xs font-bold text-foreground focus:outline-none cursor-pointer"
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
          >
            <option value="ALL">All Vendors ({suppliers.length})</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.supplier_name}>{s.supplier_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Bill No. & Date</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Vendor Supplier</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Items Count</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Total Amount (₹)</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Paid Amount (₹)</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Outstanding Dues (₹)</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Status & Mode</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredBills.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-medium">
                  <i className="fa-solid fa-cart-flatbed text-2xl text-slate-400 mb-2 block"></i>
                  No matching purchase bills found.
                </td>
              </tr>
            ) : filteredBills.map((b: any) => {
              const rawDate = new Date(b.purchase_date || b.created_at || Date.now());
              const formattedDate = isNaN(rawDate.getTime()) ? 'N/A' : rawDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              const items = b.items || b.purchase_items || [];
              const totalAmt = Number(b.total_amount || 0);
              const paidAmt = Number(b.paid_amount || 0);
              const dueAmt = Number(b.due_amount || 0);
              const isPaid = dueAmt <= 0;

              return (
                <tr 
                  key={b.id || b.bill_number} 
                  onClick={() => setViewingBill(b)}
                  className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800 cursor-pointer"
                  title="Click to view complete purchase receipt details"
                >
                  <td className="py-2.5 px-3 text-center font-mono text-xs">
                    <div className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">{b.bill_number || b.id}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{formattedDate}</div>
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">
                    {b.supplier_name || 'Vendor Supplier'}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-extrabold px-2.5 py-1 rounded-xl text-xs">
                      <i className="fa-solid fa-boxes-stacked text-[11px]"></i>
                      <span>{items.length || 1} {items.length === 1 ? 'Item' : 'Items'}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs font-mono font-black text-slate-900 dark:text-slate-100">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2.5 px-3 text-center text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{paidAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2.5 px-3 text-center text-xs font-mono font-bold text-rose-600 dark:text-rose-400">₹{dueAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2.5 px-3 text-center text-xs">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase border ${
                      isPaid
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 border-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 border-rose-300'
                    }`}>
                      {isPaid ? `Paid (${b.payment_mode || 'Cash'})` : `Dues ₹${dueAmt.toFixed(0)}`}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs flex items-center justify-center gap-1.5">
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingBill(b);
                      }}
                      className="px-2 py-1 bg-primary/10 hover:bg-primary text-primary hover:text-white font-extrabold text-xs rounded-lg border border-primary/30 transition cursor-pointer flex items-center gap-1"
                    >
                      <i className="fa-solid fa-eye text-[10px]"></i> View
                    </button>
                    <button 
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const bNum = b.bill_number || b.id;
                        if (!window.confirm(`Are you sure you want to delete Procurement Bill ${bNum}? This action cannot be undone.`)) return;
                        try {
                          await deletePurchase(b.id);
                          alert('✓ Procurement Bill successfully deleted.');
                        } catch (err: any) {
                          alert('Failed to delete procurement bill: ' + (err.message || err));
                        }
                      }}
                      className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white font-extrabold text-xs rounded-lg border border-rose-500/30 transition cursor-pointer flex items-center gap-1"
                    >
                      <i className="fa-solid fa-trash-can text-[10px]"></i> Delete
                    </button>
                  </td>
                </tr>
              );
            })}
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
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Procurement Desk</span>
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
              
              {/* Auto-filled notice banner */}
              {autoFilledNotice ? (
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-bolt text-amber-400 text-sm"></i>
                    <span>{autoFilledNotice}</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setAutoFilledNotice(null)}
                    className="text-[10px] underline font-extrabold hover:text-foreground cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              ) : todayUnbilledInflows.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-bolt text-amber-400 text-sm"></i>
                    <span>Found {todayUnbilledInflows.length} unbilled stock inflow(s) logged today!</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={loadTodayStockInflows}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-md shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1"
                  >
                    ⚡ Auto-load Today's Items
                  </button>
                </div>
              )}

              {/* Supplier and info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-textSecondary font-semibold">Select Supplier / Vendor *</label>
                    <button 
                      type="button" 
                      onClick={() => setQuickVendorModalOpen(true)}
                      className="text-[11px] text-primary hover:text-primary/80 font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                    >
                      ➕ Quick Register Vendor
                    </button>
                  </div>

                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-bold uppercase focus:border-primary focus:outline-none pr-8"
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
                              className="px-3 py-1.5 bg-primary/20 text-primary font-extrabold text-xs rounded-lg border border-primary/30 transition hover:bg-primary/30 cursor-pointer"
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
                              className={`p-2.5 hover:bg-background/80 cursor-pointer flex justify-between items-center transition ${supplierId === s.id ? 'bg-primary/10 font-black text-primary' : 'text-foreground'}`}
                            >
                              <div className="space-y-0.5">
                                <div className="text-xs font-bold uppercase">{s.supplier_name}</div>
                                <div className="text-[10px] text-textMuted">Phone: {s.phone || 'N/A'} {s.outstanding ? `| Outstanding Dues: ₹${Number(s.outstanding).toFixed(2)}` : ''}</div>
                              </div>
                              {supplierId === s.id && <span className="text-primary font-bold text-xs">✓ Selected</span>}
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
                  <div className="col-span-1 md:col-span-4 animate-fade-in bg-slate-900/60 p-3 rounded-xl border border-primary/40 space-y-1">
                    <label className="block text-xs text-primary font-extrabold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 uppercase tracking-wide">
                        <i className="fa-solid fa-receipt text-primary"></i> Transaction ID / UTR / Reference No.
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
                    <p className="text-[10px] text-textMuted font-medium">Record payment transaction reference number for vendor GPay, UPI, or Credit Card entries.</p>
                  </div>
                )}
              </div>

              {/* Items row adder */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-textSecondary uppercase tracking-wider">Product Inventory Procured</h4>
                  <div className="flex items-center gap-3">
                    <button 
                      type="button" 
                      onClick={loadTodayStockInflows}
                      className="text-xs text-blue-600 dark:text-blue-400 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                      title="Auto-fill items added to stock today"
                    >
                      <i className="fa-solid fa-bolt text-amber-400"></i> Auto-Fill Today's Inflows
                    </button>
                    <button type="button" className="text-xs text-primary hover:text-primary/80 font-bold cursor-pointer" onClick={handleAddItemRow}>
                      + Add Product Line
                    </button>
                  </div>
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
                              className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-bold uppercase focus:border-primary focus:outline-none pr-7"
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
                                <div className="p-3 text-center text-xs space-y-2">
                                  <p className="text-textMuted font-medium">No matching products found in catalog for "{productRowSearch[idx]}".</p>
                                  {productRowSearch[idx] && productRowSearch[idx].trim() && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const rawName = productRowSearch[idx].trim().toUpperCase();
                                        try {
                                          const newProdPayload = {
                                            tenant_id: tenantId,
                                            product_name: rawName,
                                            unit: 'Nos',
                                            p_unit: 'Box',
                                            s_unit: 'Nos',
                                            pieces_per_pack: 1,
                                            purchase_price: Number(billItems[idx]?.rate || 0),
                                            selling_price: Number(billItems[idx]?.rate || 0) * 1.2,
                                            current_stock: 0,
                                            status: 'Active'
                                          };
                                          const { data: createdProd } = await supabase.from('products').insert([newProdPayload as any]).select().single();
                                          if (createdProd) {
                                            handleSelectProduct(idx, createdProd as any);
                                            await refreshAllData();
                                          }
                                        } catch (e: any) {
                                          alert('Error creating product: ' + e.message);
                                        }
                                      }}
                                      className="px-3 py-1.5 bg-primary/20 text-primary font-extrabold text-xs rounded-lg border border-primary/30 transition hover:bg-primary/30 cursor-pointer"
                                    >
                                      ➕ Register "{productRowSearch[idx].trim().toUpperCase()}" in Product Catalog
                                    </button>
                                  )}
                                </div>
                              ) : (
                                filteredProdsForRow.map((p) => (
                                  <div
                                    key={p.id}
                                    onClick={() => handleSelectProduct(idx, p)}
                                    className={`p-2.5 hover:bg-background/80 cursor-pointer flex justify-between items-center transition ${item.product_id === p.id ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'}`}
                                  >
                                    <div>
                                      <div className="text-xs font-bold uppercase">{p.product_name}</div>
                                      <div className="text-[10px] text-textMuted font-semibold">
                                        Stock: <span className="font-bold text-foreground">{p.current_stock}</span> {p.s_unit || p.unit || 'Pcs'} | Cost: ₹{Number(p.purchase_price || 0).toFixed(2)}
                                      </div>
                                    </div>
                                    {item.product_id === p.id && <span className="text-primary text-xs font-bold">✓ Selected</span>}
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
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                  <span>Record Partial Payment / Remaining Vendor Dues</span>
                </label>

                {isPartialPayment && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-background p-3.5 rounded-xl border border-border/80 mt-2.5 animate-fade-in">
                    <div>
                      <label className="block text-xs font-bold text-primary uppercase mb-1">Amount Paid Now (₹)</label>
                      <input 
                        type="number"
                        step="any"
                        className="w-full bg-background border border-border rounded-lg p-2.5 text-sm font-mono font-bold text-foreground focus:border-primary"
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
                  <span className="text-xl font-mono font-black text-primary">
                    ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button type="button" className="px-5 py-2.5 border border-border text-textSecondary rounded-lg text-xs font-bold hover:bg-background transition" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md flex items-center gap-2 cursor-pointer">
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
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Procurement Quick Registration</span>
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
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground uppercase font-bold focus:border-primary focus:outline-none"
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
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-semibold focus:border-primary focus:outline-none"
                    value={quickVendorFormData.phone} 
                    onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, phone: e.target.value })} 
                    placeholder="e.g. 9876543210" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Email ID</label>
                  <input 
                    type="email" 
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-semibold focus:border-primary focus:outline-none"
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
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-mono font-semibold focus:border-primary focus:outline-none"
                    value={quickVendorFormData.dob} 
                    onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, dob: e.target.value })} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Establishment Date</label>
                  <input 
                    type="date" 
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground font-mono font-semibold focus:border-primary focus:outline-none"
                    value={quickVendorFormData.establishment_date} 
                    onChange={(e) => setQuickVendorFormData({ ...quickVendorFormData, establishment_date: e.target.value })} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Office / Godown Address</label>
                <textarea 
                  className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground focus:border-primary focus:outline-none" 
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

      {/* Purchase Bill Details Modal */}
      {viewingBill && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-2xl shadow-2xl my-auto space-y-6">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-border/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 border border-primary/30 text-primary rounded-2xl flex items-center justify-center text-xl font-bold">
                  <i className="fa-solid fa-file-invoice"></i>
                </div>
                <div>
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest block">Procurement Receipt</span>
                  <h3 className="text-xl font-black text-foreground uppercase tracking-tight">{viewingBill.bill_number || viewingBill.id}</h3>
                  <p className="text-xs text-textMuted font-medium">{new Date(viewingBill.purchase_date || viewingBill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setViewingBill(null)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition"
              >
                &times; Close
              </button>
            </div>

            {/* Vendor & Payment Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-background/60 p-4 rounded-xl border border-border text-xs">
              <div>
                <span className="text-[10px] font-bold text-textMuted uppercase block">Vendor / Supplier</span>
                <span className="font-extrabold text-foreground uppercase">{viewingBill.supplier_name || 'Vendor Supplier'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-textMuted uppercase block">Payment Channel</span>
                <span className="font-bold text-primary">{viewingBill.payment_mode || 'Cash'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-textMuted uppercase block">Reference / UTR</span>
                <span className="font-mono font-bold text-foreground">{viewingBill.transaction_id || viewingBill.ref_number || 'N/A'}</span>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-textSecondary uppercase tracking-wider">Procured Line Items</h4>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-background/80 text-textSecondary font-black uppercase text-[10px] border-b border-border">
                    <tr>
                      <th className="p-2.5">HSN Code</th>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Rate (₹)</th>
                      <th className="p-2.5 text-center">GST %</th>
                      <th className="p-2.5 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {(viewingBill.items || viewingBill.purchase_items || []).map((it: any, i: number) => {
                      const itemName = it.product_name || it.product?.product_name || 'Procured Material Item';
                      const hsnCode = it.hsn || it.product?.hsn || '-';
                      const gstRate = Number(it.gst_percent ?? it.product?.gst ?? 18);
                      const lineAmt = Number(it.amount || (Number(it.qty || 1) * Number(it.rate || 0)));

                      return (
                        <tr key={i} className="hover:bg-background/30">
                          <td className="p-2.5 font-mono text-[11px] font-semibold text-textMuted">{hsnCode}</td>
                          <td className="p-2.5 font-bold uppercase">{itemName}</td>
                          <td className="p-2.5 text-center font-mono font-bold">{it.qty || 1}</td>
                          <td className="p-2.5 text-right font-mono">₹{Number(it.rate || 0).toFixed(2)}</td>
                          <td className="p-2.5 text-center font-mono text-xs">{gstRate}%</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{lineAmt.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Procurement Cost</span>
                <span className="text-lg font-black text-emerald-400">₹{Number(viewingBill.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={async () => {
                    const bNum = viewingBill.bill_number || viewingBill.id;
                    if (!window.confirm(`Are you sure you want to delete Procurement Bill ${bNum}? This action cannot be undone.`)) return;
                    try {
                      await deletePurchase(viewingBill.id);
                      setViewingBill(null);
                      alert('✓ Procurement Bill successfully deleted.');
                    } catch (err: any) {
                      alert('Failed to delete procurement bill: ' + (err.message || err));
                    }
                  }}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-trash-can text-[10px]"></i> Delete Bill
                </button>
                <button 
                  type="button" 
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-print"></i> Print Receipt
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
