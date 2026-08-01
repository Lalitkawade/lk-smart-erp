-- =========================================================================
-- LK Smart ERP - SAFE DYNAMIC DATABASE RESET SCRIPT
-- Cleans all tables present in the public schema without erroring if a table is missing.
-- =========================================================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Iterate over every existing table in public schema and truncate with CASCADE
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE;';
    END LOOP;
END $$;
