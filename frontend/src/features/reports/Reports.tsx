import { useMemo } from 'react';
import type { SalesInvoice, PurchaseBill } from '../../types/erp.types';
import { t } from '../../utils/i18n';

interface ReportsProps {
  tenantId: string;
  sales: SalesInvoice[];
  purchases: PurchaseBill[];
}

export default function Reports({ tenantId, sales, purchases }: ReportsProps) {
  if (tenantId) {} // reference tenantId to satisfy compile check
  // Compute Monthly Selling and Purchasing totals
  const monthlyTotals = useMemo(() => {
    const monthsData: { [key: string]: { monthName: string; sales: number; purchases: number } } = {};

    // Process sales
    sales.forEach(s => {
      if (!s.sale_date) return;
      const d = new Date(s.sale_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const name = d.toLocaleDateString([], { year: 'numeric', month: 'short' });
      if (!monthsData[key]) {
        monthsData[key] = { monthName: name, sales: 0, purchases: 0 };
      }
      monthsData[key].sales += Number(s.total_amount || 0);
    });

    // Process purchases
    purchases.forEach(p => {
      if (!p.purchase_date) return;
      const d = new Date(p.purchase_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const name = d.toLocaleDateString([], { year: 'numeric', month: 'short' });
      if (!monthsData[key]) {
        monthsData[key] = { monthName: name, sales: 0, purchases: 0 };
      }
      monthsData[key].purchases += Number(p.total_amount || 0);
    });

    // Sort chronologically by key
    return Object.keys(monthsData)
      .sort((a, b) => a.localeCompare(b))
      .map(key => ({
        key,
        ...monthsData[key],
        netValue: monthsData[key].sales - monthsData[key].purchases
      }));
  }, [sales, purchases]);

  return (
    <div className="bg-secondary border border-border rounded-xl p-6 shadow-xl space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">{t('materialTrackingReports')}</h2>
        <p className="text-xs text-textMuted mt-1">Audit material flow volume comparisons grouped by calendar months</p>
      </div>

      {/* SVG Comparison Bar Chart */}
      <div className="bg-background/40 p-6 rounded-lg border border-border flex flex-col justify-between h-64 relative">
        {monthlyTotals.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-textMuted text-xs font-semibold">
            No monthly transactions mapped in workspace.
          </div>
        ) : (
          <div className="flex justify-around items-end h-full w-full pt-6">
            {monthlyTotals.map((m, idx) => {
              const maxVal = Math.max(...monthlyTotals.map(x => Math.max(x.sales, x.purchases)), 1);
              const salesHeightPercent = (m.sales / maxVal) * 80;
              const purchaseHeightPercent = (m.purchases / maxVal) * 80;

              return (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1 animate-fade-in">
                  {/* Bar Heights Stack */}
                  <div className="flex gap-2 items-end justify-center h-32 w-full">
                    {/* Sales Bar */}
                    <div 
                      className="w-5 bg-indigo-500 rounded-t-sm hover:bg-indigo-400 transition relative group"
                      style={{ height: `${Math.max(2, salesHeightPercent)}%` }}
                    >
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-950 border border-indigo-900 text-indigo-300 font-mono text-[9px] px-1.5 py-0.5 rounded shadow z-10 whitespace-nowrap">
                        Sales: ₹{m.sales.toLocaleString()}
                      </div>
                    </div>
                    {/* Purchase Bar */}
                    <div 
                      className="w-5 bg-blue-500 rounded-t-sm hover:bg-blue-400 transition relative group"
                      style={{ height: `${Math.max(2, purchaseHeightPercent)}%` }}
                    >
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-950 border border-blue-900 text-blue-400 font-mono text-[9px] px-1.5 py-0.5 rounded shadow z-10 whitespace-nowrap">
                        Purchases: ₹{m.purchases.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] font-bold text-foreground mt-1">{m.monthName}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end gap-4 text-[10px] font-bold border-t border-border/40 pt-2.5">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-indigo-500 rounded-sm inline-block"></span> Material Selling (Sales)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-blue-500 rounded-sm inline-block"></span> Material Purchasing (Purchases)</span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Month</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Material Selling (Sales Amount)</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Material Purchasing (Purchase Amount)</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Profit / Loss Surplus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {monthlyTotals.map((m, idx) => (
              <tr key={idx} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                <td className="py-3.5 px-4 text-center font-bold text-slate-900 dark:text-slate-100 text-xs uppercase">{m.monthName}</td>
                <td className="py-3.5 px-4 text-center font-mono text-slate-900 dark:text-slate-100 font-bold text-xs">₹{m.sales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="py-3.5 px-4 text-center font-mono text-slate-600 dark:text-slate-300 font-semibold text-xs">₹{m.purchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className={`py-3.5 px-4 text-center font-mono font-bold text-xs ${m.netValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {m.netValue >= 0 ? '+' : ''}₹{m.netValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
