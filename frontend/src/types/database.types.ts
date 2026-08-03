export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ==========================================
// 1. Tenants Table Interfaces
// ==========================================
export type TenantRow = {
  id: string;
  company_code: string;
  company_name: string;
  owner_name: string;
  owner_email: string;
  plan: string;
  status: string;
  created_at: string;
}
export type TenantInsert = {
  id?: string;
  company_code: string;
  company_name: string;
  owner_name: string;
  owner_email: string;
  plan?: string;
  status?: string;
  created_at?: string;
}
export type TenantUpdate = {
  company_code?: string;
  company_name?: string;
  owner_name?: string;
  owner_email?: string;
  plan?: string;
  status?: string;
}

// ==========================================
// 2. Profiles Table Interfaces
// ==========================================
export type ProfileRow = {
  id: string;
  tenant_id: string | null;
  username: string;
  role: string;
  status: string;
  created_at: string;
}
export type ProfileInsert = {
  id: string;
  tenant_id?: string | null;
  username: string;
  role: string;
  status?: string;
  created_at?: string;
}
export type ProfileUpdate = {
  tenant_id?: string | null;
  username?: string;
  role?: string;
  status?: string;
}

// ==========================================
// 3. Products Table Interfaces
// ==========================================
export type ProductRow = {
  id: string;
  tenant_id: string;
  product_name: string;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string;
  brand_name?: string;
  unit?: string;
  purchase_price: number;
  selling_price: number;
  dealer_price?: number | null;
  mrp?: number | null;
  gst?: number | null;
  current_stock: number;
  min_stock_level?: number;
  status?: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  warehouse_location?: string | null;
  godown?: string | null;
  rack_number?: string | null;
  shelf_number?: string | null;
  imei?: string | null;
  serial_number?: string | null;
  hsn?: string | null;
  size?: string | null;
  weight?: string | null;
  description?: string | null;
  p_unit?: string | null;
  s_unit?: string | null;
  pieces_per_pack?: number | null;
  piece_selling_price?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  created_at?: string;
}
export type ProductInsert = {
  id?: string;
  tenant_id: string;
  product_name: string;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string;
  brand_name?: string;
  unit?: string;
  purchase_price?: number;
  selling_price?: number;
  dealer_price?: number | null;
  mrp?: number | null;
  gst?: number | null;
  current_stock?: number;
  min_stock_level?: number;
  status?: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  warehouse_location?: string | null;
  godown?: string | null;
  rack_number?: string | null;
  shelf_number?: string | null;
  imei?: string | null;
  serial_number?: string | null;
  hsn?: string | null;
  size?: string | null;
  weight?: string | null;
  description?: string | null;
  p_unit?: string | null;
  s_unit?: string | null;
  pieces_per_pack?: number | null;
  piece_selling_price?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  created_at?: string;
}
export type ProductUpdate = {
  id?: string;
  tenant_id?: string;
  product_name?: string;
  sku?: string | null;
  barcode?: string | null;
  category_name?: string;
  brand_name?: string;
  unit?: string;
  purchase_price?: number;
  selling_price?: number;
  dealer_price?: number | null;
  mrp?: number | null;
  gst?: number | null;
  current_stock?: number;
  min_stock_level?: number;
  status?: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  warehouse_location?: string | null;
  godown?: string | null;
  rack_number?: string | null;
  shelf_number?: string | null;
  imei?: string | null;
  serial_number?: string | null;
  hsn?: string | null;
  size?: string | null;
  weight?: string | null;
  description?: string | null;
  p_unit?: string | null;
  s_unit?: string | null;
  pieces_per_pack?: number | null;
  piece_selling_price?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
}

// ==========================================
// 4. Sales Invoices Table Interfaces
// ==========================================
export type SalesInvoiceRow = {
  id: string;
  tenant_id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone?: string | null;
  total_amount: number;
  tax_amount?: number;
  gst_amount?: number;
  payment_mode?: string;
  payment_status?: string;
  status?: string;
  sale_date?: string;
  created_at: string;
}
export type SalesInvoiceInsert = {
  id?: string;
  tenant_id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone?: string | null;
  total_amount?: number;
  tax_amount?: number;
  gst_amount?: number;
  payment_mode?: string;
  payment_status?: string;
  status?: string;
  sale_date?: string;
  created_at?: string;
}
export type SalesInvoiceUpdate = {
  invoice_number?: string;
  customer_name?: string;
  customer_phone?: string | null;
  total_amount?: number;
  tax_amount?: number;
  gst_amount?: number;
  payment_mode?: string;
  payment_status?: string;
  status?: string;
  sale_date?: string;
}

// ==========================================
// 5. Sales Items Table Interfaces
// ==========================================
export type SalesItemRow = {
  id: string;
  invoice_id: string;
  product_id: string;
  qty: number;
  rate: number;
  amount: number;
}
export type SalesItemInsert = {
  id?: string;
  invoice_id: string;
  product_id: string;
  qty: number;
  rate: number;
  amount: number;
}
export type SalesItemUpdate = {
  qty?: number;
  rate?: number;
  amount?: number;
}

