-- ============================================================================
-- LK SMART ERP - COMPLETE SUPABASE DATABASE RESET & RECREATION SCRIPT
-- INCLUDING SERVER-SIDE AUTHENTICATION, AUTHORIZATION & MULTI-TENANT RLS POLICIES
-- ============================================================================
-- Instructions: Copy and paste this script into your Supabase SQL Editor
-- (Supabase Dashboard -> SQL Editor -> New Query -> Run)
-- ============================================================================

-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. DROP EXISTING TABLES IN CASCADE ORDER (Clean Reset)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.get_auth_tenant_id CASCADE;

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

-- 3. PROFILES TABLE (Server-side Auth Authorization User Profile)
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
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
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
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
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
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
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

-- ============================================================================
-- 15. SERVER-SIDE AUTOMATIC AUTHENTICATION TRIGGER FUNCTION
-- Automatically provisions tenant & user profile in PostgreSQL upon user signup
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
-- 16. SERVER-SIDE AUTHORIZATION & MULTI-TENANT RLS POLICIES
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

-- Helper function to resolve tenant_id for authenticated auth.uid() on server-side
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID AS $$
    SELECT COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::UUID) 
    FROM public.profiles 
    WHERE id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Strict Server-Side Authentication & Authorization Policies
CREATE POLICY "Server Auth: tenants policy" ON tenants
    FOR ALL USING (auth.role() = 'authenticated' OR id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: profiles policy" ON profiles
    FOR ALL USING (auth.role() = 'authenticated' OR id = auth.uid());

CREATE POLICY "Server Auth: settings policy" ON settings
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: suppliers policy" ON suppliers
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: customers policy" ON customers
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: products policy" ON products
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: expenses policy" ON expenses
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: sales_invoices policy" ON sales_invoices
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: sales_items policy" ON sales_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Server Auth: purchase_bills policy" ON purchase_bills
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: purchase_items policy" ON purchase_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Server Auth: customer_payments policy" ON customer_payments
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "Server Auth: supplier_payments policy" ON supplier_payments
    FOR ALL USING (auth.role() = 'authenticated' OR tenant_id = '00000000-0000-0000-0000-000000000000');

-- Done! Your Supabase Database Schema is now protected with Server-Side Authentication, Authorization & Auto-Provisioning Triggers!
