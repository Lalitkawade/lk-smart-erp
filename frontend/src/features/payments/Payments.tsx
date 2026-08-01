import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../api/supabase';

interface Payment {
  id: string;
  party_name: string;
  amount: number;
  payment_mode: string;
  ref_number: string;
  payment_date: string;
}

export default function Payments() {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || 'default-hardware-erp';

  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');

  const fetchPaymentsData = async () => {
    if (!tenantId) return;
    try {
      // 1. Fetch Customer Payments joined with Customers table
      const { data: custData, error: custErr } = await supabase
        .from('customer_payments')
        .select(`
          *,
          customer:customers(customer_name)
        `)
        .eq('tenant_id', tenantId)
        .order('payment_date', { ascending: false });

      if (!custErr && custData) {
        setCustomerPayments(custData.map((item: any) => ({
          id: item.id,
          party_name: item.customer?.customer_name || 'Unknown Customer',
          amount: Number(item.amount),
          payment_mode: item.payment_mode,
          ref_number: item.ref_number,
          payment_date: item.payment_date
        })));
      }

      // 2. Fetch Supplier Payments joined with Suppliers table
      const { data: supData, error: supErr } = await supabase
        .from('supplier_payments')
        .select(`
          *,
          supplier:suppliers(supplier_name)
        `)
        .eq('tenant_id', tenantId)
        .order('payment_date', { ascending: false });

      if (!supErr && supData) {
        setSupplierPayments(supData.map((item: any) => ({
          id: item.id,
          party_name: item.supplier?.supplier_name || 'Unknown Supplier',
          amount: Number(item.amount),
          payment_mode: item.payment_mode,
          ref_number: item.ref_number,
          payment_date: item.payment_date
        })));
      }
    } catch (e) {
      console.error('Failed to sync payments logs with Supabase:', e);
    }
  };

  useEffect(() => {
    fetchPaymentsData();
    window.addEventListener('storage', fetchPaymentsData);
    return () => window.removeEventListener('storage', fetchPaymentsData);
  }, [tenantId]);

  const displayedList = activeTab === 'customers' ? customerPayments : supplierPayments;

  const filtered = displayedList.filter(p => {
    return (
      p.party_name.toLowerCase().includes(search.toLowerCase()) ||
      p.ref_number.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6 bg-secondary border border-border p-6 rounded-xl shadow-md flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Payments Registry</h2>
          <p className="text-xs text-textMuted mt-1">Audit customer collections and supplier payout receipts</p>
        </div>

        {/* Toggle Selector tabs */}
        <div className="flex bg-background p-1 border border-border rounded-lg">
          <button onClick={() => { setActiveTab('customers'); setSearch(''); }}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition ${activeTab === 'customers' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-textSecondary hover:text-foreground'
              }`}>
            👤 Customer Collections
          </button>
          <button onClick={() => { setActiveTab('suppliers'); setSearch(''); }}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition ${activeTab === 'suppliers' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-textSecondary hover:text-foreground'
              }`}>
            🏢 Supplier Payouts
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-lg p-3 text-sm focus:outline-none focus:border-emerald-500 font-semibold"
          placeholder={activeTab === 'customers' ? "Search collections by customer name, ref..." : "Search payouts by supplier name, ref..."}
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg overflow-x-auto">
        <table className="w-full text-left text-sm text-textSecondary">
          <thead>
            <tr className="border-b border-border text-textPrimary font-extrabold uppercase tracking-wider text-xs">
              <th className="py-3">Voucher ID</th>
              <th className="py-3">{activeTab === 'customers' ? 'Received From' : 'Settled To'}</th>
              <th className="py-3">Payment Date</th>
              <th className="py-3">Method / Ref</th>
              <th className="py-3 text-right">Transaction Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-textMuted">No payment vouchers logged.</td>
              </tr>
            ) : filtered.map((p) => (
              <tr key={p.id} className="border-b border-border hover:bg-slate-100/10 dark:hover:bg-slate-800/10">
                <td className="py-4 font-mono text-xs text-textMuted">{p.id.slice(0, 8).toUpperCase()}</td>
                <td className="py-4 font-bold text-foreground uppercase">{p.party_name}</td>
                <td className="py-4">{new Date(p.payment_date).toLocaleDateString()}</td>
                <td className="py-4">
                  <div className="font-semibold text-textSecondary">{p.payment_mode}</div>
                  <div className="text-[10px] text-textMuted font-mono">Ref: {p.ref_number}</div>
                </td>
                <td className={`py-4 text-right font-mono font-bold text-base ${activeTab === 'customers' ? 'text-emerald-400' : 'text-rose-455'}`}>
                  {activeTab === 'customers' ? '+' : '-'}₹{p.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
