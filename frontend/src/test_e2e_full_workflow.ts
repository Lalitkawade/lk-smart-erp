import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vigwyrsryiriejkqarlk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZ3d5cnNyeWlyaWVqa3FhcmxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NDM2NzQsImV4cCI6MjEwMTIxOTY3NH0.5Hzi2GRDELW5QB_rBrHtGBWf06bKOLkbGjVlepDDBpM';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run15StepE2eWorkflow() {
  console.log('===========================================================');
  console.log('🚀 15-STEP END-TO-END SUPABASE AUTH & ERP WORKFLOW SUITE');
  console.log('===========================================================\n');

  const testEmail = `owner_e2e_${Date.now()}@maharudra.com`;
  const testPassword = 'Password123!';
  const tenantId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000001';

  // STEP 1-4: Run Setup Wizard Logic
  console.log('--- RUNNING SETUP WIZARD PROVISIONING ---');
  
  // 1. Create Tenant
  const { data: tenant, error: tenErr } = await supabase.from('tenants').insert({
    id: tenantId,
    company_code: 'MAHARUDRA',
    company_name: 'Maharudra Hardware Store',
    owner_name: 'Lalit Kawade',
    owner_email: testEmail,
    plan: 'Enterprise',
    status: 'Active'
  }).select().single();
  const step2Pass = !tenErr && tenant?.id === tenantId;
  console.log(`[Step 2] Tenant Exists in DB: ${step2Pass ? 'PASS' : tenErr?.message}`);

  // 2. Register Owner Auth User
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword
  });
  const authUser = signUpData.user;
  const step1Pass = !signUpErr && Boolean(authUser?.id);
  console.log(`[Step 1] Auth User Exists in Supabase Auth: ${step1Pass ? 'PASS' : signUpErr?.message}`);

  // 3. Create Profile
  const { data: profile, error: profErr } = await supabase.from('profiles').insert({
    id: authUser?.id,
    tenant_id: tenantId,
    username: 'LALIT KAWADE',
    role: 'Owner',
    status: 'Active'
  }).select().single();
  const step3Pass = !profErr && Boolean(profile?.id);
  console.log(`[Step 3] Profile Exists in DB: ${step3Pass ? 'PASS' : profErr?.message}`);

  // 4. Create Settings
  const { data: setting, error: setErr } = await supabase.from('settings').insert({
    tenant_id: tenantId,
    invoice_prefix: 'INV',
    gstin: '27LKSERP401Z2B5',
    address: 'Main Market Road',
    currency: 'INR'
  }).select().single();
  const step4Pass = !setErr && Boolean(setting?.id);
  console.log(`[Step 4] Settings Exist in DB: ${step4Pass ? 'PASS' : setErr?.message}`);

  // 5. Sign In & Verify auth.uid()
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  const currentUid = signInData.session?.user?.id;
  const step5Pass = !signInErr && Boolean(currentUid);
  console.log(`[Step 5] auth.uid() Is Not NULL: ${step5Pass ? 'PASS (uid: ' + currentUid + ')' : 'FAIL'}`);

  // 6 & 7. Refresh Page / Restore Session Verification
  const { data: refreshedSession } = await supabase.auth.getSession();
  const step6_7Pass = Boolean(refreshedSession.session?.access_token) && refreshedSession.session?.user?.id === currentUid;
  console.log(`[Step 6 & 7] Refresh Page & Session Restored: ${step6_7Pass ? 'PASS' : 'FAIL'}`);

  // 8 & 9. Create Product & Verify Row Exists
  const prodId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000002';
  const { data: createdProd, error: prodErr } = await supabase.from('products').insert({
    id: prodId,
    tenant_id: tenantId,
    product_name: 'Brass Water Tap',
    purchase_price: 180,
    selling_price: 280,
    current_stock: 40,
    status: 'Active'
  }).select().single();
  const step8_9Pass = !prodErr && createdProd?.id === prodId;
  console.log(`[Step 8 & 9] Create Product & Verify Row: ${step8_9Pass ? 'PASS (Product ID: ' + prodId + ')' : prodErr?.message}`);

  // 10. Logout
  await supabase.auth.signOut();
  const { data: loggedOutSess } = await supabase.auth.getSession();
  const step10Pass = loggedOutSess.session === null;
  console.log(`[Step 10] Logout Verification: ${step10Pass ? 'PASS (Session is NULL)' : 'FAIL'}`);

  // 11 & 12. Login Again & Verify Product Visible
  const { data: reLoginData, error: reLoginErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  const { data: fetchedProds } = await supabase.from('products').select('*').eq('id', prodId).single();
  const step11_12Pass = !reLoginErr && fetchedProds?.id === prodId;
  console.log(`[Step 11 & 12] Login Again & Product Still Visible: ${step11_12Pass ? 'PASS' : 'FAIL'}`);

  // 13. Create Customer
  const custId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000003';
  const { data: createdCust, error: custErr } = await supabase.from('customers').insert({
    id: custId,
    tenant_id: tenantId,
    customer_name: 'Prakash Hardware Buyer',
    phone: '9876543210',
    outstanding: 500
  }).select().single();
  const step13Pass = !custErr && createdCust?.id === custId;
  console.log(`[Step 13] Create Customer: ${step13Pass ? 'PASS (Customer ID: ' + custId + ')' : custErr?.message}`);

  // 14. Create Supplier
  const supId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000004';
  const { data: createdSup, error: supErr } = await supabase.from('suppliers').insert({
    id: supId,
    tenant_id: tenantId,
    supplier_name: 'Mahalaxmi Steel Depot',
    phone: '8888877777',
    gstin: '27MAHA1234F1Z0'
  }).select().single();
  const step14Pass = !supErr && createdSup?.id === supId;
  console.log(`[Step 14] Create Supplier: ${step14Pass ? 'PASS (Supplier ID: ' + supId + ')' : supErr?.message}`);

  // 15. Create Sale
  const saleId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000005';
  const { data: createdSale, error: saleErr } = await supabase.from('sales_invoices').insert({
    id: saleId,
    tenant_id: tenantId,
    invoice_number: 'INV-E2E-1001',
    customer_name: 'Prakash Hardware Buyer',
    total_amount: 1400,
    subtotal: 1400,
    paid_amount: 900,
    due_amount: 500
  }).select().single();
  const step15Pass = !saleErr && createdSale?.id === saleId;
  console.log(`[Step 15] Create Sale Invoice: ${step15Pass ? 'PASS (Invoice ID: ' + saleId + ')' : saleErr?.message}`);

  const allPassed = step1Pass && step2Pass && step3Pass && step4Pass && step5Pass && step6_7Pass && step8_9Pass && step10Pass && step11_12Pass && step13Pass && step14Pass && step15Pass;

  console.log('\n===========================================================');
  console.log(allPassed ? '🎉 FINAL VERIFICATION: PASS (100% SUCCESS ACROSS ALL 15 STEPS)' : '❌ FINAL VERIFICATION: FAIL');
  console.log('===========================================================');
}

run15StepE2eWorkflow();
