import React, { useState, useEffect } from 'react';
import { SalesInvoiceWithItems } from '../../services/saleService';
import { SalesReturnService } from '../../services/salesReturnService';
import { supabase } from '../../api/supabase';

interface ReturnItemState {
  id: string;
  product_id: string;
  product_name: string;
  total_amount: number;
  actual_total_qty: number;
  rate_per_item: number;
  unit: string;
  stock_per_item: number;
  past_returned_qty: number;
  remaining_qty: number;
  remaining_amount: number;
  return_qty: number;
  error?: string;
}

interface SalesReturnModalProps {
  tenantId: string;
  invoice: SalesInvoiceWithItems;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SalesReturnModal({ tenantId, invoice, onClose, onSuccess }: SalesReturnModalProps) {
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([]);
  const [refundMode, setRefundMode] = useState<'Credit' | 'Cash'>('Credit');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const rawItems = (invoice && (invoice.items || (invoice as any).sales_items)) || [];
    if (rawItems.length > 0) {
      const parsedItems: ReturnItemState[] = rawItems.map((item: any) => {
        const prod = item.product || {};
        const baseUnit = (item.base_unit || prod.s_unit || prod.unit || 'Nos').trim();
        const billedQty = Number(item.qty || 1);
        const totalAmount = Number(item.amount !== undefined && item.amount !== null ? item.amount : (billedQty * Number(item.rate || 0)));

        const baseQty = Number(item.base_quantity || 0);
        const convFactor = Number(item.conversion_factor || 0);

        // Determine the actual single items the customer physically purchased:
        // If an additional unit was sold (e.g. 1 pack containing 7 pieces):
        // Then actual items = 7 Nos! NOT 1 Nos!
        let actualQty = billedQty;
        let stockPerItem = 1;

        if (baseQty > billedQty) {
          actualQty = baseQty;
          stockPerItem = 1;
        } else if (convFactor > 1 && (baseQty <= 0 || baseQty === billedQty)) {
          actualQty = billedQty * convFactor;
          stockPerItem = 1;
        } else if (baseQty > 0 && billedQty > 0 && baseQty < billedQty) {
          actualQty = billedQty;
          stockPerItem = baseQty / billedQty;
        } else if (convFactor > 0 && convFactor < 1) {
          actualQty = billedQty;
          stockPerItem = convFactor;
        } else {
          actualQty = billedQty;
          stockPerItem = 1;
        }

        const ratePerItem = actualQty > 0 ? (totalAmount / actualQty) : Number(item.rate || 0);

        // Calculate past returned items
        let pastReturnedQty = 0;
        let pastRefundAmount = 0;
        if (invoice.returns && Array.isArray(invoice.returns)) {
          invoice.returns.forEach((ret: any) => {
            if (ret.items && Array.isArray(ret.items)) {
              ret.items.forEach((ri: any) => {
                if (ri.sales_item_id === item.id) {
                  pastRefundAmount += Number(ri.refund_amount || 0);
                  const rQty = Number(ri.return_qty || 0);
                  pastReturnedQty += rQty;
                }
              });
            }
          });
        }

        const remainingQty = Math.max(0, actualQty - pastReturnedQty);
        const remainingAmount = Math.max(0, totalAmount - pastRefundAmount);

        return {
          id: item.id,
          product_id: item.product_id,
          product_name: prod.product_name || item.product_name || 'Item',
          total_amount: totalAmount,
          actual_total_qty: actualQty,
          rate_per_item: ratePerItem,
          unit: baseUnit,
          stock_per_item: stockPerItem,
          past_returned_qty: pastReturnedQty,
          remaining_qty: remainingQty,
          remaining_amount: remainingAmount,
          return_qty: 0,
          error: undefined
        };
      }).filter((item: ReturnItemState) => item.remaining_qty > 0.0001);

      setReturnItems(parsedItems);
    }
  }, [invoice]);

  const handleQtyChange = (itemId: string, qtyStr: string) => {
    const qty = parseFloat(qtyStr);
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const validQty = isNaN(qty) ? 0 : Math.max(0, qty);
          let error: string | undefined = undefined;
          if (validQty > item.remaining_qty + 0.0001) {
            error = `Exceeds available (${item.remaining_qty.toFixed(2)} ${item.unit})`;
          }
          return { ...item, return_qty: validQty, error };
        }
        return item;
      })
    );
  };

  const calculateRefund = (item: ReturnItemState) => {
    const returnQty = Number(item.return_qty || 0);
    if (returnQty <= 0) return 0;
    if (item.actual_total_qty <= 0) return 0;

    // If returning all remaining items, refund the exact remaining amount
    if (Math.abs(returnQty - item.remaining_qty) < 0.0001) {
      return Math.max(0, item.remaining_amount);
    }

    const refund = returnQty * item.rate_per_item;
    return Math.min(item.remaining_amount, Math.round(refund * 100) / 100);
  };

  const totalRefund = returnItems.reduce((acc, item) => acc + calculateRefund(item), 0);
  const isReturnValid = totalRefund > 0 && !returnItems.some(i => !!i.error);

  const handleSubmit = async () => {
    if (!isReturnValid || isSubmitting) return;

    // Double check exceeding
    const hasExceeding = returnItems.some((item) => {
      return Number(item.return_qty || 0) > item.remaining_qty + 0.0001;
    });

    if (hasExceeding) {
      alert("Return quantity cannot exceed available quantity.");
      return;
    }

    setIsSubmitting(true);

    try {
      const returnNumber = await SalesReturnService.generateReturnNumber(tenantId);

      const payload = {
        tenant_id: tenantId,
        invoice_id: invoice.id,
        return_number: returnNumber,
        total_refund_amount: Math.round(totalRefund * 100) / 100,
        refund_mode: refundMode,
        reason: reason.trim() || null,
      };

      const itemsPayload = returnItems
        .filter((item) => Number(item.return_qty) > 0)
        .map((item) => {
          const retQty = Number(item.return_qty);
          const refundAmt = calculateRefund(item);
          const stockRestore = retQty * (item.stock_per_item || 1);

          return {
            sales_item_id: item.id,
            product_id: item.product_id,
            return_qty: retQty,
            return_unit: item.unit,
            refund_amount: refundAmt,
            stock_return_qty: stockRestore,
            base_return_qty: stockRestore,
            base_unit: item.unit,
            conversion_factor: 1
          };
        });

      // Find customer id if Credit Note
      let customerId: string | null = (invoice as any).customer_id || null;
      if (!customerId && invoice.customer_name && invoice.customer_name.trim().toUpperCase() !== 'CASH CUSTOMER') {
        const { data: cData } = await supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('customer_name', invoice.customer_name.trim())
          .limit(1)
          .maybeSingle();
        if (cData) customerId = cData.id;
      }

      const res = await SalesReturnService.createSalesReturn(payload, itemsPayload as any, customerId);
      if (res.error) throw new Error(res.error);

      alert('✓ Return processed successfully! Stock and customer account have been updated.');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Failed to process return: ' + (err.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
      <div className="bg-secondary border border-border p-4 sm:p-6 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] my-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-border shrink-0">
          <div>
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Item Return Desk</span>
            <h2 className="text-lg sm:text-xl font-black text-foreground uppercase mt-0.5">
              Return Items — Invoice #{invoice.invoice_number || invoice.id}
            </h2>
            <div className="text-xs text-textMuted font-medium mt-0.5">
              Customer: <strong className="text-foreground uppercase">{invoice.customer_name || 'Cash Customer'}</strong>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-background hover:bg-slate-200 dark:hover:bg-slate-800 text-textMuted hover:text-foreground text-lg font-bold transition cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Items Table Container */}
        <div className="flex-1 min-h-0 overflow-y-auto mb-4 border border-border rounded-xl p-1 bg-background/50 scrollbar-thin">
          {returnItems.length === 0 ? (
            <div className="text-center py-12 text-xs text-textMuted font-semibold">
              <i className="fa-solid fa-check-circle text-2xl text-emerald-500 mb-2 block"></i>
              All items on this invoice have already been returned in full.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-foreground min-w-[650px]">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase text-textMuted font-extrabold bg-secondary">
                    <th className="p-3">Product</th>
                    <th className="p-3">Billed As</th>
                    <th className="p-3 text-center">Available Qty</th>
                    <th className="p-3 text-center w-40">Return Qty</th>
                    <th className="p-3 text-center w-24">Unit</th>
                    <th className="p-3 text-right">Refund (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {returnItems.map((item) => {
                    const refundAmt = calculateRefund(item);

                    return (
                      <tr key={item.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3 font-semibold uppercase">
                          <div className="text-foreground font-bold text-sm">{item.product_name}</div>
                        </td>

                        <td className="p-3 text-xs">
                          <div className="font-mono font-bold text-foreground">
                            {item.actual_total_qty} {item.unit} @ ₹{item.rate_per_item.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-textMuted font-mono">
                            Total: ₹{item.total_amount.toFixed(2)}
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <div className="font-mono font-black text-foreground text-base">
                            {item.remaining_qty.toFixed(0)} {item.unit}
                          </div>
                          {item.past_returned_qty > 0 && (
                            <div className="text-[10px] text-textMuted font-mono">
                              ({item.past_returned_qty} already returned)
                            </div>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <div className="relative inline-block w-full">
                            <input
                              type="number"
                              min="0"
                              max={item.remaining_qty}
                              step="any"
                              className={`w-full bg-background border ${item.error ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5' : 'border-border'} rounded-lg p-2 text-center font-mono font-bold text-foreground text-base focus:border-primary focus:outline-none`}
                              placeholder="0"
                              value={item.return_qty === 0 ? '' : item.return_qty}
                              onChange={(e) => handleQtyChange(item.id, e.target.value)}
                            />

                            {/* Easy 1-click Return helper buttons */}
                            <div className="flex gap-1 justify-center mt-1 text-[10px] font-bold">
                              {item.remaining_qty >= 2 && (
                                <button
                                  type="button"
                                  onClick={() => handleQtyChange(item.id, '2')}
                                  className="px-2 py-0.5 bg-primary/10 hover:bg-primary hover:text-white border border-primary/30 text-primary rounded-md cursor-pointer transition font-extrabold"
                                  title="Return 2 items"
                                >
                                  Return 2
                                </button>
                              )}
                              {item.remaining_qty > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleQtyChange(item.id, item.remaining_qty.toString())}
                                  className="px-2 py-0.5 bg-background border border-border hover:border-primary text-textMuted hover:text-primary rounded-md cursor-pointer transition font-bold"
                                  title="Return all items"
                                >
                                  All ({item.remaining_qty.toFixed(0)})
                                </button>
                              )}
                            </div>
                          </div>
                          {item.error && (
                            <div className="text-[10px] text-rose-500 font-bold mt-1">
                              {item.error}
                            </div>
                          )}
                        </td>

                        <td className="p-3 text-center">
                          <span className="font-mono font-bold text-foreground uppercase bg-background px-2.5 py-1 rounded-lg border border-border text-xs">
                            {item.unit}
                          </span>
                        </td>

                        <td className="p-3 text-right">
                          <div className="font-mono font-black text-base text-emerald-500">
                            ₹{refundAmt.toFixed(2)}
                          </div>
                          {item.return_qty > 0 && (
                            <div className="text-[10px] text-textMuted font-mono">
                              ({item.return_qty} × ₹{item.rate_per_item.toFixed(2)})
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Refund Mode & Reason Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 shrink-0">
          <div>
            <label className="block text-xs text-textMuted font-bold mb-1">Refund Settlement Mode</label>
            <select
              className="w-full bg-background border border-border rounded-lg p-2.5 text-xs sm:text-sm font-semibold focus:border-primary focus:outline-none text-foreground cursor-pointer"
              value={refundMode}
              onChange={(e) => setRefundMode(e.target.value as any)}
            >
              <option value="Credit">Credit Note (Reduce Outstanding Udhar)</option>
              <option value="Cash">Cash Refund (Payout Directly to Customer)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-textMuted font-bold mb-1">Reason for Return</label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-lg p-2.5 text-xs sm:text-sm font-semibold focus:border-primary focus:outline-none text-foreground"
              placeholder="e.g. Excess material, Defective, Wrong size"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-t border-border pt-4 mt-auto shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-textMuted font-bold uppercase tracking-wider">Total Refund Amount:</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-500 font-mono">₹{totalRefund.toFixed(2)}</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 border border-border text-foreground rounded-xl text-xs font-bold hover:bg-background transition active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isReturnValid || isSubmitting}
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs font-extrabold text-white transition shadow-md flex items-center justify-center gap-2 active:scale-95 cursor-pointer ${
                isReturnValid && !isSubmitting ? 'bg-primary hover:bg-primary/90' : 'bg-primary/50 cursor-not-allowed opacity-60'
              }`}
            >
              {isSubmitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Processing Return...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-rotate-left"></i>
                  <span>Confirm Return (₹{totalRefund.toFixed(2)})</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
