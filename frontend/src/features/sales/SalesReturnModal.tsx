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
          const pUnit = item.product?.p_unit || 'Box';
          const sUnit = item.product?.s_unit || item.product?.unit || 'Pcs';
          const piecesPerPack = Math.max(0.000001, Number(item.product?.pieces_per_pack || 1));
          const isDualUnit = piecesPerPack > 1 || (pUnit.toLowerCase() !== sUnit.toLowerCase());
          
          const invoiceRate = Number(item.rate);
          const packPriceDiff = Math.abs(invoiceRate - Number(item.product?.selling_price || 0));
          const piecePriceDiff = Math.abs(invoiceRate - Number(item.product?.piece_selling_price || 0));
          
          // Guess the unit the item was sold in based on the rate
          const likelySoldAsPack = packPriceDiff <= piecePriceDiff;
          const invoiceUnit = likelySoldAsPack ? pUnit : sUnit;

          let returnedQtyInInvoiceUnits = 0;
          if (invoice.returns && Array.isArray(invoice.returns)) {
            invoice.returns.forEach((ret: any) => {
              if (ret.items && Array.isArray(ret.items)) {
                ret.items.forEach((ri: any) => {
                  if (ri.sales_item_id === item.id) {
                    const pastReturnUnit = ri.return_unit || invoiceUnit;
                    let pastQty = Number(ri.return_qty || 0);
                    
                    // Convert pastQty to invoiceUnit
                    if (invoiceUnit === pUnit && pastReturnUnit === sUnit) {
                       pastQty = pastQty / piecesPerPack;
                    } else if (invoiceUnit === sUnit && pastReturnUnit === pUnit) {
                       pastQty = pastQty * piecesPerPack;
                    }
                    returnedQtyInInvoiceUnits += pastQty;
                  }
                });
              }
            });
          }

          const availableQty = Math.max(0, Number(item.qty || 0) - returnedQtyInInvoiceUnits);

          return {
            ...item,
            qty: availableQty, // Replace original qty with net available qty in invoice units
            return_qty: 0,
            return_unit: invoiceUnit,
            invoice_unit: invoiceUnit,
            p_unit: pUnit,
            s_unit: sUnit,
            pieces_per_pack: piecesPerPack,
            is_dual_unit: isDualUnit
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
          const validQty = isNaN(qty) ? 0 : Math.max(0, qty);
          // We can validate if it exceeds available qty here, but let's just do it
          return { ...item, return_qty: validQty };
        }
        return item;
      })
    );
  };

  const handleUnitChange = (itemId: string, unit: string) => {
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return { ...item, return_unit: unit, return_qty: 0 }; // Reset qty on unit change to avoid confusion
        }
        return item;
      })
    );
  };

  const calculateRefund = (item: any) => {
    let qtyInInvoiceUnits = item.return_qty;
    if (item.invoice_unit === item.p_unit && item.return_unit === item.s_unit) {
      qtyInInvoiceUnits = item.return_qty / item.pieces_per_pack;
    } else if (item.invoice_unit === item.s_unit && item.return_unit === item.p_unit) {
      qtyInInvoiceUnits = item.return_qty * item.pieces_per_pack;
    }
    return qtyInInvoiceUnits * Number(item.rate);
  };

  const totalRefund = returnItems.reduce((acc, item) => acc + calculateRefund(item), 0);
  const isReturnValid = totalRefund > 0;

  const handleSubmit = async () => {
    if (!isReturnValid) return;
    
    // Validate max qty
    let isExceeding = false;
    returnItems.forEach(item => {
       let qtyInInvoiceUnits = item.return_qty;
       if (item.invoice_unit === item.p_unit && item.return_unit === item.s_unit) {
         qtyInInvoiceUnits = item.return_qty / item.pieces_per_pack;
       } else if (item.invoice_unit === item.s_unit && item.return_unit === item.p_unit) {
         qtyInInvoiceUnits = item.return_qty * item.pieces_per_pack;
       }
       if (qtyInInvoiceUnits > item.qty + 0.001) { // 0.001 for float math
           isExceeding = true;
       }
    });

    if (isExceeding) {
        alert("Return quantity cannot exceed purchased quantity.");
        return;
    }

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
        .map((item) => {
           // Calculate base unit stock return qty (s_unit)
           let stockReturnQty = item.return_qty;
           if (item.return_unit === item.p_unit) {
               stockReturnQty = item.return_qty * item.pieces_per_pack;
           }

           return {
             sales_item_id: item.id,
             product_id: item.product_id,
             return_qty: item.return_qty,
             return_unit: item.return_unit,
             refund_amount: calculateRefund(item),
             stock_return_qty: stockReturnQty // We'll pass this to service to handle stock
           };
        });

      await SalesReturnService.createSalesReturn(payload, itemsPayload as any, null);
      
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
      <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-foreground">Return Items - Invoice {invoice.invoice_number}</h2>
          <button onClick={onClose} className="text-textMuted hover:text-foreground text-xl font-bold">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto mb-4 border border-border rounded-lg p-1 bg-background/50">
          <table className="w-full text-left text-sm text-foreground">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-textMuted font-bold bg-secondary">
                <th className="p-3">Product</th>
                <th className="p-3">Invoiced As</th>
                <th className="p-3 text-center">Available Qty</th>
                <th className="p-3 text-center" colSpan={2}>Return Qty & Unit</th>
                <th className="p-3 text-right">Refund Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returnItems.map((item) => (
                <tr key={item.id} className="hover:bg-primary/5">
                  <td className="p-3 font-semibold uppercase">{item.product?.product_name || 'Item'}</td>
                  <td className="p-3 text-xs">
                    <div className="font-mono text-primary font-bold">₹{Number(item.rate).toFixed(2)}</div>
                    <div className="text-[10px] text-textMuted uppercase">{item.invoice_unit}</div>
                  </td>
                  <td className="p-3 text-center font-mono font-bold">{Number(item.qty).toFixed(2)} {item.invoice_unit}</td>
                  <td className="p-3 pr-1 w-24">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="w-full bg-background border border-border rounded p-1.5 text-center font-bold focus:border-primary focus:outline-none text-foreground"
                      value={item.return_qty === 0 ? '' : item.return_qty}
                      onChange={(e) => handleQtyChange(item.id, e.target.value)}
                    />
                  </td>
                  <td className="p-3 pl-1 w-28">
                    {item.is_dual_unit ? (
                      <select
                        className="w-full bg-background border border-border rounded p-1.5 text-xs font-bold text-foreground focus:border-primary focus:outline-none uppercase"
                        value={item.return_unit}
                        onChange={(e) => handleUnitChange(item.id, e.target.value)}
                      >
                        <option value={item.p_unit}>{item.p_unit}</option>
                        <option value={item.s_unit}>{item.s_unit}</option>
                      </select>
                    ) : (
                      <div className="p-1.5 text-xs font-bold uppercase text-textMuted text-center">{item.return_unit}</div>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-500">
                    ₹{calculateRefund(item).toFixed(2)}
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

