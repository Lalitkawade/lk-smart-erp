import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useInventory } from '../../hooks/useInventory';
import { supabase } from '../../api/supabase';
import type { Product, BusinessType } from '../../types/erp.types';

interface ProductsProps {
  tenantId: string;
  businessType: BusinessType;
  autoOpenModal?: boolean;
  onModalClosed?: () => void;
}

export default function Products({ tenantId, businessType, autoOpenModal, onModalClosed }: ProductsProps) {
  const { products, isLoading, saveProduct, deleteProduct } = useInventory(tenantId, businessType);
  const [search, setSearch] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (autoOpenModal) {
      handleOpenAdd();
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenModal]);

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<'purchases' | 'sales'>('purchases');
  const [selectedHistoryProduct, setSelectedHistoryProduct] = useState<Product | null>(null);
  const [prodPurchaseHistory, setProdPurchaseHistory] = useState<any[]>([]);
  const [prodSalesHistory, setProdSalesHistory] = useState<any[]>([]);

  const handleShowHistory = async (p: Product) => {
    setSelectedHistoryProduct(p);

    // 1. Fetch Sales (combine Supabase live DB + localStorage cache)
    let salesList: any[] = [];
    try {
      const localSales = localStorage.getItem('lk_sales');
      if (localSales) {
        salesList = JSON.parse(localSales);
      }
    } catch (e) {}

    if (tenantId) {
      try {
        const { data: remoteSales } = await supabase
          .from('sales_invoices')
          .select('*, items:sales_items(*, product:products(*))')
          .eq('tenant_id', tenantId)
          .order('sale_date', { ascending: false });

        if (remoteSales && remoteSales.length > 0) {
          const salesMap = new Map();
          remoteSales.forEach(rs => salesMap.set(rs.invoice_number || rs.id, rs));
          salesList.forEach(ls => {
            const k = ls.invoice_number || ls.id;
            if (k && !salesMap.has(k)) salesMap.set(k, ls);
          });
          salesList = Array.from(salesMap.values());
        }
      } catch (err) {}
    }

    const matchedSales: any[] = [];
    salesList.forEach((invoice: any) => {
      const lineItems = invoice.items || invoice.sales_items || [];
      lineItems.forEach((item: any) => {
        const itemProdId = item.product_id || item.product?.id;
        const itemProdName = item.product_name || item.product?.product_name;

        const isMatch = (itemProdId && String(itemProdId) === String(p.id)) ||
          (itemProdName && p.product_name && itemProdName.toLowerCase().trim() === p.product_name.toLowerCase().trim());

        if (isMatch) {
          matchedSales.push({
            date: invoice.sale_date || invoice.created_at || new Date().toISOString(),
            id: invoice.invoice_number || invoice.id,
            customer_name: invoice.customer_name || 'Walk-in Customer',
            payment_mode: invoice.payment_mode || 'Cash',
            qty: Number(item.qty || item.quantity || 1),
            rate: Number(item.rate || item.price || 0),
            amount: Number(item.amount || (item.qty * item.rate))
          });
        }
      });
    });
    matchedSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setProdSalesHistory(matchedSales);

    // 2. Fetch Purchases (combine Supabase live DB + localStorage cache)
    let purchasesList: any[] = [];
    try {
      const localPurchases = localStorage.getItem('lk_purchases');
      if (localPurchases) {
        purchasesList = JSON.parse(localPurchases);
      }
    } catch (e) {}

    if (tenantId) {
      try {
        const { data: remotePurchases } = await supabase
          .from('purchase_bills')
          .select('*, items:purchase_items(*, product:products(*))')
          .eq('tenant_id', tenantId)
          .order('purchase_date', { ascending: false });

        if (remotePurchases && remotePurchases.length > 0) {
          const purchMap = new Map();
          remotePurchases.forEach(rp => purchMap.set(rp.bill_number || rp.id, rp));
          purchasesList.forEach(lp => {
            const k = lp.bill_number || lp.id;
            if (k && !purchMap.has(k)) purchMap.set(k, lp);
          });
          purchasesList = Array.from(purchMap.values());
        }
      } catch (err) {}
    }

    const matchedPurchases: any[] = [];
    purchasesList.forEach((bill: any) => {
      const lineItems = bill.items || bill.purchase_items || [];
      lineItems.forEach((item: any) => {
        const itemProdId = item.product_id || item.product?.id;
        const itemProdName = item.product_name || item.product?.product_name;

        const isMatch = (itemProdId && String(itemProdId) === String(p.id)) ||
          (itemProdName && p.product_name && itemProdName.toLowerCase().trim() === p.product_name.toLowerCase().trim());

        if (isMatch) {
          matchedPurchases.push({
            date: bill.purchase_date || bill.created_at || new Date().toISOString(),
            bill_number: bill.bill_number || 'N/A',
            supplier_name: bill.supplier_name || 'Generic Supplier',
            payment_mode: bill.payment_mode || 'N/A',
            qty: Number(item.qty || item.quantity || 1),
            rate: Number(item.rate || item.price || 0),
            selling_price: Number(item.selling_price || p.selling_price || 0),
            amount: Number(item.amount || (item.qty * item.rate))
          });
        }
      });
    });

    // Calculate total stock sold and total recorded inflows to reconstruct full history
    const totalSoldQty = matchedSales.reduce((sum, s) => sum + Number(s.qty || 0), 0);
    const totalRecordedInflowQty = matchedPurchases.reduce((sum, pb) => sum + Number(pb.qty || 0), 0);
    const requiredTotalInflow = Number(p.current_stock || 0) + totalSoldQty;
    const initialOpeningQty = Math.max(0, requiredTotalInflow - totalRecordedInflowQty);

    if (initialOpeningQty > 0 || matchedPurchases.length === 0) {
      matchedPurchases.push({
        date: (p as any).created_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        bill_number: 'OPENING-STOCK',
        supplier_name: p.supplier_name || 'Store Catalog Inflow',
        payment_mode: 'Catalog Opening',
        qty: initialOpeningQty > 0 ? initialOpeningQty : Number(p.current_stock || 0),
        rate: Number(p.purchase_price || 0),
        selling_price: Number(p.selling_price || 0),
        amount: (initialOpeningQty > 0 ? initialOpeningQty : Number(p.current_stock || 0)) * Number(p.purchase_price || 0)
      });
    }

    matchedPurchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setProdPurchaseHistory(matchedPurchases);

    setHistoryModalOpen(true);
  };


  // Form State
  const [formData, setFormData] = useState({
    product_name: '',
    sku: '',
    barcode: '',
    category_name: 'General',
    brand_name: 'Generic',
    unit: 'Pcs',
    purchase_price: 0,
    selling_price: 0,
    dealer_price: 0,
    mrp: 0,
    current_stock: 0,
    min_stock_level: 10,
    hsn: '',
    gst: 18,
    godown: '',
    rack_number: '',
    shelf_number: '',
    description: '',
    size: '',
    weight: '',
    warehouse_location: '',
    p_unit: 'Pcs',
    s_unit: 'Pcs',
    supplier_id: '',
    supplier_name: '',
    supplier_phone: '',
    pieces_per_pack: 1,
    piece_selling_price: 0,
    additional_stock: 0
  });

  const [isEditingBaseStock, setIsEditingBaseStock] = useState(false);
  const [isEditingTax, setIsEditingTax] = useState(false);

  const [purchases, setPurchases] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  useEffect(() => {
    const loadTransactions = () => {
      const pStr = localStorage.getItem('lk_purchases') || '[]';
      const sStr = localStorage.getItem('lk_sales') || '[]';
      try {
        setPurchases(JSON.parse(pStr));
        setSales(JSON.parse(sStr));
      } catch (e) {}
    };
    loadTransactions();
    window.addEventListener('storage', loadTransactions);
    return () => window.removeEventListener('storage', loadTransactions);
  }, []);

  // Load suppliers list from localStorage on mount/modal toggle
  useEffect(() => {
    const localSups = localStorage.getItem('lk_suppliers');
    if (localSups) {
      try {
        setSuppliers(JSON.parse(localSups));
      } catch (e) {}
    }
  }, [modalOpen]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({
      product_name: '',
      sku: '',
      barcode: '',
      category_name: 'General',
      brand_name: 'Generic',
      unit: 'Pcs',
      purchase_price: 0,
      selling_price: 0,
      dealer_price: 0,
      mrp: 0,
      current_stock: 0,
      min_stock_level: 10,
      hsn: '',
      gst: 18,
      godown: '',
      rack_number: '',
      shelf_number: '',
      description: '',
      size: '',
      weight: '',
      warehouse_location: '',
      p_unit: 'Pcs',
      s_unit: 'Pcs',
      supplier_id: '',
      supplier_name: '',
      supplier_phone: '',
      pieces_per_pack: 1,
      piece_selling_price: 0,
      additional_stock: 0
    });
    setIsEditingBaseStock(false);
    setIsEditingTax(false);
    setModalOpen(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingProduct(p);
    setIsEditingBaseStock(false);
    setIsEditingTax(false);
    
    // Parse location values
    const locationStr = p.warehouse_location || '';
    const parsedGodown = p.godown || (locationStr.includes('|') ? locationStr.split('|')[0].replace(/^Godown:\s*/i, '').trim() : locationStr);
    const parsedRack = p.rack_number || (locationStr.match(/Rack:\s*([^|]+)/i)?.[1]?.trim() || '');
    const parsedShelf = p.shelf_number || (locationStr.match(/Shelf:\s*([^|]+)/i)?.[1]?.trim() || '');

    setFormData({
      product_name: p.product_name,
      sku: p.sku || '',
      barcode: p.barcode || '',
      category_name: p.category_name,
      brand_name: p.brand_name,
      unit: p.unit || 'Pcs',
      purchase_price: Number(p.purchase_price),
      selling_price: Number(p.selling_price),
      dealer_price: Number(p.dealer_price || 0),
      mrp: Number(p.mrp || 0),
      current_stock: p.current_stock,
      min_stock_level: p.min_stock_level,
      hsn: p.hsn || '',
      gst: Number(p.gst || 18),
      godown: parsedGodown,
      rack_number: parsedRack,
      shelf_number: parsedShelf,
      description: p.description || '',
      size: p.size || '',
      weight: p.weight || '',
      warehouse_location: locationStr,
      p_unit: p.p_unit || p.unit || 'Pcs',
      s_unit: p.s_unit || p.unit || 'Pcs',
      supplier_id: p.supplier_id || '',
      supplier_name: p.supplier_name || '',
      supplier_phone: p.supplier_phone || '',
      pieces_per_pack: p.pieces_per_pack || 1,
      piece_selling_price: p.piece_selling_price || 0,
      additional_stock: 0
    });
    setModalOpen(true);
  };

  // Detect matching/similar products in catalog for duplicate prevention & live suggestions
  const similarProducts = useMemo(() => {
    if (editingProduct || !formData.product_name.trim() || formData.product_name.trim().length < 2) return [];
    const query = formData.product_name.trim().toLowerCase();
    return products.filter(p => {
      const pName = p.product_name.toLowerCase();
      const barcode = p.barcode?.toLowerCase() || '';
      const sku = p.sku?.toLowerCase() || '';
      return pName.includes(query) || barcode.includes(query) || sku.includes(query);
    }).slice(0, 5);
  }, [formData.product_name, products, editingProduct]);

  // Log stock inflow history for product transaction ledger
  const logInflowPurchaseHistory = async (
    tenantId: string,
    productId: string,
    productName: string,
    qty: number,
    purchaseRate: number,
    sellingPrice: number,
    supplierName: string
  ) => {
    const billNum = `STOCK-IN-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    // 1. LocalStorage purchase log
    const localP = localStorage.getItem('lk_purchases') || '[]';
    try {
      const list = JSON.parse(localP);
      const newBill = {
        id: 'bill-' + Date.now(),
        tenant_id: tenantId,
        bill_number: billNum,
        supplier_name: supplierName,
        payment_mode: 'Cash',
        total_amount: qty * purchaseRate,
        paid_amount: qty * purchaseRate,
        due_amount: 0,
        purchase_date: nowIso,
        items: [
          {
            product_id: productId,
            product_name: productName,
            qty,
            rate: purchaseRate,
            selling_price: sellingPrice,
            amount: qty * purchaseRate
          }
        ]
      };
      list.unshift(newBill);
      localStorage.setItem('lk_purchases', JSON.stringify(list));
    } catch (e) {}

    // 2. Supabase purchase bill log
    try {
      const { data: billData } = await supabase
        .from('purchase_bills')
        .insert({
          tenant_id: tenantId,
          bill_number: billNum,
          supplier_name: supplierName,
          payment_mode: 'Cash',
          total_amount: qty * purchaseRate,
          paid_amount: qty * purchaseRate,
          due_amount: 0,
          purchase_date: nowIso
        })
        .select()
        .single();

      if (billData) {
        await supabase.from('purchase_items').insert({
          bill_id: billData.id,
          product_id: productId,
          qty,
          rate: purchaseRate,
          amount: qty * purchaseRate
        });
      }
    } catch (e) {
      console.warn('Inflow purchase history log notice:', e);
    }
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedSup = suppliers.find(s => s.id === formData.supplier_id);

      const fullLocation = [
        formData.godown ? `Godown: ${formData.godown}` : '',
        formData.rack_number ? `Rack: ${formData.rack_number}` : '',
        formData.shelf_number ? `Shelf: ${formData.shelf_number}` : ''
      ].filter(Boolean).join(' | ');

      // Check duplicate if not editing explicitly
      let targetProductId = editingProduct?.id;
      let isMergeOperation = false;
      let existingStock = 0;

      if (!targetProductId && formData.product_name.trim()) {
        const match = products.find(p => {
          if (formData.barcode && p.barcode && p.barcode === formData.barcode.trim()) return true;
          if (formData.sku && p.sku && p.sku.toUpperCase() === formData.sku.trim().toUpperCase()) return true;
          return p.product_name.toLowerCase().trim() === formData.product_name.toLowerCase().trim();
        });

        if (match) {
          targetProductId = match.id;
          isMergeOperation = true;
          existingStock = Number(match.current_stock || 0);
        }
      }

      const oldStock = editingProduct ? Number(editingProduct.current_stock || 0) : 0;
      const directStockIncrease = editingProduct ? Math.max(0, Number(formData.current_stock || 0) - oldStock) : 0;
      const additionalInput = Number(formData.additional_stock || 0);

      const addedStockInflow = editingProduct
        ? (additionalInput > 0 ? additionalInput : directStockIncrease)
        : (isMergeOperation ? Number(formData.current_stock || 0) + additionalInput : Number(formData.current_stock || 0));

      const finalStock = editingProduct
        ? (additionalInput > 0 ? (oldStock + additionalInput) : Number(formData.current_stock || 0))
        : (isMergeOperation ? (existingStock + addedStockInflow) : addedStockInflow);

      const productPayload = {
        tenant_id: tenantId,
        product_name: formData.product_name,
        sku: formData.sku || null,
        barcode: formData.barcode || null,
        category_name: formData.category_name,
        brand_name: formData.brand_name,
        unit: formData.s_unit || formData.unit,
        purchase_price: formData.purchase_price,
        selling_price: formData.selling_price,
        dealer_price: formData.dealer_price,
        mrp: formData.mrp,
        current_stock: finalStock,
        min_stock_level: formData.min_stock_level,
        hsn: formData.hsn || null,
        gst: formData.gst,
        godown: formData.godown || null,
        rack_number: formData.rack_number || null,
        shelf_number: formData.shelf_number || null,
        description: formData.description || null,
        size: formData.size || null,
        weight: formData.weight || null,
        warehouse_location: fullLocation || formData.godown || formData.warehouse_location || null,
        p_unit: formData.p_unit,
        s_unit: formData.s_unit,
        supplier_id: formData.supplier_id || null,
        supplier_name: selectedSup ? selectedSup.supplier_name : (formData.supplier_name || null),
        supplier_phone: selectedSup ? selectedSup.phone : (formData.supplier_phone || null),
        status: 'Active',
        pieces_per_pack: Number(formData.pieces_per_pack || 1),
        piece_selling_price: Number(formData.piece_selling_price || 0),
        ...(targetProductId && { id: targetProductId })
      };

      const savedProd = saveProduct(productPayload as any);

      // Check if prices changed or new stock was added to record in Product History ledger asynchronously
      const effectiveProdId = savedProd?.id || targetProductId;
      const isPriceChanged = editingProduct && (
        editingProduct.purchase_price !== formData.purchase_price || 
        editingProduct.selling_price !== formData.selling_price
      );

      if (effectiveProdId && (addedStockInflow > 0 || isPriceChanged)) {
        logInflowPurchaseHistory(
          tenantId,
          effectiveProdId,
          formData.product_name,
          addedStockInflow > 0 ? addedStockInflow : 0,
          formData.purchase_price,
          formData.selling_price,
          selectedSup ? selectedSup.supplier_name : (formData.supplier_name || 'Direct Stock Inflow / Price Update')
        ).catch(() => {});
      }

      setModalOpen(false);
      if (isMergeOperation || (editingProduct && addedStockInflow > 0)) {
        triggerToast(`Stock updated! Added +${addedStockInflow} ${formData.s_unit || 'Pcs'}. Total Stock: ${finalStock}`);
      } else {
        triggerToast('⚡ Product saved successfully!');
      }
      window.dispatchEvent(new Event('storage'));
    } catch (err: any) {
      triggerToast('⚠️ Save failed: ' + err.message);
    }
  };

  const handleDeleteProduct = async (pId: string) => {
    if (!window.confirm('Delete this product item?')) return;
    try {
      deleteProduct(pId);
      triggerToast('Product item removed');
      window.dispatchEvent(new Event('storage'));
    } catch (err: any) {
      triggerToast(err.message);
    }
  };

  const filtered = products.filter(p => {
    const name = p?.product_name || '';
    const sku = p?.sku || '';
    const barcode = p?.barcode || '';
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      sku.toLowerCase().includes(search.toLowerCase()) ||
      barcode.includes(search)
    );
  });

  return (
    <div className="bg-secondary border border-border rounded-xl p-4 sm:p-6 relative">
      {/* Non-blocking Floating Toast Banner Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-5 py-2.5 rounded-full font-extrabold text-xs shadow-2xl flex items-center gap-2 border border-primary/30 animate-bounce">
          <i className="fa-solid fa-bolt text-sm text-amber-300"></i>
          <span>{toastMessage}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Products</h2>
          <p className="text-xs text-textMuted mt-1">Configure and manage standard product parameters</p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={handleOpenAdd}>
          Add Product Item
        </button>
      </div>

      <div className="mb-4">
        <input type="text" className="w-full bg-background border border-border text-foreground rounded-lg p-3 text-sm focus:outline-none focus:border-primary font-semibold" placeholder="Search products..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-textSecondary">
          <thead>
            <tr className="border-b border-border text-textPrimary font-extrabold uppercase tracking-wider text-xs">
              <th className="py-3">HSN Code of Product</th>
              <th className="py-3">Product Name</th>
              <th className="py-3">Cost</th>
              <th className="py-3">Margin</th>
              <th className="py-3">Selling Price</th>
              <th className="py-3">Available Stock</th>
              <th className="py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="py-6 text-center text-textMuted">Retrieving catalog records...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-center text-textMuted">No items configured in catalog.</td></tr>
            ) : filtered.map((p) => {
              const name = p?.product_name || 'Unnamed Product';
              const purchasePrice = Number(p?.purchase_price || 0);
              const sellingPrice = Number(p?.selling_price || 0);
              const marginAmount = sellingPrice - purchasePrice;
              const marginPercent = purchasePrice > 0 ? (marginAmount / purchasePrice) * 100 : 0;
               const currentStock = Number(p?.current_stock || 0);
              const minStock = Number(p?.min_stock_level || 10);
              const unit = p?.s_unit || p?.unit || 'Pcs';
              const isLowStock = currentStock <= minStock;

              // Find last purchase details of this product
              const matchedPurchases: any[] = [];
              purchases.forEach((bill: any) => {
                (bill.items || []).forEach((item: any) => {
                  if (item.product_id === p.id) {
                    matchedPurchases.push({
                      date: bill.purchase_date,
                      supplier_name: bill.supplier_name || 'Generic Supplier',
                      rate: item.rate
                    });
                  }
                });
              });
              matchedPurchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              const lastPurchase = matchedPurchases[0] || null;

              // Find last sale details of this product
              const matchedSales: any[] = [];
              sales.forEach((invoice: any) => {
                (invoice.items || []).forEach((item: any) => {
                  if (item.product_id === p.id) {
                    matchedSales.push({
                      date: invoice.sale_date,
                      rate: item.rate
                    });
                  }
                });
              });
              matchedSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              const lastSale = matchedSales[0] || null;
              
              return (
                <tr key={p.id} className="border-b border-border hover:bg-slate-100/10 dark:hover:bg-slate-800/10 group">
                  <td className="py-4 font-mono text-xs font-bold text-foreground">{p.hsn || '-'}</td>
                  <td className="py-4 font-bold uppercase cursor-pointer"
                    onClick={() => handleShowHistory(p)}
                    title="Click to view transaction ledger details">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5 font-bold text-blue-500 dark:text-blue-400 hover:text-blue-650 dark:hover:text-blue-350 hover:underline">
                        <i className="fa-solid fa-clock-rotate-left text-[10px]"></i>
                        {name}
                      </span>
                      {(p.size || p.weight || p.description) && (
                        <div className="text-[10px] text-textMuted font-medium mt-1 flex items-center flex-wrap gap-1.5 normal-case">
                          {p.size && <span className="bg-slate-100 dark:bg-slate-800 border border-border px-1.5 py-0.5 rounded text-[9px]">📐 {p.size}</span>}
                          {p.weight && <span className="bg-slate-100 dark:bg-slate-800 border border-border px-1.5 py-0.5 rounded text-[9px]">⚖️ {p.weight}</span>}
                          {p.description && <span className="text-textMuted truncate max-w-[180px] text-[9px] font-normal" title={p.description}>📝 {p.description}</span>}
                        </div>
                      )}
                      {(lastPurchase || lastSale) && (
                        <div className="text-[10px] mt-1.5 space-y-0.5 border-t border-border/30 pt-1.5 normal-case font-medium">
                          {lastPurchase && (
                            <div className="text-blue-550 dark:text-blue-400 flex items-center gap-1 flex-wrap">
                              <span>📥 Last Buy:</span>
                              <span className="font-mono font-bold">₹{lastPurchase.rate.toFixed(2)}</span>
                              <span className="text-[9px] text-textMuted truncate max-w-[150px] uppercase font-bold" title={lastPurchase.supplier_name}>({lastPurchase.supplier_name})</span>
                            </div>
                          )}
                          {lastSale && (
                            <div className="text-emerald-550 dark:text-emerald-450 flex items-center gap-1 flex-wrap">
                              <span>📤 Last Sell:</span>
                              <span className="font-mono font-bold">₹{lastSale.rate.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 font-mono">₹{purchasePrice.toFixed(2)}</td>
                  <td className="py-4">
                    <div className="font-mono text-xs text-emerald-400 font-bold">₹{marginAmount.toFixed(2)}</div>
                    <div className="text-[10px] text-textMuted">({marginPercent.toFixed(1)}%)</div>
                  </td>
                  <td className="py-4 font-semibold text-emerald-450 font-bold">₹{sellingPrice.toFixed(2)}</td>
                  <td className="py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono font-bold text-sm ${isLowStock ? 'text-rose-455' : 'text-foreground'}`}>
                          {currentStock.toFixed(2).replace(/\.00$/, '')}
                        </span>
                        <span className="text-[10px] text-textMuted font-bold uppercase">{unit}</span>
                        {isLowStock && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-rose-955 border border-rose-900 text-rose-400 rounded-md font-bold" title="Low stock warning!">
                            ⚠️ Low
                          </span>
                        )}
                      </div>
                      {Number(p.pieces_per_pack || 1) > 1 && (
                        <div className="text-[10px] text-textMuted font-medium">
                          ({(currentStock * Number(p.pieces_per_pack)).toLocaleString(undefined, { maximumFractionDigits: 0 })} loose pieces)
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="text-xs bg-background hover:bg-slate-100 dark:hover:bg-slate-800 border border-border px-2.5 py-1 rounded text-textSecondary hover:text-foreground transition"
                        onClick={() => handleOpenEdit(p)}>Edit</button>
                      <button className="text-xs bg-rose-950 border border-rose-900/30 text-rose-400 hover:bg-rose-900/45 px-2.5 py-1 rounded font-semibold transition"
                        onClick={() => handleDeleteProduct(p.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save Modal */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-3xl shadow-2xl my-auto max-h-[85vh] flex flex-col gap-4 overflow-hidden">
            
            {/* Sticky Header */}
            <div className="flex justify-between items-center pb-3 border-b border-border shrink-0">
              <div>
                <span className="text-[10px] font-bold text-emerald-450 uppercase tracking-widest">Inventory Management</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">{editingProduct ? 'Edit Inventory Product' : 'Add New Inventory Product'}</h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition">
                &times; Close
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveProduct} className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2 relative">
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Product Name *</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none focus:border-emerald-500 font-semibold uppercase" required
                    value={formData.product_name} onChange={(e) => setFormData({ ...formData, product_name: e.target.value })} />
                </div>

                {similarProducts.length > 0 && !editingProduct && (
                  <div className="col-span-1 sm:col-span-2 bg-slate-900 border border-amber-500/40 rounded-xl p-3 space-y-2 shadow-xl animate-fade-in text-xs">
                    <div className="flex items-center justify-between text-[11px] font-extrabold text-amber-400 uppercase tracking-wide">
                      <span className="flex items-center gap-1.5">
                        <i className="fa-solid fa-magnifying-glass text-amber-400"></i>
                        {similarProducts.length} Similar Product{similarProducts.length > 1 ? 's' : ''} Found in Catalog:
                      </span>
                      <span className="text-[9px] text-textMuted font-normal">Click to load / add stock</span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {similarProducts.map((p) => (
                        <div 
                          key={p.id}
                          onClick={() => handleOpenEdit(p)}
                          className="p-2.5 bg-background hover:bg-amber-500/10 border border-border hover:border-amber-500/50 rounded-lg flex items-center justify-between cursor-pointer transition group"
                        >
                          <div className="space-y-0.5 pr-2">
                            <div className="font-extrabold text-xs text-foreground group-hover:text-amber-400 uppercase flex items-center gap-2">
                              <span>{p.product_name}</span>
                              {p.hsn && <span className="text-[9px] font-mono bg-slate-800 text-textMuted px-1.5 py-0.5 rounded font-normal">HSN: {p.hsn}</span>}
                            </div>
                            <div className="text-[10px] text-textMuted flex items-center gap-3 font-mono">
                              <span>Cost: ₹{Number(p.purchase_price || 0).toFixed(2)}</span>
                              <span>Sell: ₹{Number(p.selling_price || 0).toFixed(2)}</span>
                              {p.warehouse_location && <span className="truncate max-w-[120px]">Loc: {p.warehouse_location}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md">
                              Stock: {p.current_stock} {p.s_unit || p.unit || 'Pcs'}
                            </span>
                            <button
                              type="button"
                              className="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-2.5 py-1 rounded-md transition uppercase flex items-center gap-1 shadow-xs"
                            >
                              <i className="fa-solid fa-pen-to-square text-[9px]"></i> Select / Merge
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">SKU Code</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none"
                    value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Barcode</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none"
                    value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Cost (Purchase Price) *</label>
                  <input type="number" step="any" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none" required
                    value={formData.purchase_price === 0 ? '' : formData.purchase_price} 
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value === '' ? 0 : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Selling Price *</label>
                  <input type="number" step="any" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none font-bold text-emerald-450" required
                    value={formData.selling_price === 0 ? '' : formData.selling_price} 
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value === '' ? 0 : Number(e.target.value) })} />
                </div>
                
                {/* Margin Inline calculation */}
                <div className="col-span-1 sm:col-span-2 bg-amber-500/10 p-3 rounded-xl border border-amber-500/30 text-xs flex justify-between items-center shadow-xs flex-wrap gap-2">
                  <span className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wide">
                    <i className="fa-solid fa-chart-line text-emerald-500"></i> Calculated Retail Margin (based on Purchase Cost):
                  </span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    ₹{(formData.selling_price - formData.purchase_price).toFixed(2)} 
                    <span className="ml-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      ({formData.purchase_price > 0 
                        ? (((formData.selling_price - formData.purchase_price) / formData.purchase_price) * 100).toFixed(1)
                        : '0.0'}%)
                    </span>
                  </span>
                </div>

                {editingProduct ? (
                  <>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-semibold text-textSecondary">
                          Current Base Stock {isEditingBaseStock ? '(Correction Mode)' : ''}
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsEditingBaseStock(!isEditingBaseStock)}
                          className="text-[10px] font-extrabold text-amber-500 hover:text-amber-400 underline flex items-center gap-1 cursor-pointer"
                        >
                          <i className={`fa-solid ${isEditingBaseStock ? 'fa-lock' : 'fa-pen-to-square'}`}></i> 
                          {isEditingBaseStock ? 'Lock Field' : '✏️ Correct / Edit Base Stock'}
                        </button>
                      </div>
                      <input 
                        type="number" 
                        step="any"
                        disabled={!isEditingBaseStock}
                        className={`w-full border rounded-lg p-2 font-mono font-bold transition ${
                          isEditingBaseStock 
                            ? 'bg-background border-amber-500 text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20' 
                            : 'bg-background/50 border-border text-textMuted cursor-not-allowed opacity-80'
                        }`}
                        value={formData.current_stock === 0 ? '' : formData.current_stock} 
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setFormData({ ...formData, current_stock: e.target.value === '' ? 0 : Number(e.target.value) })} 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-emerald-400 mb-1">➕ Add New Inflow Stock</label>
                      <input type="number" step="any" min="0" className="w-full bg-background border border-emerald-500/50 rounded-lg p-2 text-emerald-400 focus:outline-none font-mono font-extrabold"
                        placeholder="Enter qty to add (e.g. 20)..."
                        value={formData.additional_stock === 0 ? '' : formData.additional_stock} 
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setFormData({ ...formData, additional_stock: e.target.value === '' ? 0 : Number(e.target.value) })} />
                    </div>
                    <div className="col-span-1 sm:col-span-2 bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg text-xs font-bold text-emerald-400 flex justify-between items-center flex-wrap gap-2">
                      <span>Updated Total Stock after saving:</span>
                      <span className="font-mono text-sm font-black">
                        {formData.current_stock || 0} + {formData.additional_stock || 0} = {Number(formData.current_stock || 0) + Number(formData.additional_stock || 0)} {formData.s_unit || 'Pcs'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">Initial Stock *</label>
                    <input type="number" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none font-mono" required
                      value={formData.current_stock === 0 ? '' : formData.current_stock} 
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, current_stock: e.target.value === '' ? 0 : Number(e.target.value) })} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Min Stock Warning *</label>
                  <input type="number" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none font-mono" required
                    value={formData.min_stock_level === 0 ? '' : formData.min_stock_level} 
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value === '' ? 0 : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">HSN Code of Product</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none font-mono"
                    value={formData.hsn} onChange={(e) => setFormData({ ...formData, hsn: e.target.value })} placeholder="e.g. 7214" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-textSecondary">GST Tax Rate (%)</label>
                    <button
                      type="button"
                      onClick={() => setIsEditingTax(!isEditingTax)}
                      className="text-[10px] font-extrabold text-amber-500 hover:text-amber-400 underline flex items-center gap-1 cursor-pointer"
                    >
                      <i className={`fa-solid ${isEditingTax ? 'fa-lock' : 'fa-pen-to-square'}`}></i>
                      {isEditingTax ? 'Lock Tax' : '✏️ Edit Tax Rate'}
                    </button>
                  </div>
                  <select 
                    disabled={!isEditingTax} 
                    className={`w-full border rounded-lg p-2 font-semibold transition ${
                      isEditingTax 
                        ? 'bg-background border-amber-500 text-foreground focus:outline-none' 
                        : 'bg-background/50 border-border/60 text-textMuted cursor-not-allowed opacity-75'
                    }`}
                    value={formData.gst || 0} 
                    onChange={(e) => setFormData({ ...formData, gst: Number(e.target.value) })}
                  >
                    <option value={0}>0% (GST Disabled)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                    <option value={28}>28% GST</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Product Size</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs"
                    value={formData.size} onChange={(e) => setFormData({ ...formData, size: e.target.value })} placeholder="e.g. 10mm, 2 Inch" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Product Weight</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs"
                    value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="e.g. 1.2kg, 500g" />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Product Description</label>
                  <textarea className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs" rows={2}
                    value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Enter detailed specifications..." />
                </div>
              </div>

              {/* Units & Stock Location Logistics */}
              <div className="bg-background/40 p-4 border border-border rounded-lg space-y-4">
                <h4 className="text-xs font-bold text-emerald-450 uppercase tracking-wide">Logistics & Units</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">Purchase Unit (P. Unit)</label>
                    <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs" placeholder="e.g. Bags, Bundles, Boxes"
                      value={formData.p_unit} onChange={(e) => setFormData({ ...formData, p_unit: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">Sales Unit (S. Unit)</label>
                    <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs" placeholder="e.g. Pcs, Bags, Kgs"
                      value={formData.s_unit} onChange={(e) => setFormData({ ...formData, s_unit: e.target.value })} />
                  </div>
                </div>

                {/* Stock Location Breakdown: Godown + Rack + Shelf */}
                <div className="pt-3 border-t border-border/50">
                  <label className="block text-xs font-bold text-textSecondary mb-2 uppercase tracking-wide">Stock Location (Warehouse / Shelf Breakdown)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-textMuted mb-1">Godown (Warehouse)</label>
                      <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs font-medium" placeholder="e.g. Main Godown A"
                        value={formData.godown} onChange={(e) => setFormData({ ...formData, godown: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-textMuted mb-1">Rack Number</label>
                      <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs font-medium" placeholder="e.g. Rack R-12"
                        value={formData.rack_number} onChange={(e) => setFormData({ ...formData, rack_number: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-textMuted mb-1">Shelf Number</label>
                      <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs font-medium" placeholder="e.g. Shelf S-3"
                        value={formData.shelf_number} onChange={(e) => setFormData({ ...formData, shelf_number: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pack conversion logistics */}
              <div className="bg-background/40 p-4 border border-border rounded-lg space-y-3">
                <h4 className="text-xs font-bold text-blue-450 uppercase tracking-wide">Packet to Loose Pieces Tracking</h4>
                <p className="text-[10px] text-textMuted leading-normal">
                  Configure this if you buy this product in packets/boxes but sometimes sell them in individual loose pieces.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">Pieces per Pack</label>
                    <input type="number" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs font-mono font-bold" placeholder="e.g. 100"
                      value={formData.pieces_per_pack} onChange={(e) => setFormData({ ...formData, pieces_per_pack: Number(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1">Loose Price per Piece (₹)</label>
                    <input type="number" step="any" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs font-mono font-bold" placeholder="e.g. 2"
                      value={formData.piece_selling_price} onChange={(e) => setFormData({ ...formData, piece_selling_price: Number(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>

              {/* Vendor mapping */}
              <div className="bg-background/40 p-4 border border-border rounded-lg space-y-3">
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wide">Preferred Supplier (Vendor)</h4>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Select Registered Vendor</label>
                  <select className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none text-xs font-semibold"
                    value={formData.supplier_id} 
                    onChange={(e) => {
                      const val = e.target.value;
                      const match = suppliers.find(s => s.id === val);
                      setFormData({ 
                        ...formData, 
                        supplier_id: val, 
                        supplier_name: match ? match.supplier_name : '', 
                        supplier_phone: match ? match.phone : '' 
                      });
                    }}>
                    <option value="">-- Choose Vendor --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.supplier_name} ({s.phone})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sticky Action Footer */}
              <div className="shrink-0 flex gap-3 justify-end pt-3 border-t border-border mt-4">
                <button type="button" className="px-5 py-2.5 border border-border text-textSecondary rounded-lg text-xs font-bold hover:bg-background transition" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-emerald-500 text-slate-950 font-extrabold rounded-lg text-xs hover:bg-emerald-400 transition shadow-sm">Save Item</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* History Modal */}
      {historyModalOpen && selectedHistoryProduct && createPortal(
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] overflow-y-auto animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-5xl shadow-2xl overflow-y-auto max-h-[90vh] flex flex-col gap-4">
            
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <span className="text-[10px] font-bold text-emerald-450 uppercase tracking-widest">Product Card Report</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-1">
                  {selectedHistoryProduct.product_name}
                </h3>
                <p className="text-xs text-textSecondary mt-0.5">
                  HSN: {selectedHistoryProduct.hsn || 'N/A'} | Current Stock: <strong className="text-emerald-400 font-mono">{selectedHistoryProduct.current_stock} {selectedHistoryProduct.s_unit || 'Pcs'}</strong> | Cost: <span className="font-mono font-bold">₹{Number(selectedHistoryProduct.purchase_price || 0).toFixed(2)}</span> | Sell: <span className="font-mono font-bold text-emerald-400">₹{Number(selectedHistoryProduct.selling_price || 0).toFixed(2)}</span>
                </p>
              </div>
              <button className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition"
                onClick={() => setHistoryModalOpen(false)}>
                &times; Close Report
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-border/60 pb-2">
              <button
                type="button"
                onClick={() => setHistoryTab('purchases')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold uppercase transition flex items-center gap-2 ${
                  historyTab === 'purchases'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-background/40 text-textMuted hover:text-foreground border border-border/50'
                }`}
              >
                <i className="fa-solid fa-boxes-packing text-xs"></i> 📥 Stock Inflows & Purchases ({prodPurchaseHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('sales')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold uppercase transition flex items-center gap-2 ${
                  historyTab === 'sales'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-background/40 text-textMuted hover:text-foreground border border-border/50'
                }`}
              >
                <i className="fa-solid fa-receipt text-xs"></i> 📤 Sales & Customer Billing ({prodSalesHistory.length})
              </button>
            </div>

            {/* Product History Tables */}
            {historyTab === 'purchases' ? (
              <div className="overflow-x-auto border border-border rounded-xl bg-background/25">
                <table className="w-full text-left text-xs text-textSecondary">
                  <thead>
                    <tr className="border-b border-border bg-background/50 text-textPrimary uppercase font-extrabold">
                      <th className="p-3">Sr. No.</th>
                      <th className="p-3">Inflow Date</th>
                      <th className="p-3">Ref No.</th>
                      <th className="p-3">Qty Added</th>
                      <th className="p-3">Purchase Price (Cost)</th>
                      <th className="p-3">Selling Price (Retail)</th>
                      <th className="p-3">Vendor / Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodPurchaseHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-textMuted font-medium">No purchase inflow history logged for this product.</td>
                      </tr>
                    ) : (
                      prodPurchaseHistory.map((h, i) => (
                        <tr key={i} className="border-b border-border hover:bg-slate-100/5 transition font-medium">
                          <td className="p-3 font-mono font-bold text-foreground">{i + 1}</td>
                          <td className="p-3">{new Date(h.date).toLocaleString()}</td>
                          <td className="p-3 font-mono text-[11px] text-textMuted">{h.bill_number}</td>
                          <td className="p-3 font-mono font-extrabold text-emerald-400">+{h.qty} {selectedHistoryProduct.s_unit || 'Pcs'}</td>
                          <td className="p-3 font-mono font-bold text-foreground">₹{Number(h.rate || 0).toFixed(2)}</td>
                          <td className="p-3 font-mono font-bold text-emerald-400">₹{Number(h.selling_price || selectedHistoryProduct.selling_price).toFixed(2)}</td>
                          <td className="p-3 font-semibold uppercase text-foreground">{h.supplier_name}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-xl bg-background/25">
                <table className="w-full text-left text-xs text-textSecondary">
                  <thead>
                    <tr className="border-b border-border bg-background/50 text-textPrimary uppercase font-extrabold">
                      <th className="p-3">Sr. No.</th>
                      <th className="p-3">Sale Date</th>
                      <th className="p-3">Customer Name</th>
                      <th className="p-3">Qty Sold</th>
                      <th className="p-3">Selling Rate</th>
                      <th className="p-3">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodSalesHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-textMuted font-medium">No customer sales billing transactions recorded yet for this product.</td>
                      </tr>
                    ) : (
                      prodSalesHistory.map((s, i) => (
                        <tr key={i} className="border-b border-border hover:bg-slate-100/5 transition font-medium">
                          <td className="p-3 font-mono font-bold text-foreground">{i + 1}</td>
                          <td className="p-3">{new Date(s.date).toLocaleString()}</td>
                          <td className="p-3 font-semibold text-foreground uppercase">{s.customer_name}</td>
                          <td className="p-3 font-mono font-bold text-blue-400">-{s.qty} {selectedHistoryProduct.s_unit || 'Pcs'}</td>
                          <td className="p-3 font-mono font-bold text-foreground">₹{Number(s.rate || 0).toFixed(2)}</td>
                          <td className="p-3 font-mono font-extrabold text-emerald-400">₹{Number(s.amount || 0).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
