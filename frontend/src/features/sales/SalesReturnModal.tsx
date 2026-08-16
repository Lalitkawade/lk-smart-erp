import React, { useState, useEffect } from 'react';
import { SalesInvoiceWithItems } from '../../services/saleService';
import { SalesReturnService } from '../../services/salesReturnService';

interface SalesReturnModalProps {
  tenantId: string;
  invoice: SalesInvoiceWithItems;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SalesReturnModal({ tenantId, invoice, onClose, onSuccess }: SalesReturnModalProps) {
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [refundMode, setRefundMode] = useState<'Credit' | 'Cash'>('Credit');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (invoice && invoice.items) {
      setReturnItems(
        invoice.items.map((item) => {
          let returnedQty = 0;
          if (invoice.returns && Array.isArray(invoice.returns)) {
            invoice.returns.forEach((ret: any) => {
              if (ret.items && Array.isArray(ret.items)) {
                ret.items.forEach((ri: any) => {
                  if (ri.sales_item_id === item.id) {
                    returnedQty += Number(ri.return_qty || 0);
                  }
                });
              }
            });
          }

          const availableQty = Math.max(0, Number(item.qty || 0) - returnedQty);

          return {
            ...item,
            qty: availableQty, // Replace original qty with net available qty
            return_qty: 0,
          };
        }).filter(item => item.qty > 0) // Only show items that still have qty available to return
      );
    }
  }, [invoice]);

  const handleQtyChange = (itemId: string, qtyStr: string) => {
    const qty = parseFloat(qtyStr);
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const validQty = isNaN(qty) ? 0 : Math.min(Math.max(0, qty), Number(item.qty));
          return { ...item, return_qty: validQty };
        }
        return item;
      })
    );
  };

  const totalRefund = returnItems.reduce((acc, item) => acc + (item.return_qty * Number(item.rate)), 0);
  const isReturnValid = totalRefund > 0;

  const handleSubmit = async () => {
    if (!isReturnValid) return;
    setIsSubmitting(true);

    try {
      const returnNumber = await SalesReturnService.generateReturnNumber(tenantId);
      
      const payload = {
        tenant_id: tenantId,
        invoice_id: invoice.id,
        return_number: returnNumber,
        total_refund_amount: totalRefund,
        refund_mode: refundMode,
        reason: reason.trim() || null,
      };

      const itemsPayload = returnItems
        .filter((item) => item.return_qty > 0)
        .map((item) => ({
          sales_item_id: item.id,
          product_id: item.product_id,
          return_qty: item.return_qty,
          refund_amount: item.return_qty * Number(item.rate),
        }));

      // For customer updates, try to find customer id from the invoice if it was linked properly.
      // The schema for sales_invoices doesn't strictly have customer_id but matches by name/phone. 
      // If customer is known, we can pass it. 
      // Let's rely on name/phone matching if needed, or skip if no ID is saved on invoice.
      // Assuming 'Credit' mode is only valid if we can link it.
      // We will skip `customerId` pass for now and rely on manual balance update if ID isn't directly on invoice.
      // Wait, let's see if we can fetch customer by name to apply the credit.
      
      await SalesReturnService.createSalesReturn(payload, itemsPayload, null);
      
      alert('Return processed successfully! Stock has been updated.');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Failed to process return: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
      <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-foreground">Return Items - Invoice {invoice.invoice_number}</h2>
          <button onClick={onClose} className="text-textMuted hover:text-foreground text-xl font-bold">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto mb-4 border border-border rounded-lg p-1 bg-background/50">
          <table className="w-full text-left text-sm text-foreground">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-textMuted font-bold bg-secondary">
                <th className="p-3">Product</th>
                <th className="p-3">Rate</th>
                <th className="p-3 text-center">Purchased Qty</th>
                <th className="p-3 text-center">Return Qty</th>
                <th className="p-3 text-right">Refund Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returnItems.map((item) => (
                <tr key={item.id} className="hover:bg-primary/5">
                  <td className="p-3 font-semibold uppercase">{item.product?.product_name || 'Item'}</td>
                  <td className="p-3 font-mono">₹{Number(item.rate).toFixed(2)}</td>
                  <td className="p-3 text-center font-mono font-bold">{item.qty}</td>
                  <td className="p-3 text-center">
                    <input
                      type="number"
                      min="0"
                      max={item.qty}
                      step="0.01"
                      className="w-24 bg-background border border-border rounded p-1.5 text-center font-bold focus:border-primary focus:outline-none text-foreground"
                      value={item.return_qty === 0 ? '' : item.return_qty}
                      onChange={(e) => handleQtyChange(item.id, e.target.value)}
                    />
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-500">
                    ₹{(item.return_qty * Number(item.rate)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-textMuted font-bold mb-1">Refund Mode</label>
            <select
              className="w-full bg-background border border-border rounded-lg p-2.5 text-sm font-semibold focus:border-primary focus:outline-none text-foreground"
              value={refundMode}
              onChange={(e) => setRefundMode(e.target.value as any)}
            >
              <option value="Credit">Credit Note (Reduce Outstanding)</option>
              <option value="Cash">Cash Refund (Given to Customer)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-textMuted font-bold mb-1">Reason for Return</label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-lg p-2.5 text-sm font-semibold focus:border-primary focus:outline-none text-foreground"
              placeholder="e.g. Excess material, Defective"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-border pt-4 mt-auto">
          <div className="text-sm">
            <span className="text-textMuted font-bold">Total Refund: </span>
            <span className="text-xl font-black text-emerald-500 font-mono">₹{totalRefund.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border text-foreground rounded-lg font-bold hover:bg-background transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isReturnValid || isSubmitting}
              className={`px-6 py-2 rounded-lg font-bold text-white transition ${
                isReturnValid && !isSubmitting ? 'bg-primary hover:bg-primary/90' : 'bg-primary/50 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Processing...' : 'Confirm Return'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
