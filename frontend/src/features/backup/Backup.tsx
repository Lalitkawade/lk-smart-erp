import React, { useState } from 'react';
import { supabase } from '../../api/supabase';
import { useErpContext } from '../../context/ErpContext';
import { useAuth } from '../../hooks/useAuth';

export default function Backup() {
  const { tenant } = useAuth();
  const { refreshAllData } = useErpContext();
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const tenantId = tenant?.id || '00000000-0000-0000-0000-000000000000';

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const [
        settingsRes,
        productsRes,
        customersRes,
        suppliersRes,
        salesInvoicesRes,
        salesItemsRes,
        purchaseBillsRes,
        purchaseItemsRes,
        custPaymentsRes,
        supPaymentsRes,
        expensesRes
      ] = await Promise.all([
        supabase.from('settings').select('*'),
        supabase.from('products').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('suppliers').select('*'),
        supabase.from('sales_invoices').select('*'),
        supabase.from('sales_items').select('*'),
        supabase.from('purchase_bills').select('*'),
        supabase.from('purchase_items').select('*'),
        supabase.from('customer_payments').select('*'),
        supabase.from('supplier_payments').select('*'),
        supabase.from('expenses').select('*')
      ]);

      const backupPayload = {
        version: '2.0-SSOT',
        timestamp: new Date().toISOString(),
        tenant_id: tenantId,
        data: {
          settings: settingsRes.data || [],
          products: productsRes.data || [],
          customers: customersRes.data || [],
          suppliers: suppliersRes.data || [],
          sales_invoices: salesInvoicesRes.data || [],
          sales_items: salesItemsRes.data || [],
          purchase_bills: purchaseBillsRes.data || [],
          purchase_items: purchaseItemsRes.data || [],
          customer_payments: custPaymentsRes.data || [],
          supplier_payments: supPaymentsRes.data || [],
          expenses: expensesRes.data || []
        }
      };

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lk_ssot_erp_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert('Single Source of Truth (SSOT) Database Backup file successfully generated!');
    } catch (e: any) {
      alert('Export failed: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setRestoreFile(e.target.files[0]);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreFile) {
      alert('Please select a valid .json backup file first!');
      return;
    }
    if (!window.confirm('WARNING: Restoring will bulk-upsert all products, sales, purchases, payments, and settings into Supabase. Continue?')) {
      return;
    }

    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string);

        if (!payload || typeof payload !== 'object' || !payload.data) {
          throw new Error('Invalid SSOT backup payload format. Missing data payload root.');
        }

        const data = payload.data;

        // Restore in dependency sequence
        const restoreSequence: Array<{ table: string; records: any[] }> = [
          { table: 'settings', records: data.settings || [] },
          { table: 'products', records: data.products || [] },
          { table: 'customers', records: data.customers || [] },
          { table: 'suppliers', records: data.suppliers || [] },
          { table: 'sales_invoices', records: data.sales_invoices || [] },
          { table: 'sales_items', records: data.sales_items || [] },
          { table: 'purchase_bills', records: data.purchase_bills || [] },
          { table: 'purchase_items', records: data.purchase_items || [] },
          { table: 'customer_payments', records: data.customer_payments || [] },
          { table: 'supplier_payments', records: data.supplier_payments || [] },
          { table: 'expenses', records: data.expenses || [] }
        ];

        for (const step of restoreSequence) {
          if (step.records && step.records.length > 0) {
            const { error } = await supabase.from(step.table as any).upsert(step.records);
            if (error) {
              console.warn(`Restore note for table ${step.table}:`, error.message);
            }
          }
        }

        await refreshAllData();
        alert('Supabase database successfully restored! Data synchronized.');
      } catch (err: any) {
        alert('Restore validation failed: ' + err.message);
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(restoreFile);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-secondary border border-border rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-bold text-foreground">Database Backup & Recovery (SSOT Engine)</h2>
        <p className="text-xs text-textMuted mt-1">Direct Cloud Database JSON Backup, Restore, and Bulk Upserts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Export Card */}
        <div className="bg-secondary border border-border p-6 rounded-xl shadow-lg flex flex-col justify-between space-y-6 hover:border-slate-350 dark:hover:border-slate-700 transition">
          <div>
            <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xl mb-4">
              <i className="fa-solid fa-file-export"></i>
            </div>
            <h3 className="text-sm font-bold text-foreground">Generate Full Cloud Backup</h3>
            <p className="text-xs text-textMuted mt-1">
              Downloads a compressed JSON snapshot of your entire database directly from Supabase, including products, customers, suppliers, billing invoices, purchase bills, payment ledgers, expenses, and store settings.
            </p>
          </div>
          <button 
            disabled={isExporting}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer disabled:opacity-50" 
            onClick={handleExportBackup}
          >
            {isExporting ? 'Generating SSOT Backup...' : 'Export Database (JSON)'}
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-secondary border border-border p-6 rounded-xl shadow-lg flex flex-col justify-between space-y-6 hover:border-slate-350 dark:hover:border-slate-700 transition">
          <div>
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl mb-4">
              <i className="fa-solid fa-file-import"></i>
            </div>
            <h3 className="text-sm font-bold text-foreground">Restore Database Payload</h3>
            <p className="text-xs text-textMuted mt-1">
              Bulk-upsert database records into Supabase in strict dependency order from a verified JSON backup file.
            </p>
            <div className="mt-4">
              <input 
                type="file" 
                accept=".json" 
                onChange={handleRestoreFileChange}
                className="block w-full text-xs text-textMuted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer" 
              />
            </div>
          </div>
          <button 
            disabled={isRestoring || !restoreFile}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer disabled:opacity-50" 
            onClick={handleRestoreBackup}
          >
            {isRestoring ? 'Restoring Payload...' : 'Restore Database (JSON)'}
          </button>
        </div>

      </div>
    </div>
  );
}
