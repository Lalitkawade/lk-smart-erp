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
  const { demands, highDemandAlerts, logDemand, incrementDemand, dismissDemand } = useDemandTracker(tenantId);
  const [newItemName, setNewItemName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = newItemName.trim();
    if (!val) return;
    
    setIsSubmitting(true);
    try {
      await logDemand(val);
      setNewItemName('');
    } catch (err) {
      console.error('Failed to log demand:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-backdrop-fade">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900">
        
        {/* Header (Light Theme) */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
              <i className="fa-solid fa-fire text-amber-500"></i> Customer Lost Demand Tracker
            </span>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mt-0.5">
              Unstocked Product Requests Log
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Track items requested by customers that are not in stock. Items requested <span className="font-bold text-amber-600">5+ times</span> trigger automatic procurement warnings in your notification bell!
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-200/70 hover:bg-slate-300 text-slate-700 text-xs font-bold transition"
          >
            &times; Close
          </button>
        </div>

        {/* High Demand Warning Banner if any */}
        {highDemandAlerts.length > 0 && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 flex items-center gap-3">
            <i className="fa-solid fa-triangle-exclamation text-rose-600 text-base animate-bounce"></i>
            <div className="text-xs">
              <span className="font-black text-black uppercase tracking-wide text-xs">
                {highDemandAlerts.length} High Demand Item{highDemandAlerts.length > 1 ? 's' : ''} Alert (5+ Customer Requests)
              </span>
              <p className="text-slate-600 text-[11px]">
                Consider adding these items to your Product Catalog & issuing purchase orders.
              </p>
            </div>
          </div>
        )}

        {/* Add New Demand Form */}
        <form onSubmit={handleSubmit} className="p-4 bg-slate-50/80 border-b border-slate-200 flex gap-3">
          <input 
            type="text"
            className="flex-grow bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 font-semibold focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            placeholder="Enter unstocked item name requested by customer (e.g. 12mm Asian Paint Brush)..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
          />
          <button 
            type="submit"
            disabled={isSubmitting || !newItemName.trim()}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shrink-0 shadow-sm"
          >
            <i className="fa-solid fa-plus"></i> {isSubmitting ? 'Logging...' : 'Log Request'}
          </button>
        </form>

        {/* Demands List Table */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3 bg-slate-100/40">
          {demands.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <i className="fa-solid fa-clipboard-list text-3xl text-slate-300"></i>
              <p className="text-xs font-semibold text-slate-600">No customer demand requests logged yet.</p>
              <p className="text-[11px] text-slate-500">Type an item name above to log when a customer asks for an unstocked item!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {demands.map((item: UnstockedDemand) => {
                const isHighDemand = item.request_count >= 5;
                return (
                  <div 
                    key={item.id}
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition ${
                      isHighDemand 
                        ? 'bg-rose-50/80 border-rose-300 shadow-sm shadow-rose-500/5' 
                        : 'bg-white border-slate-200 hover:border-amber-400 shadow-sm'
                    }`}
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-slate-900 uppercase tracking-wide">
                          {item.item_name}
                        </span>
                        {isHighDemand ? (
                          <span className="text-[10px] font-black bg-black text-white px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-md border border-slate-900">
                            <i className="fa-solid fa-fire text-amber-400 animate-pulse"></i> 5+ High Demand Alert
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 uppercase">
                            {item.request_count} / 5 Requests
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Last requested: {new Date(item.last_requested_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => incrementDemand(item.id)}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-black transition flex items-center gap-1 shadow-xs"
                        title="Customer requested this item again"
                      >
                        <i className="fa-solid fa-plus text-[10px]"></i> +1 Request ({item.request_count})
                      </button>

                      {onNavigateToProducts && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigateToProducts(item.item_name);
                          }}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-black transition flex items-center gap-1 shadow-xs"
                          title="Create this item in your inventory catalog"
                        >
                          <i className="fa-solid fa-box-open text-[10px]"></i> Add Stock
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => dismissDemand(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Dismiss / Remove"
                      >
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-[11px] text-slate-600 font-medium">
          <span>Total Logged Items: {demands.length}</span>
          <span className="text-black font-black">High Demand Alerts (&ge; 5 Requests): {highDemandAlerts.length}</span>
        </div>

      </div>
    </div>,
    document.body
  );
}
