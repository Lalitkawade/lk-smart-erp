/**
 * Comprehensive Internationalization (i18n) Module
 * Complete English & Marathi (मराठी) translation dictionary for LK Smart ERP
 */

export type Language = 'en' | 'mr';

export const translations: Record<string, { en: string; mr: string }> = {
  // Navigation & Headers
  appTitle: { en: 'Enterprise Portal', mr: 'एंटरप्राइज पोर्टल' },
  dashboard: { en: 'Dashboard', mr: 'डॅशबोर्ड' },
  business: { en: 'BUSINESS', mr: 'व्यवसाय' },
  customers: { en: 'Customers', mr: 'ग्राहक खाते' },
  vendors: { en: 'Vendors', mr: 'पुरवठादार (विक्रेते)' },
  products: { en: 'Products', mr: 'उत्पादने व माल' },
  transactions: { en: 'TRANSACTIONS', mr: 'व्यवहार व बिलिंग' },
  newEntry: { en: 'New Entry', mr: 'नवीन बिलिंग' },
  purchase: { en: 'Purchase', mr: 'खरेदी नोंदणी' },
  sales: { en: 'Sales', mr: 'विक्री नोंदी' },
  shopExpenses: { en: 'Shop Expenses', mr: 'दुकानाचा खर्च' },
  inventory: { en: 'INVENTORY', mr: 'मालसाठा' },
  inventoryStock: { en: 'Inventory & Stock', mr: 'स्टॉक व मालसाठा' },
  materialTracking: { en: 'Material Tracking', mr: 'मटेरियल ट्रॅकिंग' },
  reports: { en: 'REPORTS', mr: 'अहवाल' },
  excelExport: { en: 'Excel Export', mr: 'एक्सेल अहवाल' },
  logout: { en: 'Log out', mr: 'लॉग आऊट' },

  // Executive Dashboard Terms
  executiveDashboard: { en: 'Realtime Executive Dashboard', mr: 'लाइव डॅशबोर्ड व विक्री अहवाल' },
  totalSales: { en: 'Total Sales', mr: 'एकूण विक्री' },
  totalPurchases: { en: 'Total Purchases', mr: 'एकूण खरेदी' },
  netProfit: { en: 'Net Profit', mr: 'निव्वळ नफा (Net Profit)' },
  customerUdharDues: { en: 'Customer Outstanding Udhar', mr: 'ग्राहकांचे एकूण बाकी उधार' },
  vendorPayables: { en: 'Vendor Outstanding Dues', mr: 'पुरवठादारांची देय रक्कम' },
  tenDays: { en: '10 Days', mr: '१० दिवस' },
  month: { en: 'Month', mr: 'महिना' },
  year: { en: 'Year', mr: 'वर्ष' },
  allTime: { en: 'All Time', mr: 'सर्व काळ' },
  custom: { en: 'Custom', mr: 'कस्टम तारीख' },

  // Customer Management Desk
  customerManagement: { en: 'Customer Ledger Management', mr: 'ग्राहक खाते व्यवस्थापन' },
  addCustomer: { en: 'Add New Customer', mr: 'नवीन ग्राहक जोडा' },
  totalCustomers: { en: 'Total Customers', mr: 'एकूण ग्राहक संख्या' },
  totalUdharAmount: { en: 'Total Outstanding Udhar', mr: 'एकूण बाकी उधार रक्कम' },
  birthdaysThisMonth: { en: 'Birthdays This Month', mr: 'या महिन्यातील वाढदिवस' },
  customerHistory: { en: 'Ledger & Transaction History', mr: 'खाते व व्यवहारांचा इतिहास' },
  creditLimit: { en: 'Credit Limit (₹)', mr: 'उधार मर्यादा (₹)' },
  address: { en: 'Address / Location', mr: 'पत्ता / ठिकाण' },

  // Supplier & Vendor Desk
  vendorManagement: { en: 'Material Supplier & Vendor Desk', mr: 'पुरवठादार व विक्रेते खाते' },
  addVendor: { en: 'Register Material Vendor', mr: 'नवीन पुरवठादार जोडा' },
  totalVendors: { en: 'Total Vendors', mr: 'एकूण पुरवठादार संख्या' },
  totalPayableDues: { en: 'Total Payable Dues', mr: 'देय असलेली बाकी रक्कम' },
  companyName: { en: 'Company / Establishment Name', mr: 'कंपनी किंवा दुकानाचे नाव' },
  gstin: { en: 'GSTIN Number', mr: 'जीएसटी (GSTIN) नंबर' },

  // Products & Inventory Catalog
  productCatalog: { en: 'Inventory & Product Catalog', mr: 'उत्पादने व मालसाठा कॅटलॉग' },
  addProduct: { en: 'Add Product Item', mr: 'नवीन माल जोडा' },
  totalStockValue: { en: 'Total Inventory Valuation', mr: 'एकूण मालसाठा मूल्य' },
  totalItems: { en: 'Total Items In Catalog', mr: 'एकूण उत्पादने' },
  skuBarcode: { en: 'SKU / Barcode', mr: 'बारकोड / कोड (SKU)' },
  minStockLevel: { en: 'Minimum Alert Stock Level', mr: 'किमान साठा मर्यादा' },
  unitOfMeasure: { en: 'Unit (Pcs, Kg, Meter, Box)', mr: 'एकक (नग, किलो, मीटर, बॉक्स)' },
  category: { en: 'Product Category', mr: 'मालाचा प्रकार (प्रवर्ग)' },

  // Purchases Desk
  purchaseBills: { en: 'Procurement & Purchase Bills Desk', mr: 'खरेदी बिले व नोंदणी' },
  newPurchaseBill: { en: 'Log New Purchase Bill', mr: 'नवीन खरेदी बिल नोंदवा' },
  billNumber: { en: 'Bill / Invoice Number', mr: 'खरेदी बिल नंबर' },
  purchaseDate: { en: 'Purchase Date', mr: 'खरेदी तारीख' },
  vendorName: { en: 'Vendor / Supplier Name', mr: 'पुरवठादाराचे नाव' },

  // Expenses Desk
  shopOperatingExpenses: { en: 'Shop Operating Expenses Audit', mr: 'दुकानाचा खर्च व नोंदी' },
  logExpense: { en: 'Log New Expense Entry', mr: 'नवीन खर्च नोंदवा' },
  expenseCategory: { en: 'Expense Category', mr: 'खर्चाचा प्रकार' },
  expenseDate: { en: 'Expense Date', mr: 'खर्चाची तारीख' },
  notes: { en: 'Description / Remarks', mr: 'तपशील / टीप' },

  // Reports & Material Tracking
  materialTrackingReports: { en: 'Material Movement & Profit Audit Reports', mr: 'मटेरियल ट्रॅकिंग व अहवाल' },
  salesReports: { en: 'Sales Performance Reports', mr: 'विक्री अहवाल' },
  stockLedger: { en: 'Stock Movement Ledger', mr: 'माल साठा अहवाल' },
  profitAnalysis: { en: 'Net Margin & COGS Audit', mr: 'नफा व खर्च पृथक्करण' },

  // Excel Export Desk
  excelExportDesk: { en: 'Excel Report Generator & Data Export', mr: 'एक्सेल अहवाल डाउनलोड' },
  downloadSalesExcel: { en: 'Export Sales Report (Excel)', mr: 'विक्री अहवाल डाउनलोड करा (Excel)' },
  downloadStockExcel: { en: 'Export Inventory Stock (Excel)', mr: 'मालसाठा अहवाल डाउनलोड करा (Excel)' },
  downloadCustomersExcel: { en: 'Export Customer Ledgers (Excel)', mr: 'ग्राहक अहवाल डाउनलोड करा (Excel)' },
  downloadExpensesExcel: { en: 'Export Expense Audit (Excel)', mr: 'खर्च अहवाल डाउनलोड करा (Excel)' },

  // Dashboard Overview Metrics
  totalSalesToday: { en: "Today's Total Sales", mr: 'आजची एकूण विक्री' },
  cashCollectedToday: { en: "Today's Cash Collected", mr: 'आज जमा झालेली कॅश' },
  totalUdharPending: { en: 'Total Outstanding Udhar', mr: 'एकूण मागील बाकी (उधार)' },
  lowStockAlerts: { en: 'Low Stock Items', mr: 'कमी साठा (स्टॉक कमी माल)' },
  todaysBirthdays: { en: "Today's Birthdays", mr: 'आजचे वाढदिवस' },

  // POS & Checkout Modal
  selectProducts: { en: 'Select Products', mr: 'माल निवडा' },
  cartSubTotal: { en: 'Current Cart Sub Total', mr: 'आजच्या बिलाची एकूण रक्कम' },
  todayBillCollected: { en: "Today's Bill Collected:", mr: 'आज जमा झालेली रक्कम:' },
  totalCashCollected: { en: 'TOTAL CASH / PAYMENT COLLECTED:', mr: 'एकूण जमा रक्कम (कॅश/ऑनलाइन):' },
  currentBillStatus: { en: 'Current Bill Payment Status:', mr: 'बिलाची स्थिती:' },
  unpaidAddedToUdhar: { en: 'Unpaid Amount Added to Udhar:', mr: 'उधार खात्यात जोडलेली बाकी रक्कम:' },
  newUdharBalance: { en: 'New Net Total Udhar Balance:', mr: 'मागील बाकी + नवीन बाकी उधार:' },
  previousUdharRepaid: { en: 'Previous Udhar Repaid Today:', mr: 'आज जमा झालेली जुनी उधार रक्कम:' },
  appliedToPreviousUdhar: { en: 'Applied to Previous Udhar:', mr: 'जुन्या उधारीत जमा:' },
  repayPreviousUdhar: { en: 'Repay Previous Udhar (₹):', mr: 'जुनी बाकी उधार जमा करा (₹):' },

  // Form Field Labels & Placeholders
  customerName: { en: 'Customer Name', mr: 'ग्राहकाचे नाव' },
  customerPhone: { en: 'Customer Mobile Number', mr: 'ग्राहकाचा मोबाईल नंबर' },
  supplierName: { en: 'Supplier / Vendor Name', mr: 'पुरवठादाराचे नाव' },
  productName: { en: 'Product Name', mr: 'उत्पादनाचे नाव' },
  amount: { en: 'Amount (₹)', mr: 'रक्कम (₹)' },
  quantity: { en: 'Quantity (Qty)', mr: 'नग / प्रमाण (नग)' },
  rate: { en: 'Selling Price / Rate (₹)', mr: 'विक्री दर (₹)' },
  purchasePrice: { en: 'Purchase Price (₹)', mr: 'खरेदी दर (₹)' },
  searchPlaceholder: { en: 'Search items by name, SKU, or scan barcode...', mr: 'नाव किंवा बारकोडने माल शोधा...' },
  searchCustomerPlaceholder: { en: 'Search existing customer by Name or Mobile Phone...', mr: 'नाव किंवा मोबाईल नंबरने ग्राहक शोधा...' },

  // Buttons & Badges
  checkoutAndBill: { en: 'Checkout & Bill', mr: 'बिल तयार करा' },
  cancel: { en: 'Cancel', mr: 'रद्द करा' },
  printInvoice: { en: 'Print Invoice', mr: 'बिल प्रिंट करा' },
  close: { en: 'Close', mr: 'बंद करा' },
  save: { en: 'Save Record', mr: 'जतन करा' },
  delete: { en: 'Delete', mr: 'हटवा' },
  edit: { en: 'Edit', mr: 'सुधारा' },
  paid: { en: 'PAID', mr: 'पूर्ण जमा (PAID)' },
  partial: { en: 'PARTIAL', mr: 'अंशतः जमा (PARTIAL)' },
  unpaid: { en: 'UNPAID', mr: 'उधार (UNPAID)' },
  pending: { en: 'Pending Dues', mr: 'बाकी उधार' },
  noDues: { en: 'No Dues', mr: 'बाकी नाही' },

  // Payment Modes
  paymentMode: { en: 'Payment Mode', mr: 'पैसे भरण्याची पद्धत' },
  cash: { en: 'Cash', mr: 'रोख (Cash)' },
  upi: { en: 'UPI / GPay', mr: 'युपीआय / जीपे (UPI)' },
  card: { en: 'Credit / Debit Card', mr: 'कार्ड (Card)' },
  bank: { en: 'Bank Transfer / NEFT', mr: 'बँक ट्रान्सफर' },
  creditUdhar: { en: 'Credit (Udhar Account)', mr: 'उधार खाते (Udhar)' },

  // Customer / Vendor Ledger Terms
  previousOutstanding: { en: 'Previous Outstanding Udhar:', mr: 'मागील बाकी उधार:' },
  paidTodayFromPrevious: { en: 'Paid Today From Previous Udhar:', mr: 'आज जमा झालेली जुनी उधार:' },
  paidTodayForCurrent: { en: 'Paid Today For Current Bill:', mr: 'आजच्या बिलापोटी जमा:' },
  netRemainingUdhar: { en: 'NET REMAINING OUTSTANDING UDHAR:', mr: 'एकूण एकूण बाकी उधार:' },

  // Developer & System Info
  developedBy: { en: 'Developed by LK Digital Solution', mr: 'विकसित: LK Digital Solution' },
  contactNo: { en: 'Call: 9270138287', mr: 'संपर्क: 9270138287' },
};

/**
 * Get translated text for a key based on active language.
 */
export function t(key: string, lang?: Language): string {
  const activeLang = lang || (localStorage.getItem('lk_lang') as Language) || 'en';
  const item = translations[key];
  if (!item) return key;
  return item[activeLang] || item['en'] || key;
}
