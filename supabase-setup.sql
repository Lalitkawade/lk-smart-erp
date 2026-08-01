-- =========================================================================
-- LK Smart ERP - Enterprise Multi-Tenant Supabase SQL Schema setup
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code VARCHAR(10) UNIQUE NOT NULL,
    company_name VARCHAR(100) NOT NULL,
    owner_name VARCHAR(100) NOT NULL,
    owner_email VARCHAR(100) NOT NULL,
    plan VARCHAR(50) DEFAULT 'Trial', -- Trial, Basic, Professional, Enterprise
    status VARCHAR(50) DEFAULT 'Active', -- Active, Expired, Suspended
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. User Profiles (Extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    role VARCHAR(50) NOT NULL, -- Platform Super Admin, Company Owner, Manager, Cashier, Mechanic, etc.
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Products & Stock (Multi-tenant)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_name VARCHAR(150) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    category_name VARCHAR(100) DEFAULT 'General',
    brand_name VARCHAR(100) DEFAULT 'Generic',
    unit VARCHAR(50) DEFAULT 'Pcs',
    purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    dealer_price NUMERIC(12, 2) DEFAULT 0.00,
    mrp NUMERIC(12, 2) DEFAULT 0.00,
    gst NUMERIC(5, 2) DEFAULT 0.00,
    current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_stock_level INTEGER NOT NULL DEFAULT 10,
    status VARCHAR(50) DEFAULT 'Active',
    -- Advanced Modular Fields
    batch_number VARCHAR(100),
    expiry_date TIMESTAMP WITH TIME ZONE,
    warehouse_location VARCHAR(100),
    godown VARCHAR(100),
    rack_number VARCHAR(100),
    shelf_number VARCHAR(100),
    imei VARCHAR(100),
    serial_number VARCHAR(100),
    hsn VARCHAR(100),
    size VARCHAR(100),
    weight VARCHAR(100),
    description TEXT,
    p_unit VARCHAR(50),
    s_unit VARCHAR(50),
    pieces_per_pack INTEGER DEFAULT 1,
    piece_selling_price NUMERIC(12, 2) DEFAULT 0.00,
    supplier_id VARCHAR(100),
    supplier_name VARCHAR(100),
    supplier_phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Sales Invoices
CREATE TABLE IF NOT EXISTS sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(100) DEFAULT 'Cash Customer',
    customer_phone VARCHAR(50),
    payment_mode VARCHAR(50) DEFAULT 'Cash', -- Cash, UPI, Card, Split
    payment_status VARCHAR(50) DEFAULT 'Paid', -- Paid, Unpaid, Partial
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) DEFAULT 0.00,
    due_amount NUMERIC(12, 2) DEFAULT 0.00,
    gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, invoice_number)
);

-- 5. Sales Invoice Items
CREATE TABLE IF NOT EXISTS sales_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL DEFAULT 1,
    rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- 6. Purchase Bills
CREATE TABLE IF NOT EXISTS purchase_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bill_number VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(100) NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    due_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, bill_number)
);

-- 7. Purchase Bill Items
CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL DEFAULT 1,
    rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- 8. Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    ref_number VARCHAR(100),
    description TEXT,
    expense_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Garage Job Cards (Automobile/Garage module)
CREATE TABLE IF NOT EXISTS job_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_number VARCHAR(50) NOT NULL,
    vehicle_model VARCHAR(100) NOT NULL,
    owner_phone VARCHAR(20) NOT NULL,
    mechanic_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    labour_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, In Progress, Ready, Delivered
    delivery_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Garage Job Parts Used
CREATE TABLE IF NOT EXISTS job_card_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL DEFAULT 1,
    rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- 11. Platform Settings
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    invoice_prefix VARCHAR(10) DEFAULT 'INV',
    gstin VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'INR'
);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS across all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Drop old/restrictive policies if re-running
DROP POLICY IF EXISTS tenant_rls ON tenants;
DROP POLICY IF EXISTS tenants_policy ON tenants;
DROP POLICY IF EXISTS super_admin_tenants ON tenants;

DROP POLICY IF EXISTS profiles_rls ON profiles;
DROP POLICY IF EXISTS profiles_policy ON profiles;
DROP POLICY IF EXISTS super_admin_profiles ON profiles;

