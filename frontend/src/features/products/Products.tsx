import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useInventory } from '../../hooks/useInventory';
import { supabase } from '../../api/supabase';
import type { Product, BusinessType } from '../../types/erp.types';
import { t } from '../../utils/i18n';
import { getProductUnitRates } from '../../utils/formatters';

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
  autoOpenPurchaseModal?: boolean;
  onModalClosed?: () => void;
}

export default function Products({ tenantId, businessType, mode = 'catalog', autoOpenModal, autoOpenPurchaseModal, onModalClosed }: ProductsProps) {
  const { products, isLoading, saveProduct, deleteProduct } = useInventory(tenantId, businessType);
  const [search, setSearch] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stockFilterTab, setStockFilterTab] = useState<'all' | 'low'>('all');
  const [purchasesList, setPurchasesList] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('lk_purchases');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeSearchDropdownIndex, setActiveSearchDropdownIndex] = useState<number | null>(null);

  // Purchase Bill Modal State
  const [supplierId, setSupplierId] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [transactionId, setTransactionId] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);



  // Quick Vendor Registration State
  const [quickVendorModalOpen, setQuickVendorModalOpen] = useState(false);
  const [quickVendorFormData, setQuickVendorFormData] = useState({
    supplier_name: '',
    phone: '',
    email: '',
    address: '',
    dob: '',
    establishment_date: ''
  });

  const selectedSup = useMemo(() => {
    return suppliers.find(s => s.id === supplierId);
  }, [suppliers, supplierId]);

  const filteredSuppliersForBill = useMemo(() => {
    const query = vendorSearchQuery.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter(s => 
      (s.supplier_name && s.supplier_name.toLowerCase().includes(query)) ||
      (s.phone && s.phone.includes(query))
    );
  }, [suppliers, vendorSearchQuery]);



  const [hasBillDetails, setHasBillDetails] = useState(false);

  const handleOpenNewBillModal = () => {
    setEditingProduct(null);
    setProductItems([createDefaultProductItem()]);
    setSupplierId('');
    setVendorSearchQuery('');
    setBillNumber('');
    setTransactionId('');
    setPaidAmount(0);
    setIsPartialPayment(false);
    setIsEditingBaseStock(true);
    setIsEditingTax(true);
    setHasBillDetails(true);
    setModalOpen(true);
  };



  const handleQuickCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVendorFormData.supplier_name.trim()) return;

    const formattedName = quickVendorFormData.supplier_name.trim().toUpperCase();
    const newSupplierObj: any = {
      id: 'sup-' + Date.now(),
      supplier_name: formattedName,
      phone: quickVendorFormData.phone,
      email: quickVendorFormData.email,
      address: quickVendorFormData.address,
      dob: quickVendorFormData.dob || undefined,
      establishment_date: quickVendorFormData.establishment_date || undefined,
      outstanding: 0,
      created_at: new Date().toISOString()
    };

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
      if (isUuid) {
        const payload: any = {
          tenant_id: tenantId,
          supplier_name: formattedName,
          phone: quickVendorFormData.phone,
          email: quickVendorFormData.email,
          address: quickVendorFormData.address,
          dob: quickVendorFormData.dob || null,
          establishment_date: quickVendorFormData.establishment_date || null,
          outstanding: 0
        };

        let res = await supabase.from('suppliers').insert(payload).select().maybeSingle();
        if (res.error && (res.error.message?.includes('dob') || res.error.message?.includes('establishment_date'))) {
          delete payload.dob;
          delete payload.establishment_date;
          res = await supabase.from('suppliers').insert(payload).select().maybeSingle();
        }

        if (res.data?.id) {
          newSupplierObj.id = res.data.id;
        }
      }
    } catch (e: any) {}

    try {
      const currentLocal = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
      localStorage.setItem('lk_suppliers', JSON.stringify([newSupplierObj, ...currentLocal]));
    } catch (e: any) {}

    setSuppliers(prev => [newSupplierObj, ...prev]);
    setSupplierId(newSupplierObj.id);
    setVendorSearchQuery(newSupplierObj.supplier_name);
    setQuickVendorModalOpen(false);
    setQuickVendorFormData({ supplier_name: '', phone: '', email: '', address: '', dob: '', establishment_date: '' });
    triggerToast(`Vendor "${formattedName}" registered & selected!`);
  };



  useEffect(() => {
    if (autoOpenPurchaseModal) {
      handleOpenNewBillModal();
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenPurchaseModal]);

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

  const saveCustomUnit = (unitName: string) => {
    setCustomUnits(prev => {
      const next = Array.from(new Set([...prev, unitName]));
      try {
        localStorage.setItem('lk_custom_units', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const fetchPurchaseBills = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_bills')
        .select('*')
        .order('purchase_date', { ascending: false });

      const localStr = localStorage.getItem('lk_purchases') || '[]';
      let localBills: any[] = [];
      try { localBills = JSON.parse(localStr); } catch (e) {}

      if (!error && data && Array.isArray(data)) {
        const billMap = new Map<string, any>();
        localBills.forEach(b => { if (b && b.id) billMap.set(b.id, b); });
        data.forEach((rb: any) => {
          if (rb && rb.id) {
            const existing = billMap.get(rb.id);
            billMap.set(rb.id, {
              ...existing,
              ...rb,
              items: rb.purchase_items || existing?.items || []
            });
          }
        });
        const merged = Array.from(billMap.values());
        setPurchasesList(merged);
        try { localStorage.setItem('lk_purchases', JSON.stringify(merged)); } catch (e) {}
      } else if (localBills.length > 0) {
        setPurchasesList(localBills);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchPurchaseBills();
    window.addEventListener('storage', fetchPurchaseBills);
    window.addEventListener('lk_purchases_updated', fetchPurchaseBills);
    return () => {
      window.removeEventListener('storage', fetchPurchaseBills);
      window.removeEventListener('lk_purchases_updated', fetchPurchaseBills);
    };
  }, []);

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
              const rsItems = rs.items || (rs as any).sales_items || [];
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
              const rpItems = rp.items || (rp as any).purchase_items || [];
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


  // Form State for Multi-Product Procurement & Catalog Management
  const createDefaultProductItem = (id?: string) => ({
    id: id || 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
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
    track_base_unit: true,
    isCollapsed: false,
    isUnitConversionExpanded: false
  });

  const [productItems, setProductItems] = useState<any[]>([createDefaultProductItem()]);

  const updateProductItem = (index: number, updates: any) => {
    setProductItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleAddProductItem = () => {
    setProductItems(prev => {
      const collapsedPrev = prev.map(item => ({ ...item, isCollapsed: true }));
      return [...collapsedPrev, createDefaultProductItem()];
    });
  };

  const handleRemoveProductItem = (index: number) => {
    if (productItems.length <= 1) return;
    setProductItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleCollapse = (index: number) => {
    setProductItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], isCollapsed: !next[index].isCollapsed };
      return next;
    });
  };

  const handleUnitDropdownChange = (index: number, field: 'p_unit' | 's_unit' | 'unit', value: string) => {
    if (value === '__ADD_CUSTOM__') {
      const customVal = prompt('Enter new custom unit name (e.g. Dozen, Barrel, Coil):');
      if (customVal && customVal.trim()) {
        const cleaned = customVal.trim();
        saveCustomUnit(cleaned);
        updateProductItem(index, { [field]: cleaned });
      }
    } else {
      updateProductItem(index, { [field]: value });
    }
  };



  const [isEditingBaseStock, setIsEditingBaseStock] = useState(false);
  const [isEditingTax, setIsEditingTax] = useState(false);

  const [activeViewTab, setActiveViewTab] = useState<'catalog' | 'bills'>('catalog');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [viewingPurchaseBill, setViewingPurchaseBill] = useState<any | null>(null);
  const [viewingProcuredItems, setViewingProcuredItems] = useState<any | null>(null);
  const [editingBill, setEditingBill] = useState<any | null>(null);
  const [editBillData, setEditBillData] = useState({
    bill_number: '',
    supplier_name: '',
    purchase_date: '',
    total_amount: 0,
    paid_amount: 0,
    due_amount: 0,
    payment_mode: 'UPI'
  });

  const handleOpenEditBill = (b: any) => {
    setEditingBill(b);
    setEditBillData({
      bill_number: b.bill_number || b.id || '',
      supplier_name: b.supplier_name || '',
      purchase_date: b.purchase_date || new Date().toISOString().slice(0, 10),
      total_amount: Number(b.total_amount || 0),
      paid_amount: Number(b.paid_amount || 0),
      due_amount: Number(b.due_amount || 0),
      payment_mode: b.payment_mode || 'UPI'
    });
  };

  const handleSaveEditBill = async () => {
    if (!editingBill) return;
    try {
      const targetId = editingBill.id || editingBill.bill_number;
      const updatedTotal = Number(editBillData.total_amount || 0);
      const updatedPaid = Number(editBillData.paid_amount || 0);
      const updatedDue = Math.max(0, updatedTotal - updatedPaid);

      const updatedBillObj = {
        ...editingBill,
        bill_number: editBillData.bill_number,
        supplier_name: editBillData.supplier_name,
        purchase_date: editBillData.purchase_date,
        total_amount: updatedTotal,
        paid_amount: updatedPaid,
        due_amount: updatedDue,
        payment_mode: editBillData.payment_mode
      };

      const localP = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
      const updatedList = localP.map((b: any) => {
        if (b.id === targetId || b.bill_number === targetId || (b.bill_number && b.bill_number === editingBill.bill_number)) {
          return updatedBillObj;
        }
        return b;
      });
      localStorage.setItem('lk_purchases', JSON.stringify(updatedList));
      setPurchasesList(updatedList);

      try {
        if (editingBill.id && !editingBill.id.startsWith('pb-') && !editingBill.id.startsWith('sup-')) {
          await supabase
            .from('purchase_bills')
            .update({
              bill_number: editBillData.bill_number,
              supplier_name: editBillData.supplier_name,
              purchase_date: editBillData.purchase_date,
              total_amount: updatedTotal,
              paid_amount: updatedPaid,
              due_amount: updatedDue,
              payment_mode: editBillData.payment_mode
            })
            .eq('id', editingBill.id);
        }
      } catch (e) {}

      window.dispatchEvent(new Event('storage'));
      triggerToast('⚡ Purchase bill updated successfully!');
      setEditingBill(null);
    } catch (err: any) {
      triggerToast('⚠️ Error updating bill: ' + err.message);
    }
  };

  const [_purchases, _setPurchases] = useState<any[]>([]);
  const [_sales, setSales] = useState<any[]>([]);

  useEffect(() => {
    const loadTransactions = () => {
      const pStr = localStorage.getItem('lk_purchases') || '[]';
      const sStr = localStorage.getItem('lk_sales') || '[]';
      try {
        const parsedP = JSON.parse(pStr);
        setPurchasesList(parsedP);
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
    setProductItems([createDefaultProductItem()]);
    setIsEditingBaseStock(true);
    setIsEditingTax(true);
    setHasBillDetails(false);
    setSupplierId('');
    setVendorSearchQuery('');
    setBillNumber('');
    setTransactionId('');
    setIsPartialPayment(false);
    setPaidAmount(0);
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

    setProductItems([{
      id: p.id,
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
      track_base_unit: p.track_base_unit ?? true,
      isCollapsed: false,
      isUnitConversionExpanded: false
    }]);
    setModalOpen(true);
  };



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
        is_offline_draft: true,
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
      window.dispatchEvent(new Event('storage'));
    } catch (e) {}
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let activeSup: any = null;
      if (hasBillDetails) {
        activeSup = suppliers.find(s => s.id === supplierId);
        if (!activeSup) {
          const fallbackName = vendorSearchQuery.trim().toUpperCase() || 'GENERAL VENDOR';
          activeSup = suppliers.find(s => s.supplier_name.toUpperCase() === fallbackName) || {
            id: 'sup-gen-' + Date.now(),
            supplier_name: fallbackName,
            phone: '',
            outstanding: 0
          };
        }
      }

      const savedBillItems: any[] = [];
      let totalBillCost = 0;
      let savedCount = 0;

      for (let i = 0; i < productItems.length; i++) {
        const item = productItems[i];
        if (!item.product_name || !item.product_name.trim()) continue;

        savedCount++;
        const fullLocation = [
          item.godown ? `Godown: ${item.godown}` : '',
          item.rack_number ? `Rack: ${item.rack_number}` : '',
          item.shelf_number ? `Shelf: ${item.shelf_number}` : ''
        ].filter(Boolean).join(' | ');

        let targetProductId = editingProduct?.id || (item.id && !item.id.startsWith('item-') ? item.id : undefined);
        let isMergeOperation = false;
        let existingStock = 0;

        if (!targetProductId && item.product_name.trim()) {
          const match = products.find(p => {
            if (item.barcode && p.barcode && p.barcode === item.barcode.trim()) return true;
            if (item.sku && p.sku && p.sku.toUpperCase() === item.sku.trim().toUpperCase()) return true;
            return p.product_name.toLowerCase().trim() === item.product_name.toLowerCase().trim();
          });

          if (match) {
            targetProductId = match.id;
            isMergeOperation = true;
            existingStock = Number(match.current_stock || 0);
          }
        }

        const conversionFactor = Math.max(1, Number(item.pieces_per_pack || 1));
        const pPrice = Number(item.purchase_price || 0); // Price per Purchase Unit (e.g. ₹300 / Box)
        const sPrice = Number(item.selling_price || 0);   // Price per Selling Unit (e.g. ₹5 / Pcs)
        const calculatedBaseUnitCost = conversionFactor > 0 ? (pPrice / conversionFactor) : pPrice;

        const currentBaseStockInDb = editingProduct ? Number(editingProduct.current_stock || 0) : (isMergeOperation ? existingStock : 0);
        
        // Purchase Quantity entered in Purchase Unit (e.g. 1 Box)
        const purchaseQtyInput = Number(item.additional_stock || 0);
        // Base Stock units added = Purchase Qty * Conversion Factor
        const baseUnitsAdded = purchaseQtyInput * conversionFactor;

        // When creating a new product, if user didn't enter additional_stock, check item.current_stock (which is also in Purchase Units)
        const rawNewProductPurchaseQty = Number(item.current_stock || 0);
        const newProductBaseStockAdded = purchaseQtyInput > 0 ? baseUnitsAdded : (rawNewProductPurchaseQty * conversionFactor);

        const finalStock = editingProduct
          ? (purchaseQtyInput > 0 
              ? (currentBaseStockInDb + baseUnitsAdded) 
              : Number(item.current_stock || currentBaseStockInDb))
          : (isMergeOperation 
              ? (existingStock + newProductBaseStockAdded) 
              : newProductBaseStockAdded);

        const addedStockInflowBaseUnits = purchaseQtyInput > 0 
          ? baseUnitsAdded 
          : (editingProduct ? Math.max(0, finalStock - currentBaseStockInDb) : finalStock);

        const purchasePacksAdded = conversionFactor > 0 ? (addedStockInflowBaseUnits / conversionFactor) : addedStockInflowBaseUnits;
        const itemLineCost = purchasePacksAdded * pPrice;
        totalBillCost += itemLineCost;

        const productPayload = {
          tenant_id: tenantId,
          product_name: item.product_name,
          sku: item.sku || null,
          barcode: item.barcode || null,
          category_name: item.category_name,
          brand_name: item.brand_name,
          unit: item.unit || item.s_unit || 'Nos', // Base Stock Unit
          p_unit: item.p_unit || 'Box',             // Purchase Unit
          s_unit: item.s_unit || item.unit || 'Nos',// Selling Unit
          pieces_per_pack: conversionFactor,        // Conversion Factor (e.g. 100)
          purchase_price: pPrice,                   // Purchase Price per Purchase Unit (e.g. ₹100 / Box)
          selling_price: sPrice,                    // Selling Price per Selling Unit (e.g. ₹2 / Nos)
          base_unit_cost: calculatedBaseUnitCost,   // Base Unit Cost (e.g. ₹1 / Nos)
          dealer_price: item.dealer_price,
          mrp: item.mrp,
          current_stock: finalStock,                // Inventory stock in Base Stock Unit (e.g. 1000 Nos)
          min_stock_level: item.min_stock_level,
          hsn: item.hsn || null,
          gst: item.gst,
          godown: item.godown || null,
          rack_number: item.rack_number || null,
          shelf_number: item.shelf_number || null,
          description: item.description || null,
          size: item.size || null,
          weight: item.weight || null,
          warehouse_location: fullLocation || item.godown || item.warehouse_location || null,
          supplier_id: activeSup ? activeSup.id : (item.supplier_id || null),
          supplier_name: activeSup ? activeSup.supplier_name : (item.supplier_name || null),
          supplier_phone: activeSup ? activeSup.phone : (item.supplier_phone || null),
          status: 'Active',
          piece_selling_price: sPrice,
          allow_decimal: item.allow_decimal,
          allow_purchase_unit_selling: item.allow_purchase_unit_selling,
          track_base_unit: item.track_base_unit,
          ...(targetProductId && { id: targetProductId })
        };

        const savedProd = saveProduct(productPayload as any);
        const effectiveProdId = savedProd?.id || targetProductId;
        const packSellingRate = sPrice * conversionFactor;

        savedBillItems.push({
          product_id: effectiveProdId || 'prod-' + Date.now() + '-' + i,
          product_name: item.product_name,
          qty: addedStockInflowBaseUnits,
          rate: pPrice,
          amount: itemLineCost
        });

        if (effectiveProdId && (addedStockInflowBaseUnits > 0 || (editingProduct && editingProduct.purchase_price !== item.purchase_price))) {
          logInflowPurchaseHistory(
            tenantId,
            effectiveProdId,
            item.product_name,
            addedStockInflowBaseUnits,
            pPrice,
            packSellingRate,
            activeSup ? activeSup.supplier_name : 'Direct Stock Inflow'
          ).catch(() => {});
        }
      }

      // Log purchase bill record if Vendor & Procurement details are active
      if (hasBillDetails && activeSup && savedBillItems.length > 0) {
        const rawDate = purchaseDate ? new Date(purchaseDate) : new Date();
        const safeIsoDate = isNaN(rawDate.getTime()) ? new Date().toISOString() : rawDate.toISOString();
        const effectivePaid = isPartialPayment ? Math.min(totalBillCost, Math.max(0, paidAmount)) : totalBillCost;
        const dueAmount = Math.max(0, totalBillCost - effectivePaid);

        const newBillObj = {
          id: 'pb-' + Date.now(),
          bill_number: billNumber.trim() || 'PB-' + Date.now().toString().slice(-5),
          supplier_name: activeSup.supplier_name,
          payment_mode: paymentMode,
          ref_number: transactionId.trim() || null,
          transaction_id: transactionId.trim() || null,
          total_amount: totalBillCost,
          paid_amount: effectivePaid,
          due_amount: dueAmount,
          purchase_date: safeIsoDate,
          is_offline_draft: true,
          items: savedBillItems
        };

        try {
          const localP = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
          const cleanedP = localP.filter((b: any) => !(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN')));
          localStorage.setItem('lk_purchases', JSON.stringify([newBillObj, ...cleanedP]));

          if (dueAmount > 0) {
            const localSups = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
            const sIdx = localSups.findIndex((s: any) => s.id === activeSup.id);
            if (sIdx >= 0) {
              localSups[sIdx].outstanding = Number(localSups[sIdx].outstanding || 0) + dueAmount;
            }
            localStorage.setItem('lk_suppliers', JSON.stringify(localSups));
          }
        } catch (e) {}

        const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isValidUUID(tenantId)) {
          try {
            const { data: billRes } = await supabase.from('purchase_bills').insert({
              tenant_id: tenantId,
              bill_number: newBillObj.bill_number,
              supplier_name: activeSup.supplier_name,
              payment_mode: paymentMode,
              ref_number: transactionId.trim() || null,
              transaction_id: transactionId.trim() || null,
              total_amount: totalBillCost,
              paid_amount: effectivePaid,
              due_amount: dueAmount,
              purchase_date: newBillObj.purchase_date
            }).select().single();

            if (billRes && billRes.id) {
              const rows = savedBillItems.map(bi => ({
                bill_id: billRes.id,
                product_id: isValidUUID(bi.product_id) ? bi.product_id : null,
                qty: bi.qty,
                rate: bi.rate,
                amount: bi.amount
              }));
              await supabase.from('purchase_items').insert(rows);
            }
          } catch (e) {}
        }
      }

      setModalOpen(false);
      triggerToast(`⚡ ${savedCount} Product(s) saved successfully!`);
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

  const getMatchingProducts = (queryText: string) => {
    if (!queryText || queryText.trim().length < 2) return [];
    const q = queryText.trim().toLowerCase();
    return products.filter(p => {
      const pName = (p.product_name || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const hsn = (p.hsn || '').toLowerCase();
      return pName.includes(q) || barcode.includes(q) || sku.includes(q) || hsn.includes(q);
    }).slice(0, 6);
  };

  const filtered = useMemo(() => {
    return products
      .filter(p => {
        const name = p?.product_name || '';
        const sku = p?.sku || '';
        const barcode = p?.barcode || '';
        const category = p?.category_name || '';
        const hsn = p?.hsn || '';
        const brand = p?.brand_name || '';
        const q = search.trim().toLowerCase();

        const matchesSearch = !q || (
          name.toLowerCase().includes(q) ||
          sku.toLowerCase().includes(q) ||
          barcode.toLowerCase().includes(q) ||
          category.toLowerCase().includes(q) ||
          hsn.toLowerCase().includes(q) ||
          brand.toLowerCase().includes(q)
        );

        if (!matchesSearch) return false;
        if (mode === 'stock') {
          const currentStock = Number(p?.current_stock || 0);
          const minStock = Number(p?.min_stock_level || 10);
          if (stockFilterTab === 'low') return currentStock <= minStock;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
        if (timeA && timeB && timeA !== timeB) return timeB - timeA;
        return 0; // Preserve unshifted array order
      });
  }, [products, search, mode, stockFilterTab]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => {
      const piecesPerPack = Number(p.pieces_per_pack || 1);
      const baseStockQty = Number(p?.current_stock || 0);
      const purchasePackQty = piecesPerPack > 1 ? (baseStockQty / piecesPerPack) : baseStockQty;
      const minStockPacks = Number(p?.min_stock_level || 10);
      return purchasePackQty <= minStockPacks;
    }).length;
  }, [products]);

  const uniqueBillsList = useMemo(() => {
    const rawLocal = localStorage.getItem('lk_purchases') || '[]';
    let list: any[] = purchasesList.length > 0 ? purchasesList : [];
    if (list.length === 0 && rawLocal) {
      try { list = JSON.parse(rawLocal); } catch (e) {}
    }

    const confirmed = list.filter((b: any) => !(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN')));
    return confirmed.sort((a, b) => new Date(b.purchase_date || b.created_at || 0).getTime() - new Date(a.purchase_date || a.created_at || 0).getTime());
  }, [purchasesList, modalOpen]);

  const filteredPurchaseBills = useMemo(() => {
    return uniqueBillsList.filter((b: any) => {
      const supName = b.supplier_name || 'Generic Vendor';
      const billNo = b.bill_number || b.id || '';
      const matchesSearch = (
        supName.toLowerCase().includes(search.toLowerCase()) ||
        billNo.toLowerCase().includes(search.toLowerCase()) ||
        (b.purchase_date || '').includes(search)
      );

      if (!matchesSearch) return false;
      if (vendorFilter !== 'ALL' && supName.toUpperCase().trim() !== vendorFilter.toUpperCase().trim()) {
        return false;
      }
      return true;
    });
  }, [uniqueBillsList, search, vendorFilter]);

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
        <div className="w-full sm:w-auto">
          <button 
            className="w-full sm:w-auto px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-xl text-xs sm:text-sm text-center shrink-0 shadow-md transition active:scale-95 cursor-pointer flex items-center justify-center gap-2" 
            onClick={handleOpenNewBillModal}
          >
            <i className="fa-solid fa-plus text-sm"></i>
            <span>Add Product & Purchase Bill</span>
          </button>
        </div>
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
              ₹{products.reduce((sum, p) => {
                const piecesPerPack = Number(p.pieces_per_pack || 1);
                const purchasePrice = Number(p.purchase_price || 0);
                const costPerPiece = piecesPerPack > 1 ? (purchasePrice / piecesPerPack) : purchasePrice;
                return sum + (Number(p.current_stock || 0) * costPerPiece);
              }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-textMuted mt-0.5 font-medium font-mono">Purchase cost valuation</div>
          </div>

          <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Estimated Retail Valuation</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              ₹{products.reduce((sum, p) => {
                const { piecePrice } = getProductUnitRates(p);
                return sum + (Number(p.current_stock || 0) * piecePrice);
              }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

      {/* Stock Filter Tabs in Stock Mode - Equal 2-Column Side-by-Side Grid */}
      {mode === 'stock' && (
        <div className="grid grid-cols-2 gap-2 border-b border-border text-xs font-bold mb-4">
          <button
            type="button"
            onClick={() => setStockFilterTab('all')}
            className={`w-full py-2.5 px-2 rounded-t-xl transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${stockFilterTab === 'all' ? 'bg-secondary border-t-2 border-x border-primary text-primary font-extrabold shadow-2xs' : 'bg-background/50 border-t border-x border-border text-textMuted hover:text-foreground'}`}
          >
            <span className="truncate">📦 All Warehouse Stock</span>
            <span className="bg-background px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono shrink-0">{products.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setStockFilterTab('low')}
            className={`w-full py-2.5 px-2 rounded-t-xl transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${stockFilterTab === 'low' ? 'bg-secondary border-t-2 border-x border-rose-500 text-rose-500 font-extrabold shadow-2xs' : 'bg-background/50 border-t border-x border-border text-textMuted hover:text-foreground'}`}
          >
            <span className="truncate">⚠️ Low Stock Alerts</span>
            <span className="bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0">
              {lowStockCount}
            </span>
          </button>
        </div>
      )}

      {/* Catalog vs Vendor Procurement Bills Desk Sub-Tabs - Equal 2-Column Side-by-Side Grid */}
      {mode === 'catalog' && (
        <div className="grid grid-cols-2 gap-2 mb-6 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setActiveViewTab('catalog')}
            className={`w-full py-2.5 px-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeViewTab === 'catalog'
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-background border border-border text-textSecondary hover:text-foreground'
            }`}
          >
            <i className="fa-solid fa-boxes-stacked text-xs shrink-0"></i>
            <span className="truncate">Product Items & Catalog</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] shrink-0 font-mono">{products.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('bills')}
            className={`w-full py-2.5 px-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeViewTab === 'bills'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-background border border-border text-textSecondary hover:text-foreground'
            }`}
          >
            <i className="fa-solid fa-receipt text-xs shrink-0"></i>
            <span className="truncate">Procurement & Bills Desk</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] shrink-0 font-mono">{uniqueBillsList.length}</span>
          </button>
        </div>
      )}

      {/* RENDER MODE A: PROCUREMENT & PURCHASE BILLS DESK (ONLY VENDORS AND THEIR BILLS VISIBLE) */}
      {mode === 'catalog' && activeViewTab === 'bills' ? (
        <div className="space-y-6 animate-fade-in">
          {/* Top KPI Cards for Vendor Bills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Total Recorded Bills</div>
              <div className="text-xl font-black text-foreground font-mono mt-1">{filteredPurchaseBills.length} Bills</div>
              <div className="text-[10px] text-textMuted mt-0.5 font-medium">Vendor procurement invoices</div>
            </div>

            <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total Procurement Amount</div>
              <div className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono mt-1">
                ₹{filteredPurchaseBills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-textMuted mt-0.5 font-medium">Sum of all purchase bills</div>
            </div>

            <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Total Paid Amount</div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                ₹{filteredPurchaseBills.reduce((sum, b) => sum + Number(b.paid_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-textMuted mt-0.5 font-medium">Paid to suppliers</div>
            </div>

            <div className="bg-background border border-border p-4 rounded-xl shadow-xs">
              <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Outstanding Vendor Dues</div>
              <div className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono mt-1">
                ₹{filteredPurchaseBills.reduce((sum, b) => sum + Number(b.due_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-textMuted mt-0.5 font-medium">Remaining payables balance</div>
            </div>
          </div>

          {/* Search & Vendor Filter Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-background border border-border p-3.5 rounded-xl">
            <div className="w-full sm:w-1/2">
              <input
                type="text"
                className="w-full bg-secondary border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-primary font-semibold"
                placeholder="Search by Bill No., Vendor Name, or Date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="w-full sm:w-auto flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Filter Vendor:</span>
              <select
                className="bg-secondary border border-border rounded-lg p-2 text-xs font-bold text-foreground focus:outline-none cursor-pointer"
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
              >
                <option value="ALL">All Vendors ({suppliers.length})</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.supplier_name}>{s.supplier_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Vendor Bills Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Bill No. & Date</th>
                  <th className="py-3 px-4">Vendor Supplier</th>
                  <th className="py-3 px-4 text-center">No. of Items</th>
                  <th className="py-3 px-4 text-right">Total Cost (₹)</th>
                  <th className="py-3 px-4 text-right">Paid Amount (₹)</th>
                  <th className="py-3 px-4 text-right">Outstanding Dues (₹)</th>
                  <th className="py-3 px-4 text-center">Status & Mode</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredPurchaseBills.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-medium">
                      No vendor purchase bills recorded yet. Click "+ Add Product & Purchase Bill" to log a new bill.
                    </td>
                  </tr>
                ) : (
                  filteredPurchaseBills.map((b: any) => {
                    const billNo = b.bill_number || b.id || 'N/A';
                    const vendorName = b.supplier_name || 'Generic Vendor';
                    const items = b.items || b.purchase_items || [];
                    const totalAmt = Number(b.total_amount || 0);
                    const paidAmt = Number(b.paid_amount || 0);
                    const dueAmt = Number(b.due_amount || 0);
                    const isPaid = dueAmt <= 0;

                    return (
                      <tr key={b.id || billNo} className="hover:bg-blue-50/60 dark:hover:bg-slate-800/70 transition">
                        <td className="py-3 px-4 font-mono font-bold">
                          <div>{billNo}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{new Date(b.purchase_date || b.created_at || Date.now()).toLocaleDateString('en-IN')}</div>
                        </td>
                        <td className="py-3 px-4 font-bold uppercase text-blue-600 dark:text-blue-400">
                          {vendorName}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setViewingProcuredItems(b)}
                            className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-extrabold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-2xs group"
                            title="Click to view full list of procured items"
                          >
                            <i className="fa-solid fa-boxes-stacked text-[11px]"></i>
                            <span>{items.length || 1} {items.length === 1 ? 'Item' : 'Items'}</span>
                            <i className="fa-solid fa-arrow-right text-[10px] opacity-70 group-hover:translate-x-0.5 transition-transform"></i>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                          ₹{totalAmt.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ₹{paidAmt.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          ₹{dueAmt.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase border ${
                            isPaid
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 border-emerald-300'
                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 border-rose-300'
                          }`}>
                            {isPaid ? `Paid (${b.payment_mode || 'Cash'})` : `⚠️ Dues ₹${dueAmt.toFixed(0)}`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditBill(b)}
                              className="text-xs bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-600 hover:text-white border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 font-extrabold px-2.5 py-1.5 rounded-lg transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Edit bill details, vendor name, or paid amounts"
                            >
                              <i className="fa-solid fa-pen-to-square text-[11px]"></i>
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setViewingPurchaseBill(b)}
                              className="text-xs bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-extrabold px-2.5 py-1.5 rounded-lg transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="View printable bill receipt"
                            >
                              <i className="fa-solid fa-file-invoice text-[11px]"></i>
                              <span>View Bill</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* RENDER MODE B: PRODUCTS & STOCK CATALOG TABLE */
        <>
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
              <th className="py-3 px-3.5 text-center whitespace-nowrap">
                {mode === 'catalog' ? 'Warehouse Location & Actions' : 'Warehouse Location'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs font-medium">Retrieving inventory records...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs font-medium">No matching stock items found.</td></tr>
            ) : filtered.map((p) => {
              const name = p?.product_name || 'Unnamed Product';
              const pUnit = p.p_unit || 'Box';
              const sUnit = p.s_unit || p.unit || 'Nos';
              const piecesPerPack = Math.max(1, Number(p.pieces_per_pack || 1));

              const isDualUnit = piecesPerPack > 1 || (pUnit && sUnit && pUnit.toLowerCase() !== sUnit.toLowerCase());

              const purchasePrice = Number(p.purchase_price || 0); // Purchase Price per Purchase Unit (e.g. ₹100 / Box)
              const costPerPiece = piecesPerPack > 0 ? (purchasePrice / piecesPerPack) : purchasePrice; // Base Unit Cost (e.g. ₹1 / Nos)
              const piecePrice = Number(p.selling_price || 0); // Selling Price per Selling Unit (e.g. ₹2 / Nos)
              const packPrice = piecePrice * piecesPerPack; // Pack Selling Price (e.g. ₹200 / Box)

              const marginPerPiece = piecePrice - costPerPiece;
              const marginPercent = costPerPiece > 0 ? (marginPerPiece / costPerPiece) * 100 : 0;
              const baseStockQty = Number(p?.current_stock || 0);
              const purchasePackQty = piecesPerPack > 0 ? (baseStockQty / piecesPerPack) : baseStockQty;
              const minStockPacks = Number(p?.min_stock_level || 10);
              const isLowStock = baseStockQty <= minStockPacks;
              const costValuation = baseStockQty * costPerPiece;
              const retailValuation = baseStockQty * piecePrice;
              const stockRatio = Math.min(100, Math.max(5, (baseStockQty / (minStockPacks * 2 || 20)) * 100));

              const godownVal = p.godown || (p.warehouse_location?.includes('|') ? p.warehouse_location.split('|')[0].replace(/^Godown:\s*/i, '').trim() : '');
              const rackVal = p.rack_number || (p.warehouse_location?.match(/Rack:\s*([^|]+)/i)?.[1]?.trim() || '');
              const shelfVal = p.shelf_number || (p.warehouse_location?.match(/Shelf:\s*([^|]+)/i)?.[1]?.trim() || '');

              const locationParts: string[] = [];
              if (godownVal) locationParts.push(`Godown: ${godownVal}`);
              if (rackVal) locationParts.push(`Rack: ${rackVal}`);
              if (shelfVal) locationParts.push(`Shelf: ${shelfVal}`);

              const formattedLocationSeq = locationParts.length > 0 
                ? locationParts.join(' ➔ ') 
                : (p.warehouse_location || 'Main Store');

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
                      {isDualUnit && (
                        <span className="text-[9.5px] bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-extrabold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1 mt-1 font-mono uppercase shadow-2xs">
                          📦 1 {pUnit.toUpperCase()} = {piecesPerPack} {sUnit.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </td>

                  {mode === 'stock' ? (
                    <>
                      <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                        {minStockPacks} {pUnit}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col gap-1 max-w-[200px] mx-auto">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-mono font-black text-xs ${isLowStock ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                              {isDualUnit 
                                ? `${purchasePackQty.toFixed(2).replace(/\.00$/, '')} ${pUnit.toUpperCase()}`
                                : `${baseStockQty.toFixed(2).replace(/\.00$/, '')} ${sUnit.toUpperCase()}`}
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
                          {isDualUnit && piecesPerPack > 1 && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold font-mono text-left">
                              ({baseStockQty.toFixed(2).replace(/\.00$/, '')} {sUnit.toUpperCase()})
                            </div>
                          )}
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
                      <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-900 dark:text-slate-100">
                        <div className="flex flex-col items-center">
                          <span className="font-bold">₹{purchasePrice.toFixed(2)} {isDualUnit ? <span className="text-[10px] text-blue-600 dark:text-blue-400 font-extrabold">/ {pUnit}</span> : ''}</span>
                          {isDualUnit && (
                            <span className="text-[10px] text-slate-400 font-mono">(₹{costPerPiece.toFixed(2)} / {sUnit})</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className={`font-mono text-xs font-bold ${marginPerPiece >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {marginPerPiece >= 0 ? '+' : ''}₹{marginPerPiece.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">/ {sUnit}</span>
                        </div>
                        <div className={`text-[10px] font-mono ${marginPerPiece >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          ({marginPercent >= 0 ? '+' : ''}{marginPercent.toFixed(1)}%)
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">
                        <div className="flex flex-col items-center">
                          <span className="font-bold">₹{piecePrice.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">/ {sUnit}</span></span>
                          {isDualUnit && (
                            <span className="text-[10px] text-slate-400 font-mono">(₹{packPrice.toFixed(2)} / {pUnit})</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`font-mono font-bold text-xs ${isLowStock ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                              {isDualUnit 
                                ? purchasePackQty.toFixed(2).replace(/\.00$/, '') 
                                : baseStockQty.toFixed(2).replace(/\.00$/, '')}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                              {isDualUnit ? pUnit.toUpperCase() : sUnit.toUpperCase()}
                            </span>
                            {isLowStock && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-md font-bold" title="Low stock warning!">
                                ⚠️ Low
                              </span>
                            )}
                          </div>
                          {isDualUnit && piecesPerPack > 1 && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold font-mono">
                              ({baseStockQty.toFixed(2).replace(/\.00$/, '')} {sUnit.toUpperCase()})
                            </div>
                          )}
                        </div>
                      </td>
                    </>
                  )}

                  {mode === 'catalog' ? (
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <div 
                          onClick={() => handleOpenEdit(p)} 
                          className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 transition cursor-pointer"
                          title="Click to edit warehouse location & details"
                        >
                          <i className="fa-solid fa-location-dot text-primary text-[11px]"></i>
                          <span className="font-mono text-xs">{formattedLocationSeq}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="text-xs bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-extrabold px-2.5 py-1.5 rounded-lg transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                          title="Edit product details, prices, or stock"
                        >
                          <i className="fa-solid fa-pen-to-square text-[11px]"></i>
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(p.id)}
                          className="text-xs bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-600 hover:text-white border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-extrabold px-2.5 py-1.5 rounded-lg transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                          title="Delete this product item"
                        >
                          <i className="fa-solid fa-trash text-[11px]"></i>
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <i className="fa-solid fa-location-dot text-primary text-[11px]"></i>
                        <span className="font-mono text-xs">{formattedLocationSeq}</span>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>
      )}

      {/* Printable Vendor Purchase Invoice Receipt Modal */}
      {viewingPurchaseBill && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start border-b pb-3 border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <i className="fa-solid fa-file-invoice text-blue-600"></i> Vendor Purchase Invoice Receipt
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Bill No: {viewingPurchaseBill.bill_number || viewingPurchaseBill.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingPurchaseBill(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-slate-400 block font-sans">Vendor / Supplier:</span>
                <strong className="text-blue-600 dark:text-blue-400 text-sm font-bold">{viewingPurchaseBill.supplier_name || 'Generic Vendor'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Purchase Date:</span>
                <strong className="text-slate-900 dark:text-slate-100">{new Date(viewingPurchaseBill.purchase_date || viewingPurchaseBill.created_at || Date.now()).toLocaleDateString('en-IN')}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Payment Mode:</span>
                <strong className="text-slate-900 dark:text-slate-100">{viewingPurchaseBill.payment_mode || 'Cash'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Payment Status:</span>
                <strong className={Number(viewingPurchaseBill.due_amount || 0) <= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {Number(viewingPurchaseBill.due_amount || 0) <= 0 ? '✓ Paid in Full' : `⚠️ Dues ₹${Number(viewingPurchaseBill.due_amount || 0).toFixed(2)}`}
                </strong>
              </div>
            </div>

            {/* Procured Items */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Procured Materials Breakdown:</h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Rate (₹)</th>
                      <th className="p-2.5 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(viewingPurchaseBill.items || viewingPurchaseBill.purchase_items || []).map((it: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-bold">{it.product_name || 'Procured Item'}</td>
                        <td className="p-2.5 text-center font-bold">{it.qty || 1}</td>
                        <td className="p-2.5 text-right">₹{Number(it.rate || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-right font-bold">₹{(Number(it.qty || 1) * Number(it.rate || 0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between items-center text-xs font-mono">
              <span className="text-slate-500 font-sans">Total Bill Cost:</span>
              <strong className="text-sm text-slate-900 dark:text-slate-100 font-black">₹{Number(viewingPurchaseBill.total_amount || 0).toFixed(2)}</strong>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <i className="fa-solid fa-print"></i> Print Invoice
              </button>
              <button
                type="button"
                onClick={() => setViewingPurchaseBill(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-300 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Clickable Procured Items Popup Modal */}
      {viewingProcuredItems && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl overflow-y-auto max-h-[85vh]">
            <div className="flex justify-between items-start border-b pb-3 border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <i className="fa-solid fa-boxes-stacked text-blue-600"></i> Procured Material Items Breakdown
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Vendor: <strong className="text-blue-600">{viewingProcuredItems.supplier_name || 'Generic Vendor'}</strong> | Bill No: <strong className="text-slate-700 dark:text-slate-300">{viewingProcuredItems.bill_number || viewingProcuredItems.id}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingProcuredItems(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Product Name</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Rate (₹)</th>
                    <th className="p-2.5 text-right">Subtotal (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(viewingProcuredItems.items || viewingProcuredItems.purchase_items || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">Stock procurement entry</td>
                    </tr>
                  ) : (
                    (viewingProcuredItems.items || viewingProcuredItems.purchase_items || []).map((it: any, idx: number) => {
                      const qty = Number(it.qty || 1);
                      const rate = Number(it.rate || 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="p-2.5 text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">{it.product_name || 'Procured Material'}</td>
                          <td className="p-2.5 text-center font-bold text-blue-600 dark:text-blue-400">{qty}</td>
                          <td className="p-2.5 text-right">₹{rate.toFixed(2)}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">₹{(qty * rate).toFixed(2)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono">
              <span className="text-slate-500 font-sans">Total Procured Cost:</span>
              <strong className="text-sm font-black text-slate-900 dark:text-slate-100">
                ₹{Number(viewingProcuredItems.total_amount || 0).toFixed(2)}
              </strong>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setViewingProcuredItems(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-300 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Purchase Bill Modal */}
      {editingBill && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <i className="fa-solid fa-pen-to-square text-amber-500"></i> Edit Purchase Bill Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">Bill Number / Invoice Ref No.</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-foreground font-mono font-bold focus:outline-none focus:border-primary"
                  value={editBillData.bill_number}
                  onChange={(e) => setEditBillData({ ...editBillData, bill_number: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">Vendor / Supplier Name</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-foreground font-bold focus:outline-none focus:border-primary uppercase"
                  value={editBillData.supplier_name}
                  onChange={(e) => setEditBillData({ ...editBillData, supplier_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Purchase Date</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-foreground font-mono focus:outline-none focus:border-primary"
                    value={editBillData.purchase_date}
                    onChange={(e) => setEditBillData({ ...editBillData, purchase_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Payment Mode</label>
                  <select
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-foreground font-bold focus:outline-none focus:border-primary cursor-pointer"
                    value={editBillData.payment_mode}
                    onChange={(e) => setEditBillData({ ...editBillData, payment_mode: e.target.value })}
                  >
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="NetBanking">Net Banking</option>
                    <option value="Credit">Credit (Unpaid)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Total Bill Cost (₹)</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-foreground font-mono font-bold focus:outline-none focus:border-primary"
                    value={editBillData.total_amount}
                    onChange={(e) => {
                      const tot = Number(e.target.value || 0);
                      const paid = editBillData.paid_amount;
                      setEditBillData({
                        ...editBillData,
                        total_amount: tot,
                        due_amount: Math.max(0, tot - paid)
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Paid Amount (₹)</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-foreground font-mono font-bold text-emerald-600 focus:outline-none focus:border-primary"
                    value={editBillData.paid_amount}
                    onChange={(e) => {
                      const paid = Number(e.target.value || 0);
                      const tot = editBillData.total_amount;
                      setEditBillData({
                        ...editBillData,
                        paid_amount: paid,
                        due_amount: Math.max(0, tot - paid)
                      });
                    }}
                  />
                </div>
              </div>

              <div className="bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-800/60 flex justify-between items-center font-mono">
                <span className="text-rose-700 dark:text-rose-400 font-sans font-bold">Calculated Vendor Dues:</span>
                <strong className="text-rose-600 dark:text-rose-400 text-sm font-black">
                  ₹{Math.max(0, editBillData.total_amount - editBillData.paid_amount).toFixed(2)}
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditBill}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                <i className="fa-solid fa-check"></i> Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
              
              {/* TOP VENDOR & PROCUREMENT BILL SECTION */}
              {!editingProduct && (
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                  <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs uppercase text-slate-900 dark:text-slate-100 select-none">
                      <input 
                        type="checkbox" 
                        checked={hasBillDetails} 
                        onChange={(e) => setHasBillDetails(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <i className="fa-solid fa-cart-shopping text-emerald-600 dark:text-emerald-400"></i>
                      <span>Record Supplier Purchase Bill / Procurement Details</span>
                    </label>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {hasBillDetails ? '✓ Bill Details Active' : 'Check if you have a supplier bill'}
                    </span>
                  </div>

                  {hasBillDetails && (
                    <div className="space-y-4 animate-fade-in pt-1">
                      {/* Vendor Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Select Supplier / Vendor *</label>
                            <button 
                              type="button" 
                              onClick={() => setQuickVendorModalOpen(true)}
                              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                            >
                              ➕ Quick Register
                            </button>
                          </div>

                          <div className="relative">
                            <input 
                              type="text" 
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-bold uppercase focus:border-blue-600 focus:outline-none pr-8"
                              value={vendorSearchQuery || selectedSup?.supplier_name || ''} 
                              onFocus={() => setVendorDropdownOpen(true)}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVendorSearchQuery(val);
                                setVendorDropdownOpen(true);
                                if (!val.trim()) setSupplierId('');
                              }} 
                              placeholder="🔍 Type vendor name..."
                            />
                            {(supplierId || vendorSearchQuery) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSupplierId('');
                                  setVendorSearchQuery('');
                                  setVendorDropdownOpen(false);
                                }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
                              >
                                &times;
                              </button>
                            )}

                            {/* Floating Vendor Autocomplete */}
                            {vendorDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin animate-fade-in">
                                {filteredSuppliersForBill.length === 0 ? (
                                  <div className="p-3 text-center text-xs space-y-2">
                                    <p className="text-slate-500 dark:text-slate-400 font-medium">No vendors found matching "{vendorSearchQuery}".</p>
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        setQuickVendorFormData(prev => ({ ...prev, supplier_name: vendorSearchQuery.toUpperCase() }));
                                        setVendorDropdownOpen(false);
                                        setQuickVendorModalOpen(true);
                                      }}
                                      className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-extrabold text-xs rounded-lg border border-blue-200 dark:border-blue-800 transition hover:bg-blue-100 cursor-pointer"
                                    >
                                      ➕ Register "{vendorSearchQuery.toUpperCase()}" as New Vendor
                                    </button>
                                  </div>
                                ) : (
                                  filteredSuppliersForBill.map((s) => (
                                    <div 
                                      key={s.id}
                                      onClick={() => {
                                        setSupplierId(s.id);
                                        setVendorSearchQuery(s.supplier_name);
                                        setVendorDropdownOpen(false);
                                      }}
                                      className={`p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer flex justify-between items-center transition ${supplierId === s.id ? 'bg-blue-50 dark:bg-blue-950/60 font-black text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-slate-100'}`}
                                    >
                                      <div className="space-y-0.5">
                                        <div className="text-xs font-bold uppercase">{s.supplier_name}</div>
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400">Phone: {s.phone || 'N/A'} {s.outstanding ? `| Dues: ₹${Number(s.outstanding).toFixed(2)}` : ''}</div>
                                      </div>
                                      {supplierId === s.id && <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">✓ Selected</span>}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Supplier Bill Number</label>
                          <input type="text" className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                            value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. IN-98218" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Billing Date *</label>
                          <input type="date" className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono font-semibold focus:outline-none focus:border-blue-600"
                            value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required={hasBillDetails} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Channel</label>
                          <select className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
                            value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                            <option value="UPI">UPI / GPay</option>
                            <option value="Card">Credit / Debit Card</option>
                            <option value="Bank Transfer">Bank Transfer / NEFT</option>
                            <option value="Cash">Cash Voucher</option>
                          </select>
                        </div>

                        {/* Transaction ID / Ref No. */}
                        {paymentMode !== 'Cash' && (
                          <div className="col-span-1 md:col-span-4 animate-fade-in bg-blue-50/80 dark:bg-blue-950/40 p-3.5 rounded-xl border border-blue-200 dark:border-blue-800 space-y-1">
                            <label className="block text-xs text-blue-900 dark:text-blue-300 font-extrabold flex items-center justify-between">
                              <span className="flex items-center gap-1.5 uppercase tracking-wide">
                                <i className="fa-solid fa-receipt text-blue-600"></i> Transaction ID / UTR / Reference No.
                              </span>
                            </label>
                            <input 
                              type="text"
                              className="w-full bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-slate-100 font-mono font-bold focus:border-blue-600 focus:outline-none uppercase"
                              value={transactionId}
                              onChange={(e) => setTransactionId(e.target.value)}
                              placeholder="e.g. UPI-981240192849 / CARD-492019 / GPay Ref ID"
                            />
                          </div>
                        )}
                      </div>

                      {/* Partial Payment Option */}
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                          <input 
                            type="checkbox" 
                            checked={isPartialPayment}
                            onChange={(e) => setIsPartialPayment(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span>Record Partial Payment / Remaining Vendor Dues</span>
                        </label>

                        {isPartialPayment && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 animate-fade-in shadow-xs">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Amount Paid Now (₹)</label>
                              <input 
                                type="number" 
                                step="any"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none"
                                value={paidAmount}
                                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Total Bill Cost (₹)</label>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono font-extrabold text-slate-900 dark:text-slate-100">
                                ₹{productItems.reduce((sum, item) => sum + (Number(item.current_stock || 0) * Number(item.purchase_price || 0)), 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MULTI-PRODUCT ACCORDION LIST */}
              <div className="space-y-4">
                {productItems.map((item, index) => {
                  const pUnit = item.p_unit || 'Box';
                  const sUnit = item.s_unit || item.unit || 'Nos';
                  const piecesPerPack = Number(item.pieces_per_pack || 1);
                  const isDualUnit = piecesPerPack > 1;

                  const costPerSellingUnit = isDualUnit ? (item.purchase_price / piecesPerPack) : item.purchase_price;
                  const marginPerSellingUnit = item.selling_price - costPerSellingUnit;
                  const marginPercent = costPerSellingUnit > 0 ? (marginPerSellingUnit / costPerSellingUnit) * 100 : 0;
                  // Collapsed View Card
                  if (item.isCollapsed) {
                    return (
                      <div 
                        key={item.id || index}
                        className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 hover:border-blue-500/60 rounded-2xl p-4 shadow-sm transition-all flex items-center justify-between gap-3 animate-fade-in"
                      >
                        <div 
                          className="flex items-center gap-3.5 cursor-pointer flex-1 min-w-0"
                          onClick={() => handleToggleCollapse(index)}
                        >
                          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center font-black text-xs font-mono shrink-0">
                            #{index + 1}
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 uppercase truncate">
                                {item.product_name || `Product Item #${index + 1}`}
                              </h4>
                              {item.category_name && (
                                <span className="text-[9.5px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 uppercase">
                                  {item.category_name}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-3 flex-wrap">
                              <span>Stock: <strong className="text-emerald-600 dark:text-emerald-400">{item.current_stock || 0} {item.unit || 'Nos'}</strong></span>
                              <span>Cost: <strong className="text-blue-600 dark:text-blue-400">₹{item.purchase_price || 0} / {pUnit}</strong></span>
                              <span>Selling: <strong className="text-amber-600 dark:text-amber-400">₹{item.selling_price || 0} / {sUnit}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            type="button" 
                            onClick={() => handleToggleCollapse(index)} 
                            className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <i className="fa-solid fa-pen text-[10px]"></i>
                            <span>Edit</span>
                          </button>
                          {productItems.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveProductItem(index)} 
                              className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold text-xs rounded-xl transition cursor-pointer"
                              title="Remove item from bill"
                            >
                              <i className="fa-solid fa-trash text-[10px]"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Full Expanded Form View
                  return (
                    <div key={item.id || index} className="space-y-4 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl bg-slate-50/60 dark:bg-slate-900/50 shadow-xs">
                      
                      {/* Item Section Header (for multi-product tracking) */}
                      {productItems.length > 1 && (
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs font-mono shadow-xs">
                              #{index + 1}
                            </span>
                            <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                              Product Item #{index + 1} Details
                            </h4>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleCollapse(index)}
                              className="text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 cursor-pointer"
                            >
                              <i className="fa-solid fa-chevron-up text-[10px]"></i>
                              <span>Collapse Item</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveProductItem(index)}
                              className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800 transition flex items-center gap-1 cursor-pointer"
                            >
                              <i className="fa-solid fa-trash text-[10px]"></i>
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* UNITS & STOCK CONFIGURATION CARD */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
                        <div 
                          className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 cursor-pointer select-none"
                          onClick={() => updateProductItem(index, { isUnitConversionExpanded: !item.isUnitConversionExpanded })}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                              <i className="fa-solid fa-boxes-stacked text-sm"></i>
                            </div>
                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2 flex-wrap">
                                <span>Units & Dual-Unit Conversion</span>
                                <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                  1 {item.p_unit} = {item.pieces_per_pack} {item.unit}
                                </span>
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure purchase, selling, and inventory base unit conversions</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                          >
                            <span>{item.isUnitConversionExpanded ? 'Hide Advanced Rules' : '⚙️ Expand Rules'}</span>
                            <i className={`fa-solid ${item.isUnitConversionExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                          </button>
                        </div>

                        {/* Unit Dropdowns */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                              Purchase Unit <span className="text-rose-500 font-bold">*</span>
                            </label>
                            <select
                              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
                              value={item.p_unit}
                              onChange={(e) => handleUnitDropdownChange(index, 'p_unit', e.target.value)}
                            >
                              {allUnits.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                              <option value="__ADD_CUSTOM__" className="font-bold text-blue-600">+ Add Custom Unit</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                              Selling Unit <span className="text-rose-500 font-bold">*</span>
                            </label>
                            <select
                              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
                              value={item.s_unit}
                              onChange={(e) => handleUnitDropdownChange(index, 's_unit', e.target.value)}
                            >
                              {allUnits.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                              <option value="__ADD_CUSTOM__" className="font-bold text-blue-600">+ Add Custom Unit</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                              Base Stock Unit <span className="text-rose-500 font-bold">*</span>
                            </label>
                            <select
                              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
                              value={item.unit}
                              onChange={(e) => handleUnitDropdownChange(index, 'unit', e.target.value)}
                            >
                              {allUnits.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                              <option value="__ADD_CUSTOM__" className="font-bold text-blue-600">+ Add Custom Unit</option>
                            </select>
                          </div>
                        </div>

                        {/* Collapsible Conversion Factor Section */}
                        {item.isUnitConversionExpanded && (
                          <div className="space-y-4 animate-fade-in pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="bg-gradient-to-br from-blue-50/90 via-slate-50 to-indigo-50/80 dark:from-slate-800/90 dark:via-slate-800/50 dark:to-blue-950/40 border-2 border-blue-200 dark:border-blue-800/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                              <div className="flex justify-between items-center flex-wrap gap-2">
                                <span className="text-xs font-extrabold text-blue-900 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                                  <i className="fa-solid fa-calculator text-blue-600"></i> Conversion Factor
                                </span>
                                <span className="text-[11px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-950 px-2.5 py-0.5 rounded-full border border-blue-300 dark:border-blue-700">
                                  Live Auto-Conversion
                                </span>
                              </div>

                              <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex flex-wrap items-center justify-center gap-3 shadow-sm">
                                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                                  <span className="font-black text-sm text-slate-900 dark:text-slate-100 font-mono">1</span>
                                  <select
                                    className="bg-transparent text-xs font-bold text-blue-600 dark:text-blue-400 focus:outline-none cursor-pointer"
                                    value={item.p_unit}
                                    onChange={(e) => handleUnitDropdownChange(index, 'p_unit', e.target.value)}
                                  >
                                    {allUnits.map(u => (
                                      <option key={u} value={u}>{u}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                                  =
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0.001"
                                    className="w-28 bg-blue-50/80 dark:bg-slate-800 border-2 border-blue-600 rounded-xl p-2 text-center text-base font-black text-blue-700 dark:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-600/30 shadow-inner font-mono"
                                    value={item.pieces_per_pack}
                                    onChange={(e) => updateProductItem(index, { pieces_per_pack: Number(e.target.value) || 1 })}
                                    placeholder="100"
                                  />
                                  <select
                                    className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 p-2.5 rounded-lg focus:outline-none cursor-pointer"
                                    value={item.unit}
                                    onChange={(e) => handleUnitDropdownChange(index, 'unit', e.target.value)}
                                  >
                                    {allUnits.map(u => (
                                      <option key={u} value={u}>{u}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="bg-blue-600 text-white text-center py-2 px-4 rounded-xl text-xs font-extrabold shadow-sm flex items-center justify-center gap-2">
                                <i className="fa-solid fa-eye text-blue-200"></i>
                                <span>Live Conversion Preview:</span>
                                <span className="font-mono text-amber-300 font-black text-sm">
                                  1 {item.p_unit} = {item.pieces_per_pack} {item.unit}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* PRODUCT DETAILS GRID */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="col-span-1 sm:col-span-2 relative">
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Product Name *</label>
                          <input 
                            type="text" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 uppercase shadow-xs" 
                            required
                            value={item.product_name} 
                            onFocus={() => setActiveSearchDropdownIndex(index)}
                            onBlur={() => setTimeout(() => setActiveSearchDropdownIndex(null), 200)}
                            onChange={(e) => {
                              updateProductItem(index, { product_name: e.target.value });
                              setActiveSearchDropdownIndex(index);
                            }} 
                            placeholder="e.g. 2*6 SCREW"
                          />

                          {/* Live Catalog Search & Auto-Fill Suggestions */}
                          {activeSearchDropdownIndex === index && item.product_name.trim().length >= 2 && (() => {
                            const suggestions = getMatchingProducts(item.product_name);
                            if (suggestions.length === 0) return null;
                            return (
                              <div className="absolute z-[100] left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border-2 border-blue-500 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto animate-fade-in">
                                <div className="bg-blue-50 dark:bg-blue-950 px-3 py-1.5 border-b border-blue-200 dark:border-blue-800 text-[10px] font-extrabold text-blue-700 dark:text-blue-300 uppercase flex justify-between items-center">
                                  <span>⚡ {suggestions.length} Catalog Match(es) Found</span>
                                  <span>Click to Auto-fill Product</span>
                                </div>
                                {suggestions.map(p => (
                                  <div
                                    key={p.id}
                                    className="p-2.5 border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/80 dark:hover:bg-blue-950/60 cursor-pointer transition flex items-center justify-between gap-2"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      updateProductItem(index, {
                                        id: p.id,
                                        product_name: p.product_name,
                                        purchase_price: Number(p.purchase_price || 0),
                                        selling_price: Number(p.selling_price || 0),
                                        unit: p.unit || 'Nos',
                                        p_unit: p.p_unit || p.unit || 'Box',
                                        s_unit: p.s_unit || p.unit || 'Nos',
                                        pieces_per_pack: Number(p.pieces_per_pack || 1),
                                        barcode: p.barcode || '',
                                        sku: p.sku || '',
                                        category_name: p.category_name || '',
                                        hsn: p.hsn || ''
                                      });
                                      setActiveSearchDropdownIndex(null);
                                    }}
                                  >
                                    <div>
                                      <div className="font-extrabold text-xs text-slate-900 dark:text-slate-100 uppercase">{p.product_name}</div>
                                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                                        <span>Stock: <strong className="text-emerald-600 dark:text-emerald-400">{p.current_stock || 0} {p.unit || 'Nos'}</strong></span>
                                        {p.category_name && <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-600 dark:text-slate-300">{p.category_name}</span>}
                                        {p.hsn && <span className="text-slate-400 font-mono">HSN: {p.hsn}</span>}
                                      </div>
                                    </div>
                                    <div className="text-right font-mono text-xs font-bold shrink-0">
                                      <div className="text-blue-600 dark:text-blue-400">Cost: ₹{Number(p.purchase_price || 0).toFixed(2)}</div>
                                      <div className="text-amber-600 dark:text-amber-400">Sell: ₹{Number(p.selling_price || 0).toFixed(2)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">SKU Code</label>
                          <input 
                            type="text" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 shadow-xs"
                            value={item.sku} 
                            onChange={(e) => updateProductItem(index, { sku: e.target.value })} 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Barcode</label>
                          <input 
                            type="text" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 shadow-xs"
                            value={item.barcode} 
                            onChange={(e) => updateProductItem(index, { barcode: e.target.value })} 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                            <span>Cost (Purchase Price) *</span>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">per {item.p_unit || 'Unit'}</span>
                          </label>
                          <input 
                            type="number" 
                            step="any" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-blue-600 shadow-xs" 
                            required
                            value={item.purchase_price === 0 ? '' : item.purchase_price} 
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateProductItem(index, { purchase_price: e.target.value === '' ? 0 : Number(e.target.value) })} 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                            <span>Selling Price *</span>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">per {item.s_unit || 'Unit'}</span>
                          </label>
                          <input 
                            type="number" 
                            step="any" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:border-blue-600 shadow-xs" 
                            required
                            value={item.selling_price === 0 ? '' : item.selling_price} 
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateProductItem(index, { selling_price: e.target.value === '' ? 0 : Number(e.target.value) })} 
                          />
                        </div>
                        
                        {/* RULE 8: Live Step-by-Step Unit Conversion & Margin Calculation Card */}
                        <div className="col-span-1 sm:col-span-2 bg-gradient-to-r from-blue-50/90 via-slate-50 to-emerald-50/90 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4 rounded-2xl border-2 border-blue-200 dark:border-blue-800 text-xs space-y-2.5 shadow-xs">
                          <div className="flex justify-between items-center flex-wrap gap-2 border-b border-blue-200 dark:border-blue-800 pb-2">
                            <span className="font-extrabold text-blue-900 dark:text-blue-300 flex items-center gap-1.5 uppercase tracking-wide">
                              <i className="fa-solid fa-calculator text-blue-600"></i> Rule 8 Live Conversion & Profit Engine
                            </span>
                            <span className={`font-mono font-black text-xs px-2.5 py-0.5 rounded-md border ${
                              marginPercent >= 0 
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' 
                                : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                            }`}>
                              Margin: {marginPercent >= 0 ? '+' : ''}{marginPercent.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-0.5">
                              <span className="text-slate-500 font-sans text-[10px] block font-semibold">1. Purchase Price (per {pUnit}):</span>
                              <strong className="text-blue-600 dark:text-blue-400 text-xs block">₹{Number(item.purchase_price || 0).toFixed(2)} / {pUnit}</strong>
                              <span className="text-[9.5px] text-slate-400 font-sans block">Entered in Purchase Unit</span>
                            </div>

                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-0.5">
                              <span className="text-slate-500 font-sans text-[10px] block font-semibold">2. Calculated Base Cost (per {item.unit || 'Nos'}):</span>
                              <strong className="text-slate-900 dark:text-slate-100 text-xs block">₹{costPerSellingUnit.toFixed(2)} / {item.unit || 'Nos'}</strong>
                              <span className="text-[9.5px] text-slate-400 font-sans block">(₹{item.purchase_price || 0} ÷ {piecesPerPack})</span>
                            </div>

                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-0.5">
                              <span className="text-slate-500 font-sans text-[10px] block font-semibold">3. Selling Price & Profit (per {sUnit}):</span>
                              <strong className="text-amber-600 dark:text-amber-400 text-xs block">₹{Number(item.selling_price || 0).toFixed(2)} / {sUnit}</strong>
                              <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-bold block font-mono">
                                Profit: ₹{marginPerSellingUnit.toFixed(2)} / {sUnit}
                              </span>
                            </div>
                          </div>

                          <div className="bg-blue-600/10 border border-blue-200 dark:border-blue-800 p-2 rounded-xl text-[11px] font-mono text-blue-900 dark:text-blue-300 flex justify-between items-center flex-wrap gap-2">
                            <span>Full Pack Retail Selling Price (1 {pUnit} = {piecesPerPack} {sUnit}):</span>
                            <span className="font-black text-blue-700 dark:text-blue-400 text-xs">₹{(Number(item.selling_price || 0) * piecesPerPack).toFixed(2)} / {pUnit}</span>
                          </div>
                        </div>

                        {editingProduct ? (
                          <>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                  Current Base Stock {isEditingBaseStock ? '(Direct Audit Correction)' : ''}
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingBaseStock(!isEditingBaseStock)}
                                  className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <i className={`fa-solid ${isEditingBaseStock ? 'fa-lock' : 'fa-pen-to-square'}`}></i> 
                                  {isEditingBaseStock ? 'Lock Field' : '✏️ Audit Base Stock Correction'}
                                </button>
                              </div>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  step="any"
                                  disabled={!isEditingBaseStock}
                                  className={`w-full border rounded-xl p-2.5 font-mono font-bold transition text-xs pr-14 ${
                                    isEditingBaseStock 
                                      ? 'bg-white dark:bg-slate-900 border-blue-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20' 
                                      : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 cursor-not-allowed opacity-80'
                                  }`}
                                  value={item.current_stock === 0 ? '' : item.current_stock} 
                                  placeholder="0"
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => updateProductItem(index, { current_stock: e.target.value === '' ? 0 : Number(e.target.value) })} 
                                />
                                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 font-mono uppercase">
                                  {item.unit || 'Pcs'}
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-extrabold text-blue-600 dark:text-blue-400 mb-1 flex items-center justify-between">
                                <span>➕ Purchase Quantity (Stock Inward)</span>
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 uppercase">
                                  in {item.p_unit || 'Box'}
                                </span>
                              </label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  step="any" 
                                  min="0" 
                                  className="w-full bg-white dark:bg-slate-900 border-2 border-blue-500 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none font-mono font-extrabold shadow-xs pr-16"
                                  placeholder={`Enter qty in ${item.p_unit || 'Box'} (e.g. 1)...`}
                                  value={item.additional_stock === 0 ? '' : item.additional_stock} 
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => updateProductItem(index, { additional_stock: e.target.value === '' ? 0 : Number(e.target.value) })} 
                                />
                                <span className="absolute right-3 top-2.5 text-xs font-black text-blue-600 dark:text-blue-400 font-mono uppercase">
                                  {item.p_unit || 'Box'}
                                </span>
                              </div>
                            </div>

                            {/* Live Calculation Preview Card for Editing Stock */}
                            <div className="col-span-1 sm:col-span-2 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white border-2 border-blue-500/40 p-3.5 rounded-2xl space-y-2.5 font-mono text-xs shadow-md">
                              <div className="flex justify-between items-center border-b border-blue-500/30 pb-2 flex-wrap gap-2">
                                <span className="font-extrabold text-blue-300 uppercase tracking-wide flex items-center gap-2 text-[11px]">
                                  <i className="fa-solid fa-boxes-packing text-amber-400"></i> Purchase Inward Stock Calculation
                                </span>
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                                  Purchase Qty × Conversion Factor
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
                                <div className="bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                                  <span className="text-slate-400 block text-[9.5px] font-sans">Current Stock:</span>
                                  <strong className="text-slate-100 text-xs">{Number(item.current_stock || 0)} {item.unit || 'Pcs'}</strong>
                                </div>

                                <div className="bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                                  <span className="text-slate-400 block text-[9.5px] font-sans">Purchase:</span>
                                  <strong className="text-blue-300 text-xs">+{Number(item.additional_stock || 0)} {item.p_unit || 'Box'}</strong>
                                </div>

                                <div className="bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                                  <span className="text-slate-400 block text-[9.5px] font-sans">Conversion:</span>
                                  <strong className="text-amber-300 text-xs">1 {item.p_unit || 'Box'} = {item.pieces_per_pack || 1} {item.unit || 'Pcs'}</strong>
                                </div>

                                <div className="bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                                  <span className="text-slate-400 block text-[9.5px] font-sans">Stock Added:</span>
                                  <strong className="text-emerald-400 text-xs">
                                    +{Number(item.additional_stock || 0) * Number(item.pieces_per_pack || 1)} {item.unit || 'Pcs'}
                                  </strong>
                                </div>

                                <div className="col-span-2 sm:col-span-1 bg-emerald-950/80 p-2 rounded-xl border border-emerald-500/60">
                                  <span className="text-emerald-300 block text-[9.5px] font-sans font-bold">Updated Stock:</span>
                                  <strong className="text-emerald-400 text-xs font-black">
                                    {Number(item.current_stock || 0) + (Number(item.additional_stock || 0) * Number(item.pieces_per_pack || 1))} {item.unit || 'Pcs'}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-1 sm:col-span-2 space-y-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                                <span>📦 Purchase Quantity (Opening Stock) *</span>
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 uppercase">
                                  in {item.p_unit || 'Box'}
                                </span>
                              </label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  step="any"
                                  min="0"
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none font-mono font-bold shadow-xs pr-16" 
                                  required
                                  value={item.additional_stock || item.current_stock || ''} 
                                  placeholder={`Enter opening qty in ${item.p_unit || 'Box'}...`}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                                    updateProductItem(index, { additional_stock: val, current_stock: val });
                                  }} 
                                />
                                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-500 font-mono uppercase">
                                  {item.p_unit || 'Box'}
                                </span>
                              </div>
                            </div>

                            {/* Live Conversion Preview Card for New Product */}
                            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white border border-blue-500/40 p-3.5 rounded-2xl space-y-2 font-mono text-xs shadow-md">
                              <div className="flex justify-between items-center border-b border-blue-500/30 pb-1.5 flex-wrap gap-2">
                                <span className="font-extrabold text-blue-300 uppercase tracking-wide flex items-center gap-2 text-[11px]">
                                  <i className="fa-solid fa-calculator text-amber-400"></i> Opening Base Stock Calculation
                                </span>
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                                  Purchase Qty × Conversion Factor
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-[11px]">
                                <div className="bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                                  <span className="text-slate-400 block text-[9.5px] font-sans">Purchase Quantity:</span>
                                  <strong className="text-blue-300 text-xs">{Number(item.additional_stock || item.current_stock || 0)} {item.p_unit || 'Box'}</strong>
                                </div>

                                <div className="bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                                  <span className="text-slate-400 block text-[9.5px] font-sans">Conversion Rule:</span>
                                  <strong className="text-amber-300 text-xs">1 {item.p_unit || 'Box'} = {item.pieces_per_pack || 1} {item.unit || 'Pcs'}</strong>
                                </div>

                                <div className="bg-emerald-950/80 p-2 rounded-xl border border-emerald-500/60">
                                  <span className="text-emerald-300 block text-[9.5px] font-sans font-bold">Initial Base Stock Saved:</span>
                                  <strong className="text-emerald-400 text-xs font-black">
                                    {Number(item.additional_stock || item.current_stock || 0) * Number(item.pieces_per_pack || 1)} {item.unit || 'Pcs'}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                            <span>Min Stock Warning *</span>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">in {item.unit || 'Base Unit'}</span>
                          </label>
                          <input 
                            type="number" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none font-mono font-bold shadow-xs" 
                            required
                            value={item.min_stock_level === 0 ? '' : item.min_stock_level} 
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateProductItem(index, { min_stock_level: e.target.value === '' ? 0 : Number(e.target.value) })} 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">HSN Code of Product</label>
                          <input 
                            type="text" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none font-mono shadow-xs"
                            value={item.hsn} 
                            onChange={(e) => updateProductItem(index, { hsn: e.target.value })} 
                            placeholder="e.g. 7214" 
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">GST Tax Rate (%)</label>
                            <button
                              type="button"
                              onClick={() => setIsEditingTax(!isEditingTax)}
                              className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <i className={`fa-solid ${isEditingTax ? 'fa-lock' : 'fa-pen-to-square'}`}></i>
                              {isEditingTax ? 'Lock Tax' : '✏️ Edit Tax Rate'}
                            </button>
                          </div>
                          <select 
                            disabled={!isEditingTax} 
                            className={`w-full border rounded-xl p-2.5 text-xs font-semibold transition ${
                              isEditingTax 
                                ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none' 
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 cursor-not-allowed opacity-75'
                            }`}
                            value={item.gst || 0} 
                            onChange={(e) => updateProductItem(index, { gst: Number(e.target.value) })}
                          >
                            <option value={0}>0% (GST Disabled)</option>
                            <option value={5}>5% GST</option>
                            <option value={12}>12% GST</option>
                            <option value={18}>18% GST</option>
                            <option value={28}>28% GST</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Product Size</label>
                          <input 
                            type="text" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none shadow-xs"
                            value={item.size} 
                            onChange={(e) => updateProductItem(index, { size: e.target.value })} 
                            placeholder="e.g. 10mm, 2 Inch" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Product Weight</label>
                          <input 
                            type="text" 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none shadow-xs"
                            value={item.weight} 
                            onChange={(e) => updateProductItem(index, { weight: e.target.value })} 
                            placeholder="e.g. 1.2kg, 500g" 
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Product Description</label>
                          <textarea 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none shadow-xs" 
                            rows={2}
                            value={item.description} 
                            onChange={(e) => updateProductItem(index, { description: e.target.value })} 
                            placeholder="Enter detailed specifications..." 
                          />
                        </div>
                      </div>

                      {/* Stock Location Breakdown: Godown + Rack + Shelf */}
                      <div className="bg-white dark:bg-slate-900/80 p-4 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-3 shadow-xs">
                        <label className="block text-xs font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Stock Location (Warehouse / Shelf Breakdown)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Godown (Warehouse)</label>
                            <input 
                              type="text" 
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none font-medium" 
                              placeholder="e.g. Main Godown A"
                              value={item.godown} 
                              onChange={(e) => updateProductItem(index, { godown: e.target.value })} 
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Rack Number</label>
                            <input 
                              type="text" 
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none font-medium" 
                              placeholder="e.g. Rack R-12"
                              value={item.rack_number} 
                              onChange={(e) => updateProductItem(index, { rack_number: e.target.value })} 
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Shelf Number</label>
                            <input 
                              type="text" 
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none font-medium" 
                              placeholder="e.g. Shelf S-3"
                              value={item.shelf_number} 
                              onChange={(e) => updateProductItem(index, { shelf_number: e.target.value })} 
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* + ADD ANOTHER PRODUCT BUTTON AT THE LAST OF FORM */}
              {!editingProduct && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleAddProductItem}
                    className="w-full py-3.5 bg-blue-50/80 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/70 border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-extrabold text-xs sm:text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-98"
                  >
                    <i className="fa-solid fa-plus-circle text-base text-emerald-600 dark:text-emerald-400"></i>
                    <span>+ Add Another Product to Purchase Bill</span>
                  </button>
                </div>
              )}

              {/* Sticky Action Footer */}
              <div className="shrink-0 flex gap-3 justify-end pt-3 border-t border-border mt-4">
                <button type="button" className="px-5 py-2.5 border border-border text-textSecondary rounded-lg text-xs font-bold hover:bg-background transition cursor-pointer" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer flex items-center gap-2">
                  <i className="fa-solid fa-check"></i>
                  <span>Save {productItems.length > 1 ? `${productItems.length} Products & Bill` : 'Item'}</span>
                </button>
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
                  <span className="text-[11px] text-slate-500 font-mono">(Inflows Logged: {prodPurchaseHistory.reduce((sum, pb) => sum + Number(pb.qty || 0), 0)} Pcs)</span>
                  <span>Cost: <span className="font-mono font-bold">₹{Number(selectedHistoryProduct.purchase_price || 0).toFixed(2)}</span></span>
                  <span>Sell: <span className="font-mono font-bold text-primary">₹{Number(selectedHistoryProduct.selling_price || 0).toFixed(2)}</span></span>
                </p>
              </div>
              <button className="text-textSecondary hover:text-foreground text-xs font-bold bg-background/50 hover:bg-background border border-border px-3 py-1.5 rounded-lg transition cursor-pointer"
                onClick={() => setHistoryModalOpen(false)}>
                &times; Close Report
              </button>
            </div>

            {/* History Tab Selector */}
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <button
                type="button"
                onClick={() => setHistoryTab('purchases')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  historyTab === 'purchases'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-background text-textSecondary hover:text-foreground border border-border'
                }`}
              >
                📦 Purchase Inflows ({prodPurchaseHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('sales')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  historyTab === 'sales'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-background text-textSecondary hover:text-foreground border border-border'
                }`}
              >
                🛒 Sales Outflows ({prodSalesHistory.length})
              </button>
            </div>

            {/* Stock Inflows & Sales History Table */}
            <div className="overflow-x-auto border border-border rounded-xl bg-background/25">
              <table className="w-full text-left text-xs text-textSecondary">
                <thead>
                  <tr className="border-b border-border bg-background/50 text-textPrimary uppercase font-extrabold">
                    <th className="p-3">Sr. No.</th>
                    <th className="p-3">{historyTab === 'purchases' ? 'Inflow Date' : 'Sale Date'}</th>
                    <th className="p-3">Ref / Invoice No.</th>
                    <th className="p-3">{historyTab === 'purchases' ? 'Qty Added' : 'Qty Sold'}</th>
                    <th className="p-3">Rate (₹)</th>
                    <th className="p-3">Total Amount</th>
                    <th className="p-3">{historyTab === 'purchases' ? 'Vendor / Source' : 'Customer / Mode'}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyTab === 'purchases' ? (
                    prodPurchaseHistory.length === 0 ? (
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
                          <td className="p-3 font-mono font-bold text-primary">₹{Number(h.amount || (h.qty * h.rate)).toFixed(2)}</td>
                          <td className="p-3 font-semibold uppercase text-foreground">{h.supplier_name}</td>
                        </tr>
                      ))
                    )
                  ) : (
                    prodSalesHistory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-textMuted font-medium">No sales invoice history logged for this product.</td>
                      </tr>
                    ) : (
                      prodSalesHistory.map((s, i) => (
                        <tr key={i} className="border-b border-border hover:bg-slate-100/5 transition font-medium">
                          <td className="p-3 font-mono font-bold text-foreground">{i + 1}</td>
                          <td className="p-3">{new Date(s.date).toLocaleString()}</td>
                          <td className="p-3 font-mono text-[11px] text-textMuted">{s.id}</td>
                          <td className="p-3 font-mono font-extrabold text-rose-500">-{s.qty} {selectedHistoryProduct.s_unit || 'Pcs'}</td>
                          <td className="p-3 font-mono font-bold text-foreground">₹{Number(s.rate || 0).toFixed(2)}</td>
                          <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{Number(s.amount || (s.qty * s.rate)).toFixed(2)}</td>
                          <td className="p-3 font-semibold uppercase text-foreground">{s.customer_name} ({s.payment_mode})</td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Quick Register Vendor Modal Portal */}
      {quickVendorModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[10000] animate-backdrop-fade">
          <div className="bg-secondary border border-border p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                <i className="fa-solid fa-truck-ramp-box text-primary"></i> Quick Register Vendor / Supplier
              </h3>
              <button 
                type="button" 
                onClick={() => setQuickVendorModalOpen(false)} 
                className="text-textMuted hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickCreateVendor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-textSecondary mb-1">Vendor / Firm Name *</label>
                <input 
                  type="text" 
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-extrabold uppercase focus:border-primary focus:outline-none"
                  value={quickVendorFormData.supplier_name}
                  onChange={(e) => setQuickVendorFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                  placeholder="e.g. AMBICA STEEL TRADERS"
                  required 
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Phone / Mobile Number</label>
                <input 
                  type="tel" 
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-mono"
                  value={quickVendorFormData.phone}
                  onChange={(e) => setQuickVendorFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g. 9822012345"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-textSecondary mb-1">Supplier City / Address</label>
                <textarea 
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground"
                  value={quickVendorFormData.address}
                  onChange={(e) => setQuickVendorFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="e.g. Market Yard, Pune"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button 
                  type="button" 
                  onClick={() => setQuickVendorModalOpen(false)}
                  className="px-4 py-2 bg-background text-foreground font-bold text-xs rounded-xl border border-border hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-primary text-white font-extrabold text-xs rounded-xl shadow-md hover:bg-primary/90 transition active:scale-95 cursor-pointer"
                >
                  Register & Select Vendor
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
