-- ============================================================================
-- LK SMART ERP - MASTER SUPABASE DATABASE SCHEMA (CLEAN RECREATION)
-- Complete schema with Multi-Tenant RLS, Server-Side Triggers & All Modules
-- ============================================================================
-- Instructions: 
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. Go to: SQL Editor -> New Query
-- 3. Copy and paste this ENTIRE script and click "Run" (Ctrl + Enter)
-- ============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DROP EXISTING TABLES IN CASCADE ORDER FOR CLEAN RESET
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.get_auth_tenant_id CASCADE;

DROP TABLE IF EXISTS unstocked_item_demands CASCADE;
DROP TABLE IF EXISTS supplier_payments CASCADE;
DROP TABLE IF EXISTS customer_payments CASCADE;
DROP TABLE IF EXISTS job_card_parts CASCADE;
DROP TABLE IF EXISTS job_cards CASCADE;
DROP TABLE IF EXISTS purchase_items CASCADE;
DROP TABLE IF EXISTS purchase_bills CASCADE;
DROP TABLE IF EXISTS sales_items CASCADE;
DROP TABLE IF EXISTS sales_invoices CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- 2. TENANTS TABLE
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code TEXT NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    plan TEXT DEFAULT 'Enterprise',
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default Shared Fallback Tenant Record
INSERT INTO tenants (id, company_code, company_name, owner_name, owner_email)
VALUES ('00000000-0000-0000-0000-000000000000', 'LKHARDWARE', 'LK Hardware ERP', 'Store Owner', 'owner@shop.com')
ON CONFLICT (id) DO NOTHING;

-- 3. PROFILES TABLE (Extends Supabase Auth users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY, -- Maps to auth.users.id
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Owner',
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SETTINGS TABLE
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    invoice_prefix TEXT DEFAULT 'INV',
    gstin TEXT DEFAULT '27LKSERP401Z2B5',
    address TEXT DEFAULT '123 Market Road, Pune, Maharashtra',
    city TEXT DEFAULT 'Pune',
    state TEXT DEFAULT 'Maharashtra',
    currency TEXT DEFAULT 'INR',
    business_type TEXT DEFAULT 'Hardware Shop',
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default Settings Record for Default Tenant
INSERT INTO settings (tenant_id, invoice_prefix, gstin, address, city, state, currency, business_type)
VALUES ('00000000-0000-0000-0000-000000000000', 'INV', '27LKSERP401Z2B5', '123 Market Road, Pune, Maharashtra', 'Pune', 'Maharashtra', 'INR', 'Hardware Shop')
ON CONFLICT (tenant_id) DO NOTHING;

-- 5. SUPPLIERS (VENDORS) TABLE
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    dob DATE,
    establishment_date DATE,
    outstanding NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CUSTOMERS TABLE
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    dob DATE,
    credit_limit NUMERIC(12, 2) DEFAULT 0.00,
    outstanding NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. PRODUCTS TABLE
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    sku TEXT,
    barcode TEXT,
    category_name TEXT DEFAULT 'General',
    brand_name TEXT DEFAULT 'Generic',
    unit TEXT DEFAULT 'Pcs',
    purchase_price NUMERIC(12, 2) DEFAULT 0.00,
    selling_price NUMERIC(12, 2) DEFAULT 0.00,
    dealer_price NUMERIC(12, 2) DEFAULT 0.00,
    mrp NUMERIC(12, 2) DEFAULT 0.00,
    gst NUMERIC(5, 2) DEFAULT 0.00,
    current_stock NUMERIC(12, 2) DEFAULT 0.00,
    min_stock_level NUMERIC(12, 2) DEFAULT 10,
    status TEXT DEFAULT 'Active',
    batch_number TEXT,
    expiry_date DATE,
    warehouse_location TEXT,
    godown TEXT,
    rack_number TEXT,
    shelf_number TEXT,
    imei TEXT,
    serial_number TEXT,
    hsn TEXT,
    size TEXT,
    weight TEXT,
    description TEXT,
    p_unit TEXT DEFAULT 'Pcs',
    s_unit TEXT DEFAULT 'Pcs',
    pieces_per_pack INTEGER DEFAULT 1,
    piece_selling_price NUMERIC(12, 2) DEFAULT 0.00,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT,
    supplier_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EXPENSES TABLE
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount NUMERIC(12, 2) DEFAULT 0.00,
    payment_mode TEXT DEFAULT 'Cash',
    ref_number TEXT,
    description TEXT,
    expense_date TIMESTAMPTZ DEFAULT NOW()
);

-- 9. SALES INVOICES TABLE
CREATE TABLE sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) DEFAULT 0.00,
    gst_amount NUMERIC(12, 2) DEFAULT 0.00,
    due_amount NUMERIC(12, 2) DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) DEFAULT 0.00,
    payment_mode TEXT DEFAULT 'Cash',
    ref_number TEXT,
    payment_status TEXT DEFAULT 'Paid',
    status TEXT DEFAULT 'Completed',
    sale_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. SALES ITEMS TABLE
