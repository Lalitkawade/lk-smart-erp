import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useInventory } from '../../hooks/useInventory';
import { supabase } from '../../api/supabase';
import type { Product, BusinessType } from '../../types/erp.types';
import { t } from '../../utils/i18n';

const DEFAULT_UNITS = [
  'Nos', 'Box', 'Bundle', 'Packet', 'Bag', 'Kg', 'Gram', 'Feet', 'Meter', 'Inch',
  'Roll', 'Can', 'Liter', 'ML', 'Sheet', 'Rod', 'Pipe', 'Coil', 'Set', 'Piece',
  'Dozen', 'Carton', 'Bottle', 'Tube'
];

interface ProductsProps {
  tenantId: string;
  businessType: BusinessType;
  mode?: 'catalog' | 'stock';
  autoOpenModal?: boolean;
  onModalClosed?: () => void;
}

export default function Products({ tenantId, businessType, mode = 'catalog', autoOpenModal, onModalClosed }: ProductsProps) {
  const { products, isLoading, saveProduct, deleteProduct } = useInventory(tenantId, businessType);
  const [search, setSearch] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stockFilterTab, setStockFilterTab] = useState<'all' | 'low'>('all');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Custom Unit State & List
  const [customUnits, setCustomUnits] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('lk_custom_units');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const allUnits = useMemo(() => {
    const set = new Set([...DEFAULT_UNITS, ...customUnits]);
    return Array.from(set);
  }, [customUnits]);

  const handleUnitDropdownChange = (field: 'p_unit' | 's_unit' | 'unit', value: string) => {
    if (value === '__ADD_CUSTOM__') {
      const input = window.prompt('Enter custom unit name (e.g. Drum, Gross, SqFt):');
      if (input && input.trim()) {
        const formatted = input.trim();
        if (!customUnits.includes(formatted)) {
          const next = [...customUnits, formatted];
          setCustomUnits(next);
          try {
            localStorage.setItem('lk_custom_units', JSON.stringify(next));
          } catch (e) {}
        }
        setFormData(prev => ({ ...prev, [field]: formatted }));
      }
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

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
          const salesMap = new Map<string, any>();
          salesList.forEach(ls => {
            const k = ls.invoice_number || ls.id;
            if (k) salesMap.set(k, ls);
          });
          remoteSales.forEach(rs => {
            const k = rs.invoice_number || rs.id;
            if (k) {
              const existingLocal = salesMap.get(k);
              const rsItems = rs.items || rs.sales_items || [];
              const localItems = existingLocal?.items || existingLocal?.sales_items || [];
              salesMap.set(k, {
                ...existingLocal,
                ...rs,
                items: rsItems.length > 0 ? rsItems : localItems
              });
            }
          });
          salesList = Array.from(salesMap.values());
        }
      } catch (err) {}
    }

    const matchedSales: any[] = [];
    salesList.forEach((invoice: any) => {
      const lineItems = invoice.items || invoice.sales_items || [];
      if (!lineItems || lineItems.length === 0) {
        const itemProdId = invoice.product_id;
        const itemProdName = invoice.product_name;
        const isMatch = (itemProdId && String(itemProdId) === String(p.id)) ||
          (itemProdName && p.product_name && itemProdName.toLowerCase().trim() === p.product_name.toLowerCase().trim());
        if (isMatch) {
          matchedSales.push({
            date: invoice.sale_date || invoice.created_at || new Date().toISOString(),
            id: invoice.invoice_number || invoice.id,
            customer_name: invoice.customer_name || 'Walk-in Customer',
            payment_mode: invoice.payment_mode || 'Cash',
            qty: Number(invoice.qty || invoice.quantity || 1),
            rate: Number(invoice.rate || invoice.price || 0),
            amount: Number(invoice.amount || invoice.total_amount || 0)
          });
        }
      } else {
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
      }
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
          const purchMap = new Map<string, any>();
          purchasesList.forEach(lp => {
            const k = lp.bill_number || lp.id;
            if (k) purchMap.set(k, lp);
          });
          remotePurchases.forEach(rp => {
            const k = rp.bill_number || rp.id;
            if (k) {
              const existingLocal = purchMap.get(k);
              const rpItems = rp.items || rp.purchase_items || [];
              const localItems = existingLocal?.items || existingLocal?.purchase_items || [];
              purchMap.set(k, {
                ...existingLocal,
                ...rp,
                items: rpItems.length > 0 ? rpItems : localItems
              });
            }
          });
          purchasesList = Array.from(purchMap.values());
        }
      } catch (err) {}
    }

    const matchedPurchases: any[] = [];
    purchasesList.forEach((bill: any) => {
      const lineItems = bill.items || bill.purchase_items || [];
      if (!lineItems || lineItems.length === 0) {
        const itemProdId = bill.product_id;
        const itemProdName = bill.product_name;
        const isMatch = (itemProdId && String(itemProdId) === String(p.id)) ||
          (itemProdName && p.product_name && itemProdName.toLowerCase().trim() === p.product_name.toLowerCase().trim());
        if (isMatch) {
          matchedPurchases.push({
            date: bill.purchase_date || bill.created_at || new Date().toISOString(),
            bill_number: bill.bill_number || bill.id || 'N/A',
            supplier_name: bill.supplier_name || 'Vendor Supplier',
            payment_mode: bill.payment_mode || 'Cash',
            qty: Number(bill.qty || bill.quantity || 1),
            rate: Number(bill.rate || bill.price || bill.purchase_price || 0),
            selling_price: Number(bill.selling_price || p.selling_price || 0),
            amount: Number(bill.amount || bill.total_amount || (bill.qty * bill.rate) || 0)
          });
        }
      } else {
        lineItems.forEach((item: any) => {
          const itemProdId = item.product_id || item.product?.id;
          const itemProdName = item.product_name || item.product?.product_name;

          const isMatch = (itemProdId && String(itemProdId) === String(p.id)) ||
            (itemProdName && p.product_name && itemProdName.toLowerCase().trim() === p.product_name.toLowerCase().trim());

          if (isMatch) {
            matchedPurchases.push({
              date: bill.purchase_date || bill.created_at || new Date().toISOString(),
              bill_number: bill.bill_number || bill.id || 'N/A',
              supplier_name: bill.supplier_name || 'Generic Supplier',
              payment_mode: bill.payment_mode || 'N/A',
              qty: Number(item.qty || item.quantity || 1),
              rate: Number(item.rate || item.price || 0),
              selling_price: Number(item.selling_price || p.selling_price || 0),
              amount: Number(item.amount || (item.qty * item.rate))
            });
          }
        });
      }
    });

    // Calculate total stock sold and total recorded inflows to reconstruct full history
    const totalSoldQty = matchedSales.reduce((sum, s) => sum + Number(s.qty || 0), 0);
    const totalRecordedInflowQty = matchedPurchases.reduce((sum, pb) => sum + Number(pb.qty || 0), 0);
    const requiredTotalInflow = Number(p.current_stock || 0) + totalSoldQty;
    const initialOpeningQty = Math.max(0, requiredTotalInflow - totalRecordedInflowQty);

    if (initialOpeningQty > 0) {
      matchedPurchases.push({
        date: (p as any).created_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        bill_number: 'OPENING-STOCK',
        supplier_name: p.supplier_name || 'Store Catalog Inflow',
        payment_mode: 'Catalog Opening',
        qty: initialOpeningQty,
        rate: Number(p.purchase_price || 0),
        selling_price: Number(p.selling_price || 0),
        amount: initialOpeningQty * Number(p.purchase_price || 0)
      });
    }

    matchedPurchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setProdPurchaseHistory(matchedPurchases);

    // Compute live net sum stock: total inflows minus total sales
    const finalInflowsSum = matchedPurchases.reduce((sum, pb) => sum + Number(pb.qty || 0), 0);
    const liveCalculatedStock = Math.max(0, finalInflowsSum - totalSoldQty);

    // Reconcile and update product stock in state and local cache
    const reconciledProduct = {
      ...p,
      current_stock: liveCalculatedStock
    };
    setSelectedHistoryProduct(reconciledProduct);

    try {
      const localProds = JSON.parse(localStorage.getItem('lk_products') || '[]');
      const pIdx = localProds.findIndex((lp: any) => lp.id === p.id);
      if (pIdx >= 0 && Number(localProds[pIdx].current_stock || 0) !== liveCalculatedStock) {
        localProds[pIdx].current_stock = liveCalculatedStock;
        localStorage.setItem('lk_products', JSON.stringify(localProds));
        window.dispatchEvent(new Event('storage'));
      }
    } catch (e) {}

    setHistoryModalOpen(true);
  };


  // Form State
  const [formData, setFormData] = useState({
    product_name: '',
    sku: '',
    barcode: '',
    category_name: 'General',
    brand_name: 'Generic',
    unit: 'Nos',
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
    p_unit: 'Box',
    s_unit: 'Nos',
    supplier_id: '',
    supplier_name: '',
    supplier_phone: '',
    pieces_per_pack: 100,
    piece_selling_price: 0,
    additional_stock: 0,
    purchase_date: new Date().toISOString().slice(0, 10),
    allow_decimal: false,
    allow_purchase_unit_selling: true,
    track_base_unit: true
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
      unit: 'Nos',
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
      p_unit: 'Box',
      s_unit: 'Nos',
      supplier_id: '',
      supplier_name: '',
      supplier_phone: '',
      pieces_per_pack: 100,
      piece_selling_price: 0,
      additional_stock: 0,
      purchase_date: new Date().toISOString().slice(0, 10),
      allow_decimal: false,
      allow_purchase_unit_selling: true,
      track_base_unit: true
    });
    setIsEditingBaseStock(true);
    setIsEditingTax(true);
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
      unit: p.unit || p.s_unit || 'Nos',
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
      p_unit: p.p_unit || p.unit || 'Box',
      s_unit: p.s_unit || p.unit || 'Nos',
      supplier_id: p.supplier_id || '',
      supplier_name: p.supplier_name || '',
      supplier_phone: p.supplier_phone || '',
      pieces_per_pack: p.pieces_per_pack || 1,
      piece_selling_price: p.piece_selling_price || 0,
      additional_stock: 0,
      purchase_date: new Date().toISOString().slice(0, 10),
      allow_decimal: p.allow_decimal ?? false,
      allow_purchase_unit_selling: p.allow_purchase_unit_selling ?? true,
      track_base_unit: p.track_base_unit ?? true
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
        unit: formData.unit || formData.s_unit || 'Nos',
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
        allow_decimal: formData.allow_decimal,
        allow_purchase_unit_selling: formData.allow_purchase_unit_selling,
        track_base_unit: formData.track_base_unit,
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
    const matchesSearch = (
      name.toLowerCase().includes(search.toLowerCase()) ||
      sku.toLowerCase().includes(search.toLowerCase()) ||
      barcode.includes(search)
    );

    if (!matchesSearch) return false;
    if (mode === 'stock') {
      const currentStock = Number(p?.current_stock || 0);
      const minStock = Number(p?.min_stock_level || 10);
      if (stockFilterTab === 'low') return currentStock <= minStock;
    }
    return true;
  });

  const lowStockCount = useMemo(() => {
    return products.filter(p => Number(p?.current_stock || 0) <= Number(p?.min_stock_level || 10)).length;
  }, [products]);

  return (
    <div className="bg-secondary border border-border rounded-xl p-4 sm:p-6 relative">
      {/* Non-blocking Floating Toast Banner Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-primary text-white px-5 py-2.5 rounded-full font-extrabold text-xs shadow-2xl flex items-center gap-2 border border-primary/30 animate-bounce">
          <i className="fa-solid fa-bolt text-sm text-amber-300"></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <i className={`fa-solid ${mode === 'stock' ? 'fa-warehouse text-primary' : 'fa-boxes-stacked text-primary'}`}></i>
            {mode === 'stock' ? 'Warehouse Inventory & Stock Control' : t('productCatalog')}
          </h2>
          <p className="text-xs text-textMuted mt-1">
            {mode === 'stock' 
              ? 'Real-time warehouse stock tracking, valuation cards, low stock alerts, and quick stock level adjustments'
              : 'Configure hardware products, HSN codes, purchase rates, margin %, and dual unit conversions'}
          </p>
        </div>
        <button className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer" onClick={handleOpenAdd}>
          + {mode === 'stock' ? 'Add Stock Item' : t('addProduct')}
        </button>
      </div>

      {/* Inventory & Stock Valuation KPI Summary Bar */}
      {mode === 'stock' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
            <div className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Total Catalog Items</div>
            <div className="text-xl font-black text-foreground font-mono mt-1">{products.length} Products</div>
            <div className="text-[10px] text-textMuted mt-0.5 font-medium">Distinct inventory items</div>
          </div>

          <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Stock Valuation (At Cost)</div>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono mt-1">
              ₹{products.reduce((sum, p) => sum + (Number(p.current_stock || 0) * Number(p.purchase_price || 0)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-textMuted mt-0.5 font-medium font-mono">Purchase cost valuation</div>
          </div>

          <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Estimated Retail Valuation</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              ₹{products.reduce((sum, p) => sum + (Number(p.current_stock || 0) * Number(p.selling_price || 0)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-textMuted mt-0.5 font-medium font-mono">Selling price valuation</div>
          </div>

          <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
            <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Low Stock Reorder Alerts</div>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono mt-1">
              {lowStockCount} Items
            </div>
            <div className="text-[10px] text-textMuted mt-0.5 font-medium">Below safety stock level</div>
          </div>
        </div>
      )}

      {/* Stock Filter Tabs in Stock Mode */}
      {mode === 'stock' && (
        <div className="flex border-b border-border text-xs font-bold gap-2 overflow-x-auto pb-1 mb-4">
          <button
            onClick={() => setStockFilterTab('all')}
            className={`py-2 px-3.5 rounded-t-lg transition flex items-center gap-1.5 ${stockFilterTab === 'all' ? 'bg-secondary border-t-2 border-x border-primary text-primary' : 'text-textMuted hover:text-foreground'}`}
          >
            <span>📦 All Warehouse Stock</span>
            <span className="bg-background px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono">{products.length}</span>
          </button>
          <button
            onClick={() => setStockFilterTab('low')}
            className={`py-2 px-3.5 rounded-t-lg transition flex items-center gap-1.5 ${stockFilterTab === 'low' ? 'bg-secondary border-t-2 border-x border-rose-500 text-rose-500 font-bold' : 'text-textMuted hover:text-foreground'}`}
          >
            <span>⚠️ Low Stock Alerts</span>
            <span className="bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
              {lowStockCount}
            </span>
          </button>
        </div>
      )}

      <div className="mb-4">
        <input type="text" className="w-full bg-background border border-border text-foreground rounded-lg p-3 text-sm focus:outline-none focus:border-primary font-semibold shadow-inner" placeholder={`🔍 ${t('searchPlaceholder')}`}
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700 dark:text-slate-200 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px] divide-x divide-slate-200 dark:divide-slate-700 whitespace-nowrap">
              <th className="py-3 px-3.5 text-center whitespace-nowrap">HSN Code</th>
              <th className="py-3 px-3.5 text-center whitespace-nowrap">{mode === 'stock' ? 'Product Item & Location' : 'Product Name'}</th>
              {mode === 'stock' ? (
                <>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Safety Min</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Live Stock Level & Meter</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Valuation (Cost)</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Valuation (Retail)</th>
                </>
              ) : (
                <>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Cost (₹)</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Margin</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Selling Price (₹)</th>
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">Available Stock</th>
                </>
              )}
              <th className="py-3 px-3.5 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs font-medium">Retrieving inventory records...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs font-medium">No matching stock items found.</td></tr>
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
              const costValuation = currentStock * purchasePrice;
              const retailValuation = currentStock * sellingPrice;
              const stockRatio = Math.min(100, Math.max(5, (currentStock / (minStock * 2 || 20)) * 100));

              return (
                <tr key={p.id} className="odd:bg-white dark:odd:bg-slate-900 even:bg-slate-50/70 dark:even:bg-slate-800/30 hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition-colors divide-x divide-slate-200 dark:divide-slate-800">
                  <td className="py-3.5 px-4 text-center font-mono text-xs">
                    <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-bold">
                      {p.hsn || '-'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold uppercase cursor-pointer"
                    onClick={() => handleShowHistory(p)}
                    title="Click to view transaction ledger details">
                    <div className="flex flex-col items-center justify-center">
                      <span className="flex items-center justify-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 hover:underline text-xs">
                        <i className="fa-solid fa-clock-rotate-left text-[10px]"></i>
                        {name}
                      </span>
                      {(p.godown || p.rack_number || p.shelf_number || p.warehouse_location) && (
                        <div className="text-[10px] text-textMuted font-mono mt-0.5 flex items-center justify-center gap-1">
                          <i className="fa-solid fa-location-dot text-[9px] text-primary"></i>
                          <span>{p.godown || p.warehouse_location || 'Main Store'} {p.rack_number ? `(Rack: ${p.rack_number})` : ''}</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {mode === 'stock' ? (
                    <>
                      <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                        {minStock} {unit}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col gap-1 max-w-[200px] mx-auto">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-mono font-black text-xs ${isLowStock ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                              {currentStock.toFixed(2).replace(/\.00$/, '')} {unit}
                            </span>
                            {isLowStock ? (
                              <span className="text-[9px] px-1.5 py-0.2 bg-rose-500 text-white rounded font-black uppercase tracking-wider animate-pulse">
                                ⚠️ Low Stock
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded font-bold uppercase">
                                ✓ Healthy
                              </span>
                            )}
                          </div>
                          {/* Stock Level Progress Meter */}
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${isLowStock ? 'bg-rose-500' : stockRatio < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                              style={{ width: `${stockRatio}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                        ₹{costValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                        ₹{retailValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-900 dark:text-slate-100">₹{purchasePrice.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">₹{marginAmount.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400 font-mono">({marginPercent.toFixed(1)}%)</div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">₹{sellingPrice.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`font-mono font-bold text-xs ${isLowStock ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                              {currentStock.toFixed(2).replace(/\.00$/, '')}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">{unit}</span>
                            {isLowStock && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-md font-bold" title="Low stock warning!">
                                ⚠️ Low
                              </span>
                            )}
                          </div>
                          {Number(p.pieces_per_pack || 1) > 1 && (
                            <div className="text-[10px] text-slate-400 font-medium">
                              ({(currentStock * Number(p.pieces_per_pack)).toLocaleString(undefined, { maximumFractionDigits: 0 })} loose pieces)
                            </div>
                          )}
                        </div>
                      </td>
                    </>
                  )}

                  <td className="py-3.5 px-4 text-center">
                    <div className="flex gap-1.5 justify-center">
                      {mode === 'stock' && (
                        <button 
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2.5 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer shadow-xs flex items-center gap-1"
                          onClick={() => handleOpenEdit(p)}
                          title="Restock or update inventory stock level"
                        >
                          ⚡ Restock Qty
                        </button>
                      )}
                      <button className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer font-semibold"
                        onClick={() => handleOpenEdit(p)}>Edit</button>
                      <button className="text-xs bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-600 hover:text-white border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 px-2.5 py-1.5 rounded-lg font-semibold transition-all active:scale-95 cursor-pointer"
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
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Inventory Management</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-0.5">{editingProduct ? 'Edit Inventory Product' : 'Add New Inventory Product'}</h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition">
                &times; Close
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveProduct} className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
              {/* UNITS & STOCK CONFIGURATION CARD (TOP SECTION) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6 shadow-sm">
                {/* Card Title Header */}
                <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <i className="fa-solid fa-boxes-stacked text-sm"></i>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Units & Stock Configuration</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure purchase, selling, and inventory base unit conversions</p>
                  </div>
                </div>

                {/* Row 1: Unit Dropdowns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                      Purchase Unit <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition cursor-pointer"
                      value={formData.p_unit}
                      onChange={(e) => handleUnitDropdownChange('p_unit', e.target.value)}
                    >
                      {allUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                      <option value="__ADD_CUSTOM__" className="font-bold text-blue-600">+ Add Custom Unit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                      Selling Unit <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition cursor-pointer"
                      value={formData.s_unit}
                      onChange={(e) => handleUnitDropdownChange('s_unit', e.target.value)}
                    >
                      {allUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                      <option value="__ADD_CUSTOM__" className="font-bold text-blue-600">+ Add Custom Unit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                      Base Stock Unit <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition cursor-pointer"
                      value={formData.unit}
                      onChange={(e) => handleUnitDropdownChange('unit', e.target.value)}
                    >
                      {allUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                      <option value="__ADD_CUSTOM__" className="font-bold text-blue-600">+ Add Custom Unit</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Conversion Factor (Visually Highlighted) */}
                <div className="bg-gradient-to-br from-blue-50/90 via-slate-50 to-indigo-50/80 dark:from-slate-800/90 dark:via-slate-800/50 dark:to-blue-950/40 border-2 border-blue-200 dark:border-blue-800/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="text-xs font-extrabold text-blue-900 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fa-solid fa-calculator text-blue-600"></i> Conversion Factor
                    </span>
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-950 px-2.5 py-0.5 rounded-full border border-blue-300 dark:border-blue-700">
                      Live Auto-Conversion
                    </span>
                  </div>

                  {/* Visual Conversion Editor controls */}
                  <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex flex-wrap items-center justify-center gap-3 shadow-sm">
                    {/* 1 Purchase Unit */}
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                      <span className="font-black text-sm text-slate-900 dark:text-slate-100 font-mono">1</span>
                      <select
                        className="bg-transparent text-xs font-bold text-blue-600 dark:text-blue-400 focus:outline-none cursor-pointer"
                        value={formData.p_unit}
                        onChange={(e) => handleUnitDropdownChange('p_unit', e.target.value)}
                      >
                        {allUnits.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>

                    {/* Equals Sign */}
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                      =
                    </div>

                    {/* Conversion Factor Input & Base Unit */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        className="w-28 bg-blue-50/80 dark:bg-slate-800 border-2 border-blue-600 rounded-xl p-2 text-center text-base font-black text-blue-700 dark:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-600/30 shadow-inner font-mono"
                        value={formData.pieces_per_pack}
                        onChange={(e) => setFormData({ ...formData, pieces_per_pack: Number(e.target.value) || 1 })}
                        placeholder="100"
                      />
                      <select
                        className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 p-2.5 rounded-lg focus:outline-none cursor-pointer"
                        value={formData.unit}
                        onChange={(e) => handleUnitDropdownChange('unit', e.target.value)}
                      >
                        {allUnits.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Live Preview Display */}
                  <div className="bg-blue-600 text-white text-center py-2 px-4 rounded-xl text-xs font-extrabold shadow-sm flex items-center justify-center gap-2">
                    <i className="fa-solid fa-eye text-blue-200"></i>
                    <span>Live Conversion Preview:</span>
                    <span className="font-mono text-amber-300 font-black text-sm">
                      1 {formData.p_unit} = {formData.pieces_per_pack} {formData.unit}
                    </span>
                  </div>

                  {/* Hardware Store Examples Underneath */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Examples (Click to quick preset):</span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { p: 'Box', u: 'Nos', f: 100 },
                        { p: 'Bundle', u: 'Kg', f: 25 },
                        { p: 'Roll', u: 'Meter', f: 90 },
                        { p: 'Pipe', u: 'Feet', f: 20 },
                        { p: 'Packet', u: 'Gram', f: 250 }
                      ].map(preset => (
                        <button
                          key={preset.p}
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            p_unit: preset.p,
                            unit: preset.u,
                            s_unit: preset.u,
                            pieces_per_pack: preset.f
                          })}
                          className="text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg transition font-mono cursor-pointer"
                        >
                          1 {preset.p} = {preset.f} {preset.u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 3: Checkboxes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/80 transition cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={formData.allow_decimal}
                      onChange={(e) => setFormData({ ...formData, allow_decimal: e.target.checked })}
                    />
                    <div>
                      <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">☑ Allow Decimal Selling</span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">e.g. 0.25 Kg, 0.5 Meter, 1.75 Feet</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/80 transition cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={formData.allow_purchase_unit_selling}
                      onChange={(e) => setFormData({ ...formData, allow_purchase_unit_selling: e.target.checked })}
                    />
                    <div>
                      <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">☑ Allow Selling in Purchase Unit</span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">e.g. Sell full box also</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 hover:bg-blue-50/60 transition cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={formData.track_base_unit}
                      onChange={(e) => setFormData({ ...formData, track_base_unit: e.target.checked })}
                    />
                    <div>
                      <span className="block text-xs font-bold text-blue-950 dark:text-blue-200">☑ Track Stock using Base Unit</span>
                      <span className="block text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">(Default Enabled)</span>
                    </div>
                  </label>
                </div>

                {/* Helpful Information Card */}
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 rounded-xl p-4 text-xs text-blue-900 dark:text-blue-200 leading-relaxed flex items-start gap-3">
                  <i className="fa-solid fa-circle-info text-blue-600 dark:text-blue-400 text-base shrink-0 mt-0.5"></i>
                  <div className="space-y-2 w-full">
                    <p className="font-bold text-blue-950 dark:text-blue-100">Stock Calculation Rule</p>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-800 dark:text-blue-300 text-[11px]">
                      <li>Stock is always stored in Base Unit.</li>
                      <li>Purchases are automatically converted into Base Unit.</li>
                      <li>Sales deduct stock from Base Unit.</li>
                    </ul>
                    <div className="mt-2 pt-2 border-t border-blue-200/80 dark:border-blue-800/80 text-[11px] bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono">
                      <div><span className="text-slate-500 dark:text-slate-400">Purchase:</span> <strong className="text-slate-900 dark:text-slate-100">5 {formData.p_unit}</strong></div>
                      <div><span className="text-slate-500 dark:text-slate-400">Conversion:</span> <strong className="text-slate-900 dark:text-slate-100">1 {formData.p_unit} = {formData.pieces_per_pack} {formData.unit}</strong></div>
                      <div><span className="text-blue-600 dark:text-blue-400 font-bold">Available Stock:</span> <strong className="text-blue-700 dark:text-blue-300 font-black">{5 * (formData.pieces_per_pack || 1)} {formData.unit}</strong></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* PRODUCT DETAILS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2 relative">
                  <label className="block text-xs font-semibold text-textSecondary mb-1">Product Name *</label>
                  <input type="text" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none focus:border-primary font-semibold uppercase" required
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
                            <span className="text-[10px] font-extrabold bg-primary/10 text-primary border border-primary/30 px-2 py-1 rounded-md">
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
                  <label className="block text-xs font-semibold text-textSecondary mb-1 flex items-center justify-between">
                    <span>Cost (Purchase Price) *</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">per {formData.p_unit || 'Unit'}</span>
                  </label>
                  <input type="number" step="any" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none" required
                    value={formData.purchase_price === 0 ? '' : formData.purchase_price} 
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value === '' ? 0 : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1 flex items-center justify-between">
                    <span>Selling Price *</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">per {formData.s_unit || 'Unit'}</span>
                  </label>
                  <input type="number" step="any" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none font-bold" required
                    value={formData.selling_price === 0 ? '' : formData.selling_price} 
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value === '' ? 0 : Number(e.target.value) })} />
                </div>
                
                {/* Margin Inline calculation */}
                <div className="col-span-1 sm:col-span-2 bg-primary/10 p-3 rounded-xl border border-primary/30 text-xs flex justify-between items-center shadow-xs flex-wrap gap-2">
                  <span className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wide">
                    <i className="fa-solid fa-chart-line text-primary"></i> Calculated Retail Margin (based on Purchase Cost):
                  </span>
                  <span className="font-mono font-black text-primary text-sm">
                    ₹{(formData.selling_price - formData.purchase_price).toFixed(2)} 
                    <span className="ml-1 text-xs font-bold text-primary">
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
                          className="text-[10px] font-extrabold text-primary hover:text-primary/80 underline flex items-center gap-1 cursor-pointer"
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
                            ? 'bg-background border-primary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20' 
                            : 'bg-background/50 border-border text-textMuted cursor-not-allowed opacity-80'
                        }`}
                        value={formData.current_stock === 0 ? '' : formData.current_stock} 
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setFormData({ ...formData, current_stock: e.target.value === '' ? 0 : Number(e.target.value) })} 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-primary mb-1">➕ Add New Inflow Stock</label>
                      <input type="number" step="any" min="0" className="w-full bg-background border border-primary/50 rounded-lg p-2 text-foreground focus:outline-none font-mono font-extrabold"
                        placeholder="Enter qty to add (e.g. 20)..."
                        value={formData.additional_stock === 0 ? '' : formData.additional_stock} 
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setFormData({ ...formData, additional_stock: e.target.value === '' ? 0 : Number(e.target.value) })} />
                    </div>
                    <div className="col-span-1 sm:col-span-2 bg-primary/10 border border-primary/30 p-2.5 rounded-lg text-xs font-bold text-primary flex justify-between items-center flex-wrap gap-2">
                      <span>Updated Total Stock after saving:</span>
                      <span className="font-mono text-sm font-black">
                        {formData.current_stock || 0} + {formData.additional_stock || 0} = {Number(formData.current_stock || 0) + Number(formData.additional_stock || 0)} {formData.unit || 'Nos'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-textSecondary mb-1 flex items-center justify-between">
                      <span>Initial Stock *</span>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">in {formData.unit || 'Base Unit'}</span>
                    </label>
                    <input type="number" className="w-full bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none font-mono" required
                      value={formData.current_stock === 0 ? '' : formData.current_stock} 
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, current_stock: e.target.value === '' ? 0 : Number(e.target.value) })} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-textSecondary mb-1 flex items-center justify-between">
                    <span>Min Stock Warning *</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">in {formData.unit || 'Base Unit'}</span>
                  </label>
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
                      className="text-[10px] font-extrabold text-primary hover:text-primary/80 underline flex items-center gap-1 cursor-pointer"
                    >
                      <i className={`fa-solid ${isEditingTax ? 'fa-lock' : 'fa-pen-to-square'}`}></i>
                      {isEditingTax ? 'Lock Tax' : '✏️ Edit Tax Rate'}
                    </button>
                  </div>
                  <select 
                    disabled={!isEditingTax} 
                    className={`w-full border rounded-lg p-2 font-semibold transition ${
                      isEditingTax 
                        ? 'bg-background border-primary text-foreground focus:outline-none' 
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



              {/* Stock Location Breakdown: Godown + Rack + Shelf */}
              <div className="bg-background/40 p-4 border border-border rounded-xl space-y-3">
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wide">Stock Location (Warehouse / Shelf Breakdown)</label>
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
                <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer">Save Item</button>
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
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Product Card Report</span>
                <h3 className="text-lg font-black text-foreground uppercase mt-1">
                  {selectedHistoryProduct.product_name}
                </h3>
                <p className="text-xs text-textSecondary mt-1 flex items-center gap-3 flex-wrap">
                  <span>HSN: <strong>{selectedHistoryProduct.hsn || 'N/A'}</strong></span>
                  <span>Current Stock: <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm font-black">{selectedHistoryProduct.current_stock} {selectedHistoryProduct.s_unit || selectedHistoryProduct.unit || 'Pcs'}</strong></span>
                  <span className="text-[11px] text-slate-500 font-mono">(Inflows: {prodPurchaseHistory.reduce((sum, pb) => sum + Number(pb.qty || 0), 0)} Pcs | Billed Sales: {prodSalesHistory.reduce((sum, s) => sum + Number(s.qty || 0), 0)} Pcs)</span>
                  <span>Cost: <span className="font-mono font-bold">₹{Number(selectedHistoryProduct.purchase_price || 0).toFixed(2)}</span></span>
                  <span>Sell: <span className="font-mono font-bold text-primary">₹{Number(selectedHistoryProduct.selling_price || 0).toFixed(2)}</span></span>
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
                    ? 'bg-primary text-white shadow-sm'
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
                          <td className="p-3 font-mono font-extrabold text-primary">+{h.qty} {selectedHistoryProduct.s_unit || 'Pcs'}</td>
                          <td className="p-3 font-mono font-bold text-foreground">₹{Number(h.rate || 0).toFixed(2)}</td>
                          <td className="p-3 font-mono font-bold text-primary">₹{Number(h.selling_price || selectedHistoryProduct.selling_price).toFixed(2)}</td>
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
                          <td className="p-3 font-mono font-extrabold text-primary">₹{Number(s.amount || 0).toFixed(2)}</td>
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
