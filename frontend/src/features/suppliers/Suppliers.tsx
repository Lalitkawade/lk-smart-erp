import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { useErpContext } from '../../context/ErpContext';
import { useSuppliers } from '../../hooks/useSuppliers';
import { PaymentService } from '../../services/paymentService';
import { t } from '../../utils/i18n';

interface Supplier {
  id: string;
  supplier_code?: string | null;
  supplier_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  establishment_date?: string | null;
  due_date?: string | null;
  outstanding: number;
  initial_outstanding?: number;
  gst_number?: string | null;
  created_at: string;
}

interface SupplierPaymentRecord {
  id: string;
  supplier_id: string;
  amount: number;
  payment_mode: string;
  ref_number: string;
  payment_date: string;
}

interface SuppliersProps {
  autoOpenModal?: boolean;
  onModalClosed?: () => void;
}

export default function Suppliers({ autoOpenModal, onModalClosed }: SuppliersProps = {}) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || 'default-hardware-erp';
  const { suppliers, isLoading, saveSupplier, deleteSupplier } = useSuppliers(tenantId);

  const { supplierPayments: contextSupplierPayments, purchases: contextPurchases, refreshAllData } = useErpContext();
  const payments: SupplierPaymentRecord[] = contextSupplierPayments || [];

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'payables'>('all');
  
  // Modals Control
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (autoOpenModal) {
      handleOpenAdd();
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenModal]);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  // Statement Modal
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    supplier_name: '',
    phone: '',
    email: '',
    address: '',
    dob: '',
    establishment_date: '',
    gst_number: '',
    outstanding: 0
  });

  // Pay Supplier Form
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payFormData, setPayFormData] = useState({
    supplier_id: '',
    amount: 0,
    payment_mode: 'Cash',
    ref_number: ''
  });



  const [phoneError, setPhoneError] = useState<string | null>(null);

  const formatDateForInput = (dateVal?: string | null) => {
    if (!dateVal) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
    if (dateVal.includes('T')) return dateVal.split('T')[0];
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setPhoneError(null);
    setFormData({
      supplier_name: '',
      phone: '',
      email: '',
      address: '',
      dob: '',
      establishment_date: '',
      gst_number: '',
      outstanding: 0
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setPhoneError(null);
    setFormData({
      supplier_name: s.supplier_name,
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      dob: formatDateForInput(s.dob),
      establishment_date: formatDateForInput(s.establishment_date),
      gst_number: s.gst_number || '',
      outstanding: Number(s.outstanding || 0)
    });
    setModalOpen(true);
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    if (!formData.supplier_name.trim()) return;

    if (formData.phone.trim()) {
      const cleanPhone = formData.phone.trim().replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        const msg = '⚠️ Phone number must be compulsory 10 digits!';
        setPhoneError(msg);
        triggerToast(msg);
        return;
      }
    }

    const formattedName = formData.supplier_name.trim().toUpperCase();

    const supplierPayload = {
      ...(editingSupplier?.id ? { id: editingSupplier.id } : {}),
      supplier_name: formattedName,
      phone: formData.phone || '',
      email: formData.email || '',
      address: formData.address || '',
      dob: formData.dob || '',
      establishment_date: formData.establishment_date || '',
      gst_number: formData.gst_number || null,
      outstanding: Number(formData.outstanding || 0),
      created_at: editingSupplier?.created_at
    };
    
    console.log('--- DEBUG --- Supplier Component Payload:', supplierPayload);

    try {
      await saveSupplier(supplierPayload);
      setModalOpen(false);
      triggerToast('✅ Supplier profile saved successfully!');
    } catch (e: any) {
      setPhoneError(e.message || 'Failed to save supplier profile.');
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('Delete this supplier profile account?')) return;
    try {
      await deleteSupplier(id);
      triggerToast('✓ Supplier profile deleted.');
    } catch (e: any) {
      alert('Failed to delete supplier profile: ' + e.message);
    }
  };

  const handleOpenPayModal = (s: Supplier) => {
    setPayFormData({
      supplier_id: s.id,
      amount: Number(s.outstanding || 0),
      payment_mode: 'Bank Transfer',
      ref_number: ''
    });
    setPayModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payFormData.amount <= 0) return;

    try {
      const targetSupplier = suppliers.find(s => s.id === payFormData.supplier_id);
      if (!targetSupplier) return;

      const paidAmt = Number(payFormData.amount);
      const newOutstanding = Math.max(0, Number(targetSupplier.outstanding || 0) - paidAmt);

      const nowIso = new Date().toISOString();

      setPayModalOpen(false);
      triggerToast(`✓ Logged payout of ₹${paidAmt.toFixed(2)} to ${targetSupplier.supplier_name}! Remaining dues: ₹${newOutstanding.toFixed(2)}`);

      try {
        await PaymentService.recordSupplierPayment({
          tenant_id: tenantId,
          supplier_id: targetSupplier.id,
          amount: paidAmt,
          payment_mode: payFormData.payment_mode,
          ref_number: payFormData.ref_number.trim() || 'DIR-REC',
          payment_date: nowIso
        });
        await refreshAllData();
      } catch (e) {
        console.warn('Background supplier payment note:', e);
      }
    } catch (e: any) {
      alert('Failed to record payment: ' + e.message);
    }
  };

  // Date & Time Formatter for Ledger Entries
  const formatLedgerDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const hasTime = dateStr.includes('T') || dateStr.includes(':');
    const datePart = d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    if (!hasTime) return datePart;

    const timePart = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    return `${datePart}, ${timePart}`;
  };

  // Compile supplier ledger entries (Purchases vs payments) with Line-by-Line Running Balance
  const statementLedger = useMemo(() => {
    if (!statementSupplier) return { items: [], summary: { totalBilled: 0, totalPaid: 0, netBalance: 0 } };

    const nameKey = (statementSupplier.supplier_name || '').trim().toUpperCase();
    const allPurchs: any[] = contextPurchases || [];

    // 1. Get all purchase bills for this supplier
    const supplierPurchs = allPurchs.filter(p => {
      const suppName = (p.supplier_name || '').trim().toUpperCase();
      return (p.supplier_id && p.supplier_id === statementSupplier.id) || (suppName && suppName === nameKey);
    });

    // 2. Get all payout records for this supplier
    const supplierPayments = (payments || []).filter(p => {
      const pSuppName = ((p as any).supplier_name || '').trim().toUpperCase();
      return (p.supplier_id && p.supplier_id === statementSupplier.id) || (pSuppName && pSuppName === nameKey);
    });

    const events: Array<{
      date: string;
      type: string;
      ref: string;
      debit: number; // Bill Add (Increases Accounts Payable)
      credit: number; // Payment / Settlement (Decreases Accounts Payable)
      mode: string;
      notes: string;
    }> = [];

    // Add Opening Balance!
    const openingBalance = Number(statementSupplier.outstanding || 0);
    if (openingBalance > 0) {
      events.push({
        date: statementSupplier.created_at || new Date().toISOString(),
        type: 'Opening Balance',
        ref: 'OPENING',
        debit: openingBalance,
        credit: 0,
        mode: '-',
        notes: 'Initial account balance'
      });
    }

    // A. Add Procurement Bills and Upfront Checkout Payments
    supplierPurchs.forEach(pb => {
      const billDate = pb.purchase_date || pb.created_at || new Date().toISOString();
      const totalAmt = Number(pb.total_amount || 0);
      const paidAmt = Number(pb.paid_amount || 0);
      const billNo = (pb.bill_number && pb.bill_number !== 'N/A' && !pb.bill_number.toLowerCase().startsWith('pb-'))
        ? pb.bill_number
        : `PB-${(pb.id || '').slice(0, 6)}`;

      // Entry 1: Procurement Bill (Increases Payable / Debit)
      events.push({
        date: billDate,
        type: 'Procurement Bill',
        ref: billNo,
        debit: totalAmt,
        credit: 0,
        mode: pb.payment_mode || 'Credit',
        notes: `Procurement Purchase Bill #${billNo}`
      });

      // Entry 2: Upfront Payment at Checkout (Decreases Payable / Credit)
      if (paidAmt > 0) {
        const checkoutPaymentDate = new Date(new Date(billDate).getTime() + 1000).toISOString();
        events.push({
          date: checkoutPaymentDate,
          type: `Bill Payment (${pb.payment_mode || 'Cash'})`,
          ref: billNo,
          debit: 0,
          credit: paidAmt,
          mode: pb.payment_mode || 'Cash',
          notes: `Upfront payment for Bill #${billNo}`
        });
      }
    });

    // B. Add Vendor Settlement Payout Vouchers
    supplierPayments.forEach(p => {
      const pDate = p.payment_date || (p as any).created_at || new Date().toISOString();
      events.push({
        date: pDate,
        type: `Vendor Settlement Voucher (${p.payment_mode || 'Cash'})`,
        ref: p.ref_number || 'Cash Voucher',
        debit: 0,
        credit: Number(p.amount || 0),
        mode: p.payment_mode || 'Cash',
        notes: `Payout Settlement Ref: ${p.ref_number || 'Cash'}`
      });
    });

    // C. Sort events chronologically by date/time
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // D. Calculate Line-by-Line Running Balance
    let totalBilled = 0;
    let totalPaid = 0;
    events.forEach(ev => {
      totalBilled += ev.debit;
      totalPaid += ev.credit;
    });

    const initialBalance = Number(statementSupplier.outstanding || 0);

    let currentBalance = initialBalance;
    const items = events.map(ev => {
      currentBalance = currentBalance + ev.debit - ev.credit;
      return {
        ...ev,
        runningBalance: Math.max(0, currentBalance)
      };
    });

    if (initialBalance !== 0 || events.length === 0) {
      items.unshift({
        date: statementSupplier.created_at || new Date().toISOString(),
        type: 'Opening Balance',
        ref: 'OPENING',
        debit: initialBalance > 0 ? initialBalance : 0,
        credit: initialBalance < 0 ? Math.abs(initialBalance) : 0,
        mode: '-',
        notes: 'Manually set or historical opening balance',
        runningBalance: initialBalance
      });
    }

    return {
      items,
      summary: {
        totalBilled,
        totalPaid,
        netBalance: Math.max(0, currentBalance)
      }
    };
  }, [statementSupplier, contextPurchases, payments]);

  // Pre-calculate per-supplier stats (total purchases, total paid, realtime outstanding, last purchase date, last payment date)
  const supplierStatsMap = useMemo(() => {
    const map = new Map<string, { 
      totalPurchases: number; 
      totalPaid: number;
      realtimeOutstanding: number;
      lastPurchaseDate: string | null; 
      lastPaymentDate: string | null;
      earliestDueDate: string | null;
    }>();

    const allPurchs: any[] = contextPurchases || [];

    suppliers.forEach(s => {
      const nameKey = (s.supplier_name || '').toUpperCase().trim();
      const suppBills = allPurchs.filter(b => 
        (b.supplier_id && b.supplier_id === s.id) ||
        (b.supplier_name && b.supplier_name.toUpperCase().trim() === nameKey)
      );
      const suppPays = payments.filter(p => 
        p.supplier_id === s.id ||
        ((p as any).supplier_name && (p as any).supplier_name.toUpperCase().trim() === nameKey)
      );

      const totalPurch = suppBills.reduce((acc, b) => acc + Number(b.total_amount || 0), 0);
      const totalBillPaid = suppBills.reduce((acc, b) => acc + Number(b.paid_amount || 0), 0);
      const totalVoucherPaid = suppPays.reduce((acc, p) => acc + Number(p.amount || 0), 0);
      const totalPaid = totalBillPaid + totalVoucherPaid;

      const realtimeOutstanding = Number(s.outstanding || 0) + totalPurch - totalPaid;

      let earliestDueDate: string | null = null;
      console.log(`[DEBUG SUPPLIER DUE DATE] Evaluating supplier: ${s.supplier_name}`);
      suppBills.forEach(b => {
        const amtDue = Number(b.total_amount || 0) - Number(b.paid_amount || 0);
        console.log(`  - Bill: ${b.bill_number} | Due Amt: ${amtDue} | Raw due_date: ${b.due_date}`);
      });

      suppBills.filter(b => (Number(b.total_amount || 0) - Number(b.paid_amount || 0)) > 0 && b.due_date).forEach(b => {
        if (!earliestDueDate || new Date(b.due_date) < new Date(earliestDueDate)) {
          earliestDueDate = b.due_date;
        }
      });

      let lastPurchDate: string | null = null;
      if (suppBills.length > 0) {
        const sorted = [...suppBills].sort((a, b) => new Date(b.purchase_date || b.created_at || 0).getTime() - new Date(a.purchase_date || a.created_at || 0).getTime());
        lastPurchDate = sorted[0].purchase_date || sorted[0].created_at || null;
      }

      let lastPayDate: string | null = null;
      if (suppPays.length > 0) {
        const sortedP = [...suppPays].sort((a, b) => new Date(b.payment_date || (b as any).created_at || 0).getTime() - new Date(a.payment_date || (a as any).created_at || 0).getTime());
        lastPayDate = sortedP[0].payment_date || (sortedP[0] as any).created_at || null;
      }

      map.set(s.id, {
        totalPurchases: totalPurch,
        totalPaid,
        realtimeOutstanding,
        lastPurchaseDate: lastPurchDate,
        lastPaymentDate: lastPayDate,
        earliestDueDate
      });
    });

    return map;
  }, [suppliers, contextPurchases, payments]);

  const chronologicalSuppliers = useMemo(() => {
    return [...suppliers].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
    });
  }, [suppliers]);

  const getVendorCode = (s: Supplier, idx?: number) => {
    if ((s as any).supplier_code) return (s as any).supplier_code;
    if (s.id && s.id.startsWith('VND-')) return s.id;
    if (typeof idx === 'number') {
      return `VND-${String(idx + 1).padStart(3, '0')}`;
    }
    const numMatch = s.id ? s.id.match(/\d+/) : null;
    const num = numMatch ? numMatch[0].slice(-3) : '001';
    return `VND-${num.padStart(3, '0')}`;
  };

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s, idx) => {
      const stats = supplierStatsMap.get(s.id) || { realtimeOutstanding: Number(s.outstanding || 0) };
      if (filterTab === 'payables' && stats.realtimeOutstanding <= 0) return false;

      const name = s.supplier_name || '';
      const phone = s.phone || '';
      const chronologicalIdx = chronologicalSuppliers.findIndex(cs => cs.id === s.id);
      const code = getVendorCode(s, chronologicalIdx).toLowerCase();
      return (
        name.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search) ||
        code.includes(search.toLowerCase())
      );
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [suppliers, search, filterTab, supplierStatsMap]);

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Floating Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-5 py-2.5 rounded-full font-extrabold text-xs shadow-2xl flex items-center gap-2 border border-primary/30 animate-bounce">
          <i className="fa-solid fa-bolt text-sm text-amber-300"></i>
          <span>{toastMessage}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6 bg-secondary border border-border p-4 sm:p-6 rounded-xl shadow-md">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t('vendorManagement')}</h2>
          <p className="text-xs text-textMuted mt-1">Manage vendor contact profiles, credit statements, and payment ledgers</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={handleOpenAdd}>
          + {t('addVendor')}
        </button>
      </div>

      {/* Filter Tabs Bar - Equal 2-Column Side-by-Side Grid */}
      <div className="grid grid-cols-2 gap-2 border-b border-border text-xs font-bold mb-4">
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          className={`w-full py-2.5 px-2 rounded-t-xl transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${filterTab === 'all' ? 'bg-secondary border-t-2 border-x border-primary text-primary font-extrabold shadow-2xs' : 'bg-background/50 border-t border-x border-border text-textMuted hover:text-foreground'}`}
        >
          <span className="truncate">👥 All Vendors</span>
          <span className="bg-background px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono shrink-0">{suppliers.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('payables')}
          className={`w-full py-2.5 px-2 rounded-t-xl transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${filterTab === 'payables' ? 'bg-secondary border-t-2 border-x border-rose-500 text-rose-500 font-extrabold shadow-2xs' : 'bg-background/50 border-t border-x border-border text-textMuted hover:text-foreground'}`}
        >
          <span className="truncate">⚠️ Pending Payables</span>
          <span className="bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0">
            {suppliers.filter(s => (supplierStatsMap.get(s.id)?.realtimeOutstanding || Number(s.outstanding || 0)) > 0).length}
          </span>
        </button>
      </div>

      <div className="mb-4">
        <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-xl p-3 text-sm focus:outline-none focus:border-primary font-semibold shadow-inner"
          placeholder="Search by vendor name, code (VND-001) or contact number..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Vendor ID</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Vendor Name</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Phone</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Purchases</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Pending Payable</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Earliest Due</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Last Buy</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Last Paid</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Status</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading && suppliers.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-medium">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-solid fa-circle-notch fa-spin text-2xl text-primary"></i>
                    <span>Loading vendor accounts & ledger records...</span>
                  </div>
                </td>
              </tr>
            ) : filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-400 text-xs font-medium">
                  <i className="fa-solid fa-truck-ramp-box text-2xl text-slate-400 mb-2 block"></i>
                  No matching vendor records found.
                </td>
              </tr>
            ) : filteredSuppliers.map((s) => {
              const chronologicalIdx = chronologicalSuppliers.findIndex(cs => cs.id === s.id);
              const code = getVendorCode(s, chronologicalIdx);
              const stats = supplierStatsMap.get(s.id) || { totalPurchases: 0, realtimeOutstanding: Number(s.outstanding || 0), lastPurchaseDate: null, lastPaymentDate: null, earliestDueDate: null };
              const hasPayable = stats.realtimeOutstanding > 0;

              return (
                <tr key={s.id} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                  <td className="py-3.5 px-4 text-center">
                    <span className="font-mono text-[11px] font-extrabold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md inline-block">
                      {code}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span className="font-bold text-slate-900 dark:text-slate-100 uppercase text-xs">
                        {s.supplier_name}
                      </span>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">{s.address || 'No office address'}</div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    {s.phone ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{s.phone}</span>
                        <a 
                          href={`tel:${s.phone}`} 
                          className="w-6 h-6 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white rounded-md flex items-center justify-center transition shadow-xs active:scale-95 cursor-pointer shrink-0" 
                          title={`Call ${s.supplier_name} (${s.phone})`}
                        >
                          <i className="fa-solid fa-phone text-[10px]"></i>
                        </a>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">
                    ₹{stats.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono text-xs">
                    <span className={`font-bold inline-block px-2.5 py-0.5 rounded-lg ${hasPayable ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
                      ₹{stats.realtimeOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    {stats.earliestDueDate && hasPayable ? new Date(stats.earliestDueDate).toLocaleDateString('en-IN') : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-mono text-slate-600 dark:text-slate-300">
                    {stats.lastPurchaseDate ? new Date(stats.lastPurchaseDate).toLocaleDateString('en-IN') : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-mono text-slate-600 dark:text-slate-300">
                    {stats.lastPaymentDate ? new Date(stats.lastPaymentDate).toLocaleDateString('en-IN') : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border inline-block ${hasPayable ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'}`}>
                      {hasPayable ? '⚠️ Pending' : '✓ Clean'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex flex-col items-center justify-center gap-1.5 min-w-[180px] max-w-[240px] mx-auto">
                      {hasPayable && (
                        <button 
                          className="w-full text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-black py-1 px-2 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                          onClick={() => handleOpenPayModal(s)}
                          title={`Record payout to vendor (₹${stats.realtimeOutstanding.toFixed(2)})`}
                        >
                          <i className="fa-solid fa-hand-holding-dollar"></i> Pay Vendor (₹{stats.realtimeOutstanding.toLocaleString()})
                        </button>
                      )}
                      <div className="flex items-center justify-center gap-2 w-full">
                        <button 
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500/10 hover:bg-purple-600 hover:text-white border border-purple-500/30 text-purple-600 dark:text-purple-400 rounded-full font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
                          onClick={() => setStatementSupplier(s)}
                          title="View vendor ledger statement"
                        >
                          <i className="fa-solid fa-file-invoice text-xs"></i>
                        </button>
                        <button 
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500/10 hover:bg-blue-600 hover:text-white border border-blue-500/30 text-blue-600 dark:text-blue-400 rounded-full font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
                          onClick={() => handleOpenEdit(s)}
                          title="Edit vendor profile"
                        >
                          <i className="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button 
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-rose-500/10 hover:bg-rose-600 hover:text-white border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-full font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
                          onClick={() => handleDeleteSupplier(s.id)}
                          title="Delete vendor record"
                        >
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-2xl shadow-2xl my-auto max-h-[85vh] flex flex-col gap-4 overflow-hidden">
            
            {/* Sticky Header */}
            <div className="flex justify-between items-center pb-3 border-b border-border shrink-0">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Vendor Management</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">{editingSupplier ? 'Edit Supplier Profile' : 'Register New Supplier'}</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setModalOpen(false)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition"
              >
                &times; Close
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveSupplier} className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
              {phoneError && (
                <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2.5 shadow-sm">
                  <i className="fa-solid fa-triangle-exclamation text-base text-rose-500 shrink-0"></i>
                  <span>{phoneError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Supplier / Distributor Name *</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground uppercase font-bold"
                  value={formData.supplier_name} onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Phone Number</label>
                  <input 
                    type="text" 
                    maxLength={10} 
                    className={`w-full bg-background border ${phoneError ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5' : 'border-border'} rounded-lg p-2.5 text-xs text-foreground font-semibold transition`}
                    value={formData.phone} 
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setFormData({ ...formData, phone: val });
                      if (val.length === 10 || val.length === 0) {
                        setPhoneError(null);
                      }
                    }} 
                    placeholder="e.g. 9876543210" 
                  />
                  {phoneError && (
                    <p className="mt-1 text-[11px] font-bold text-rose-500 flex items-center gap-1">
                      <i className="fa-solid fa-circle-exclamation text-[10px]"></i>
                      {phoneError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Email ID</label>
                  <input type="email" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                    value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="vendor@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Owner / Contact Birthday</label>
                  <input type="date" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-semibold"
                    value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Establishment Date</label>
                  <input type="date" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-semibold"
                    value={formData.establishment_date} onChange={(e) => setFormData({ ...formData, establishment_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">GST Number (Optional)</label>
                  <input 
                    type="text" 
                    maxLength={15}
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground uppercase font-semibold"
                    value={formData.gst_number} 
                    onChange={(e) => setFormData({ ...formData, gst_number: e.target.value.toUpperCase() })} 
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Office / Godown Address</label>
                <textarea className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground" rows={2}
                  value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Enter vendor street address, city..." />
              </div>

              {/* Sticky Action Footer */}
              <div className="shrink-0 flex gap-3 justify-end pt-3 border-t border-border mt-4">
                <button type="button" className="px-5 py-2.5 border border-border text-textSecondary rounded-lg text-xs font-bold hover:bg-background transition" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer">Save Profile</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Record Payout Modal */}
      {payModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-lg shadow-2xl my-auto max-h-[85vh] flex flex-col gap-4 overflow-hidden">
            
            {/* Sticky Header */}
            <div className="flex justify-between items-center pb-3 border-b border-border shrink-0">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Accounts Payable</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">Record Supplier Settlement</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setPayModalOpen(false)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition"
              >
                &times; Close
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleRecordPayment} className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Payout Voucher Amount (₹) *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground font-mono font-bold"
                  value={payFormData.amount === 0 ? '' : payFormData.amount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPayFormData({ ...payFormData, amount: e.target.value === '' ? '' as any : (isNaN(Number(e.target.value)) ? '' as any : e.target.value as any) })}
                  placeholder="Enter payout amount..."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Settlement Method</label>
                <select className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                  value={payFormData.payment_mode} onChange={(e) => setPayFormData({ ...payFormData, payment_mode: e.target.value })}>
                  <option value="Bank Transfer">Bank Transfer / NEFT</option>
                  <option value="Cash">Cash Voucher</option>
                  <option value="Cheque">Cheque Payment</option>
                  <option value="UPI">UPI / GPay</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Cheque Number / UTR Ref.</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                  value={payFormData.ref_number} onChange={(e) => setPayFormData({ ...payFormData, ref_number: e.target.value })} placeholder="e.g. UTR-928189" />
              </div>

              {/* Sticky Action Footer */}
              <div className="shrink-0 flex gap-3 justify-end pt-3 border-t border-border mt-4">
                <button type="button" className="px-5 py-2.5 border border-border text-textSecondary rounded-lg text-xs font-bold hover:bg-background transition" onClick={() => setPayModalOpen(false)}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer">Save Voucher</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Printable Statement Modal */}
      {statementSupplier && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-[9999] print:p-0 print:bg-white animate-backdrop-fade">
          
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 5mm;
              }
              body * {
                visibility: hidden !important;
              }
              #supplier-print-area, #supplier-print-area * {
                visibility: visible !important;
              }
              #supplier-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                max-height: none !important;
                overflow: visible !important;
                background: white !important;
                color: black !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
                border: none !important;
              }
              #supplier-print-area table {
                width: 100% !important;
                table-layout: fixed !important;
                border-collapse: collapse !important;
              }
              #supplier-print-area th, #supplier-print-area td {
                font-size: 9.5px !important;
                padding: 4px 3px !important;
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
              }
              .print\:hidden {
                display: none !important;
              }
            }
          `}</style>

          <div className="bg-secondary border border-border rounded-2xl w-full max-w-5xl sm:max-w-6xl shadow-2xl print:bg-white print:border-none print:shadow-none print:p-0 flex flex-col justify-between max-h-[92vh] overflow-hidden" id="supplier-print-area">
            
            {/* Modal Header */}
            <div className="p-3.5 sm:p-5 border-b border-border flex justify-between items-center bg-background/50 shrink-0 print:bg-white print:border-slate-300">
              <div>
                <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest block">Accounts Payable Ledger</span>
                <h3 className="text-base sm:text-lg font-black text-foreground print:text-black uppercase tracking-tight">
                  Supplier Account Statement & Financial Ledger
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setStatementSupplier(null)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background hover:bg-slate-200 dark:hover:bg-slate-800 border border-border px-3 py-1.5 rounded-lg transition print:hidden cursor-pointer"
              >
                &times; Close
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="p-3.5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 scrollbar-thin print:overflow-visible print:p-0">
              
              {/* Top Financial Summary Bento Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:grid-cols-3">
                <div className="bg-blue-50/80 dark:bg-blue-950/40 p-3.5 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                  <span className="text-[10px] font-extrabold text-blue-700 dark:text-blue-300 uppercase tracking-wider block">Total Billed (Procurements)</span>
                  <div className="text-lg font-black font-mono text-blue-900 dark:text-blue-100 mt-1">
                    ₹{statementLedger.summary.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
                  <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">Total Settled (Payments)</span>
                  <div className="text-lg font-black font-mono text-emerald-900 dark:text-emerald-100 mt-1">
                    ₹{statementLedger.summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-amber-50/80 dark:bg-amber-950/40 p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 text-center">
                  <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300 uppercase tracking-wider block">Net Pending Payable</span>
                  <div className={`text-lg font-black font-mono mt-1 ${statementLedger.summary.netBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    ₹{statementLedger.summary.netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Vendor Information Box */}
              <div className="bg-background p-4 border border-border rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs print:bg-white print:border-slate-300 print:text-black">
                <div>
                  <div className="text-textMuted text-[10px] uppercase font-bold">Supplier Profile</div>
                  <div className="text-foreground print:text-black font-extrabold uppercase text-sm mt-0.5">{statementSupplier.supplier_name}</div>
                  <div className="text-textMuted mt-1">{statementSupplier.address || 'No location address recorded'}</div>
                  {statementSupplier.establishment_date && (
                    <div className="text-[11px] text-blue-600 dark:text-blue-400 font-mono mt-1">🏛️ Est: {new Date(statementSupplier.establishment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  )}
                </div>
                <div>
                  <div className="text-textMuted text-[10px] uppercase font-bold">Contact Details</div>
                  <div className="text-foreground print:text-black font-bold font-mono text-xs mt-0.5 flex items-center gap-2">
                    <span>📱 Phone: {statementSupplier.phone || 'N/A'}</span>
                    {statementSupplier.phone && (
                      <a href={`tel:${statementSupplier.phone}`} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline print:hidden">Call Now</a>
                    )}
                  </div>
                  {statementSupplier.email && <div className="text-textMuted mt-1">📧 Email: {statementSupplier.email}</div>}
                  {statementSupplier.dob && (
                    <div className="text-[11px] text-pink-600 dark:text-pink-400 font-mono mt-1">🎂 Birthday: {new Date(statementSupplier.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  )}
                </div>
              </div>

              {/* Timeline Ledger Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-textSecondary uppercase tracking-wide">Procurements & Settlements Timeline Ledger</h4>
                  <span className="text-[10px] font-mono text-textMuted font-bold">{statementLedger.items.length} Ledger Entries</span>
                </div>

                <div className="overflow-x-auto border border-border rounded-xl print:border-none print:overflow-visible">
                  <table className="w-full text-left text-xs text-textSecondary print:text-black">
                    <thead>
                      <tr className="border-b border-border bg-muted/80 text-foreground text-[11px] font-extrabold uppercase whitespace-nowrap">
                        <th className="py-3 px-2 text-center w-[16%]">Tx Date & Time</th>
                        <th className="py-3 px-2 text-left w-[27%]">Voucher Details</th>
                        <th className="py-3 px-2 text-center w-[12%]">Ref / Bill No.</th>
                        <th className="py-3 px-2 text-right w-[15%] text-blue-600 dark:text-blue-400">Bill Add (Debit +)</th>
                        <th className="py-3 px-2 text-right w-[15%] text-emerald-600 dark:text-emerald-400">Settlement (Credit -)</th>
                        <th className="py-3 px-2 text-right w-[15%] text-amber-600 dark:text-amber-400">Running Bal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {statementLedger.items.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-textMuted">No procurement or payout transactions logged for this vendor.</td>
                        </tr>
                      ) : (
                        statementLedger.items.map((row, idx) => {
                          const formattedDateTime = formatLedgerDateTime(row.date);

                          return (
                            <tr key={idx} className="hover:bg-primary/5 transition-colors border-b border-border/40">
                              <td className="py-2.5 px-2 text-center font-mono text-[11px] font-semibold">
                                {formattedDateTime}
                              </td>
                              <td className="py-2.5 px-2 font-bold text-foreground print:text-black">
                                <div className="flex items-center gap-1.5">
                                  <i className={`fa-solid ${row.debit > 0 ? 'fa-file-invoice text-blue-500' : 'fa-circle-check text-emerald-500'} text-xs shrink-0`}></i>
                                  <span>{row.type}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-center font-mono font-bold text-xs">
                                <span className="bg-muted px-1.5 py-0.5 rounded border border-border">
                                  {row.ref}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                                {row.debit > 0 ? `₹${row.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {row.credit > 0 ? `₹${row.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono font-black text-amber-600 dark:text-amber-400">
                                ₹{row.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Sticky Modal Action Footer */}
            <div className="p-4 border-t border-border flex gap-3 shrink-0 print:hidden bg-background/50">
              <button 
                type="button"
                className="flex-1 px-4 py-2.5 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-textSecondary hover:text-foreground rounded-xl text-xs font-extrabold transition cursor-pointer"
                onClick={() => setStatementSupplier(null)}
              >
                Close Statement
              </button>
              <button 
                type="button"
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-xl text-xs transition shadow-md cursor-pointer flex items-center justify-center gap-2"
                onClick={() => window.print()}
              >
                <i className="fa-solid fa-print"></i> Print Statement
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