CREATE TABLE sales_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    qty NUMERIC(12, 2) DEFAULT 1.00,
    rate NUMERIC(12, 2) DEFAULT 0.00,
    amount NUMERIC(12, 2) DEFAULT 0.00
);

-- 11. PURCHASE BILLS TABLE
CREATE TABLE purchase_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    bill_number TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    supplier_phone TEXT,
    payment_mode TEXT DEFAULT 'Cash',
    ref_number TEXT,
    total_amount NUMERIC(12, 2) DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) DEFAULT 0.00,
    due_amount NUMERIC(12, 2) DEFAULT 0.00,
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'Completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PURCHASE ITEMS TABLE
CREATE TABLE purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID REFERENCES purchase_bills(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    qty NUMERIC(12, 2) DEFAULT 1.00,
    rate NUMERIC(12, 2) DEFAULT 0.00,
    amount NUMERIC(12, 2) DEFAULT 0.00
);

-- 13. CUSTOMER PAYMENTS TABLE
CREATE TABLE customer_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) DEFAULT 0.00,
    payment_mode TEXT DEFAULT 'Cash',
    ref_number TEXT,
    payment_date TIMESTAMPTZ DEFAULT NOW()
);

-- 14. SUPPLIER PAYMENTS TABLE
CREATE TABLE supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) DEFAULT 0.00,
    payment_mode TEXT DEFAULT 'Cash',
    ref_number TEXT,
    payment_date TIMESTAMPTZ DEFAULT NOW()
);

-- 15. JOB CARDS TABLE (Garage & Automobile Services)
CREATE TABLE job_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_number TEXT NOT NULL,
    vehicle_model TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    mechanic_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    labour_charges NUMERIC(12, 2) DEFAULT 0.00,
    status TEXT DEFAULT 'Pending',
    delivery_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. JOB CARD PARTS TABLE
CREATE TABLE job_card_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_card_id UUID REFERENCES job_cards(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    qty NUMERIC(12, 2) DEFAULT 1.00,
    rate NUMERIC(12, 2) DEFAULT 0.00
);

-- 17. UNSTOCKED ITEM DEMANDS TABLE (Demand Tracker)
CREATE TABLE unstocked_item_demands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    request_count INTEGER DEFAULT 1,
    min_alert_qty INTEGER DEFAULT 5,
    status TEXT DEFAULT 'Pending',
    last_requested_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, item_name)
);

-- ============================================================================
-- 18. AUTOMATIC AUTH USER REGISTRATION TRIGGER
-- Automatically provisions tenant & user profile upon user signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_tenant_id UUID;
BEGIN
    INSERT INTO public.tenants (company_code, company_name, owner_name, owner_email)
    VALUES (
        'TENANT-' || SUBSTRING(NEW.id::text, 1, 8),
        'LK Hardware ERP',
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Store Owner'),
        COALESCE(NEW.email, 'owner@shop.com')
    )
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.profiles (id, tenant_id, username, role, status)
    VALUES (
        NEW.id,
        new_tenant_id,
        COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
        'Owner',
        'Active'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 19. ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS & grant policies for authenticated & default access
-- ============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_card_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE unstocked_item_demands ENABLE ROW LEVEL SECURITY;

-- Helper function to fetch tenant ID for authenticated user context
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Tenant Isolation Policies
CREATE POLICY "Tenant Isolation: tenants" ON tenants FOR ALL TO authenticated USING (id = public.get_auth_tenant_id() OR public.get_auth_tenant_id() IS NULL) WITH CHECK (id = public.get_auth_tenant_id() OR public.get_auth_tenant_id() IS NULL);
CREATE POLICY "Tenant Isolation: profiles" ON profiles FOR ALL TO authenticated USING (id = auth.uid() OR tenant_id = public.get_auth_tenant_id()) WITH CHECK (id = auth.uid() OR tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: settings" ON settings FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL);
CREATE POLICY "Tenant Isolation: suppliers" ON suppliers FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: customers" ON customers FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: products" ON products FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: expenses" ON expenses FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: sales_invoices" ON sales_invoices FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: sales_items" ON sales_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM sales_invoices WHERE sales_invoices.id = sales_items.invoice_id AND (sales_invoices.tenant_id = public.get_auth_tenant_id() OR sales_invoices.tenant_id IS NULL)));
CREATE POLICY "Tenant Isolation: purchase_bills" ON purchase_bills FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: purchase_items" ON purchase_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM purchase_bills WHERE purchase_bills.id = purchase_items.bill_id AND (purchase_bills.tenant_id = public.get_auth_tenant_id() OR purchase_bills.tenant_id IS NULL)));
CREATE POLICY "Tenant Isolation: customer_payments" ON customer_payments FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: supplier_payments" ON supplier_payments FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: job_cards" ON job_cards FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "Tenant Isolation: job_card_parts" ON job_card_parts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM job_cards WHERE job_cards.id = job_card_parts.job_card_id AND (job_cards.tenant_id = public.get_auth_tenant_id() OR job_cards.tenant_id IS NULL)));
CREATE POLICY "Tenant Isolation: unstocked_item_demands" ON unstocked_item_demands FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- Done! Master SQL schema is ready with enterprise tenant isolation RLS for LK Smart ERP.

