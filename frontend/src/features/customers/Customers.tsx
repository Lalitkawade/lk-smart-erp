import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { useErpContext } from '../../context/ErpContext';
import { useCustomers } from '../../hooks/useCustomers';
import { CustomerService } from '../../services/customerService';
import { SaleService } from '../../services/saleService';
import { PaymentService } from '../../services/paymentService';
import { supabase } from '../../api/supabase';
import { t } from '../../utils/i18n';

interface Customer {
  id: string;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  credit_limit: number;
  outstanding: number;
  establishment_date?: string | null;
  created_at: string;
}

interface PaymentRecord {
  id: string;
  customer_id: string;
  amount: number;
  payment_mode: string;
  ref_number: string;
  payment_date: string;
  customer_name?: string;
}

interface CustomersProps {
  onNewInvoice?: (customerName: string) => void;
  autoOpenModal?: boolean;
  onModalClosed?: () => void;
}

export default function Customers({ onNewInvoice, autoOpenModal, onModalClosed }: CustomersProps) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || 'default-hardware-erp';
  const { customers, isLoading, saveCustomer, deleteCustomer } = useCustomers(tenantId);
  const { customerPayments: contextCustomerPayments, sales: contextSales, refreshAllData } = useErpContext();
  const sales: any[] = contextSales || [];
  const payments: PaymentRecord[] = contextCustomerPayments || [];

  const [search, setSearch] = useState('');

  // Modals Control
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (autoOpenModal) {
      handleOpenAdd();
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenModal]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isEditingOutstanding, setIsEditingOutstanding] = useState(false);

  // Statement Modal
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statementTab, setStatementTab] = useState<'ledger' | 'invoices' | 'products'>('ledger');

  // Filter Tab State
  const [filterTab, setFilterTab] = useState<'all' | 'outstanding'>('all');

  // Form State
  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    email: '',
    address: '',
    dob: '',
    credit_limit: 50000,
    outstanding: 0,
    establishment_date: ''
  });

  // Pay Down Outstanding / Refund Form
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payActionType, setPayActionType] = useState<'collect' | 'refund'>('collect');
  const [payFormData, setPayFormData] = useState({
    customer_id: '',
    amount: 0,
    payment_mode: 'Cash',
    ref_number: ''
  });



  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setPhoneError(null);
    setFormData({
      customer_name: '',
      phone: '',
      email: '',
      address: '',
      dob: '',
      credit_limit: 50000,
      outstanding: 0,
      establishment_date: ''
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setPhoneError(null);
    setFormData({
      customer_name: c.customer_name,
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      dob: c.dob || '',
      credit_limit: c.credit_limit,
      outstanding: c.outstanding,
      establishment_date: c.establishment_date || ''
    });
    setModalOpen(true);
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    if (!formData.customer_name.trim()) return;

    if (formData.phone.trim()) {
      const cleanPhone = formData.phone.trim().replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        const msg = '⚠️ Phone number must be compulsory 10 digits!';
        setPhoneError(msg);
        triggerToast(msg);
        return;
      }
    }

    const formattedName = formData.customer_name.trim().toUpperCase();

    const customerPayload = {
      ...(editingCustomer?.id ? { id: editingCustomer.id } : {}),
      customer_name: formattedName,
      phone: formData.phone || '',
      email: formData.email || '',
      address: formData.address || '',
      dob: formData.dob || '',
      credit_limit: Number(formData.credit_limit || 0),
      outstanding: Number(formData.outstanding || 0),
      establishment_date: formData.establishment_date || null,
      created_at: editingCustomer?.created_at
    };

    try {
      await saveCustomer(customerPayload);
      setModalOpen(false);
      triggerToast('⚡ Customer account saved successfully!');
    } catch (err: any) {
      triggerToast('⚠️ Failed to save customer: ' + (err?.message || 'Error occurred'));
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      if (statementCustomer && statementCustomer.id === id) {
        setStatementCustomer(null);
      }
      await deleteCustomer(id);
      triggerToast('✓ Customer record deleted.');
    } catch (e: any) {
      alert('Failed to delete customer record: ' + e.message);
    }
  };

  const handleOpenPayModal = (c: Customer) => {
    const stats = customerStatsMap.get(c.id);
    const currentOutstanding = stats ? stats.realtimeOutstanding : Number(c.outstanding || 0);

    setPayActionType('collect');
    setPayFormData({
      customer_id: c.id,
      amount: currentOutstanding > 0 ? currentOutstanding : 0,
      payment_mode: 'Cash',
      ref_number: ''
    });
    setPayModalOpen(true);
  };

  const handleOpenRefundModal = (c: Customer) => {
    const stats = customerStatsMap.get(c.id);
    const currentOutstanding = stats ? stats.realtimeOutstanding : Number(c.outstanding || 0);

    setPayActionType('refund');
    setPayFormData({
      customer_id: c.id,
      amount: currentOutstanding < 0 ? Math.abs(currentOutstanding) : 0,
      payment_mode: 'Cash',
      ref_number: ''
    });
    setPayModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payFormData.amount <= 0) return;

    const targetCustomer = masterCustomersList.find(c => c.id === payFormData.customer_id);
    if (!targetCustomer) return;

    const currentUdhar = customerStatsMap.get(targetCustomer.id)?.realtimeOutstanding ?? Number(targetCustomer.outstanding || 0);
    const enteredAmt = Number(payFormData.amount);
    const actualAmtRecorded = payActionType === 'refund' ? -enteredAmt : enteredAmt;
    const newOutstanding = currentUdhar - actualAmtRecorded;

    const isUuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const nowIso = new Date().toISOString();

    if (statementCustomer && (statementCustomer.id === targetCustomer.id || statementCustomer.customer_name === targetCustomer.customer_name)) {
      setStatementCustomer({ ...statementCustomer, outstanding: newOutstanding });
    }

    setPayModalOpen(false);
    if (payActionType === 'refund') {
      triggerToast(`✓ Refunded ₹${enteredAmt.toFixed(2)} to ${targetCustomer.customer_name}! Remaining Advance: ₹${Math.abs(newOutstanding).toFixed(2)}`);
    } else {
      triggerToast(`✓ Collected ₹${enteredAmt.toFixed(2)} payment from ${targetCustomer.customer_name}! Remaining Udhar: ₹${Math.max(0, newOutstanding).toFixed(2)}`);
    }

    try {
      let custId = targetCustomer.id;
      if (!isUuid(custId)) {
        const { data: dbCust } = await supabase.from('customers').select('id').eq('customer_name', targetCustomer.customer_name).maybeSingle();
        if (dbCust?.id) custId = dbCust.id;
      }
      if (isUuid(custId)) {
        await PaymentService.recordCustomerPayment({
          tenant_id: isUuid(tenantId) ? tenantId : '00000000-0000-0000-0000-000000000000',
          customer_id: custId,
          amount: actualAmtRecorded,
          payment_mode: payFormData.payment_mode,
          ref_number: payFormData.ref_number.trim() || 'DIR-REC',
          payment_date: nowIso
        });
        await CustomerService.updateCustomer(custId, { outstanding: newOutstanding });
        await refreshAllData();
      }
    } catch (err) {
      console.warn('Payment record save exception:', err);
    }
  };

  // Raw Customer Invoices
  const rawCustomerInvoices = useMemo(() => {
    if (!statementCustomer) return [];
    return sales.filter(i =>
      i.customer_name && statementCustomer.customer_name &&
      i.customer_name.toUpperCase() === statementCustomer.customer_name.toUpperCase()
    );
  }, [statementCustomer, sales]);

  // Compile specific customer ledger entries (Invoice bills vs payment logs with running balance)
  const statementLedger = useMemo(() => {
    if (!statementCustomer) return [];

    const custNameUpper = (statementCustomer.customer_name || '').toUpperCase().trim();
    const customerPayments = payments.filter((p, index, self) =>
      (p.customer_id === statementCustomer.id || (statementCustomer.customer_name && p.customer_name && p.customer_name.toUpperCase().trim() === custNameUpper)) &&
      self.findIndex(x => (x.id ? x.id === p.id : x === p)) === index
    );

    const ledger: Array<{
      date: string;
      type: string;
      ref: string;
      mode: string;
      debit: number;
      credit: number;
      notes: string;
      runningBalance?: number;
    }> = [];

    // 1. Invoices Billed (Debit +) & Checkout Payments (Credit -)
    rawCustomerInvoices.forEach(inv => {
      const totalAmt = Number(inv.total_amount || 0);

      // Debit entry: Invoice Sale Total
      ledger.push({
        date: inv.sale_date || inv.created_at || new Date().toISOString(),
        type: 'Invoice Sale',
        ref: inv.invoice_number || 'INV-SALE',
        mode: inv.payment_mode || 'Credit / Udhar',
        debit: totalAmt,
        credit: 0,
        notes: `Bill Total Amount`
      });

      // Credit entry: Upfront payment collected at checkout time (if any)
      const paidAtCheckout = inv.paid_amount !== undefined
        ? Number(inv.paid_amount || 0)
        : (inv.amount_collected !== undefined
            ? Number(inv.amount_collected || 0)
            : (inv.payment_status === 'Paid' ? totalAmt : 0));

      if (paidAtCheckout > 0) {
        ledger.push({
          date: inv.sale_date || inv.created_at || new Date().toISOString(),
          type: 'Invoice Payment (Checkout)',
          ref: inv.invoice_number ? `PAY-${inv.invoice_number}` : 'CHECKOUT-PAY',
          mode: inv.payment_mode || 'Cash',
          debit: 0,
          credit: paidAtCheckout,
          notes: `Paid at Checkout for ${inv.invoice_number || 'Invoice'}`
        });
      }

      // Credit entry: Invoice Returns (if any)
      const returns = inv.returns || [];
      returns.forEach((ret: any) => {
        const refundAmt = Number(ret.total_refund_amount || 0);
        if (refundAmt > 0) {
          const isCredit = (ret.refund_mode || '').toLowerCase().includes('credit');
          ledger.push({
            date: ret.return_date || ret.created_at || new Date().toISOString(),
            type: 'Sales Return Refund',
            ref: `RET-${inv.invoice_number || 'SALE'}`,
            mode: ret.refund_mode || 'Credit Note',
            debit: 0,
            credit: isCredit ? refundAmt : 0, // Only Udhar/Credit Note refunds reduce the running Udhar balance
            notes: `Return Refund (${ret.refund_mode}) for ${inv.invoice_number || 'Invoice'}`
          });
        }
      });
    });

    // 2. Outstanding Collection Payments (Credit -)
    customerPayments.forEach(p => {
      ledger.push({
        date: p.payment_date || (p as any).created_at || new Date().toISOString(),
        type: 'Outstanding Collection Payment',
        ref: p.ref_number || 'DIR-REC',
        mode: p.payment_mode || 'Cash',
        debit: 0,
        credit: Number(p.amount || 0),
        notes: (p as any).notes || 'Ledger Payment Receipt'
      });
    });

    // Sort chronologically ascending
    ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute dynamic running balance (Debit increases pending udhar, Credit reduces pending udhar)
    let accum = 0;
    return ledger.map(entry => {
      accum = accum + entry.debit - entry.credit;
      return {
        ...entry,
        runningBalance: accum
      };
    });
  }, [statementCustomer, payments, rawCustomerInvoices]);

  const statementSummaryStats = useMemo(() => {
    let totalDebits = 0;
    let totalCredits = 0;

    statementLedger.forEach(row => {
      totalDebits += row.debit;
      totalCredits += row.credit;
    });

    const netOutstanding = totalDebits - totalCredits;

    return {
      totalDebits,
      totalCredits,
      netOutstanding
    };
  }, [statementLedger]);

  // Aggregate product purchasing history for customer
  const purchasedProductsHistory = useMemo(() => {
    const map = new Map<string, { name: string; totalQty: number; returnedQty: number; remainingQty: number; totalSpent: number; lastDate: string }>();
    rawCustomerInvoices.forEach(inv => {
      const items = inv.items || inv.sales_items || [];
      items.forEach((item: any) => {
        const name = (item.product?.product_name || item.product_name || 'Item').toUpperCase();
        const qty = Number(item.qty || 1);
        const amt = Number(item.amount || (qty * (item.rate || 0)) || 0);
        const date = inv.sale_date || inv.created_at;

        if (map.has(name)) {
          const curr = map.get(name)!;
          curr.totalQty += qty;
          curr.remainingQty += qty;
          curr.totalSpent += amt;
          if (new Date(date).getTime() > new Date(curr.lastDate).getTime()) {
            curr.lastDate = date;
          }
        } else {
          map.set(name, { name, totalQty: qty, returnedQty: 0, remainingQty: qty, totalSpent: amt, lastDate: date });
        }
      });

      // Account for returns
      const returns = inv.returns || [];
      returns.forEach((ret: any) => {
        const retItems = ret.items || ret.sales_return_items || [];
        retItems.forEach((rItem: any) => {
          const name = (rItem.product?.product_name || rItem.product_name || 'Item').toUpperCase();
          const retQty = Number(rItem.return_qty || rItem.qty || 0);
          if (map.has(name)) {
            const curr = map.get(name)!;
            curr.returnedQty += retQty;
            curr.remainingQty -= retQty;
          }
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [rawCustomerInvoices]);

  // Comprehensive Master Customer List (Combines registered customers + past invoice customer records)
  const masterCustomersList = useMemo(() => {
    const map = new Map<string, Customer>();

    // 1. Add registered customers
    customers.forEach(c => {
      if (c.customer_name) {
        map.set(c.customer_name.trim().toUpperCase(), { ...c });
      }
    });

    // 2. Add customers who exist in sales invoices (e.g. Lalit Kawade, etc.)
    sales.forEach((inv: any) => {
      const name = (inv.customer_name || '').trim().toUpperCase();
      if (name && name !== 'CASH CUSTOMER') {
        if (!map.has(name)) {
          map.set(name, {
            id: inv.id || ('CUST-' + name.slice(0, 8)),
            customer_name: inv.customer_name.toUpperCase(),
            phone: inv.customer_phone || '',
            email: '',
            address: '',
            credit_limit: 50000,
            outstanding: Number(inv.due_amount || 0),
            created_at: inv.sale_date || inv.created_at || new Date().toISOString()
          });
        } else {
          const existing = map.get(name)!;
          if (Number(existing.outstanding || 0) === 0 && Number(inv.due_amount || 0) > 0) {
            existing.outstanding = Number(inv.due_amount);
          }
          if (!existing.phone && inv.customer_phone) {
            existing.phone = inv.customer_phone;
          }
        }
      }
    });

    return Array.from(map.values());
  }, [customers, sales]);

  // Pre-calculate per-customer stats (total spent, dynamic realtime outstanding, last purchase date, last payment date)
  const customerStatsMap = useMemo(() => {
    const map = new Map<string, {
      totalPurchases: number;
      realtimeOutstanding: number;
      lastPurchaseDate: string | null;
      lastPaymentDate: string | null;
      udharDueDate: string | null;
    }>();

    masterCustomersList.forEach(c => {
      const custNameUpper = c.customer_name.toUpperCase();
      const custInvoices = sales.filter((inv: any) =>
        inv.customer_name && inv.customer_name.toUpperCase() === custNameUpper
      );
      const custPayments = payments.filter((p: any) =>
        p.customer_id === c.id || (c.customer_name && p.customer_name && p.customer_name.toUpperCase() === custNameUpper)
      );

      const totalSpent = custInvoices.reduce((acc: number, curr: any) => {
        const saleTotal = Number(curr.total_amount || 0);
        const returnsTotal = (curr.returns || []).reduce((retAcc: number, ret: any) => retAcc + Number(ret.total_refund_amount || 0), 0);
        return acc + Math.max(0, saleTotal - returnsTotal);
      }, 0);

      // Sum of invoice dues (unpaid amount for each invoice), adjusted for credit returns
      const totalInvoiceDues = custInvoices.reduce((acc: number, inv: any) => {
        const creditReturnsTotal = (inv.returns || []).reduce((retAcc: number, ret: any) => {
          return retAcc + ((ret.refund_mode || '').toLowerCase().includes('credit') ? Number(ret.total_refund_amount || 0) : 0);
        }, 0);
        
        const invoiceDue = inv.due_amount !== undefined
          ? Number(inv.due_amount)
          : (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
          
        return acc + (invoiceDue - creditReturnsTotal);
      }, 0);

      // Sum of payments collected in customer_payments table
      const totalPaymentsReceived = custPayments.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);

      // Compute dynamic realtime outstanding:
      // Subtract totalPaymentsReceived from invoice dues or opening balance
      let realtimeOutstanding = 0;
      if (custInvoices.length > 0) {
        realtimeOutstanding = totalInvoiceDues - totalPaymentsReceived;
      } else {
        realtimeOutstanding = Number(c.outstanding || 0) - totalPaymentsReceived;
      }

      let lastPurchDate: string | null = null;
      if (custInvoices.length > 0) {
        const sortedInvs = [...custInvoices].sort((a, b) =>
          new Date(b.sale_date || b.created_at || 0).getTime() - new Date(a.sale_date || a.created_at || 0).getTime()
        );
        lastPurchDate = sortedInvs[0].sale_date || sortedInvs[0].created_at || null;
      }

      let lastPayDate: string | null = null;
      if (custPayments.length > 0) {
        const sortedPays = [...custPayments].sort((a, b) =>
          new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime()
        );
        lastPayDate = sortedPays[0].payment_date || null;
      }

      // Compute Udhar Due Date: last purchase date + 15 days credit window
      let computedDueDate: string | null = null;
      if (!computedDueDate && lastPurchDate && realtimeOutstanding > 0) {
        const d = new Date(lastPurchDate);
        d.setDate(d.getDate() + 15);
        computedDueDate = d.toISOString().slice(0, 10);
      } else if (!computedDueDate && realtimeOutstanding > 0) {
        const d = new Date(c.created_at || Date.now());
        d.setDate(d.getDate() + 15);
        computedDueDate = d.toISOString().slice(0, 10);
      }

      map.set(c.id, {
        totalPurchases: totalSpent,
        realtimeOutstanding: realtimeOutstanding,
        lastPurchaseDate: lastPurchDate,
        lastPaymentDate: lastPayDate,
        udharDueDate: computedDueDate
      });
    });

    return map;
  }, [masterCustomersList, sales, payments]);

  // Filter & sort customer records based on selected filter tab & search query
  const processedCustomers = useMemo(() => {
    return masterCustomersList.filter(c => {
      const matchSearch = c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone && c.phone.includes(search));
      if (!matchSearch) return false;

      const stats = customerStatsMap.get(c.id);
      const outstanding = stats ? stats.realtimeOutstanding : Number(c.outstanding || 0);

      if (filterTab === 'outstanding') return outstanding > 0;
      return true;
    });
  }, [masterCustomersList, search, filterTab, customerStatsMap]);

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
          <h2 className="text-xl font-bold text-foreground">{t('customerManagement')}</h2>
          <p className="text-xs text-textMuted mt-1">Manage customer profiles, purchase history, and outstanding ledgers</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={handleOpenAdd}>
          + {t('addCustomer')}
        </button>
      </div>

      {/* Filter Tabs Bar - Equal 2-Column Side-by-Side Grid */}
      <div className="grid grid-cols-2 gap-2 border-b border-border text-xs font-bold mb-4">
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          className={`w-full py-2.5 px-2 rounded-t-xl transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${filterTab === 'all' ? 'bg-secondary border-t-2 border-x border-primary text-primary font-extrabold shadow-2xs' : 'bg-background/50 border-t border-x border-border text-textMuted hover:text-foreground'}`}
        >
          <span className="truncate">👥 All Customers</span>
          <span className="bg-background px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono shrink-0">{masterCustomersList.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('outstanding')}
          className={`w-full py-2.5 px-2 rounded-t-xl transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${filterTab === 'outstanding' ? 'bg-secondary border-t-2 border-x border-primary text-primary font-extrabold shadow-2xs' : 'bg-background/50 border-t border-x border-border text-textMuted hover:text-foreground'}`}
        >
          <span className="truncate">⚠️ Balances Pending</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0">
            {masterCustomersList.filter(c => {
              const o = customerStatsMap.get(c.id)?.realtimeOutstanding;
              return (o !== undefined ? o : Number(c.outstanding || 0)) > 0;
            }).length}
          </span>
        </button>
      </div>

      <div className="mb-4">
        <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-xl p-3 text-sm focus:outline-none focus:border-primary font-semibold shadow-inner"
          placeholder={`🔍 ${t('searchCustomerPlaceholder')}`}
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Customer</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Phone</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Total Sales</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Pending Udhar</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Last Buy</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Last Paid</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Status</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading && customers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-xs font-medium">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-solid fa-circle-notch fa-spin text-2xl text-primary"></i>
                    <span>Loading customer ledger records...</span>
                  </div>
                </td>
              </tr>
            ) : processedCustomers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-medium">
                  <i className="fa-solid fa-users-slash text-2xl text-slate-400 mb-2 block"></i>
                  No matching customer accounts found.
                </td>
              </tr>
            ) : processedCustomers.map((c) => {
              const stats = customerStatsMap.get(c.id)!;
              const hasUdhar = stats.realtimeOutstanding > 0;

              return (
                <tr key={c.id} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span className="font-bold text-slate-900 dark:text-slate-100 uppercase text-xs">
                        {c.customer_name}
                      </span>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">{c.address || 'No address'}</div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                    {c.phone ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{c.phone}</span>
                        <a
                          href={`tel:${c.phone}`}
                          className="w-6 h-6 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white rounded-md flex items-center justify-center transition shadow-xs active:scale-95 cursor-pointer shrink-0"
                          title={`Call ${c.customer_name} (${c.phone})`}
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
                    <span className={`font-bold inline-block px-2.5 py-0.5 rounded-lg ${stats.realtimeOutstanding > 0 ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800' : (stats.realtimeOutstanding < 0 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800')}`}>
                      {stats.realtimeOutstanding > 0 ? `₹${stats.realtimeOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : (stats.realtimeOutstanding < 0 ? `₹${Math.abs(stats.realtimeOutstanding).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Advance)` : '₹0.00')}
                    </span>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">Limit: ₹{Number(c.credit_limit || 0).toLocaleString()}</div>
                    {hasUdhar && stats.udharDueDate && (
                      <div className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-1 flex items-center justify-center gap-1 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md inline-flex" title={`Udhar due date for ${c.customer_name}`}>
                        <i className="fa-solid fa-calendar-day text-[9px]"></i>
                        <span>Due: {new Date(stats.udharDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-mono text-slate-600 dark:text-slate-300">
                    {stats.lastPurchaseDate ? new Date(stats.lastPurchaseDate).toLocaleDateString('en-IN') : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center text-xs font-mono text-slate-600 dark:text-slate-300">
                    {stats.lastPaymentDate ? new Date(stats.lastPaymentDate).toLocaleDateString('en-IN') : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border inline-block ${stats.realtimeOutstanding > 0 ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' : (stats.realtimeOutstanding < 0 ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800')}`}>
                      {stats.realtimeOutstanding > 0 ? '⚠️ Pending' : (stats.realtimeOutstanding < 0 ? '💸 Advance' : '✓ Clean')}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex flex-col items-center justify-center gap-1.5 min-w-[200px] max-w-[260px] mx-auto">
                      {hasUdhar && (
                        <button
                          className="w-full text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-black py-1 px-2 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                          onClick={() => handleOpenPayModal(c)}
                          title={`Collect Udhar payment (₹${stats.realtimeOutstanding.toFixed(2)})`}
                        >
                          <i className="fa-solid fa-hand-holding-dollar"></i> Pay Udhar (₹{stats.realtimeOutstanding.toLocaleString()})
                        </button>
                      )}
                      {stats.realtimeOutstanding < 0 && (
                        <button
                          className="w-full text-[11px] bg-rose-600 hover:bg-rose-500 text-white font-black py-1 px-2 rounded-lg transition-all active:scale-95 cursor-not-allowed flex items-center justify-center gap-1 shadow-xs"
                          title={`Shop owes customer this amount.`}
                        >
                          💸 Refund Advance (₹{Math.abs(stats.realtimeOutstanding).toLocaleString()})
                        </button>
                      )}
                      <div className="flex items-center justify-center gap-2 w-full">
                        <button
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-500/10 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-full font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
                          onClick={() => onNewInvoice && onNewInvoice(c.customer_name)}
                          title="Create new sales invoice bill for customer"
                        >
                          <i className="fa-solid fa-cart-shopping text-xs"></i>
                        </button>
                        <button
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500/10 hover:bg-purple-600 hover:text-white border border-purple-500/30 text-purple-600 dark:text-purple-400 rounded-full font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
                          onClick={() => {
                            setStatementTab('ledger');
                            setStatementCustomer(c);
                          }}
                          title="View customer statement & history ledger"
                        >
                          <i className="fa-solid fa-clock-rotate-left text-xs"></i>
                        </button>
                        <button
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500/10 hover:bg-blue-600 hover:text-white border border-blue-500/30 text-blue-600 dark:text-blue-400 rounded-full font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
                          onClick={() => handleOpenEdit(c)}
                          title="Edit customer profile details"
                        >
                          <i className="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-rose-500/10 hover:bg-rose-600 hover:text-white border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-full font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
                          onClick={() => handleDeleteCustomer(c.id)}
                          title="Delete customer profile"
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
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Customer Accounts</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">{editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}</h3>
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
            <form onSubmit={handleSaveCustomer} className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
              {phoneError && (
                <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2.5 shadow-sm">
                  <i className="fa-solid fa-triangle-exclamation text-base text-rose-500 shrink-0"></i>
                  <span>{phoneError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Customer / Enterprise Name *</label>
                <input type="text" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground uppercase font-bold"
                  value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} required />
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
                    value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="customer@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Date of Birth (Birthday)</label>
                  <input type="date" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-semibold"
                    value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Credit Limit (₹) *</label>
                  <input type="number" className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-bold"
                    value={formData.credit_limit === 0 ? '' : formData.credit_limit}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value === '' ? 0 : (parseInt(e.target.value) || 0) })} required />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-textSecondary">Initial Outstanding (₹)</label>
                    {editingCustomer && (
                      <button
                        type="button"
                        onClick={() => setIsEditingOutstanding(!isEditingOutstanding)}
                        className="text-[10px] font-extrabold text-amber-500 hover:text-amber-400 underline flex items-center gap-1 cursor-pointer"
                      >
                        <i className={`fa-solid ${isEditingOutstanding ? 'fa-lock' : 'fa-pen-to-square'}`}></i>
                        {isEditingOutstanding ? 'Lock' : '✏️ Correct Dues'}
                      </button>
                    )}
                  </div>
                  <input type="number"
                    disabled={!!editingCustomer && !isEditingOutstanding}
                    className={`w-full border rounded-lg p-2.5 text-xs font-mono font-bold transition ${!!editingCustomer && !isEditingOutstanding
                        ? 'bg-background/50 border-border text-textMuted cursor-not-allowed opacity-80'
                        : 'bg-background border-border text-foreground focus:outline-none'
                      }`}
                    value={formData.outstanding === 0 ? '' : formData.outstanding}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, outstanding: e.target.value === '' ? 0 : (parseInt(e.target.value) || 0) })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Customer Establishment Date</label>
                  <input 
                    type="date" 
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-semibold"
                    value={formData.establishment_date} 
                    onChange={(e) => setFormData({ ...formData, establishment_date: e.target.value })} 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Billing Address</label>
                <textarea className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground" rows={2}
                  value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Enter customer billing address..." />
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

      {/* Record Payment Modal */}
      {payModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-lg shadow-2xl my-auto max-h-[90vh] flex flex-col gap-4 overflow-hidden">

            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-border shrink-0">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${payActionType === 'refund' ? 'text-rose-500' : 'text-emerald-500'}`}>
                  <i className="fa-solid fa-hand-holding-dollar"></i> {payActionType === 'refund' ? 'Advance Refund' : 'Accounts Receivable Collection'}
                </span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">{payActionType === 'refund' ? 'Refund Customer Advance' : 'Collect Customer Udhar Payment'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition"
              >
                &times; Close
              </button>
            </div>

            {/* Target Customer Info Banner */}
            {(() => {
              const targetCust = masterCustomersList.find(c => c.id === payFormData.customer_id);
              if (!targetCust) return null;

              const stats = customerStatsMap.get(targetCust.id);
              const currentOutstanding = stats ? stats.realtimeOutstanding : Number(targetCust.outstanding || 0);

              return (
                <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 p-3.5 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-textMuted uppercase font-bold block">Customer Account</span>
                      <span className="font-extrabold text-foreground text-sm uppercase">{targetCust.customer_name}</span>
                      {targetCust.phone && <span className="text-xs text-textMuted font-mono block mt-0.5">📞 {targetCust.phone}</span>}
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] uppercase font-bold block ${payActionType === 'refund' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {payActionType === 'refund' ? 'Current Advance' : 'Current Pending Udhar'}
                      </span>
                      <span className={`font-mono text-base font-black ${payActionType === 'refund' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        ₹{Math.abs(currentOutstanding).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Quick Preset Amount Buttons */}
                  <div className="pt-2 border-t border-emerald-500/20">
                    <span className="text-[10px] font-bold text-textMuted uppercase block mb-1.5">Quick Payment Presets:</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPayFormData({ ...payFormData, amount: Math.abs(currentOutstanding) })}
                        className={`px-2.5 py-1 text-[11px] font-black text-white rounded-md transition shadow-xs cursor-pointer active:scale-95 ${payActionType === 'refund' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                      >
                        ⚡ Full {payActionType === 'refund' ? 'Refund' : 'Udhar'} (₹{Math.abs(currentOutstanding).toFixed(2)})
                      </button>
                      {[500, 200, 100].filter(amt => amt < Math.abs(currentOutstanding)).map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setPayFormData({ ...payFormData, amount: amt })}
                          className="px-2.5 py-1 text-[11px] font-bold bg-background hover:bg-emerald-500/20 text-foreground border border-border rounded-md transition cursor-pointer active:scale-95 font-mono"
                        >
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Form */}
            <form onSubmit={handleRecordPayment} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 scrollbar-thin">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  {payActionType === 'refund' ? 'Refund Amount (₹) *' : 'Collection Receipt Amount (₹) *'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  className={`w-full bg-background border-2 rounded-xl p-3 text-base text-foreground font-mono font-black focus:outline-none focus:ring-2 ${payActionType === 'refund' ? 'border-rose-500 focus:ring-rose-500/30' : 'border-emerald-500 focus:ring-emerald-500/30'}`}
                  value={payFormData.amount === 0 ? '' : payFormData.amount}
                  placeholder="Enter payment amount (e.g. 1000)"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPayFormData({ ...payFormData, amount: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) })}
                  required
                />
              </div>

              {/* Live Calculation Preview Banner */}
              {(() => {
                const targetCust = masterCustomersList.find(c => c.id === payFormData.customer_id);
                if (!targetCust) return null;
                const stats = customerStatsMap.get(targetCust.id);
                const currentOutstanding = stats ? stats.realtimeOutstanding : Number(targetCust.outstanding || 0);
                const enteredAmount = Number(payFormData.amount || 0);
                const actualAmtRecorded = payActionType === 'refund' ? -enteredAmount : enteredAmount;
                const remBalance = currentOutstanding - actualAmtRecorded;

                return (
                  <div className="bg-background/80 p-3 rounded-xl border border-border text-xs space-y-1 font-semibold">
                    <div className="flex justify-between text-textMuted">
                      <span>{currentOutstanding < 0 ? 'Current Advance:' : 'Current Udhar:'}</span>
                      <span className="font-mono">₹{Math.abs(currentOutstanding).toFixed(2)}</span>
                    </div>
                    <div className={`flex justify-between font-bold ${payActionType === 'refund' ? 'text-rose-500' : 'text-emerald-500'}`}>
                      <span>{payActionType === 'refund' ? 'Refunding Today:' : 'Paying Today:'}</span>
                      <span className="font-mono">-₹{enteredAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-foreground font-extrabold border-t border-border/40 pt-1.5 mt-1 text-xs">
                      <span>{remBalance < 0 ? 'Remaining Advance Balance:' : 'Remaining Udhar Balance:'}</span>
                      <span className={remBalance === 0 ? "font-mono text-emerald-500 font-black" : "font-mono text-amber-500 font-black"}>
                        ₹{Math.abs(remBalance).toFixed(2)} {remBalance === 0 ? '✓ Cleared!' : '(Pending)'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Payment Mode</label>
                  <select
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-semibold"
                    value={payFormData.payment_mode}
                    onChange={(e) => setPayFormData({ ...payFormData, payment_mode: e.target.value })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="Card">Credit / Debit Card</option>
                    <option value="Bank Transfer">Bank Transfer / NEFT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Transaction Ref / UTR No.</label>
                  <input
                    type="text"
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono font-semibold uppercase"
                    value={payFormData.ref_number}
                    onChange={(e) => setPayFormData({ ...payFormData, ref_number: e.target.value })}
                    placeholder="e.g. UPI-981240 / CHQ-10492"
                  />
                </div>
              </div>

              {/* Action Footer */}
              <div className="shrink-0 flex gap-3 justify-end pt-3 border-t border-border mt-4">
                <button
                  type="button"
                  className="px-4 py-2.5 border border-border text-textSecondary rounded-xl text-xs font-bold hover:bg-background transition"
                  onClick={() => setPayModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs transition shadow-lg active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-check text-xs"></i> Record Payment Receipt
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Printable Statement & Customer History Hub Modal */}
      {statementCustomer && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] print:p-0 print:bg-white animate-backdrop-fade">

          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 5mm;
              }
              body * {
                visibility: hidden !important;
              }
              #statement-print-area, #statement-print-area * {
                visibility: visible !important;
              }
              #statement-print-area {
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
              #statement-print-area table {
                width: 100% !important;
                table-layout: fixed !important;
                border-collapse: collapse !important;
              }
              #statement-print-area th, #statement-print-area td {
                font-size: 9px !important;
                padding: 3px 2px !important;
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
              }
              .print\:hidden {
                display: none !important;
              }
            }
          `}</style>

          <div className="bg-secondary border border-border p-3.5 sm:p-6 rounded-2xl w-full max-w-6xl sm:max-w-7xl shadow-2xl print:bg-white print:border-none print:shadow-none print:p-0 flex flex-col justify-between max-h-[92vh] sm:max-h-[90vh]" id="statement-print-area">
            <div className="space-y-4 overflow-y-auto pr-1 print:overflow-visible print:pr-0 scrollbar-thin">

              {/* Header */}
              {(() => {
                const statementStats = customerStatsMap.get(statementCustomer.id) || { realtimeOutstanding: Number(statementCustomer.outstanding || 0) };
                const stmtDues = statementStats.realtimeOutstanding;

                return (
                  <>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2.5 pb-3 border-b border-border print:border-slate-300">
                      <div>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest print:hidden">Customer History & Ledger Hub</span>
                        <h3 className="text-base sm:text-lg font-black text-foreground print:text-black uppercase mt-0.5">{statementCustomer.customer_name} — Account Profile</h3>
                      </div>
                      <div className="flex flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2 print:hidden">
                        {stmtDues > 0 ? (
                          <button
                            onClick={() => handleOpenPayModal(statementCustomer)}
                            className="px-2.5 sm:px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-lg text-[11px] sm:text-xs transition shadow-md flex items-center gap-1 active:scale-95 cursor-pointer whitespace-nowrap"
                          >
                            💵 Collect Udhar (₹{stmtDues.toFixed(2)})
                          </button>
                        ) : stmtDues < 0 ? (
                          <button
                            onClick={() => handleOpenRefundModal(statementCustomer)}
                            className="px-2.5 sm:px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-lg text-[11px] sm:text-xs transition shadow-md flex items-center gap-1 active:scale-95 cursor-pointer whitespace-nowrap"
                            title="Refund this advance balance to the customer."
                          >
                            💸 Refund Advance (₹{Math.abs(stmtDues).toFixed(2)})
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            const name = statementCustomer.customer_name;
                            setStatementCustomer(null);
                            if (onNewInvoice) onNewInvoice(name);
                          }}
                          className="px-2.5 sm:px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-[11px] sm:text-xs transition shadow-md flex items-center gap-1 active:scale-95 cursor-pointer whitespace-nowrap"
                        >
                          🛒 Create New Invoice
                        </button>
                        <button
                          onClick={() => setStatementCustomer(null)}
                          className="px-3 py-1.5 bg-background border border-border text-textSecondary hover:text-foreground font-bold rounded-lg text-xs transition"
                        >
                          &times; Close
                        </button>
                      </div>
                    </div>

                    {/* Customer Metadata Card */}
                    <div className="bg-background p-3.5 sm:p-4 border border-border rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs print:bg-white print:border-slate-300 print:text-black">
                      <div>
                        <div className="text-textMuted text-[10px] uppercase font-bold">Account Name</div>
                        <div className="text-foreground print:text-black font-bold uppercase">{statementCustomer.customer_name}</div>
                        <div className="text-textMuted text-[11px] mt-0.5">{statementCustomer.address || 'No address logged'}</div>
                      </div>
                      <div>
                        <div className="text-textMuted text-[10px] uppercase font-bold">Contact Phone</div>
                        <div className="text-foreground print:text-black font-mono font-bold">{statementCustomer.phone || 'N/A'}</div>
                        <div className="text-textMuted text-[11px] mt-0.5">
                          {statementCustomer.dob ? `🎂 DOB: ${new Date(statementCustomer.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : (statementCustomer.email || 'No email')}
                        </div>
                      </div>
                      <div>
                        <div className="text-textMuted text-[10px] uppercase font-bold">Active Udhar Dues</div>
                        <div className={`font-mono font-black text-sm print:text-black ${stmtDues > 0 ? 'text-rose-600 dark:text-rose-400' : (stmtDues < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-600 dark:text-emerald-400')}`}>
                          {stmtDues > 0 ? `₹${stmtDues.toFixed(2)}` : (stmtDues < 0 ? `₹${Math.abs(stmtDues).toFixed(2)} (Advance)` : '₹0.00 ✓ Cleared')}
                        </div>
                        <div className="text-textMuted text-[10px]">Credit limit: ₹{Number(statementCustomer.credit_limit || 0).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-textMuted text-[10px] uppercase font-bold">Total Invoices Billed</div>
                        <div className="text-primary font-bold font-mono text-sm print:text-black">{rawCustomerInvoices.length} Bills</div>
                        <div className="text-textMuted text-[10px]">
                          Lifetime Spent: ₹{rawCustomerInvoices.reduce((acc, curr) => {
                            const saleTotal = Number(curr.total_amount || 0);
                            const returnsTotal = (curr.returns || []).reduce((retAcc: number, ret: any) => retAcc + Number(ret.total_refund_amount || 0), 0);
                            return acc + Math.max(0, saleTotal - returnsTotal);
                          }, 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Interactive History Tabs */}
              <div className="flex border-b border-border text-xs font-bold gap-1.5 sm:gap-2 print:hidden overflow-x-auto whitespace-nowrap scrollbar-none pb-0.5">
                <button
                  onClick={() => setStatementTab('ledger')}
                  className={`py-2 px-3 border-b-2 transition ${statementTab === 'ledger' ? 'border-primary text-primary' : 'border-transparent text-textMuted hover:text-foreground'}`}
                >
                  📜 Ledger Timeline ({statementLedger.length})
                </button>
                <button
                  onClick={() => setStatementTab('invoices')}
                  className={`py-2 px-3 border-b-2 transition ${statementTab === 'invoices' ? 'border-primary text-primary' : 'border-transparent text-textMuted hover:text-foreground'}`}
                >
                  🧾 Itemized Past Invoices ({rawCustomerInvoices.length})
                </button>
                <button
                  onClick={() => setStatementTab('products')}
                  className={`py-2 px-3 border-b-2 transition ${statementTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-textMuted hover:text-foreground'}`}
                >
                  📦 Products Bought ({purchasedProductsHistory.length})
                </button>
              </div>

              {/* Tab 1: Ledger Timeline */}
              {statementTab === 'ledger' && (
                <div className="space-y-4">
                  {/* Summary Financial Header */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:grid-cols-3 print:gap-2">
                    <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl print:bg-white print:border-slate-300">
                      <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider print:text-black">
                        🔴 Total Sales Billed (Debit +)
                      </div>
                      <div className="text-base font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5 print:text-black">
                        ₹{statementSummaryStats.totalDebits.toFixed(2)}
                      </div>
                    </div>

                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl print:bg-white print:border-slate-300">
                      <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider print:text-black">
                        🟢 Total Payments Received (Credit -)
                      </div>
                      <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 print:text-black">
                        ₹{statementSummaryStats.totalCredits.toFixed(2)}
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border print:bg-white print:border-slate-300 ${statementSummaryStats.netOutstanding > 0 ? 'bg-amber-500/10 border-amber-500/30' : (statementSummaryStats.netOutstanding < 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-primary/10 border-primary/30')}`}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-textPrimary print:text-black flex justify-between items-center">
                        <span>🟡 Net Pending Udhar</span>
                        {statementSummaryStats.netOutstanding === 0 && <span className="text-primary font-bold">✓ Cleared</span>}
                        {statementSummaryStats.netOutstanding < 0 && <span className="text-emerald-500 font-bold">✓ Advance</span>}
                      </div>
                      <div className={`text-base font-black font-mono mt-0.5 print:text-black ${statementSummaryStats.netOutstanding > 0 ? 'text-amber-500 dark:text-amber-400' : (statementSummaryStats.netOutstanding < 0 ? 'text-emerald-500' : 'text-primary')}`}>
                        ₹{Math.abs(statementSummaryStats.netOutstanding).toFixed(2)} {statementSummaryStats.netOutstanding < 0 ? '(Cr)' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Organized Financial Statement Table */}
                  <div className="overflow-x-auto border border-border print:border-slate-300 rounded-xl bg-background/25 print:overflow-visible">
                    <table className="w-full text-left text-xs text-textSecondary print:text-black">
                      <thead>
                        <tr className="border-b border-border print:border-slate-300 bg-background/50 print:bg-slate-100 text-textPrimary print:text-black text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap">
                          <th className="p-2.5 text-center w-[4%]">#</th>
                          <th className="p-2.5 text-center w-[16%]">Tx Date & Time</th>
                          <th className="p-2.5 text-left w-[25%]">Entry / Particulars</th>
                          <th className="p-2.5 text-center w-[15%]">Ref / Inv No.</th>
                          <th className="p-2.5 text-center w-[8%]">Mode</th>
                          <th className="p-2.5 text-right w-[10%]">Debit (+)</th>
                          <th className="p-2.5 text-right w-[10%]">Credit (-)</th>
                          <th className="p-2.5 text-right w-[12%] font-black">Running Bal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border print:divide-slate-200">
                        {statementLedger.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-textMuted font-medium">No financial statement entries logged.</td>
                          </tr>
                        ) : (
                          statementLedger.map((row, idx) => {
                            const rawD = new Date(row.date);
                            const isDateOnly = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date.trim());
                            const formattedDateStr = isNaN(rawD.getTime()) ? String(row.date || '-') : (
                              isDateOnly
                                ? rawD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                : `${rawD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${rawD.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                            );
                            const isDebit = row.debit > 0;
                            const isCredit = row.credit > 0;
                            const bal = row.runningBalance || 0;

                            return (
                              <tr key={idx} className="hover:bg-slate-100/5 transition font-medium print:hover:bg-transparent">
                                <td className="p-3 font-mono font-bold text-foreground print:text-black text-center">{idx + 1}</td>
                                <td className="p-3 font-mono text-xs font-semibold whitespace-nowrap text-foreground print:text-black">{formattedDateStr}</td>
                                <td className="p-3 font-extrabold uppercase whitespace-nowrap">
                                  {isDebit ? (
                                    <span className="text-rose-500 print:text-black flex items-center gap-1">
                                      <i className="fa-solid fa-file-invoice text-[11px]"></i> {row.type}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-500 print:text-black flex items-center gap-1">
                                      <i className="fa-solid fa-money-bill-check text-[11px]"></i> {row.type}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 font-mono font-bold text-primary print:text-black whitespace-nowrap">{row.ref}</td>
                                <td className="p-3 font-semibold uppercase text-textMuted print:text-black whitespace-nowrap">{row.mode}</td>
                                <td className="p-3 text-right font-mono font-black text-rose-500 print:text-black whitespace-nowrap">
                                  {isDebit ? `₹${row.debit.toFixed(2)}` : '-'}
                                </td>
                                <td className="p-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 print:text-black whitespace-nowrap">
                                  {isCredit ? `₹${row.credit.toFixed(2)}` : '-'}
                                </td>
                                <td className="p-3 text-right font-mono font-black text-foreground print:text-black whitespace-nowrap bg-background/30 print:bg-transparent">
                                  {bal > 0 ? (
                                    <span className="text-amber-500 dark:text-amber-400 font-black print:text-black">
                                      ₹{bal.toFixed(2)} <span className="text-[10px] font-bold">Dr</span>
                                    </span>
                                  ) : bal < 0 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-black print:text-black">
                                      ₹{Math.abs(bal).toFixed(2)} <span className="text-[10px] font-bold">Cr</span>
                                    </span>
                                  ) : (
                                    <span className="text-primary font-bold text-[11px] print:text-black">
                                      ₹0.00 (Nil)
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 2: Itemized Past Invoices */}
              {statementTab === 'invoices' && (
                <div className="space-y-3 print:hidden">
                  {rawCustomerInvoices.length === 0 ? (
                    <div className="text-center py-6 text-textMuted text-xs font-semibold">No invoices recorded for this customer.</div>
                  ) : (
                    rawCustomerInvoices.map((inv: any, idx: number) => {
                      const invoiceTotalAmt = Number(inv.total_amount || 0);
                      const returnsTotal = (inv.returns || []).reduce((retAcc: number, ret: any) => retAcc + Number(ret.total_refund_amount || 0), 0);
                      
                      // How much of the returns were credited to Udhar? (Assuming Credit Notes reduce Udhar)
                      const creditReturnsTotal = (inv.returns || []).reduce((retAcc: number, ret: any) => {
                        return retAcc + ((ret.refund_mode || '').toLowerCase().includes('credit') ? Number(ret.total_refund_amount || 0) : 0);
                      }, 0);

                      const collectedAmt = inv.amount_collected !== undefined
                        ? Number(inv.amount_collected || 0)
                        : (inv.paid_amount !== undefined ? Number(inv.paid_amount || 0) : (inv.payment_status === 'Paid' ? invoiceTotalAmt : 0));

                      const rawUnpaid = inv.unpaid_current_bill !== undefined
                        ? Number(inv.unpaid_current_bill || 0)
                        : (inv.due_amount !== undefined ? Number(inv.due_amount || 0) : Math.max(0, invoiceTotalAmt - collectedAmt));
                        
                      // Actual pending udhar takes into account credit note returns
                      const unpaidUdharAmt = Math.max(0, rawUnpaid - creditReturnsTotal);

                      const isPending = unpaidUdharAmt > 0 || (inv.payment_status !== 'Paid' && unpaidUdharAmt > 0);

                      return (
                        <div key={inv.id || idx} className={`rounded-xl p-4 space-y-3 border ${isPending ? 'bg-slate-900 border-rose-500/70' : 'bg-secondary border-border'}`}>
                          <div className="flex justify-between items-center border-b border-border/80 pb-2">
                            <div>
                              <div className="font-mono font-black text-sm text-foreground uppercase">{inv.invoice_number}</div>
                              <div className="text-xs text-textMuted">{new Date(inv.sale_date || inv.created_at).toLocaleString()}</div>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              {isPending ? (
                                <div className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/50 px-2.5 py-1 rounded-lg">
                                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                                  <span className="font-mono font-black text-xs text-rose-400">⚠️ ₹{unpaidUdharAmt.toFixed(2)} Udhar Pending</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg text-primary text-xs font-bold">
                                  ✓ Fully Settled
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm(`Delete sales invoice ${inv.invoice_number}? This action cannot be undone.`)) return;
                                  try {
                                    const res = await SaleService.deleteSale(inv.id);
                                    if (res.error) throw new Error(res.error);
                                    await refreshAllData();
                                    alert('✓ Invoice deleted successfully.');
                                  } catch (err: any) {
                                    alert('Failed to delete invoice: ' + (err.message || err));
                                  }
                                }}
                                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 font-bold text-xs rounded-lg border border-rose-500/30 transition cursor-pointer flex items-center gap-1"
                                title="Delete sales invoice"
                              >
                                <i className="fa-solid fa-trash-can text-[10px]"></i> Delete
                              </button>
                            </div>
                          </div>

                          {/* Payment Ledger Breakdown */}
                          <div className={`grid ${returnsTotal > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-2 bg-background/80 p-2.5 rounded-lg text-xs font-semibold border border-border`}>
                            <div>
                              <span className="text-[10px] text-textMuted block uppercase font-bold">Bill Total</span>
                              <span className={`font-mono font-extrabold ${returnsTotal > 0 ? 'line-through text-textMuted text-[10px]' : 'text-foreground'}`}>₹{invoiceTotalAmt.toFixed(2)}</span>
                              {returnsTotal > 0 && <div className="font-mono font-extrabold text-foreground">₹{Math.max(0, invoiceTotalAmt - returnsTotal).toFixed(2)}</div>}
                            </div>
                            {returnsTotal > 0 && (
                              <div>
                                <span className="text-[10px] text-rose-400 block uppercase font-bold">Returned</span>
                                <span className="font-mono font-extrabold text-rose-400">-₹{returnsTotal.toFixed(2)}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-[10px] text-textMuted block uppercase font-bold">Amount Paid</span>
                              <span className="font-mono font-extrabold text-primary">₹{collectedAmt.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-textMuted block uppercase font-bold">Udhar Pending</span>
                              <span className={`font-mono font-extrabold ${unpaidUdharAmt > 0 ? 'text-rose-400' : 'text-textMuted'}`}>
                                {unpaidUdharAmt > 0 ? `+₹${unpaidUdharAmt.toFixed(2)}` : '₹0.00'}
                              </span>
                            </div>
                          </div>

                          {/* Items list */}
                          <div className="space-y-1">
                            <div className="text-[10px] font-extrabold uppercase text-textMuted">Itemized Line Products:</div>
                            {(!inv.items || inv.items.length === 0) ? (
                              <div className="text-xs text-textMuted">Standard bill line items</div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {inv.items.map((item: any, i: number) => {
                                  const name = item.product?.product_name || item.product_name || 'Item';
                                  const qty = Number(item.qty || 1);
                                  const rate = Number(item.rate || 0);
                                  return (
                                    <div key={i} className="flex justify-between items-center text-xs bg-background/80 p-2 rounded-lg border border-border font-semibold">
                                      <span className="text-foreground uppercase truncate max-w-[180px]">{name} x {qty}</span>
                                      <span className="font-mono text-primary font-bold">₹{(qty * rate).toFixed(2)}</span>
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
              )}

              {/* Tab 3: Aggregated Purchased Products */}
              {statementTab === 'products' && (
                <div className="space-y-2 print:hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-textSecondary">
                      <thead>
                        <tr className="border-b border-border text-textPrimary text-[10px] font-extrabold uppercase">
                          <th className="pb-2">Product Name</th>
                          <th className="pb-2 text-center">Gross Qty Bought</th>
                          <th className="pb-2 text-center">Returned</th>
                          <th className="pb-2 text-center">Net Remaining</th>
                          <th className="pb-2 text-right">Total Amount Spent (₹)</th>
                          <th className="pb-2 text-right">Last Purchased</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchasedProductsHistory.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-textMuted">No products purchased yet.</td>
                          </tr>
                        ) : (
                          purchasedProductsHistory.map((p, idx) => (
                            <tr key={idx} className="border-b border-border hover:bg-background/40">
                              <td className="py-3 font-bold text-foreground uppercase">{p.name}</td>
                              <td className="py-3 text-center font-mono font-bold text-foreground">{p.totalQty}</td>
                              <td className={`py-3 text-center font-mono font-bold ${p.returnedQty > 0 ? 'text-rose-500' : 'text-textMuted'}`}>{p.returnedQty > 0 ? `-${p.returnedQty}` : '-'}</td>
                              <td className="py-3 text-center font-mono font-bold text-emerald-500">{p.remainingQty}</td>
                              <td className="py-3 text-right font-mono font-bold text-primary">₹{p.totalSpent.toFixed(2)}</td>
                              <td className="py-3 text-right font-mono text-textMuted text-[11px]">{new Date(p.lastDate).toLocaleDateString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* Print Controls */}
            <div className="flex gap-3 mt-6 pt-3 border-t border-border print:hidden">
              <button className="flex-1 px-4 py-2 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border text-textSecondary hover:text-foreground rounded-lg text-xs font-semibold transition"
                onClick={() => setStatementCustomer(null)}>
                Close Statement
              </button>
              <button className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                onClick={() => window.print()}>
                🖨️ Print Ledger Statement
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
