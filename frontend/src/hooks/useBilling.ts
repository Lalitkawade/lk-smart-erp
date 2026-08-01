import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import type { CartItem, Product, SalesInvoice } from '../types/erp.types';

export function useBilling(tenantId: string) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [sales, setSales] = useState<SalesInvoice[]>([]);

  const fetchSales = async () => {
    if (!tenantId) return;
    try {
      // Query sales invoices alongside their itemized lines & products
      const { data, error } = await supabase
        .from('sales_invoices')
        .select(`
          *,
          items:sales_items(
            *,
            product:products(*)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('sale_date', { ascending: false });

      if (error) throw error;
      const fetchedList = data || [];
      const uniqueList: any[] = [];
      const seen = new Set<string>();
      fetchedList.forEach((inv: any) => {
        const k = inv.invoice_number || inv.id;
        if (k && !seen.has(k)) {
          seen.add(k);
          uniqueList.push(inv);
        }
      });
      setSales(uniqueList as any[]);
      localStorage.setItem('lk_sales', JSON.stringify(uniqueList));
    } catch (e) {
      console.error('Failed to fetch sales invoices:', e);
    }
  };

  // Fetch sales records on mount/tenant changes
  useEffect(() => {
    fetchSales();
    window.addEventListener('storage', fetchSales);
    return () => window.removeEventListener('storage', fetchSales);
  }, [tenantId]);

  const addToCart = (product: Product, isLoose: boolean = false) => {
    const existing = cart.find(item => item.product.id === product.id && item.isLoose === isLoose);
    const piecesPerPack = Number(product.pieces_per_pack || 1);
    const stockInPieces = Number(product.current_stock || 0) * piecesPerPack;

    // Calculate total pieces currently added to cart for this product
    const currentPiecesInCart = cart
      .filter(item => item.product.id === product.id)
      .reduce((sum, item) => sum + (item.qty * (item.isLoose ? 1 : piecesPerPack)), 0);

    const addedPieces = isLoose ? 1 : piecesPerPack;

    if (existing) {
      if (currentPiecesInCart + addedPieces > stockInPieces) {
        throw new Error(`Insufficient stock. Only ${product.current_stock} packs left.`);
      }
      setCart(cart.map(item => (item.product.id === product.id && item.isLoose === isLoose) ? { ...item, qty: item.qty + 1 } : item));
    } else {
      if (addedPieces > stockInPieces) {
        throw new Error(`Out of stock.`);
      }
      const rate = isLoose ? Number(product.piece_selling_price || 0) : Number(product.selling_price);
      setCart([...cart, { product, qty: 1, rate, isLoose }]);
    }
  };

  const updateCartQty = (productId: string, qty: number, isLoose: boolean = false) => {
    const item = cart.find(i => i.product.id === productId && i.isLoose === isLoose);
    if (!item) return;

    const piecesPerPack = Number(item.product.pieces_per_pack || 1);
    const stockInPieces = Number(item.product.current_stock || 0) * piecesPerPack;

    // Calculate other cart items' total pieces for this product
    const otherItemsPieces = cart
      .filter(i => i.product.id === productId && !(i.isLoose === isLoose))
      .reduce((sum, i) => sum + (i.qty * (i.isLoose ? 1 : piecesPerPack)), 0);

    const requestedPieces = otherItemsPieces + (qty * (isLoose ? 1 : piecesPerPack));

    if (requestedPieces > stockInPieces) {
      throw new Error(`Insufficient stock. Only ${item.product.current_stock} packs available.`);
    }

    setCart(cart.map(i => (i.product.id === productId && i.isLoose === isLoose) ? { ...i, qty: Math.max(1, qty) } : i));
  };

  const removeFromCart = (productId: string, isLoose: boolean = false) => {
    setCart(cart.filter(i => !(i.product.id === productId && i.isLoose === isLoose)));
  };

  const processCheckout = async (options?: { amountCollected?: number; repayUdharAmount?: number; paymentMode?: string; transactionId?: string }) => {
    if (cart.length === 0) throw new Error('Cart is empty.');

    const totalAmount = cart.reduce((acc, curr) => acc + curr.qty * curr.rate, 0);
    const gstAmount = 0; // GST is frozen for retail billing
    const currentPaymentMode = options?.paymentMode || paymentMode;
    const currentTxnId = options?.transactionId !== undefined ? options.transactionId : transactionId;

    try {
      let matchedCustomer: any = null;

      // 1. Look up matching customer profile if provided
      const trimmedName = customerName.trim();
      const trimmedPhone = customerPhone.trim();

      if (trimmedName && trimmedName.toUpperCase() !== 'CASH CUSTOMER') {
        // Try local cache first for instant match
        try {
          const localCusts = JSON.parse(localStorage.getItem('lk_customers') || '[]');
          matchedCustomer = localCusts.find((c: any) => 
            (c.customer_name && c.customer_name.trim().toUpperCase() === trimmedName.toUpperCase()) ||
            (trimmedPhone && c.phone && c.phone.trim() === trimmedPhone)
          ) || null;
        } catch(e) {}

        // Query database to ensure fresh outstanding balance data
        let query = supabase.from('customers').select('*').eq('tenant_id', tenantId);
        if (trimmedPhone) {
          query = query.or(`customer_name.ilike.${trimmedName},phone.eq.${trimmedPhone}`);
        } else {
          query = query.ilike('customer_name', trimmedName);
        }

        const { data: custRows } = await query.limit(1);
        if (custRows && custRows.length > 0) {
          matchedCustomer = custRows[0];
        }

        // Calculate past unpaid due amount from sales invoices if matchedCustomer is missing or has 0 outstanding
        let pastInvoiceDue = 0;
        try {
          const localSales = JSON.parse(localStorage.getItem('lk_sales') || '[]');
          const pastInvs = localSales.filter((inv: any) => 
            inv.customer_name && inv.customer_name.trim().toUpperCase() === trimmedName.toUpperCase()
          );
          pastInvoiceDue = pastInvs.reduce((acc: number, curr: any) => acc + Number(curr.due_amount || 0), 0);
        } catch(e) {}

        if (!matchedCustomer) {
          matchedCustomer = {
            customer_name: trimmedName.toUpperCase(),
            phone: trimmedPhone,
            outstanding: pastInvoiceDue
          };
        }
      }

      const previousOutstanding = Number(matchedCustomer?.outstanding || 0);

      let explicitRepayUdhar = 0;
      if (options?.repayUdharAmount && options.repayUdharAmount > 0 && previousOutstanding > 0) {
        explicitRepayUdhar = Math.min(options.repayUdharAmount, previousOutstanding);
      }

      // Determine amount collected for current bill
      let amountCollected = options?.amountCollected !== undefined 
        ? options.amountCollected 
        : (currentPaymentMode === 'Credit' ? 0 : totalAmount);

      if (currentPaymentMode === 'Credit' && amountCollected === undefined) {
        amountCollected = 0;
      }

      let invoiceStatus = 'Paid';
      let paidAmount = 0;
      let dueAmount = 0;
      let appliedToCurrentBill = 0;
      let appliedToPreviousUdhar = 0;
      let unpaidCurrentBill = 0;

      if (amountCollected >= totalAmount) {
        // Current bill is paid in full
        appliedToCurrentBill = totalAmount;
        paidAmount = totalAmount;
        dueAmount = 0;
        invoiceStatus = 'Paid';

        const excess = amountCollected - totalAmount;
        appliedToPreviousUdhar = explicitRepayUdhar + (excess > 0 && previousOutstanding > explicitRepayUdhar ? Math.min(excess, previousOutstanding - explicitRepayUdhar) : 0);
      } else {
        // Partial payment or full credit on current bill
        appliedToCurrentBill = Math.max(0, amountCollected);
        paidAmount = appliedToCurrentBill;
        unpaidCurrentBill = totalAmount - appliedToCurrentBill;
        dueAmount = unpaidCurrentBill;
        invoiceStatus = appliedToCurrentBill > 0 ? 'Partial' : 'Unpaid';
        appliedToPreviousUdhar = explicitRepayUdhar;
      }

      const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      // Always calculate new net outstanding balance
      const newOutstanding = Math.max(0, previousOutstanding - appliedToPreviousUdhar + unpaidCurrentBill);

      // Auto-register customer in database if they don't have a valid UUID yet
      if (customerName.trim() && customerName.trim().toUpperCase() !== 'CASH CUSTOMER') {
        if (!matchedCustomer || !isValidUUID(matchedCustomer.id)) {
          try {
            const { data: newCust } = await supabase
              .from('customers')
              .insert({
                tenant_id: tenantId,
                customer_name: customerName.trim().toUpperCase(),
                phone: customerPhone.trim(),
                credit_limit: 50000,
                outstanding: newOutstanding
              })
              .select()
              .single();

            if (newCust) matchedCustomer = newCust;
          } catch (e) {}
        } else {
          try {
            await supabase
              .from('customers')
              .update({ outstanding: newOutstanding })
              .eq('id', matchedCustomer.id);
          } catch(e) {}
        }
      }

      if (appliedToPreviousUdhar > 0 && matchedCustomer && isValidUUID(matchedCustomer.id)) {
        // Log collection payment for previous udhar repaid
        try {
          await supabase.from('customer_payments').insert({
            tenant_id: tenantId,
            customer_id: matchedCustomer.id,
            amount: appliedToPreviousUdhar,
            payment_mode: currentPaymentMode || 'Cash',
            ref_number: 'POS-UDHAR-REP-' + Date.now().toString().slice(-6),
            payment_date: new Date().toISOString()
          });
        } catch (e) {}
      }

      // 2. Create Invoice
      const generatedInvId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'f' + Date.now().toString(16).padStart(31, '0').slice(0, 31);

      let invoicePayload: any = {
        id: generatedInvId,
        tenant_id: isValidUUID(tenantId) ? tenantId : '00000000-0000-0000-0000-000000000000',
        invoice_number: 'INV-' + Date.now().toString().slice(-6),
        customer_name: customerName.trim() || 'Cash Customer',
        customer_phone: customerPhone || null,
        payment_mode: currentPaymentMode || 'Cash',
        ref_number: currentTxnId || null,
        payment_status: invoiceStatus,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        due_amount: dueAmount,
        gst_amount: gstAmount,
        sale_date: new Date().toISOString()
      };

      let invoice: any = { ...invoicePayload };

      if (isValidUUID(tenantId)) {
        try {
          const { data: invData, error: invErr } = await supabase
            .from('sales_invoices')
            .insert(invoicePayload)
            .select()
            .single();

          if (!invErr && invData) {
            invoice = invData;
          }
        } catch (e) {
          console.warn('Remote invoice save note (saved locally):', e);
        }
      }

      // 3. Save Invoice Line Items and update product stock locally and remotely
      try {
        const localProdsStr = localStorage.getItem('lk_products') || '[]';
        const localProds: Product[] = JSON.parse(localProdsStr);

        for (const item of cart) {
          // Decrement local stock level
          const piecesPerPack = Number(item.product.pieces_per_pack || 1);
          const totalDeductedPacks = item.isLoose ? (item.qty / piecesPerPack) : item.qty;
          
          const pIdx = localProds.findIndex(p => p.id === item.product.id);
          if (pIdx >= 0) {
            localProds[pIdx].current_stock = Math.max(0, Number(localProds[pIdx].current_stock || 0) - totalDeductedPacks);
          }

          if (isValidUUID(tenantId) && isValidUUID(invoice.id)) {
            try {
              await supabase.from('sales_items').insert({
                invoice_id: invoice.id,
                product_id: item.product.id,
                qty: item.qty,
                rate: item.rate,
                amount: item.qty * item.rate
              });

              if (pIdx >= 0) {
                await supabase.from('products').update({ current_stock: localProds[pIdx].current_stock }).eq('id', item.product.id);
              }
            } catch (e) {}
          }
        }

        localStorage.setItem('lk_products', JSON.stringify(localProds));
      } catch (e) {}

      // Return compiled invoice object (including item lines mapped for printing and udhar ledger breakdown)
      const compiledInvoice = {
        ...invoice,
        customer_name: customerName.trim() || 'Cash Customer',
        customer_phone: customerPhone,
        sale_date: invoice.sale_date || new Date().toISOString(),
        previous_outstanding: previousOutstanding,
        amount_collected: amountCollected,
        applied_to_current_bill: appliedToCurrentBill,
        applied_to_udhar: appliedToPreviousUdhar,
        unpaid_current_bill: unpaidCurrentBill,
        remaining_outstanding: newOutstanding,
        items: cart.map(c => ({
          product_id: c.product.id,
          product_name: c.product.product_name,
          product: c.product,
          qty: c.qty,
          rate: c.rate,
          isLoose: c.isLoose
        }))
      };

      // Cache invoice into local storage for immediate product card history matching
      try {
        const cached = localStorage.getItem('lk_sales') || '[]';
        const list = JSON.parse(cached);
        const existingIdx = list.findIndex((i: any) => (i.invoice_number && i.invoice_number === compiledInvoice.invoice_number) || i.id === compiledInvoice.id);
        if (existingIdx >= 0) {
          list[existingIdx] = compiledInvoice;
        } else {
          list.unshift(compiledInvoice);
        }
        localStorage.setItem('lk_sales', JSON.stringify(list));
      } catch (e) {}

      // Refresh list locally
      setSales(prev => [compiledInvoice, ...prev.filter(s => s.id !== compiledInvoice.id)]);
      window.dispatchEvent(new Event('storage')); // notify other tabs to refresh their listings

      setCart([]);
      setCustomerName('Cash Customer');
      setCustomerPhone('');
      setTransactionId('');
      return compiledInvoice;
    } catch (e) {
      console.error('Checkout processing error fallback:', e);
      throw e;
    }
  };

  return {
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
    sales,
    isProcessing: false
  };
}