// ==========================================
// 6. Purchase Bills Table Interfaces
// ==========================================
export type PurchaseBillRow = {
  id: string;
  tenant_id: string;
  bill_number: string;
  supplier_name: string;
  supplier_phone?: string | null;
  payment_mode?: string;
  total_amount: number;
  paid_amount?: number;
  due_amount?: number;
  purchase_date?: string;
  status?: string;
  created_at?: string;
}
export type PurchaseBillInsert = {
  id?: string;
  tenant_id: string;
  bill_number: string;
  supplier_name: string;
  supplier_phone?: string | null;
  payment_mode?: string;
  total_amount?: number;
  paid_amount?: number;
  due_amount?: number;
  purchase_date?: string;
  status?: string;
  created_at?: string;
}
export type PurchaseBillUpdate = {
  bill_number?: string;
  supplier_name?: string;
  supplier_phone?: string | null;
  payment_mode?: string;
  total_amount?: number;
  paid_amount?: number;
  due_amount?: number;
  purchase_date?: string;
  status?: string;
}

// ==========================================
// 7. Purchase Items Table Interfaces
// ==========================================
export type PurchaseItemRow = {
  id: string;
  bill_id: string;
  product_id: string;
  qty: number;
  rate: number;
  amount: number;
}
export type PurchaseItemInsert = {
  id?: string;
  bill_id: string;
  product_id: string;
  qty: number;
  rate: number;
  amount: number;
}
export type PurchaseItemUpdate = {
  qty?: number;
  rate?: number;
  amount?: number;
}

// ==========================================
// 8. Expenses Interfaces
// ==========================================
export type ExpenseRow = {
  id: string;
  tenant_id: string;
  category: string;
  amount: number;
  payment_mode: string;
  ref_number: string | null;
  description: string | null;
  expense_date: string;
}
export type ExpenseInsert = {
  id?: string;
  tenant_id: string;
  category: string;
  amount?: number;
  payment_mode?: string;
  ref_number?: string | null;
  description?: string | null;
  expense_date?: string;
}
export type ExpenseUpdate = {
  category?: string;
  amount?: number;
  payment_mode?: string;
  ref_number?: string | null;
  description?: string | null;
}

// ==========================================
// 9. Job Cards Table Interfaces
// ==========================================
export type JobCardRow = {
  id: string;
  tenant_id: string;
  job_card_number: string;
  vehicle_number: string;
  vehicle_model: string;
  owner_phone?: string | null;
  mechanic_id?: string | null;
  labour_charges?: number;
  status: string;
  estimated_cost: number;
  final_cost: number;
  created_at?: string;
}
export type JobCardInsert = {
  id?: string;
  tenant_id: string;
  job_card_number: string;
  vehicle_number: string;
  vehicle_model: string;
  owner_phone?: string | null;
  mechanic_id?: string | null;
  labour_charges?: number;
  status?: string;
  estimated_cost?: number;
  final_cost?: number;
  created_at?: string;
}
export type JobCardUpdate = {
  job_card_number?: string;
  vehicle_number?: string;
  vehicle_model?: string;
  owner_phone?: string | null;
  mechanic_id?: string | null;
  labour_charges?: number;
  status?: string;
  estimated_cost?: number;
  final_cost?: number;
}

// ==========================================
// 10. Job Card Parts Table Interfaces
// ==========================================
export type JobCardPartRow = {
  id: string;
  job_card_id: string;
  part_name: string;
  qty: number;
  cost: number;
}
export type JobCardPartInsert = {
  id?: string;
  job_card_id: string;
  part_name: string;
  qty?: number;
  cost?: number;
}
export type JobCardPartUpdate = {
  part_name?: string;
  qty?: number;
  cost?: number;
}

// ==========================================
// 11. Settings Table Interfaces
// ==========================================
export type SettingsRow = {
  id: string;
  tenant_id: string;
  invoice_prefix: string;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  currency: string;
  business_type: string | null;
  logo_url: string | null;
  created_at: string;
}
export type SettingsInsert = {
  id?: string;
  tenant_id: string;
  invoice_prefix?: string;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  currency?: string;
  business_type?: string | null;
  logo_url?: string | null;
  created_at?: string;
}
export type SettingsUpdate = {
  invoice_prefix?: string;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  currency?: string;
  business_type?: string | null;
  logo_url?: string | null;
}

// ==========================================
// 12. Customers Table Interfaces
// ==========================================
export type CustomerRow = {
  id: string;
  tenant_id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  dob: string | null;
  credit_limit: number;
  outstanding: number;
  created_at: string;
}
export type CustomerInsert = {
  id?: string;
  tenant_id: string;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  credit_limit?: number;
  outstanding?: number;
  created_at?: string;
}
export type CustomerUpdate = {
  customer_name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  credit_limit?: number;
  outstanding?: number;
}

