import { useMemo } from 'react';
import type { SalesInvoice, PurchaseBill } from '../../types/erp.types';

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
        <h2 className="text-xl font-bold text-foreground">Track the Material Selling And Purchasing as Per Months</h2>
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

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-textSecondary">
          <thead>
            <tr className="border-b border-border text-textPrimary font-extrabold uppercase tracking-wide">
              <th className="py-3">Month</th>
              <th className="py-3">Material Selling (Sales Amount)</th>
              <th className="py-3">Material Purchasing (Purchase Amount)</th>
              <th className="py-3 text-right">Profit / Loss Surplus</th>
            </tr>
          </thead>
          <tbody>
            {monthlyTotals.map((m, idx) => (
              <tr key={idx} className="border-b border-border hover:bg-slate-100/10 dark:hover:bg-slate-800/10">
                <td className="py-3.5 font-bold text-foreground">{m.monthName}</td>
                <td className="py-3.5 font-mono text-foreground font-bold">₹{m.sales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="py-3.5 font-mono text-textSecondary font-semibold">₹{m.purchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className={`py-3.5 text-right font-mono font-bold ${m.netValue >= 0 ? 'text-primary' : 'text-rose-400'}`}>
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
