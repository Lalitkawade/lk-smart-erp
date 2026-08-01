import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';

interface Supplier {
  id: string;
  supplier_name: string;
  phone: string;
  email: string;
  address: string;
  dob?: string;
  establishment_date?: string;
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

export default function Suppliers() {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || 'default-hardware-erp';

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>([]);
  const [_products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  // Modals Control
  const [modalOpen, setModalOpen] = useState(false);
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

  const fetchSuppliersData = async () => {
    if (!tenantId) return;
    try {
      // 1. Remote suppliers
      const { data: supsData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('supplier_name', { ascending: true });

      // 2. Local suppliers cache
      let localSups: any[] = [];
      try {
        localSups = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
      } catch (e) {}

      // 3. Purchase bills (to discover any vendors registered via purchase bills)
      const { data: billsData } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('tenant_id', tenantId);

      let localBills: any[] = [];
      try {
        localBills = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
      } catch (e) {}

      // 4. Products catalog (to discover any vendors assigned to products)
      const { data: prodsData } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId);

      let localProds: any[] = [];
      try {
        localProds = JSON.parse(localStorage.getItem('lk_products') || '[]');
      } catch (e) {}

      // 5. Payment records
      const { data: paysData } = await supabase
        .from('supplier_payments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('payment_date', { ascending: false });

      const currentPays = (paysData || []) as SupplierPaymentRecord[];
      setPayments(currentPays);

      // Build master unified supplier map
      const masterMap = new Map<string, Supplier>();

      // A. Add localSups first
      localSups.forEach((s: any) => {
        if (s && s.supplier_name) {
          const key = s.supplier_name.toUpperCase().trim();
          const baseOut = s.initial_outstanding !== undefined ? Number(s.initial_outstanding) : Number(s.outstanding || 0);
          masterMap.set(key, {
            id: s.id || 'sup-' + Math.random().toString(36).substring(2, 7),
            supplier_name: key,
            phone: s.phone || '',
            email: s.email || '',
            address: s.address || '',
            dob: s.dob || undefined,
            establishment_date: s.establishment_date || undefined,
            outstanding: Number(s.outstanding || 0),
            initial_outstanding: baseOut,
            created_at: s.created_at || new Date().toISOString()
          });
        }
      });

      // B. Add remote sups (overwrite/enrich without losing local metadata)
      (supsData || []).forEach((s: any) => {
        if (s && s.supplier_name) {
          const key = s.supplier_name.toUpperCase().trim();
          const existing = masterMap.get(key);
          const baseOut = s.initial_outstanding !== undefined
            ? Number(s.initial_outstanding)
            : (existing?.initial_outstanding !== undefined ? existing.initial_outstanding : Number(s.outstanding || existing?.outstanding || 0));
          masterMap.set(key, {
            id: s.id || existing?.id || 'sup-' + Date.now(),
            supplier_name: key,
            phone: s.phone || existing?.phone || '',
            email: s.email || existing?.email || '',
            address: s.address || existing?.address || '',
            dob: s.dob || existing?.dob || undefined,
            establishment_date: s.establishment_date || existing?.establishment_date || undefined,
            outstanding: Number(s.outstanding !== undefined ? s.outstanding : (existing?.outstanding || 0)),
            initial_outstanding: baseOut,
            created_at: s.created_at || existing?.created_at || new Date().toISOString()
          });
        }
      });

      // C. Add suppliers mentioned in purchase bills
      const allBills = [...(billsData || []), ...localBills];
      allBills.forEach((b: any) => {
        if (b && b.supplier_name) {
          const key = b.supplier_name.toUpperCase().trim();
          if (!masterMap.has(key)) {
            masterMap.set(key, {
              id: 'sup-' + Math.random().toString(36).substring(2, 7),
              supplier_name: key,
              phone: '',
              email: '',
              address: '',
              outstanding: 0,
              initial_outstanding: 0,
              created_at: b.purchase_date || new Date().toISOString()
            });
          }
        }
      });

      // D. Add suppliers mentioned in product catalog
      const allProds = [...(prodsData || []), ...localProds];
      allProds.forEach((p: any) => {
        if (p && p.supplier_name) {
          const key = p.supplier_name.toUpperCase().trim();
          if (!masterMap.has(key)) {
            masterMap.set(key, {
              id: 'sup-' + Math.random().toString(36).substring(2, 7),
              supplier_name: key,
              phone: '',
              email: '',
              address: '',
              outstanding: 0,
              initial_outstanding: 0,
              created_at: new Date().toISOString()
            });
          }
        }
      });

      // Re-calculate live outstanding balance for each supplier in masterMap
      const uniqueBills = Array.from(
        new Map(allBills.map((b: any) => [b.bill_number || b.id, b])).values()
      );

      const finalSuppliers = Array.from(masterMap.values()).map(s => {
        const supBills = uniqueBills.filter((b: any) =>
          (b.supplier_name && b.supplier_name.toUpperCase().trim() === s.supplier_name.toUpperCase().trim()) ||
          (b.supplier_id && String(b.supplier_id) === String(s.id))
        );
        const totalDueFromBills = supBills.reduce((acc: number, b: any) => acc + Number(b.due_amount || 0), 0);
        const totalPayouts = currentPays
          .filter((p: any) => String(p.supplier_id) === String(s.id) || (p as any).supplier_name?.toUpperCase() === s.supplier_name)
          .reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);

        const initialBal = s.initial_outstanding !== undefined ? Number(s.initial_outstanding) : Number(s.outstanding || 0);
        const liveOutstanding = Math.max(0, initialBal + totalDueFromBills - totalPayouts);
        return {
          ...s,
          initial_outstanding: initialBal,
          outstanding: liveOutstanding
        };
      });

      setSuppliers(finalSuppliers);
      localStorage.setItem('lk_suppliers', JSON.stringify(finalSuppliers));
      setProducts(allProds);
    } catch (e) {
      console.error('Failed to sync suppliers with Supabase:', e);
    }
  };

  useEffect(() => {
    fetchSuppliersData();
    window.addEventListener('storage', fetchSuppliersData);
    return () => window.removeEventListener('storage', fetchSuppliersData);
  }, [tenantId]);

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
      outstanding: s.outstanding
    });
    setModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_name.trim()) return;

    const formattedName = formData.supplier_name.trim().toUpperCase();

    const newSupplierObj: Supplier = {
      id: editingSupplier ? editingSupplier.id : 'sup-' + Date.now(),
      supplier_name: formattedName,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      dob: formData.dob || undefined,
      establishment_date: formData.establishment_date || undefined,
      outstanding: Number(formData.outstanding || 0),
      initial_outstanding: Number(formData.outstanding || 0),
      created_at: editingSupplier ? editingSupplier.created_at : new Date().toISOString()
    };

    // 1. Immediately update local state & local storage cache for instant UI feedback
    try {
      const currentLocal = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
      let updatedLocal: any[] = [];
      if (editingSupplier) {
        updatedLocal = currentLocal.map((s: any) => s.id === editingSupplier.id ? newSupplierObj : s);
      } else {
        updatedLocal = [newSupplierObj, ...currentLocal.filter((s: any) => s.supplier_name !== formattedName)];
      }
      localStorage.setItem('lk_suppliers', JSON.stringify(updatedLocal));
    } catch (err) {}

    setSuppliers(prev => {
      if (editingSupplier) {
        return prev.map(s => s.id === editingSupplier.id ? newSupplierObj : s);
      } else {
        return [newSupplierObj, ...prev.filter(s => s.supplier_name !== formattedName)];
      }
    });

    // 2. Persist to Supabase if tenantId is a valid UUID
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
      if (isUuid) {
        const payload: any = {
          supplier_name: formattedName,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          dob: formData.dob || null,
          establishment_date: formData.establishment_date || null,
          outstanding: formData.outstanding
        };

        if (editingSupplier) {
          let { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
          if (error && (error.message?.includes('dob') || error.message?.includes('establishment_date'))) {
            delete payload.dob;
            delete payload.establishment_date;
            await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
          }
        } else {
          let { data: inserted, error } = await supabase.from('suppliers').insert({ tenant_id: tenantId, ...payload }).select().maybeSingle();
          if (error && (error.message?.includes('dob') || error.message?.includes('establishment_date'))) {
            delete payload.dob;
            delete payload.establishment_date;
            const fallback = await supabase.from('suppliers').insert({ tenant_id: tenantId, ...payload }).select().maybeSingle();
            inserted = fallback.data;
          }
          if (inserted?.id) {
            newSupplierObj.id = inserted.id;
          }
        }
      }
    } catch (e: any) {
      console.warn('Remote supplier sync warning:', e);
    }

    await fetchSuppliersData();
    window.dispatchEvent(new Event('storage'));
    setModalOpen(false);
    alert('Supplier profile successfully saved!');
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('Delete this supplier profile account?')) return;
    try {
      // Remove from local storage cache
      try {
        const currentLocal = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
        const updatedLocal = currentLocal.filter((s: any) => s.id !== id);
        localStorage.setItem('lk_suppliers', JSON.stringify(updatedLocal));
      } catch (e) {}

      const isValidUUID = (idStr: any) => typeof idStr === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr);
      if (isValidUUID(id)) {
        try {
          await supabase.from('suppliers').delete().eq('id', id);
        } catch (e) {}
      }

      await fetchSuppliersData();
      window.dispatchEvent(new Event('storage'));
    } catch (e: any) {}
  };

  const handleOpenPayModal = (s: Supplier) => {
    setPayFormData({
      supplier_id: s.id,
      amount: s.outstanding,
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

      const newOutstanding = Math.max(0, targetSupplier.outstanding - payFormData.amount);

      // 1. Log payout
      const { error: logErr } = await supabase
        .from('supplier_payments')
        .insert({
          tenant_id: tenantId,
          supplier_id: payFormData.supplier_id,
          amount: payFormData.amount,
          payment_mode: payFormData.payment_mode,
          ref_number: payFormData.ref_number || 'DIR-REC',
          payment_date: new Date().toISOString()
        });

      if (logErr) throw logErr;

      // 2. Adjust outstanding payables
      const { error: updErr } = await supabase
        .from('suppliers')
        .update({ outstanding: newOutstanding })
        .eq('id', payFormData.supplier_id);

      if (updErr) throw updErr;

      await fetchSuppliersData();
      window.dispatchEvent(new Event('storage'));
      setPayModalOpen(false);
      alert(`Logged payment payout of ₹${payFormData.amount} to supplier. Ledger balance updated.`);
    } catch (e: any) {
      alert('Failed to record payment: ' + e.message);
    }
  };

  // Compile supplier ledger entries (Purchases vs payments)
  const statementLedger = useMemo(() => {
    if (!statementSupplier) return [];

    // Get all purchases for this supplier
    const localPurchs = localStorage.getItem('lk_purchases');
    let allPurchs: any[] = [];
    if (localPurchs) {
      try { 
        const parsed = JSON.parse(localPurchs); 
        if (Array.isArray(parsed)) {
          allPurchs = parsed.filter(p => p && typeof p === 'object');
        }
      } catch(e) {}
    }
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
      const name = s.supplier_name || '';
      const phone = s.phone || '';
      const code = getVendorCode(s, idx).toLowerCase();
      return (
        name.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search) ||
        code.includes(search.toLowerCase())
      );
    });
  }, [suppliers, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6 bg-secondary border border-border p-6 rounded-xl shadow-md flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Vendor list</h2>
          <p className="text-xs text-textMuted mt-1">Manage vendor contact profiles, credit statements, and payment ledgers</p>
        </div>
        <button className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-sm hover:bg-emerald-400" onClick={handleOpenAdd}>
          Register Vendor
        </button>
      </div>

      <div className="mb-4">
        <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-lg p-3 text-sm focus:outline-none focus:border-emerald-500 font-semibold"
          placeholder="Search by vendor name, code (VND-001) or contact number..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg overflow-x-auto">
        <table className="w-full text-left text-sm text-textSecondary">
          <thead>
            <tr className="border-b border-border text-textPrimary font-extrabold uppercase tracking-wider text-xs">
              <th className="py-3">Vendor ID</th>
              <th className="py-3">Vendor Name</th>
              <th className="py-3">Contact details</th>
              <th className="py-3">Office Address</th>
              <th className="py-3 text-right">Outstanding (₹)</th>
              <th className="py-3 text-right text-xs">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-textMuted">No matching vendor records found.</td>
              </tr>
            ) : filteredSuppliers.map((s, idx) => {
              return (
                <tr key={s.id} className="border-b border-border hover:bg-slate-100/10 dark:hover:bg-slate-800/10">
                  <td className="py-4 font-mono text-emerald-450 font-extrabold">{getVendorCode(s, idx)}</td>
                  <td className="py-4">
                    <div className="font-bold text-foreground uppercase flex items-center gap-1.5 flex-wrap">
                      {s.supplier_name}
                      {s.establishment_date && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono font-bold" title={`Established: ${s.establishment_date}`}>
                          🏛️ Est. {new Date(s.establishment_date).getFullYear()}
                        </span>
                      )}
                      {s.dob && (
                        <span className="text-[10px] bg-pink-500/20 text-pink-400 border border-pink-500/30 px-1.5 py-0.5 rounded font-mono font-bold" title={`Contact Birthday: ${new Date(s.dob).toLocaleDateString()}`}>
                          🎂 {new Date(s.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 text-xs">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span>{s.phone || '-'}</span>
                      {s.phone && (
                        <a href={`tel:${s.phone}`} className="px-1.5 py-0.5 bg-emerald-500/15 text-primary border border-emerald-500/30 hover:bg-emerald-500/30 rounded text-[9px] font-black uppercase inline-flex items-center gap-1" title="Call Vendor">
                          <i className="fa-solid fa-phone text-[8px]"></i> Call
                        </a>
                      )}
                    </div>
                    <div className="text-textMuted">{s.email || '-'}</div>
                  </td>
                  <td className="py-4 text-xs text-textSecondary max-w-[200px] truncate" title={s.address}>{s.address || '-'}</td>
                  <td className="py-4 text-right font-mono font-bold text-amber-500">
                    ₹{Number(s.outstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="text-xs bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border px-2.5 py-1 rounded text-textSecondary hover:text-foreground transition"
                        onClick={() => setStatementSupplier(s)}>
                        🧾 Statement
                      </button>
                      {s.outstanding > 0 && (
                        <button className="text-xs bg-emerald-950 border border-emerald-900 text-emerald-450 hover:bg-emerald-900/50 px-2.5 py-1 rounded font-semibold transition"
                          onClick={() => handleOpenPayModal(s)}>
                          💸 Pay
                        </button>
                      )}
                      <button className="text-xs bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border px-2.5 py-1 rounded text-textSecondary hover:text-foreground transition"
                        onClick={() => handleOpenEdit(s)}>
                        Edit
                      </button>
                      <button className="text-xs bg-rose-950 border border-rose-900/30 text-rose-400 hover:bg-rose-900/45 px-2.5 py-1 rounded font-semibold transition"
                        onClick={() => handleDeleteSupplier(s.id)}>
                        Delete
                      </button>
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
                <span className="text-[10px] font-bold text-emerald-450 uppercase tracking-widest">Vendor Management</span>
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
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                    value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="e.g. 9876543210" />
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
                <button type="submit" className="px-5 py-2.5 bg-emerald-500 text-slate-950 font-extrabold rounded-lg text-xs hover:bg-emerald-400 transition shadow-sm">Save Profile</button>
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
                <span className="text-[10px] font-bold text-emerald-450 uppercase tracking-widest">Accounts Payable</span>
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
                <button type="submit" className="px-5 py-2.5 bg-emerald-500 text-slate-950 font-extrabold rounded-lg text-xs hover:bg-emerald-400 transition shadow-sm">Save Voucher</button>
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
                  <div className="text-amber-500 font-bold font-mono text-sm print:text-black">₹{statementSupplier.outstanding.toLocaleString()}</div>
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
                              <td className="py-3 text-right font-mono font-semibold text-amber-550 print:text-black">
                                {!row.isCredit ? `₹${row.amount.toLocaleString()}` : '-'}
                              </td>
                              <td className="py-3 text-right font-mono font-semibold text-emerald-450 print:text-black">
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
              <button className="flex-1 px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-emerald-400 transition"
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
