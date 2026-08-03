import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';
import { t } from '../../utils/i18n';

interface Expense {
  id: string;
  tenant_id?: string;
  category: string;
  amount: number;
  payment_mode: string;
  ref_number: string;
  description: string;
  expense_date: string;
}

interface ExpensesProps {
  autoOpenModal?: boolean;
  onModalClosed?: () => void;
}

export default function Expenses({ autoOpenModal, onModalClosed }: ExpensesProps = {}) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || 'default-hardware-erp';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  
  // Modals
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (autoOpenModal) {
      handleOpenAdd();
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenModal]);

  // Form State
  const [formData, setFormData] = useState({
    category: 'Rent',
    amount: 0,
    payment_mode: 'Cash',
    ref_number: '',
    description: '',
    expense_date: new Date().toISOString().slice(0, 10)
  });

  const fetchExpensesData = async () => {
    if (!tenantId) return;
    try {
      const { data: expsData, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('expense_date', { ascending: false });

      if (error) throw error;

      let currentExps = (expsData || []) as Expense[];

      setExpenses(currentExps);
      // Bridge cache for standard localStorage statistics calculators
      localStorage.setItem('lk_expenses', JSON.stringify(currentExps));
    } catch (e) {
      console.error('Failed to sync expenses with Supabase:', e);
    }
  };

  useEffect(() => {
    fetchExpensesData();
    window.addEventListener('storage', fetchExpensesData);
    return () => window.removeEventListener('storage', fetchExpensesData);
  }, [tenantId]);

  const handleOpenAdd = () => {
    setFormData({
      category: 'Rent',
      amount: 0,
      payment_mode: 'Cash',
      ref_number: '',
      description: '',
      expense_date: new Date().toISOString().slice(0, 10)
    });
    setModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.amount <= 0) return;

    const newExpObj: Expense = {
      id: 'exp-' + Date.now(),
      tenant_id: tenantId || 'default-hardware-erp',
      category: formData.category,
      amount: Number(formData.amount),
      payment_mode: formData.payment_mode,
      ref_number: formData.ref_number || 'GEN-EXP',
      description: formData.description,
      expense_date: new Date(formData.expense_date).toISOString()
    };

    // 1. Immediate local cache and state update
    try {
      const localExps = JSON.parse(localStorage.getItem('lk_expenses') || '[]');
      localStorage.setItem('lk_expenses', JSON.stringify([newExpObj, ...localExps]));
      setExpenses(prev => [newExpObj, ...prev.filter(e => e.id !== newExpObj.id)]);
    } catch (err) {}

    // 2. Background attempt to save to remote Supabase if UUID
    const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isValidUUID(tenantId)) {
      try {
        await supabase
          .from('expenses')
          .insert({
            tenant_id: tenantId,
            category: formData.category,
            amount: formData.amount,
            payment_mode: formData.payment_mode,
            ref_number: formData.ref_number || 'GEN-EXP',
            description: formData.description,
            expense_date: newExpObj.expense_date
          });
      } catch (err) {}
    }

    window.dispatchEvent(new Event('storage'));
    setModalOpen(false);
    alert('Expense successfully recorded.');
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Delete this expense entry?')) return;
    try {
      const localExps = JSON.parse(localStorage.getItem('lk_expenses') || '[]');
      const updated = localExps.filter((e: any) => e.id !== id);
      localStorage.setItem('lk_expenses', JSON.stringify(updated));
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (err) {}

    const isValidUUID = (idStr: any) => typeof idStr === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr);
    if (isValidUUID(id)) {
      try {
        await supabase.from('expenses').delete().eq('id', id);
      } catch (err) {}
    }

    window.dispatchEvent(new Event('storage'));
  };

  // Calculate category aggregates
  const categorySummary = useMemo(() => {
    const summary: Record<string, number> = {};
    expenses.forEach(e => {
      summary[e.category] = (summary[e.category] || 0) + Number(e.amount);
    });
    return Object.entries(summary);
  }, [expenses]);

  const filtered = expenses.filter(e => {
    return (
      e.category.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6 bg-secondary border border-border p-4 sm:p-6 rounded-xl shadow-md">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t('shopOperatingExpenses')}</h2>
          <p className="text-xs text-textMuted mt-1">Audit daily store operational costs and administrative cash outflows</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={handleOpenAdd}>
          + {t('logExpense')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Expenses List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="mb-2">
            <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-lg p-3 text-sm focus:outline-none focus:border-primary font-semibold"
              placeholder="Search expenses by category or description..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200 border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Expense Date</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Category</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Description</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Outflow Amount (₹)</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs font-medium">
                      <i className="fa-solid fa-hand-holding-dollar text-2xl text-slate-400 mb-2 block"></i>
                      No matching expense logs found.
                    </td>
                  </tr>
                ) : filtered.map((e) => (
                  <tr key={e.id} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                    <td className="py-3.5 px-4 text-center font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {new Date(e.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-[11px] px-2.5 py-1 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-full font-mono font-bold uppercase inline-block">
                        {e.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center text-xs text-slate-600 dark:text-slate-300 max-w-[220px] truncate" title={e.description}>{e.description || '-'}</td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-rose-600 dark:text-rose-400 text-xs">
                      ₹{e.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button className="text-xs bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-600 hover:text-white border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-lg font-bold transition-all active:scale-95 cursor-pointer"
                        onClick={() => handleDeleteExpense(e.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expense Category Breakdowns */}
        <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg h-fit">
          <h3 className="text-sm font-bold text-foreground mb-4">Operational Outflow Analysis</h3>
          <div className="space-y-4">
            {categorySummary.length === 0 ? (
              <p className="text-xs text-textMuted py-6 text-center">No expense categories aggregated yet.</p>
            ) : categorySummary.map(([cat, val]) => {
              const total = expenses.reduce((acc, curr) => acc + curr.amount, 0);
              const percentage = total > 0 ? (val / total) * 100 : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-textSecondary font-bold uppercase">{cat}</span>
                    <span className="text-foreground font-mono">₹{val.toLocaleString()} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-background h-2 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full rounded-full" style={{ width: `${percentage}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Add Modal */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-lg shadow-2xl my-auto max-h-[85vh] flex flex-col gap-4 overflow-hidden">
            
            {/* Sticky Header */}
            <div className="flex justify-between items-center pb-3 border-b border-border shrink-0">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Financial Outflows</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">Log Store Expense</h3>
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
            <form onSubmit={handleSaveExpense} className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Expense Category *</label>
                <select className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                  value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                  <option value="Rent">Rent</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Fuel">Transport Fuel</option>
                  <option value="Refreshments">Refreshments</option>
                  <option value="Salary Wages">Wages / Salaries</option>
                  <option value="Office Stationary">Office Stationary</option>
                  <option value="Others">Others</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Outflow Amount (₹) *</label>
                <input type="number" className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground font-mono font-extrabold"
                  value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Payment Mode</label>
                  <select className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                    value={formData.payment_mode} onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI / GPay</option>
                    <option value="Bank">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Voucher / Ref Number</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                    value={formData.ref_number} onChange={(e) => setFormData({ ...formData, ref_number: e.target.value })} placeholder="e.g. BILL-90" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Expense Date</label>
                <input type="date" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-semibold"
                  value={formData.expense_date} onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Outflow Description</label>
                <textarea className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground" rows={2}
                  value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Write additional notes..." />
              </div>

              {/* Sticky Action Footer */}
              <div className="shrink-0 flex gap-3 pt-3 border-t border-border mt-4">
                <button type="button" className="flex-1 py-2.5 border border-border text-textSecondary rounded-lg text-xs font-bold hover:bg-background transition" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer">Save Expense</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