// ==========================================
// 13. Customer Payments Table Interfaces
// ==========================================
export type CustomerPaymentRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  amount: number;
  payment_mode: string;
  ref_number: string | null;
  payment_date: string;
}
export type CustomerPaymentInsert = {
  id?: string;
  tenant_id: string;
  customer_id: string;
  amount: number;
  payment_mode?: string;
  ref_number?: string | null;
  payment_date?: string;
}
export type CustomerPaymentUpdate = {
  amount?: number;
  payment_mode?: string;
  ref_number?: string | null;
  payment_date?: string;
}

// ==========================================
// 14. Suppliers Table Interfaces
// ==========================================
export type SupplierRow = {
  id: string;
  tenant_id: string;
  supplier_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  dob: string | null;
  establishment_date: string | null;
  outstanding: number;
  created_at: string;
}
export type SupplierInsert = {
  id?: string;
  tenant_id: string;
  supplier_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  establishment_date?: string | null;
  outstanding?: number;
  created_at?: string;
}
export type SupplierUpdate = {
  supplier_name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dob?: string | null;
  establishment_date?: string | null;
  outstanding?: number;
}

// ==========================================
// 15. Supplier Payments Table Interfaces
// ==========================================
export type SupplierPaymentRow = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  amount: number;
  payment_mode: string;
  ref_number: string | null;
  payment_date: string;
}
export type SupplierPaymentInsert = {
  id?: string;
  tenant_id: string;
  supplier_id: string;
  amount: number;
  payment_mode?: string;
  ref_number?: string | null;
  payment_date?: string;
}
export type SupplierPaymentUpdate = {
  amount?: number;
  payment_mode?: string;
  ref_number?: string | null;
  payment_date?: string;
}

export type UnstockedDemandRow = {
  id: string;
  tenant_id: string;
  item_name: string;
  request_count: number;
  min_alert_qty?: number;
  status?: string;
  last_requested_at?: string;
}
export type UnstockedDemandInsert = {
  id?: string;
  tenant_id: string;
  item_name: string;
  request_count?: number;
  min_alert_qty?: number;
  status?: string;
  last_requested_at?: string;
}
export type UnstockedDemandUpdate = {
  id?: string;
  tenant_id?: string;
  item_name?: string;
  request_count?: number;
  min_alert_qty?: number;
  status?: string;
  last_requested_at?: string;
}

// ==========================================
// Primary Database Registry Mapping
// ==========================================
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: TenantRow;
        Insert: TenantInsert;
        Update: TenantUpdate;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      products: {
        Row: ProductRow;
        Insert: ProductInsert;
        Update: ProductUpdate;
        Relationships: [];
      };
      sales_invoices: {
        Row: SalesInvoiceRow;
        Insert: SalesInvoiceInsert;
        Update: SalesInvoiceUpdate;
        Relationships: [];
      };
      sales_items: {
        Row: SalesItemRow;
        Insert: SalesItemInsert;
        Update: SalesItemUpdate;
        Relationships: [];
      };
      purchase_bills: {
        Row: PurchaseBillRow;
        Insert: PurchaseBillInsert;
        Update: PurchaseBillUpdate;
        Relationships: [];
      };
      purchase_items: {
        Row: PurchaseItemRow;
        Insert: PurchaseItemInsert;
        Update: PurchaseItemUpdate;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: ExpenseInsert;
        Update: ExpenseUpdate;
        Relationships: [];
      };
      job_cards: {
        Row: JobCardRow;
        Insert: JobCardInsert;
        Update: JobCardUpdate;
        Relationships: [];
      };
      job_card_parts: {
        Row: JobCardPartRow;
        Insert: JobCardPartInsert;
        Update: JobCardPartUpdate;
        Relationships: [];
      };
      settings: {
        Row: SettingsRow;
        Insert: SettingsInsert;
        Update: SettingsUpdate;
        Relationships: [];
      };
      customers: {
        Row: CustomerRow;
        Insert: CustomerInsert;
        Update: CustomerUpdate;
        Relationships: [];
      };
      customer_payments: {
        Row: CustomerPaymentRow;
        Insert: CustomerPaymentInsert;
        Update: CustomerPaymentUpdate;
        Relationships: [];
      };
      suppliers: {
        Row: SupplierRow;
        Insert: SupplierInsert;
        Update: SupplierUpdate;
        Relationships: [];
      };
      supplier_payments: {
        Row: SupplierPaymentRow;
        Insert: SupplierPaymentInsert;
        Update: SupplierPaymentUpdate;
        Relationships: [];
      };
      unstocked_item_demands: {
        Row: UnstockedDemandRow;
        Insert: UnstockedDemandInsert;
        Update: UnstockedDemandUpdate;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
