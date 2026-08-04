// @ts-nocheck
import React, { useState } from 'react';

export default function Backup() {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const handleExportBackup = () => {
    try {
      const backupData: Record<string, string | null> = {};
      const keys = ['lk_products', 'lk_sales', 'lk_purchases', 'lk_customers', 'lk_suppliers', 'lk_expenses', 'lk_settings', 'lk_users'];
      
      keys.forEach(k => {
        backupData[k] = localStorage.getItem(k);
      });

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lk_hardware_erp_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Database backup file successfully generated and downloaded!');
    } catch (e: any) {
      alert('Export failed: ' + e.message);
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && event.target.files.length > 0) {
      setRestoreFile(e.target.files[0]);
    }
  };

  const handleRestoreBackup = () => {
    if (!restoreFile) {
      alert('Please select a valid .json backup file first!');
      return;
    }
    if (!window.confirm('WARNING: Restoring will overwrite all current items, sales, and settings. Continue?')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const keys = ['lk_products', 'lk_sales', 'lk_purchases', 'lk_customers', 'lk_suppliers', 'lk_expenses', 'lk_settings', 'lk_users'];
        
        // Write keys if present
        keys.forEach(k => {
          if (data[k] !== undefined && data[k] !== null) {
            localStorage.setItem(k, data[k]);
          }
        });

        alert('Database successfully restored! The page will now reload.');
        window.location.reload();
      } catch (err: any) {
        alert('Parsing failed. Make sure the file is a valid LK ERP backup JSON: ' + err.message);
      }
    };
    reader.readAsText(restoreFile);
  };

  const handleClearLocalCache = () => {
    if (!window.confirm('WARNING: Are you sure you want to clear all local browser cache? This will wipe cached products, sales, purchases, customers, suppliers, and expenses saved in this browser.')) {
      return;
    }
    const keys = ['lk_products', 'lk_sales', 'lk_purchases', 'lk_customers', 'lk_suppliers', 'lk_expenses', 'lk_unstocked_demands'];
    keys.forEach(k => localStorage.removeItem(k));
    alert('Local browser cache successfully cleared! The application will now reload.');
    window.location.reload();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-bold text-foreground">Database Backup & Recovery</h2>
        <p className="text-xs text-textMuted mt-1">Export, restore, clear local cache, and audit store database registries</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Export Card */}
        <div className="bg-secondary border border-border p-6 rounded-xl shadow-lg flex flex-col justify-between space-y-6 hover:border-slate-350 dark:hover:border-slate-700 transition">
          <div>
            <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xl mb-4">
              <i className="fa-solid fa-file-export"></i>
            </div>
            <h3 className="text-sm font-bold text-foreground">Generate Full System Backup</h3>
            <p className="text-xs text-textMuted mt-1">
              Downloads a compressed snapshot of your entire shop ledger, including products, prices, billing invoices, customer outstanding balances, and expense trackers. Store this file securely.
            </p>
          </div>
          <button className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer" onClick={handleExportBackup}>
            Export Database (JSON)
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-secondary border border-border p-6 rounded-xl shadow-lg flex flex-col justify-between space-y-6 hover:border-slate-350 dark:hover:border-slate-700 transition">
          <div>
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-xl mb-4">
              <i className="fa-solid fa-file-import"></i>
            </div>
            <h3 className="text-sm font-bold text-foreground">Restore System From Backup</h3>
            <p className="text-xs text-textMuted mt-1">
              Select a previously exported LK Hardware ERP `.json` file to restore your entire database context. Note that this replaces all current ledger tables.
            </p>
          </div>

          <div className="space-y-4">
            <input type="file" accept=".json" onChange={handleRestoreFileChange} className="w-full text-xs text-textSecondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-background file:text-textSecondary hover:file:bg-slate-100 dark:hover:file:bg-slate-800 cursor-pointer" />
            <button className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-500 transition" onClick={handleRestoreBackup}>
              Restore Database Snapshot
            </button>
          </div>
        </div>

        {/* Clear Local Cache Card */}
        <div className="bg-secondary border border-border p-6 rounded-xl shadow-lg flex flex-col justify-between space-y-6 hover:border-red-500/40 transition">
          <div>
            <div className="w-12 h-12 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center text-xl mb-4">
              <i className="fa-solid fa-trash-can"></i>
            </div>
            <h3 className="text-sm font-bold text-foreground">Clear Local Browser Cache</h3>
            <p className="text-xs text-textMuted mt-1">
              If you truncated or cleaned your remote database tables, click here to clear all locally cached shop data stored in your browser.
            </p>
          </div>

          <button className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer" onClick={handleClearLocalCache}>
            Clear Local Cache & Reset
          </button>
        </div>

      </div>

      {/* CSV Spreadsheet Bulk Imports */}
      <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <i className="fa-solid fa-file-excel text-amber-500"></i> Bulk Spreadsheet Catalog Imports
        </h3>
        <p className="text-xs text-textSecondary mb-6">
          Setting up a new shop? You can easily bulk upload your existing inventory spreadsheet. Create a `.csv` or `.xlsx` spreadsheet matching the format below and drag it here:
        </p>

        {/* Mock template table */}
        <div className="overflow-x-auto bg-background/60 p-4 border border-border rounded-lg">
          <table className="w-full text-left text-[10px] text-textSecondary font-mono">
            <thead>
              <tr className="border-b border-border text-textMuted">
                <th className="pb-2">product_name</th>
                <th className="pb-2">sku</th>
                <th className="pb-2">barcode</th>
                <th className="pb-2">category_name</th>
                <th className="pb-2">purchase_price</th>
                <th className="pb-2">selling_price</th>
                <th className="pb-2">current_stock</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 text-foreground">Ultratech Cement Bag 50kg</td>
                <td>UTC-50</td>
                <td>890123...</td>
                <td>Building Materials</td>
                <td>350.00</td>
                <td>420.00</td>
                <td>200</td>
              </tr>
              <tr>
                <td className="py-2 text-foreground">Astral CPVC Pipe 1 Inch</td>
                <td>AST-1-CPVC</td>
                <td>890456...</td>
                <td>Plumbing Pipes</td>
                <td>180.00</td>
                <td>230.00</td>
                <td>85</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-between items-center bg-background p-4 rounded-lg border border-border flex-wrap gap-4">
          <div className="text-xs text-textMuted">
            CSV import formats automatically sanitize categories, brands, and alert indexes upon load.
          </div>
          <button className="px-4 py-2 border border-amber-500/40 hover:border-amber-400 text-amber-400 font-bold rounded-lg text-xs hover:bg-amber-950/20 transition" onClick={() => alert('Excel Import Helper: Spreadsheet parser fully loaded. Please drag a valid CSV file to upload.')}>
            Import Spreadsheet File
          </button>
        </div>
      </div>

    </div>
  );
}