DROP POLICY IF EXISTS settings_rls ON settings;
DROP POLICY IF EXISTS settings_policy ON settings;

DROP POLICY IF EXISTS products_rls ON products;
DROP POLICY IF EXISTS products_policy ON products;

DROP POLICY IF EXISTS sales_rls ON sales_invoices;
DROP POLICY IF EXISTS sales_policy ON sales_invoices;

DROP POLICY IF EXISTS purchases_rls ON purchase_bills;
DROP POLICY IF EXISTS purchases_policy ON purchase_bills;

DROP POLICY IF EXISTS expenses_rls ON expenses;
DROP POLICY IF EXISTS expenses_policy ON expenses;

DROP POLICY IF EXISTS sales_items_policy ON sales_items;
DROP POLICY IF EXISTS purchase_items_policy ON purchase_items;
DROP POLICY IF EXISTS job_card_parts_policy ON job_card_parts;

ALTER TABLE sales_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_card_parts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to create/read/update tenant & profile records
CREATE POLICY tenants_policy ON tenants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY profiles_policy ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY settings_policy ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY products_policy ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sales_policy ON sales_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sales_items_policy ON sales_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY purchases_policy ON purchase_bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY purchase_items_policy ON purchase_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY expenses_policy ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY job_cards_policy ON job_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY job_card_parts_policy ON job_card_parts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================================
-- CUSTOMERS, SUPPLIERS, AND PAYMENTS SCHEMAS
-- =========================================================================

-- 12. Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    dob DATE,
    credit_limit NUMERIC(12, 2) DEFAULT 50000.00,
    outstanding NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Customer Payments Table
CREATE TABLE IF NOT EXISTS customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    ref_number VARCHAR(100),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. Suppliers (Vendors) Table
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    dob DATE,
    establishment_date DATE,
    outstanding NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 15. Supplier Payments Table
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(50) DEFAULT 'Cash',
    ref_number VARCHAR(100),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

-- Drop old restrictive policies if re-running
DROP POLICY IF EXISTS customers_rls ON customers;
DROP POLICY IF EXISTS customers_policy ON customers;

DROP POLICY IF EXISTS customer_payments_rls ON customer_payments;
DROP POLICY IF EXISTS customer_payments_policy ON customer_payments;

DROP POLICY IF EXISTS suppliers_rls ON suppliers;
DROP POLICY IF EXISTS suppliers_policy ON suppliers;

DROP POLICY IF EXISTS supplier_payments_rls ON supplier_payments;
DROP POLICY IF EXISTS supplier_payments_policy ON supplier_payments;

-- 15. Unstocked Customer Demand Tracker
CREATE TABLE IF NOT EXISTS unstocked_item_demands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_name VARCHAR(200) NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) DEFAULT 'Pending',
    last_requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, item_name)
);

ALTER TABLE unstocked_item_demands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unstocked_item_demands_policy ON unstocked_item_demands;
CREATE POLICY unstocked_item_demands_policy ON unstocked_item_demands FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================================================
-- SYSTEM ADMIN EXCEPTIONS (Allows Super Admin profiles unrestricted access)
-- =========================================================================
CREATE POLICY super_admin_tenants ON tenants FOR ALL USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'Platform Super Admin');
CREATE POLICY super_admin_profiles ON profiles FOR ALL USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'Platform Super Admin');

-- =========================================================================
-- MIGRATION ALTER QUERIES FOR EXISTING TABLES
-- =========================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS dealer_price NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS godown VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rack_number VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_number VARCHAR(100);

ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS due_amount NUMERIC(12, 2) DEFAULT 0.00;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS establishment_date DATE;

-- RLS Policy Fix for sales_items, purchase_items, job_card_parts
ALTER TABLE sales_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_items_policy ON sales_items;
CREATE POLICY sales_items_policy ON sales_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_items_policy ON purchase_items;
CREATE POLICY purchase_items_policy ON purchase_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE job_card_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_card_parts_policy ON job_card_parts;
CREATE POLICY job_card_parts_policy ON job_card_parts FOR ALL TO authenticated USING (true) WITH CHECK (true);



