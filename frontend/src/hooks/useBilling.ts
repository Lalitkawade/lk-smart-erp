import { useState } from 'react';
import { useErpContext } from '../context/ErpContext';
import { CustomerService } from '../services/customerService';
import { SaleService } from '../services/saleService';
import { InventoryService } from '../services/inventoryService';
import { PaymentService } from '../services/paymentService';
import type { CartItem, Product } from '../types/erp.types';
import { getProductUnitRates } from '../utils/formatters';

export function useBilling(tenantId: string) {
  const { sales: contextSales, refreshAllData } = useErpContext();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');

  const sales = contextSales || [];

  const addToCart = (product: Product, isLoose: boolean = false) => {
    const existing = cart.find(item => item.product.id === product.id && item.isLoose === isLoose);
    const piecesPerPack = Math.max(1, Number(product.pieces_per_pack || 1));
    const stockInBaseUnits = Number(product.current_stock || 0);

    // Calculate total base units currently added to cart for this product
    const currentBaseUnitsInCart = cart
      .filter(item => item.product.id === product.id)
      .reduce((sum, item) => sum + (item.qty * (item.isLoose ? 1 : piecesPerPack)), 0);

    const addedBaseUnits = isLoose ? 1 : piecesPerPack;

    if (existing) {
      if (currentBaseUnitsInCart + addedBaseUnits > stockInBaseUnits) {
        const baseUnit = product.unit || product.s_unit || 'Nos';
        throw new Error(`Insufficient stock. Only ${stockInBaseUnits} ${baseUnit} available in inventory.`);
      }
      setCart(cart.map(item => (item.product.id === product.id && item.isLoose === isLoose) ? { ...item, qty: item.qty + 1 } : item));
    } else {
      if (addedBaseUnits > stockInBaseUnits) {
        const baseUnit = product.unit || product.s_unit || 'Nos';
        throw new Error(`Insufficient stock. Only ${stockInBaseUnits} ${baseUnit} available in inventory.`);
      }
      const { piecePrice, packPrice } = getProductUnitRates(product);
      const rate = isLoose ? piecePrice : packPrice;
      setCart([...cart, { product, qty: 1, rate, discountPercent: 0, isLoose }]);
    }
  };

  const updateCartQty = (productId: string, qty: number, isLoose: boolean = false, qtyText?: string) => {
    const item = cart.find(i => i.product.id === productId && i.isLoose === isLoose);
    if (!item) return;

    const piecesPerPack = Math.max(1, Number(item.product.pieces_per_pack || 1));
    const stockInBaseUnits = Number(item.product.current_stock || 0);

    // Calculate other cart items' total base units for this product
    const otherItemsBaseUnits = cart
      .filter(i => i.product.id === productId && !(i.isLoose === isLoose))
      .reduce((sum, i) => sum + (i.qty * (i.isLoose ? 1 : piecesPerPack)), 0);

    const requestedBaseUnits = otherItemsBaseUnits + (qty * (isLoose ? 1 : piecesPerPack));

    if (requestedBaseUnits > stockInBaseUnits) {
      const baseUnit = item.product.unit || item.product.s_unit || 'Nos';
      throw new Error(`Insufficient stock. Only ${stockInBaseUnits} ${baseUnit} available in inventory.`);
    }

    setCart(cart.map(i => (i.product.id === productId && i.isLoose === isLoose) ? { ...i, qty: Math.max(0, qty), qtyText } : i));
  };

  const updateCartRate = (productId: string, rate: number, isLoose: boolean = true) => {
    const safeRate = Math.max(0, Number(rate) || 0);
    setCart(cart.map(i => (i.product.id === productId && i.isLoose === isLoose) ? { ...i, rate: safeRate } : i));
  };

  const updateCartDiscount = (productId: string, discount: number, isLoose: boolean = true) => {
    const safeDisc = Math.max(0, Math.min(100, Number(discount) || 0));
    setCart(cart.map(i => {
      if (i.product.id === productId && i.isLoose === isLoose) {
        return { ...i, discountPercent: safeDisc };
      }
      return i;
    }));
  };

  const updateCartUnit = (productId: string, currentIsLoose: boolean, targetIsLoose: boolean) => {
    if (currentIsLoose === targetIsLoose) return;
    const item = cart.find(i => i.product.id === productId && i.isLoose === currentIsLoose);
    if (!item) return;

    const piecesPerPack = Math.max(1, Number(item.product.pieces_per_pack || 1));
    const stockInBaseUnits = Number(item.product.current_stock || 0);

    // Calculate other cart items' total base units for this product
    const otherItemsBaseUnits = cart
      .filter(i => i.product.id === productId && !(i.isLoose === currentIsLoose))
      .reduce((sum, i) => sum + (i.qty * (i.isLoose ? 1 : piecesPerPack)), 0);
    const targetItem = cart.find(i => i.product.id === productId && i.isLoose === currentIsLoose);
    if (!targetItem) return;

    const { piecePrice, packPrice } = getProductUnitRates(targetItem.product);
    const newRate = targetIsLoose ? piecePrice : packPrice;
    const existingTargetIndex = cart.findIndex(i => i.product.id === productId && i.isLoose === targetIsLoose);

    if (existingTargetIndex >= 0) {
      setCart(cart.filter(i => !(i.product.id === productId && i.isLoose === currentIsLoose)).map((i, idx) => {
        if (i.product.id === productId && i.isLoose === targetIsLoose) {
          return { ...i, qty: i.qty + targetItem.qty, rate: newRate };
        }
        return i;
      }));
    } else {
      setCart(cart.map(i => {
        if (i.product.id === productId && i.isLoose === currentIsLoose) {
          return { ...i, isLoose: targetIsLoose, rate: newRate };
        }
        return i;
      }));
    }
  };

  const removeFromCart = (productId: string, isLoose: boolean = true) => {
    setCart(cart.filter(i => !(i.product.id === productId && i.isLoose === isLoose)));
  };

  const processCheckout = async (options?: { amountCollected?: number; repayUdharAmount?: number; paymentMode?: string; transactionId?: string; discountAmount?: number; dueDate?: string; matchedCustomer?: any }) => {
    const activeCart = cart.filter(i => i.qty > 0);
    if (activeCart.length === 0) throw new Error('Cart is empty or has 0 quantity items.');

    const cartSubtotal = activeCart.reduce((acc, curr) => acc + (curr.qty * curr.rate * (1 - (curr.discountPercent || 0) / 100)), 0);
    const manualDiscount = options?.discountAmount && options.discountAmount > 0 
      ? Math.min(cartSubtotal, options.discountAmount) 
      : 0;
    const totalAmount = Math.max(0, cartSubtotal - manualDiscount);
    const gstAmount = 0; // GST is frozen for retail billing
    const currentPaymentMode = options?.paymentMode || paymentMode;
    const currentTxnId = options?.transactionId !== undefined ? options.transactionId : transactionId;

    try {
      let matchedCustomer: any = options?.matchedCustomer || null;

      // 1. Look up matching customer profile if provided
      const trimmedName = customerName.trim();
      const trimmedPhone = customerPhone.trim();

      if (!matchedCustomer && trimmedName && trimmedName.toUpperCase() !== 'CASH CUSTOMER') {
        const searchRes = await CustomerService.searchCustomers(trimmedPhone || trimmedName, tenantId);
        if (searchRes.data && searchRes.data.length > 0) {
          matchedCustomer = searchRes.data[0];
        }

        // Calculate past unpaid due amount from sales invoices if matchedCustomer is missing or has 0 outstanding
        let pastInvoiceDue = 0;
        try {
          const pastInvs = sales.filter((inv: any) => 
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
      const newOutstanding = previousOutstanding - appliedToPreviousUdhar + unpaidCurrentBill;

      // Auto-register customer in database if they don't have a valid UUID yet
      if (customerName.trim() && customerName.trim().toUpperCase() !== 'CASH CUSTOMER') {
        const updatePayload: any = {};
        if (options?.dueDate) {
          updatePayload.due_date = options.dueDate;
        }

        if (!matchedCustomer || !isValidUUID(matchedCustomer.id)) {
          try {
            const createRes = await CustomerService.createCustomer({
              tenant_id: tenantId,
              customer_name: customerName.trim().toUpperCase(),
              phone: customerPhone.trim(),
              credit_limit: 50000,
              ...updatePayload
            });
            if (createRes.data) matchedCustomer = createRes.data;
          } catch (e) {}
        } else {
          try {
            await CustomerService.updateCustomer(matchedCustomer.id, updatePayload);
          } catch (e) {}
        }
      }

      if (appliedToPreviousUdhar > 0 && matchedCustomer && isValidUUID(matchedCustomer.id)) {
        // Log collection payment for previous udhar repaid
        try {
          await PaymentService.recordCustomerPayment({
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
        tenant_id: tenantId || '00000000-0000-0000-0000-000000000000',
        invoice_number: 'INV-' + Date.now().toString().slice(-6),
        customer_name: customerName.trim() || 'Cash Customer',
        customer_phone: customerPhone || null,
        payment_mode: currentPaymentMode || 'Cash',
        ref_number: currentTxnId || null,
        payment_status: invoiceStatus,
        subtotal: cartSubtotal,
        discount_amount: manualDiscount,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        due_amount: dueAmount,
        gst_amount: gstAmount,
        sale_date: new Date().toISOString()
      };

      let invoice: any = { ...invoicePayload };

      const itemsPayload = cart.map(item => {
        const piecesPerPack = Math.max(0.000001, Number(item.product.pieces_per_pack || 1));
        const conversionFactor = item.isLoose ? 1 : piecesPerPack;
        const transactionUnit = item.isLoose 
          ? (item.product.s_unit || item.product.unit || 'Nos') 
          : (item.product.p_unit || item.product.purchase_units?.[0] || 'Box');

        return {
          product_id: item.product.id,
          qty: item.qty,
          rate: item.rate,
          amount: item.qty * item.rate * (1 - (item.discountPercent || 0) / 100),
          unit: transactionUnit,
          base_unit: item.product.base_unit || item.product.unit || 'Nos',
          conversion_factor: conversionFactor,
          base_quantity: item.qty * conversionFactor
        };
      });

      const res = await SaleService.createSale(invoicePayload as any, itemsPayload);
      if (res.data) {
        invoice = res.data;
      }

      // 3. Update product stock in Supabase via central InventoryService
      try {
        await InventoryService.deductStockForInvoice(cart);
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
          amount: c.qty * c.rate * (1 - (c.discountPercent || 0) / 100),
          isLoose: c.isLoose,
          unitName: (c as any).unitName || (c.isLoose ? (c.product.s_unit || c.product.unit) : c.product.p_unit),
          purchase_price: c.product.purchase_price,
          pieces_per_pack: c.product.pieces_per_pack
        }))
      };

      try {
        const prevCacheStr = localStorage.getItem('lk_sales_invoices');
        const prevList = prevCacheStr ? JSON.parse(prevCacheStr) : [];
        const nextList = [compiledInvoice, ...prevList.filter((inv: any) => inv.id !== compiledInvoice.id)];
        localStorage.setItem('lk_sales_invoices', JSON.stringify(nextList));
      } catch(e) {}

      // Refresh state asynchronously in background without blocking print modal render
      refreshAllData().catch(e => console.warn('Background refresh error:', e));

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

  const deleteSale = async (saleId: string) => {
    const res = await SaleService.deleteSale(saleId);
    if (res.error) throw new Error(res.error);
    await refreshAllData();
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
    updateCartRate,
    updateCartDiscount,
    updateCartUnit,
    removeFromCart,
    processCheckout,
    deleteSale,
    sales,
    isProcessing: false
  };
}
