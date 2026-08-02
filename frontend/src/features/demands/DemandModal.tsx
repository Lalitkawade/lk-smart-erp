import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDemandTracker, UnstockedDemand } from '../../hooks/useDemandTracker';

interface DemandModalProps {
  tenantId?: string;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToProducts?: (prefillName?: string) => void;
}

export default function DemandModal({ tenantId, isOpen, onClose, onNavigateToProducts }: DemandModalProps) {
  const { 
    demands, 
    highDemandAlerts, 
    alertThreshold, 
    updateItemThreshold,
    logDemand, 
    incrementDemand, 
    dismissDemand 
  } = useDemandTracker(tenantId);
  const [newItemName, setNewItemName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newItemName.trim();
    if (!val) return;
    
    logDemand(val);
    setNewItemName('');
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
      <div className="bg-secondary border border-border rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-foreground">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-background/50 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-clipboard-list text-amber-500 text-sm"></i>
              <h3 className="text-base font-bold text-foreground">Customer Demand Log</h3>
            </div>
            <p className="text-xs text-textMuted mt-0.5">
              Log unstocked items requested by customers to track high-demand procurement needs.
            </p>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-textMuted hover:text-foreground text-xs font-semibold rounded-lg hover:bg-background border border-transparent hover:border-border transition"
          >
            ✕ Close
          </button>
        </div>

        {/* High Demand Warning Banner */}
        {highDemandAlerts.length > 0 && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 px-5 py-2.5 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
            <i className="fa-solid fa-triangle-exclamation text-sm text-rose-600 dark:text-rose-400"></i>
            <span><strong>{highDemandAlerts.length} High Demand Item{highDemandAlerts.length > 1 ? 's' : ''}</strong> reached target request thresholds.</span>
          </div>
        )}

        {/* Add New Demand Form */}
        <form onSubmit={handleSubmit} className="p-4 border-b border-border flex gap-2 bg-background/30">
          <input 
            type="text"
            className="flex-grow bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-textMuted font-medium focus:outline-none focus:border-primary"
            placeholder="Enter unstocked item name (e.g. 12mm Asian Paint Brush)..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
          />
          <button 
            type="submit"
            disabled={isSubmitting || !newItemName.trim()}
            className="bg-primary hover:bg-primary/90 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shrink-0 disabled:opacity-50 shadow-xs"
          >
            <i className="fa-solid fa-plus text-xs"></i> {isSubmitting ? 'Saving...' : 'Log Request'}
          </button>
        </form>

        {/* Demands List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
          {demands.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <i className="fa-solid fa-clipboard-list text-2xl text-textMuted"></i>
              <p className="text-xs font-semibold text-textMuted">No customer demand requests logged yet.</p>
              <p className="text-[11px] text-textMuted/80">Log requested items above to track what customers want in your store.</p>
            </div>
          ) : (
            demands.map((item: UnstockedDemand) => {
              const targetThreshold = item.min_alert_qty !== undefined ? item.min_alert_qty : alertThreshold;
              const isHighDemand = item.request_count >= targetThreshold;

              return (
                <div 
                  key={item.id}
                  className={`p-3.5 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition ${
                    isHighDemand 
                      ? 'bg-rose-500/5 border-rose-500/30' 
                      : 'bg-background/40 border-border hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-foreground uppercase tracking-wide">
                        {item.item_name}
                      </span>
                      {isHighDemand ? (
                        <span className="text-[10px] font-extrabold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-mono">
                          🔥 High Demand ({item.request_count} / {targetThreshold})
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-secondary text-textMuted border border-border px-2 py-0.5 rounded font-mono">
                          {item.request_count} / {targetThreshold} Reqs
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-textMuted font-mono">
                      <span>Requested: {new Date(item.last_requested_at).toLocaleDateString()}</span>
                      <span className="text-textMuted">•</span>

                      {/* Product-wise Min Alert Threshold Stepper */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-textMuted font-sans">Min Alert:</span>
                        <button
                          type="button"
                          onClick={() => updateItemThreshold(item.id, targetThreshold - 1)}
                          className="w-4 h-4 rounded bg-background border border-border text-textSecondary hover:text-foreground text-[10px] flex items-center justify-center font-bold"
                          title="Decrease min alert threshold"
                        >
                          -
                        </button>
                        <span className="text-[11px] font-bold text-foreground w-5 text-center">{targetThreshold}</span>
                        <button
                          type="button"
                          onClick={() => updateItemThreshold(item.id, targetThreshold + 1)}
                          className="w-4 h-4 rounded bg-background border border-border text-textSecondary hover:text-foreground text-[10px] flex items-center justify-center font-bold"
                          title="Increase min alert threshold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => incrementDemand(item.id)}
                      className="px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded text-xs font-bold transition flex items-center gap-1"
                      title="Customer requested item again"
                    >
                      <i className="fa-solid fa-plus text-[10px]"></i> +1 ({item.request_count})
                    </button>

                    {onNavigateToProducts && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateToProducts(item.item_name);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition flex items-center gap-1 shadow-xs"
                        title="Add to product catalog"
                      >
                        <i className="fa-solid fa-box-open text-[10px]"></i> Add Product
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => dismissDemand(item.id)}
                      className="p-1.5 text-textMuted hover:text-rose-400 transition"
                      title="Remove demand record"
                    >
                      <i className="fa-solid fa-trash-can text-xs"></i>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
