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
    setAlertThreshold, 
    updateItemThreshold,
    logDemand, 
    incrementDemand, 
    dismissDemand 
  } = useDemandTracker(tenantId);
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
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
              <i className="fa-solid fa-fire text-amber-500"></i> Customer Lost Demand Tracker
            </span>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mt-0.5">
              Unstocked Product Requests Log
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Track items requested by customers that are not in stock. Default threshold: <span className="font-bold text-amber-600">{alertThreshold}+ requests</span>.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Default Min Quantity Control */}
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300/80 px-3 py-1.5 rounded-xl shrink-0 shadow-xs">
              <span className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1">
                <i className="fa-solid fa-sliders text-amber-600"></i> Global Min:
              </span>
              <div className="flex items-center gap-1">
                <button 
                  type="button" 
                  onClick={() => setAlertThreshold(Math.max(1, alertThreshold - 1))}
                  className="w-6 h-6 rounded bg-white border border-slate-300 hover:bg-slate-100 font-extrabold text-xs text-slate-900 flex items-center justify-center shadow-xs active:scale-95 transition"
                  title="Decrease default threshold"
                >
                  -
                </button>
                <input 
                  type="number" 
                  min="1" 
                  max="100" 
                  value={alertThreshold} 
                  onChange={(e) => setAlertThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-11 text-center bg-white border border-slate-300 rounded py-0.5 text-xs font-black text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  title="Default min request threshold"
                />
                <button 
                  type="button" 
                  onClick={() => setAlertThreshold(alertThreshold + 1)}
                  className="w-6 h-6 rounded bg-white border border-slate-300 hover:bg-slate-100 font-extrabold text-xs text-slate-900 flex items-center justify-center shadow-xs active:scale-95 transition"
                  title="Increase default threshold"
                >
                  +
                </button>
              </div>
              <span className="text-[10px] font-bold text-amber-900">Reqs</span>
            </div>

            <button 
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-800 text-xs font-black transition shrink-0"
            >
              &times; Close
            </button>
          </div>
        </div>

        {/* High Demand Warning Banner if any */}
        {highDemandAlerts.length > 0 && (
          <div className="bg-rose-50 border-b border-rose-200 px-5 py-3 flex items-center gap-3">
            <i className="fa-solid fa-triangle-exclamation text-rose-600 text-base animate-bounce"></i>
            <div className="text-xs">
              <span className="font-black text-black uppercase tracking-wide text-xs">
                {highDemandAlerts.length} High Demand Item{highDemandAlerts.length > 1 ? 's' : ''} Alert Triggered!
              </span>
              <p className="text-slate-600 text-[11px]">
                Items reaching their target request threshold trigger procurement warnings in your notification bell.
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
            <div className="space-y-3">
              {demands.map((item: UnstockedDemand) => {
                const targetThreshold = item.min_alert_qty !== undefined ? item.min_alert_qty : alertThreshold;
                const isHighDemand = item.request_count >= targetThreshold;

                return (
                  <div 
                    key={item.id}
                    className={`p-4 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-200 ${
                      isHighDemand 
                        ? 'bg-rose-50/90 border-rose-300 shadow-md shadow-rose-500/10' 
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    {/* Left Column: Product Info & Threshold Adjustment */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-black text-sm text-slate-950 uppercase tracking-wide">
                          {item.item_name}
                        </h4>
                        {isHighDemand ? (
                          <span className="text-[10px] font-black bg-black text-white px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm border border-slate-900">
                            <i className="fa-solid fa-fire text-amber-400 animate-pulse"></i> {targetThreshold}+ High Demand Alert
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-full border border-slate-200 uppercase">
                            {item.request_count} / {targetThreshold} Requests
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="text-[11px] text-slate-500 font-mono">
                          Last requested: {new Date(item.last_requested_at).toLocaleString()}
                        </div>

                        {/* Individual Product Threshold Stepper Control */}
                        <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-300/80 px-2.5 py-1 rounded-lg">
                          <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-tight">
                            Min Alert Qty:
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItemThreshold(item.id, targetThreshold - 1)}
                            className="w-5 h-5 rounded bg-white border border-slate-300 hover:bg-slate-200 text-slate-950 font-black text-xs flex items-center justify-center transition active:scale-95 shadow-xs"
                            title="Decrease min alert threshold for this item"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={targetThreshold}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateItemThreshold(item.id, parseInt(e.target.value) || 1)}
                            className="w-9 text-center bg-white border border-slate-300 rounded py-0.5 text-xs font-black text-slate-950 focus:outline-none focus:border-amber-500"
                            title="Custom min alert threshold for this product"
                          />
                          <button
                            type="button"
                            onClick={() => updateItemThreshold(item.id, targetThreshold + 1)}
                            className="w-5 h-5 rounded bg-white border border-slate-300 hover:bg-slate-200 text-slate-950 font-black text-xs flex items-center justify-center transition active:scale-95 shadow-xs"
                            title="Increase min alert threshold for this item"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Action Buttons */}
                    <div className="flex items-center gap-2.5 w-full md:w-auto justify-end shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => incrementDemand(item.id)}
                        className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs"
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
                          className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white border border-slate-800 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs"
                          title="Create this item in your inventory catalog"
                        >
                          <i className="fa-solid fa-box-open text-[10px]"></i> Add Stock
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => dismissDemand(item.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-100/60 rounded-xl transition"
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
          <span className="text-black font-black">Active High Demand Alerts: {highDemandAlerts.length}</span>
        </div>

      </div>
    </div>,
    document.body
  );
}
