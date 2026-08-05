import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { useErpContext } from '../../context/ErpContext';
import { useSuppliers } from '../../hooks/useSuppliers';
import { SupplierService } from '../../services/supplierService';
import { PaymentService } from '../../services/paymentService';
import { t } from '../../utils/i18n';

interface Supplier {
  id: string;
  supplier_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  establishment_date?: string | null;
  outstanding: number;
  initial_outstanding?: number;
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



  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormData({
      supplier_name: '',
      phone: '',
      email: '',
      address: '',
      dob: '',
      establishment_date: '',
      outstanding: 0
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormData({
      supplier_name: s.supplier_name,
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      dob: s.dob || '',
      establishment_date: s.establishment_date || '',
      outstanding: s.outstanding || 0
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
    if (!formData.supplier_name.trim()) return;

    if (formData.phone.trim()) {
      const cleanPhone = formData.phone.trim().replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        triggerToast('⚠️ Phone number must be compulsory 10 digits!');
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
      outstanding: Number(formData.outstanding || 0),
      created_at: editingSupplier?.created_at
    };

    setModalOpen(false);
    triggerToast('⚡ Supplier profile saved successfully!');

    await saveSupplier(supplierPayload);
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
        await SupplierService.updateSupplier(targetSupplier.id, { outstanding: newOutstanding });
        await refreshAllData();
      } catch (e) {
        console.warn('Background supplier payment note:', e);
      }
    } catch (e: any) {
      alert('Failed to record payment: ' + e.message);
    }
  };

  // Compile supplier ledger entries (Purchases vs payments)
  const statementLedger = useMemo(() => {
    if (!statementSupplier) return [];

    // Get all purchases for this supplier
    const allPurchs: any[] = contextPurchases || [];
    const supplierPurchs = allPurchs.filter(p => 
      p.supplier_name && statementSupplier.supplier_name &&
      p.supplier_name.toUpperCase() === statementSupplier.supplier_name.toUpperCase()
    );

    // Get payments
    const supplierPayments = payments.filter(p => p && p.supplier_id === statementSupplier.id);

    // Merge & sort
    const ledger: Array<{ date: string; type: string; ref: string; amount: number; isCredit: boolean }> = [];
    
    supplierPurchs.forEach(pb => {
      ledger.push({
        date: pb.purchase_date,
        type: 'Procurement Bill',
        ref: pb.bill_number || '-',
        amount: Number(pb.total_amount || 0),
        isCredit: false // bill increases our accounts payable
      });
    });

    supplierPayments.forEach(p => {
      ledger.push({
        date: p.payment_date,
        type: 'Settlement Payout',
        ref: p.ref_number || 'Cash Voucher',
        amount: Number(p.amount || 0),
        isCredit: true // payout reduces outstanding
      });
    });

    // Sort chronologically
    return ledger.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
  }, [statementSupplier, payments]);

  // Pre-calculate per-supplier stats (total purchases, last purchase date, last payment date)
  const supplierStatsMap = useMemo(() => {
    const map = new Map<string, { 
      totalPurchases: number; 
      realtimeOutstanding: number;
      lastPurchaseDate: string | null; 
      lastPaymentDate: string | null;
    }>();

    const allPurchs: any[] = contextPurchases || [];

    suppliers.forEach(s => {
      const nameKey = (s.supplier_name || '').toUpperCase().trim();
      const suppBills = allPurchs.filter(b => b.supplier_name && b.supplier_name.toUpperCase().trim() === nameKey);
      const suppPays = payments.filter(p => p.supplier_id === s.id || ((p as any).supplier_name && (p as any).supplier_name.toUpperCase().trim() === nameKey));

      const totalPurch = suppBills.reduce((acc, b) => acc + Number(b.total_amount || 0), 0);
      
      let lastPurchDate: string | null = null;
      if (suppBills.length > 0) {
        const sorted = [...suppBills].sort((a, b) => new Date(b.purchase_date || 0).getTime() - new Date(a.purchase_date || 0).getTime());
        lastPurchDate = sorted[0].purchase_date || null;
      }

      let lastPayDate: string | null = null;
      if (suppPays.length > 0) {
        const sortedP = [...suppPays].sort((a, b) => new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime());
        lastPayDate = sortedP[0].payment_date || null;
      }

      map.set(s.id, {
        totalPurchases: totalPurch,
        realtimeOutstanding: Number(s.outstanding || 0),
        lastPurchaseDate: lastPurchDate,
        lastPaymentDate: lastPayDate
      });
    });

    return map;
  }, [suppliers, payments]);

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
      const code = getVendorCode(s, idx).toLowerCase();
      return (
        name.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search) ||
        code.includes(search.toLowerCase())
      );
    });
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
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Last Buy</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Last Paid</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Status</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 text-xs font-medium">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-solid fa-circle-notch fa-spin text-2xl text-primary"></i>
                    <span>Loading vendor accounts & ledger records...</span>
                  </div>
                </td>
              </tr>
            ) : filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400 text-xs font-medium">
                  <i className="fa-solid fa-truck-ramp-box text-2xl text-slate-400 mb-2 block"></i>
                  No matching vendor records found.
                </td>
              </tr>
            ) : filteredSuppliers.map((s, idx) => {
              const code = getVendorCode(s, idx);
              const stats = supplierStatsMap.get(s.id) || { totalPurchases: 0, realtimeOutstanding: Number(s.outstanding || 0), lastPurchaseDate: null, lastPaymentDate: null };
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
                    <div className="flex flex-col items-center justify-center gap-1.5 min-w-[260px] max-w-[300px] mx-auto">
                      {hasPayable && (
                        <button 
                          className="w-full text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-black py-1 px-2 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                          onClick={() => handleOpenPayModal(s)}
                          title="Record payment payout to vendor"
                        >
                          💵 Pay Vendor (₹{stats.realtimeOutstanding.toLocaleString()})
                        </button>
                      )}
                      <div className="grid grid-cols-3 gap-1 w-full">
                        <button 
                          className="text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-1 px-1 rounded-lg font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                          onClick={() => setStatementSupplier(s)}
                          title="View vendor ledger statement"
                        >
                          <i className="fa-solid fa-file-invoice text-[9px]"></i> Statement
                        </button>
                        <button 
                          className="text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-1 px-1 rounded-lg font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                          onClick={() => handleOpenEdit(s)}
                          title="Edit vendor profile"
                        >
                          <i className="fa-solid fa-pen-to-square text-[9px]"></i> Edit
                        </button>
                        <button 
                          className="text-[10px] bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-600 hover:text-white border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 py-1 px-1 rounded-lg font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                          onClick={() => handleDeleteSupplier(s.id)}
                          title="Delete vendor record"
                        >
                          <i className="fa-solid fa-trash-can text-[9px]"></i> Delete
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
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Supplier / Distributor Name *</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground uppercase font-bold"
                  value={formData.supplier_name} onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Phone Number</label>
                  <input type="text" maxLength={10} className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                    value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="e.g. 9876543210" />
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
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Establishment Date</label>
                <input type="date" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-semibold"
                  value={formData.establishment_date} onChange={(e) => setFormData({ ...formData, establishment_date: e.target.value })} />
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
                <input type="number" className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground font-mono font-bold"
                  value={payFormData.amount} onChange={(e) => setPayFormData({ ...payFormData, amount: parseInt(e.target.value) || 0 })} required />
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
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] print:p-0 print:bg-white animate-backdrop-fade">
          
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #supplier-print-area, #supplier-print-area * {
                visibility: visible;
              }
              #supplier-print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                color: black !important;
                padding: 15px !important;
              }
            }
          `}</style>

          <div className="bg-secondary border border-border p-6 rounded-xl w-full max-w-2xl shadow-2xl print:bg-white print:border-none print:shadow-none print:p-0 flex flex-col justify-between max-h-[85vh]" id="supplier-print-area">
            <div className="space-y-6 overflow-y-auto pr-1">
              
              {/* Header */}
              <div className="text-center pb-4 border-b border-border print:border-slate-300">
                <h3 className="text-lg font-bold text-foreground print:text-black">SUPPLIER ACCOUNT STATEMENT</h3>
                <p className="text-xs text-textMuted mt-1">Accounts Payable Records</p>
              </div>

              {/* Supplier Metadata Card */}
              <div className="bg-background p-4 border border-border rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs print:bg-white print:border-slate-300 print:text-black">
                <div>
                  <div className="text-textMuted text-[10px] uppercase font-bold">Supplier Name</div>
                  <div className="text-foreground print:text-black font-bold uppercase">{statementSupplier.supplier_name}</div>
                  <div className="text-textMuted">{statementSupplier.address}</div>
                  {statementSupplier.establishment_date && (
                    <div className="text-[11px] text-blue-400 font-mono mt-0.5">🏛️ Est: {new Date(statementSupplier.establishment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  )}
                </div>
                <div>
                  <div className="text-textMuted text-[10px] uppercase font-bold">Accounts Payable Balance</div>
                  <div className="text-primary font-bold font-mono text-sm print:text-black">₹{statementSupplier.outstanding.toLocaleString()}</div>
                  <div className="text-textMuted">Contact: {statementSupplier.phone}</div>
                  {statementSupplier.dob && (
                    <div className="text-[11px] text-pink-400 font-mono mt-0.5">🎂 Birthday: {new Date(statementSupplier.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  )}
                </div>
              </div>

              {/* Ledger Entries List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-textSecondary uppercase tracking-wide">Procurements & Settlements timeline</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-textSecondary print:text-black">
                    <thead>
                      <tr className="border-b border-border print:border-slate-350 text-textPrimary text-[10px] font-extrabold uppercase">
                        <th className="pb-2">Tx Date</th>
                        <th className="pb-2">Voucher details</th>
                        <th className="pb-2">Ref/Bill No.</th>
                        <th className="pb-2 text-right">Bill Add (Debit)</th>
                        <th className="pb-2 text-right">Settlement (Credit)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementLedger.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-textMuted">No procurement transactions logged.</td>
                        </tr>
                      ) : (
                        statementLedger.map((row, idx) => {
                          return (
                            <tr key={idx} className="border-b border-border print:border-slate-200">
                              <td className="py-3 font-mono">{new Date(row.date).toLocaleDateString()}</td>
                              <td className="py-3 font-semibold text-foreground print:text-black">{row.type}</td>
                              <td className="py-3 font-mono">{row.ref}</td>
                              <td className="py-3 text-right font-mono font-semibold text-primary print:text-black">
                                {!row.isCredit ? `₹${row.amount.toLocaleString()}` : '-'}
                              </td>
                              <td className="py-3 text-right font-mono font-semibold text-primary print:text-black">
                                {row.isCredit ? `₹${row.amount.toLocaleString()}` : '-'}
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

            {/* Print Controls */}
            <div className="flex gap-3 mt-8 print:hidden">
              <button className="flex-1 px-4 py-2 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-textSecondary hover:text-foreground rounded-lg text-xs font-semibold transition"
                onClick={() => setStatementSupplier(null)}>
                Close Statement
              </button>
              <button className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer"
                onClick={() => window.print()}>
                🖨️ Print Statement
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
