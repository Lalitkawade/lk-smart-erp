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

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Purchase Bill Modal State
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [transactionId, setTransactionId] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const [productRowSearch, setProductRowSearch] = useState<{ [key: number]: string }>({});
  const [openProductRowDropdown, setOpenProductRowDropdown] = useState<number | null>(null);
  const [billItems, setBillItems] = useState<Array<{ product_id: string; qty: number; rate: number }>>([
    { product_id: '', qty: 1, rate: 0 }
  ]);
  const [autoFilledNotice, setAutoFilledNotice] = useState<string | null>(null);

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

  const todayUnbilledInflows = useMemo(() => {
    try {
      const localP = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
      return localP.filter((b: any) => Boolean(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN')));
    } catch (e) {
      return [];
    }
  }, [purchaseModalOpen]);

  const totalBillAmount = billItems.reduce((acc, curr) => acc + curr.qty * curr.rate, 0);
  const effectivePaidAmount = isPartialPayment ? Math.min(totalBillAmount, Math.max(0, paidAmount)) : totalBillAmount;
  const dueBillAmount = Math.max(0, totalBillAmount - effectivePaidAmount);

  const loadTodayStockInflows = () => {
    try {
      const localP = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
      const todayInflows = localP.filter((b: any) => Boolean(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN')));

      if (todayInflows.length === 0) {
        setAutoFilledNotice(null);
        return false;
      }

      const itemsMap = new Map<string, { product_id: string; qty: number; rate: number }>();
      const searchMap: Record<number, string> = {};
      let autoVendorName = '';

      todayInflows.forEach((bill: any) => {
        if (!autoVendorName && bill.supplier_name && !bill.supplier_name.includes('Direct Stock Inflow')) {
          autoVendorName = bill.supplier_name;
        }
        const lineItems = bill.items || bill.purchase_items || [];
        if (lineItems.length > 0) {
          lineItems.forEach((item: any) => {
            const rawId = item.product_id || item.product?.id;
            const rawName = item.product_name || item.product?.product_name || '';

            const matched = products.find(p => 
              (rawId && p.id === rawId) || 
              (rawName && p.product_name && p.product_name.trim().toLowerCase() === rawName.trim().toLowerCase())
            );

            const canonicalId = matched ? matched.id : (rawId || rawName);
            if (canonicalId) {
              const existing = itemsMap.get(canonicalId);
              const qty = Number(item.qty || item.quantity || 1);
              const rate = Number(item.rate || item.price || (matched ? Number(matched.purchase_price) : 0));
              if (existing) {
                existing.qty += qty;
                if (rate > 0) existing.rate = rate;
              } else {
                itemsMap.set(canonicalId, { product_id: canonicalId, qty, rate });
              }
            }
          });
        }
      });

      const itemsArray = Array.from(itemsMap.values());
      if (itemsArray.length > 0) {
        itemsArray.forEach((it, idx) => {
          const matched = products.find(p => p.id === it.product_id || (p.product_name && p.product_name.trim().toLowerCase() === it.product_id.trim().toLowerCase()));
          searchMap[idx] = matched ? matched.product_name : it.product_id;
        });

        setBillItems(itemsArray);
        setProductRowSearch(searchMap);

        if (autoVendorName && suppliers.length > 0) {
          const matchSup = suppliers.find(s => s.supplier_name.toUpperCase().trim() === autoVendorName.toUpperCase().trim());
          if (matchSup) {
            setSupplierId(matchSup.id);
            setVendorSearchQuery(matchSup.supplier_name);
          }
        }

        setAutoFilledNotice(`⚡ Auto-loaded ${itemsArray.length} item(s) from today's stock entries! Enter Supplier Bill No. & Save.`);
        return true;
      }
    } catch (e) {}
    return false;
  };

  const [hasBillDetails, setHasBillDetails] = useState(false);

  const handleOpenNewBillModal = () => {
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
      current_stock: 1,
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

  const handleAddItemRow = () => {
    setBillItems(prev => [...prev, { product_id: '', qty: 1, rate: 0 }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    if (billItems.length === 1) return;
    setBillItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, val: string | number) => {
    setBillItems(prev => prev.map((item, i) => {
      if (i === idx) {
        const newItem = { ...item, [field]: val };
        if (field === 'product_id') {
          const match = products.find(p => p.id === val || (p.product_name && p.product_name.trim().toLowerCase() === String(val).trim().toLowerCase()));
          if (match) {
            newItem.product_id = match.id;
            newItem.rate = Number(match.purchase_price || 0);
            setProductRowSearch(prevSearch => ({ ...prevSearch, [idx]: match.product_name }));
          }
        }
        return newItem;
      }
      return item;
    }));
  };

  const handleSelectProduct = (idx: number, product: Product) => {
    setBillItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return {
          ...item,
          product_id: product.id,
          rate: Number(product.purchase_price || 0)
        };
      }
      return item;
    }));
    setProductRowSearch(prev => ({ ...prev, [idx]: product.product_name }));
    setOpenProductRowDropdown(null);
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

  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let activeSup = suppliers.find(s => s.id === supplierId);
    if (!activeSup) {
      const fallbackName = vendorSearchQuery.trim().toUpperCase() || 'GENERAL VENDOR';
      activeSup = suppliers.find(s => s.supplier_name.toUpperCase() === fallbackName) || {
        id: 'sup-gen-' + Date.now(),
        supplier_name: fallbackName,
        phone: '',
        outstanding: 0
      };
    }

    const rawDate = purchaseDate ? new Date(purchaseDate) : new Date();
    const safeIsoDate = isNaN(rawDate.getTime()) ? new Date().toISOString() : rawDate.toISOString();

    const newBillObj = {
      id: 'pb-' + Date.now(),
      bill_number: billNumber.trim() || 'PB-' + Date.now().toString().slice(-5),
      supplier_name: activeSup.supplier_name,
      payment_mode: paymentMode,
      ref_number: transactionId.trim() || null,
      transaction_id: transactionId.trim() || null,
      total_amount: totalBillAmount,
      paid_amount: effectivePaidAmount,
      due_amount: dueBillAmount,
      purchase_date: safeIsoDate,
      is_offline_draft: true,
      items: billItems.map((item, idx) => {
        const typedName = (productRowSearch[idx] || '').trim();
        const p = products.find(prod => prod.id === item.product_id || (prod.product_name && typedName && prod.product_name.trim().toLowerCase() === typedName.toLowerCase()));
        return {
          product_id: p ? p.id : (item.product_id || 'prod-' + Date.now()),
          product_name: p ? p.product_name : (typedName || 'Procured Material Item'),
          qty: Number(item.qty || 1),
          rate: Number(item.rate || 0)
        };
      })
    };

    try {
      const localP = JSON.parse(localStorage.getItem('lk_purchases') || '[]');
      const cleanedP = localP.filter((b: any) => !(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN')));
      localStorage.setItem('lk_purchases', JSON.stringify([newBillObj, ...cleanedP]));

      const localProds: Product[] = JSON.parse(localStorage.getItem('lk_products') || '[]');
      billItems.forEach((item, idx) => {
        const typedName = (productRowSearch[idx] || '').trim();
        const typedLower = typedName.toLowerCase();
        const pIdx = localProds.findIndex(p => {
          if (!p) return false;
          if (p.id && item.product_id && p.id === item.product_id) return true;
          if (p.product_name && item.product_id && p.product_name.trim().toLowerCase() === item.product_id.trim().toLowerCase()) return true;
          if (p.product_name && typedLower && p.product_name.trim().toLowerCase() === typedLower) return true;
          return false;
        });

        if (pIdx >= 0) {
          localProds[pIdx].current_stock = Number(localProds[pIdx].current_stock || 0) + item.qty;
          if (item.rate > 0) localProds[pIdx].purchase_price = item.rate;
        } else if (typedName) {
          const newProdObj: any = {
            id: 'prod-' + Date.now() + '-' + idx,
            tenant_id: tenantId,
            product_name: typedName,
            category_name: 'General',
            brand_name: 'Generic',
            unit: 'Nos',
            purchase_price: item.rate,
            selling_price: Math.round(item.rate * 1.2),
            current_stock: item.qty,
            min_stock_level: 10,
            status: 'Active',
            p_unit: 'Box',
            s_unit: 'Nos',
            pieces_per_pack: 1
          };
          localProds.unshift(newProdObj);
        }
      });
      localStorage.setItem('lk_products', JSON.stringify(localProds));
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('lk_inventory_updated'));

      if (dueBillAmount > 0) {
        const localSups = JSON.parse(localStorage.getItem('lk_suppliers') || '[]');
        const sIdx = localSups.findIndex((s: any) => s.id === activeSup.id);
        if (sIdx >= 0) {
          localSups[sIdx].outstanding = Number(localSups[sIdx].outstanding || 0) + dueBillAmount;
        }
        localStorage.setItem('lk_suppliers', JSON.stringify(localSups));
      }
    } catch (e) {}

    try {
      await supabase.from('purchase_bills').delete().ilike('bill_number', 'STOCK-IN%');
    } catch (e) {}

    const isValidUUID = (id: any) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isValidUUID(tenantId)) {
      try {
        const { data: billRes } = await supabase
          .from('purchase_bills')
          .insert({
            tenant_id: tenantId,
            bill_number: newBillObj.bill_number,
            supplier_name: activeSup.supplier_name,
            payment_mode: paymentMode,
            ref_number: transactionId.trim() || null,
            transaction_id: transactionId.trim() || null,
            total_amount: totalBillAmount,
            paid_amount: effectivePaidAmount,
            due_amount: dueBillAmount,
            purchase_date: newBillObj.purchase_date
          })
          .select()
          .single();

        if (billRes && billRes.id) {
          const localProds: Product[] = JSON.parse(localStorage.getItem('lk_products') || '[]');
          for (const item of newBillObj.items) {
            const validProdId = isValidUUID(item.product_id) ? item.product_id : null;
            await supabase.from('purchase_items').insert({
              bill_id: billRes.id,
              product_id: validProdId,
              qty: item.qty,
              rate: item.rate,
              amount: item.qty * item.rate
            });

            if (validProdId) {
              const pObj = localProds.find(p => p.id === validProdId);
              if (pObj) {
                await supabase
                  .from('products')
                  .update({ current_stock: Number(pObj.current_stock || 0), purchase_price: Number(pObj.purchase_price || 0) })
                  .eq('id', validProdId);
              }
            }
          }
        }
      } catch (err) {}
    }

    setPurchaseModalOpen(false);
    setBillItems([{ product_id: '', qty: 1, rate: 0 }]);
    setProductRowSearch({});
    setSupplierId('');
    setVendorSearchQuery('');
    setBillNumber('');
    setTransactionId('');
    setPaidAmount(0);
    setIsPartialPayment(false);
    setAutoFilledNotice(null);
    triggerToast('Procurement Bill saved! Stock levels & vendor ledgers updated.');
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

  const handleUnitDropdownChange = (field: 'p_unit' | 's_unit' | 'unit', value: string) => {
    let targetValue = value;
    if (value === '__ADD_CUSTOM__') {
      const custom = window.prompt('Enter new custom unit (e.g. Box, Packet, Bundle, Drum, Coil):');
      if (custom && custom.trim()) {
        targetValue = custom.trim();
        setCustomUnits(prev => Array.from(new Set([...prev, targetValue])));
      } else {
        return;
      }
    }

    setFormData(prev => {
      const next = { ...prev, [field]: targetValue };
      if (field === 's_unit') {
        next.unit = targetValue;
      }
      return next;
    });
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
  const [isUnitConversionExpanded, setIsUnitConversionExpanded] = useState(false);

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
      setPurchases(updatedList);

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

      const { piecesPerPack, piecePrice, packPrice } = getProductUnitRates({
        pieces_per_pack: formData.pieces_per_pack,
        selling_price: formData.selling_price,
        piece_selling_price: formData.piece_selling_price,
        purchase_price: formData.purchase_price
      });

      const productPayload = {
        tenant_id: tenantId,
        product_name: formData.product_name,
        sku: formData.sku || null,
        barcode: formData.barcode || null,
        category_name: formData.category_name,
        brand_name: formData.brand_name,
        unit: formData.unit || formData.s_unit || 'Nos',
        purchase_price: formData.purchase_price,
        selling_price: packPrice,
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
        pieces_per_pack: piecesPerPack,
        piece_selling_price: piecePrice,
        allow_decimal: formData.allow_decimal,
        allow_purchase_unit_selling: formData.allow_purchase_unit_selling,
        track_base_unit: formData.track_base_unit,
        ...(targetProductId && { id: targetProductId })
      };

      const savedProd = saveProduct(productPayload as any);

      // Check if prices changed or new stock was added to record in Product History ledger asynchronously
      const effectiveProdId = savedProd?.id || targetProductId;

      // Log purchase bill record if Vendor & Procurement details are active
      if (hasBillDetails) {
        let activeSup = suppliers.find(s => s.id === supplierId);
        if (!activeSup) {
          const fallbackName = vendorSearchQuery.trim().toUpperCase() || (formData.supplier_name ? formData.supplier_name.toUpperCase() : 'GENERAL VENDOR');
          activeSup = suppliers.find(s => s.supplier_name.toUpperCase() === fallbackName) || {
            id: 'sup-gen-' + Date.now(),
            supplier_name: fallbackName,
            phone: formData.supplier_phone || '',
            outstanding: 0
          };
        }

        const rawDate = purchaseDate ? new Date(purchaseDate) : new Date();
        const safeIsoDate = isNaN(rawDate.getTime()) ? new Date().toISOString() : rawDate.toISOString();
        const itemQty = Number(formData.current_stock || 1);
        const itemRate = Number(formData.purchase_price || 0);
        const totalBillCost = itemQty * itemRate;
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
          items: [
            {
              product_id: effectiveProdId || 'prod-' + Date.now(),
              product_name: formData.product_name,
              qty: itemQty,
              rate: itemRate
            }
          ]
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
          supabase.from('purchase_bills').insert({
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
          }).select().single().then(({ data: billRes }) => {
            if (billRes && billRes.id) {
              supabase.from('purchase_items').insert({
                bill_id: billRes.id,
                product_id: isValidUUID(effectiveProdId) ? effectiveProdId : null,
                qty: itemQty,
                rate: itemRate,
                amount: totalBillCost
              });
            }
          }).catch(() => {});
        }
      }
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

  const filtered = useMemo(() => {
    return products
      .filter(p => {
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
    let list: any[] = [];
    try {
      list = JSON.parse(rawLocal);
    } catch (e) {}

    const confirmed = list.filter((b: any) => !(b.bill_number && String(b.bill_number).toUpperCase().startsWith('STOCK-IN')));
    return confirmed.sort((a, b) => new Date(b.purchase_date || b.created_at || 0).getTime() - new Date(a.purchase_date || a.created_at || 0).getTime());
  }, [purchases, modalOpen]);

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

      {/* Catalog vs Vendor Procurement Bills Desk Sub-Tabs */}
      {mode === 'catalog' && (
        <div className="flex items-center gap-2 mb-6 border-b border-border pb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveViewTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeViewTab === 'catalog'
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-background border border-border text-textSecondary hover:text-foreground'
            }`}
          >
            <i className="fa-solid fa-boxes-stacked"></i>
            <span>📦 Product Items & Catalog</span>
            <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded text-[10px]">{products.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('bills')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeViewTab === 'bills'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-background border border-border text-textSecondary hover:text-foreground'
            }`}
          >
            <i className="fa-solid fa-receipt"></i>
            <span>🧾 Procurement & Purchase Bills Desk</span>
            <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded text-[10px]">{uniqueBillsList.length}</span>
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
              const purchasePrice = Number(p?.purchase_price || 0);
              const sellingPrice = Number(p?.selling_price || 0);
              const rawPieces = Number(p?.pieces_per_pack || 0);
              const isBulkLegacy = purchasePrice > sellingPrice * 2 && rawPieces <= 1;

              const { piecesPerPack, piecePrice, packPrice } = getProductUnitRates(p);
              const rawP = p?.p_unit;
              const rawS = p?.s_unit || p?.unit;

              const pUnit = (rawP && rawP.toUpperCase() !== rawS?.toUpperCase()) 
                ? rawP 
                : (isBulkLegacy ? 'Box' : (rawP || 'Pcs'));

              const sUnit = (rawS && rawS.toUpperCase() !== pUnit?.toUpperCase() && rawS.toUpperCase() !== 'PCS') 
                ? rawS 
                : (isBulkLegacy ? 'Nos' : (rawS || 'Pcs'));

              const isDualUnit = piecesPerPack > 1;

              const costPerPiece = isDualUnit ? (purchasePrice / piecesPerPack) : purchasePrice;
              const marginPerPiece = piecePrice - costPerPiece;
              const marginPercent = costPerPiece > 0 ? (marginPerPiece / costPerPiece) * 100 : 0;
              const baseStockQty = Number(p?.current_stock || 0);
              const purchasePackQty = isDualUnit ? (baseStockQty / piecesPerPack) : baseStockQty;
              const minStockPacks = Number(p?.min_stock_level || 10);
              const isLowStock = purchasePackQty <= minStockPacks;
              const costValuation = baseStockQty * costPerPiece;
              const retailValuation = baseStockQty * piecePrice;
              const stockRatio = Math.min(100, Math.max(5, (purchasePackQty / (minStockPacks * 2 || 20)) * 100));

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
              
              {/* TOP VENDOR & PROCUREMENT BILL SECTION (MATCHES USER ATTACHED SCREENSHOT) */}
              {!editingProduct && (
                <div className="bg-gradient-to-r from-blue-500/10 via-slate-900/40 to-emerald-500/10 border border-primary/40 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center flex-wrap gap-2 border-b border-border/60 pb-3">
                    <label className="flex items-center gap-2 cursor-pointer font-black text-xs uppercase text-foreground select-none">
                      <input 
                        type="checkbox" 
                        checked={hasBillDetails} 
                        onChange={(e) => setHasBillDetails(e.target.checked)}
                        className="w-4 h-4 rounded accent-primary cursor-pointer"
                      />
                      <i className="fa-solid fa-cart-shopping text-emerald-500"></i>
                      <span>Record Supplier Purchase Bill / Procurement Details</span>
                    </label>
                    <span className="text-[11px] font-bold text-textMuted">
                      {hasBillDetails ? '✓ Bill Details Active' : 'Check if you have a supplier bill'}
                    </span>
                  </div>

                  {hasBillDetails && (
                    <div className="space-y-4 animate-fade-in pt-1">
                      {/* Vendor Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs text-textSecondary font-semibold">Select Supplier / Vendor *</label>
                            <button 
                              type="button" 
                              onClick={() => setQuickVendorModalOpen(true)}
                              className="text-[11px] text-primary hover:text-primary/80 font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                            >
                              ➕ Quick Register Vendor
                            </button>
                          </div>

                          <div className="relative">
                            <input 
                              type="text" 
                              className="w-full bg-background border border-border rounded-lg p-2.5 text-xs text-foreground font-bold uppercase focus:border-primary focus:outline-none pr-8"
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
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textMuted hover:text-foreground text-xs font-bold cursor-pointer"
                              >
                                &times;
                              </button>
                            )}

                            {/* Floating Vendor Autocomplete */}
                            {vendorDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full mt-1 bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-border/40 scrollbar-thin animate-fade-in">
                                {filteredSuppliersForBill.length === 0 ? (
                                  <div className="p-3 text-center text-xs space-y-2">
                                    <p className="text-textMuted font-medium">No vendors found matching "{vendorSearchQuery}".</p>
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        setQuickVendorFormData(prev => ({ ...prev, supplier_name: vendorSearchQuery.toUpperCase() }));
                                        setVendorDropdownOpen(false);
                                        setQuickVendorModalOpen(true);
                                      }}
                                      className="px-3 py-1.5 bg-primary/20 text-primary font-extrabold text-xs rounded-lg border border-primary/30 transition hover:bg-primary/30 cursor-pointer"
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
                                      className={`p-2.5 hover:bg-background/80 cursor-pointer flex justify-between items-center transition ${supplierId === s.id ? 'bg-primary/10 font-black text-primary' : 'text-foreground'}`}
                                    >
                                      <div className="space-y-0.5">
                                        <div className="text-xs font-bold uppercase">{s.supplier_name}</div>
                                        <div className="text-[10px] text-textMuted">Phone: {s.phone || 'N/A'} {s.outstanding ? `| Dues: ₹${Number(s.outstanding).toFixed(2)}` : ''}</div>
                                      </div>
                                      {supplierId === s.id && <span className="text-primary font-bold text-xs">✓ Selected</span>}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-textSecondary mb-1">Supplier Bill Number</label>
                          <input type="text" className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-semibold"
                            value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. IN-98218" />
                        </div>
                        <div>
                          <label className="block text-xs text-textSecondary mb-1">Billing Date *</label>
                          <input type="date" className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-mono font-semibold"
                            value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required={hasBillDetails} />
                        </div>
                        <div>
                          <label className="block text-xs text-textSecondary mb-1">Payment Channel</label>
                          <select className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-semibold"
                            value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                            <option value="UPI">UPI / GPay</option>
                            <option value="Card">Credit / Debit Card</option>
                            <option value="Bank Transfer">Bank Transfer / NEFT</option>
                            <option value="Cash">Cash Voucher</option>
                          </select>
                        </div>

                        {/* Transaction ID / Ref No. */}
                        {paymentMode !== 'Cash' && (
                          <div className="col-span-1 md:col-span-4 animate-fade-in bg-slate-900/60 p-3 rounded-xl border border-primary/40 space-y-1">
                            <label className="block text-xs text-primary font-extrabold flex items-center justify-between">
                              <span className="flex items-center gap-1.5 uppercase tracking-wide">
                                <i className="fa-solid fa-receipt text-primary"></i> Transaction ID / UTR / Reference No.
                              </span>
                            </label>
                            <input 
                              type="text"
                              className="w-full bg-background border border-primary/60 rounded-lg p-2.5 text-xs text-foreground font-mono font-bold focus:border-primary focus:outline-none uppercase"
                              value={transactionId}
                              onChange={(e) => setTransactionId(e.target.value)}
                              placeholder="e.g. UPI-981240192849 / CARD-492019 / GPay Ref ID"
                            />
                          </div>
                        )}
                      </div>

                      {/* Partial Payment Option */}
                      <div className="border-t border-border/60 pt-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-textSecondary select-none">
                          <input 
                            type="checkbox" 
                            checked={isPartialPayment}
                            onChange={(e) => setIsPartialPayment(e.target.checked)}
                            className="w-4 h-4 rounded accent-primary cursor-pointer"
                          />
                          <span>Record Partial Payment / Remaining Vendor Dues</span>
                        </label>

                        {isPartialPayment && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-background/60 p-3 rounded-xl border border-border animate-fade-in">
                            <div>
                              <label className="block text-xs text-textSecondary font-semibold mb-1">Amount Paid Now (₹)</label>
                              <input 
                                type="number" 
                                step="any"
                                className="w-full bg-background border border-border rounded p-2 text-xs font-mono font-bold text-emerald-500"
                                value={paidAmount}
                                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-textSecondary mb-1">Total Bill Cost (₹)</label>
                              <div className="w-full bg-background border border-border rounded p-2 text-xs font-mono font-extrabold text-foreground">
                                ₹{(Number(formData.current_stock || 1) * Number(formData.purchase_price || 0)).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* UNITS & STOCK CONFIGURATION CARD (COMPACT & COLLAPSIBLE) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
                {/* Card Title Header with Expand/Collapse Button */}
                <div 
                  className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 cursor-pointer select-none"
                  onClick={() => setIsUnitConversionExpanded(!isUnitConversionExpanded)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      <i className="fa-solid fa-boxes-stacked text-sm"></i>
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2 flex-wrap">
                        <span>Units & Dual-Unit Conversion</span>
                        <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                          1 {formData.p_unit} = {formData.pieces_per_pack} {formData.unit}
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Configure purchase, selling, and inventory base unit conversions</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>{isUnitConversionExpanded ? 'Hide Advanced Rules' : '⚙️ Expand Rules'}</span>
                    <i className={`fa-solid ${isUnitConversionExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                  </button>
                </div>

                {/* Row 1: Unit Dropdowns (Always Visible & Compact) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      Purchase Unit <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      Selling Unit <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      Base Stock Unit <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <select
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
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

                {/* Collapsible Section: Conversion Factor, Presets, Checkboxes & Stock Rules */}
                {isUnitConversionExpanded && (
                  <div className="space-y-4 animate-fade-in pt-2 border-t border-slate-100 dark:border-slate-800">
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
                )}
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
                
                {/* Margin Inline calculation with unit normalization */}
                {(() => {
                  const pUnit = formData.p_unit || 'Unit';
                  const sUnit = formData.s_unit || formData.unit || 'Unit';
                  const piecesPerPack = Number(formData.pieces_per_pack || 1);
                  const isDualUnit = pUnit !== sUnit && piecesPerPack > 1;

                  const costPerSellingUnit = isDualUnit ? (formData.purchase_price / piecesPerPack) : formData.purchase_price;
                  const marginPerSellingUnit = formData.selling_price - costPerSellingUnit;
                  const marginPercent = costPerSellingUnit > 0 ? (marginPerSellingUnit / costPerSellingUnit) * 100 : 0;
                  const totalProfitPerPack = isDualUnit ? (marginPerSellingUnit * piecesPerPack) : marginPerSellingUnit;

                  return (
                    <div className="col-span-1 sm:col-span-2 bg-primary/10 p-3.5 rounded-xl border border-primary/30 text-xs space-y-1.5 shadow-xs">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wide">
                          <i className="fa-solid fa-chart-line text-primary"></i> Calculated Retail Margin:
                        </span>
                        <span className="font-mono font-black text-primary text-sm">
                          ₹{marginPerSellingUnit.toFixed(2)} / {sUnit}
                          <span className={`ml-1.5 text-xs font-bold ${marginPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            ({marginPercent >= 0 ? '+' : ''}{marginPercent.toFixed(1)}%)
                          </span>
                        </span>
                      </div>

                      {isDualUnit && (
                        <div className="text-[11px] font-mono text-textMuted flex items-center justify-between border-t border-primary/20 pt-1.5 mt-1 flex-wrap gap-2">
                          <span>Cost per {sUnit}: <strong>₹{costPerSellingUnit.toFixed(2)}</strong> (from ₹{formData.purchase_price} / {pUnit})</span>
                          <span>Total Profit per {pUnit}: <strong className="text-emerald-600 dark:text-emerald-400">₹{totalProfitPerPack.toFixed(2)}</strong></span>
                        </div>
                      )}
                    </div>
                  );
                })()}

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

            {/* Stock Inflows & Purchases History Table */}
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
