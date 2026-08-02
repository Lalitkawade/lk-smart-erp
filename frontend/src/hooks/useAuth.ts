import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import type { Profile, Tenant } from '../types/erp.types';
import { authRateLimiter } from '../utils/rateLimiter';

const DEFAULT_FALLBACK_TENANT_ID = 'default-hardware-erp';

export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  // Load local auth session on mount & configure live listener
  useEffect(() => {
    const sessionStr = localStorage.getItem('lk_session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session && session.user) {
          setUser(session.user);
          setProfile(session.profile || null);
          setTenant(session.tenant || null);
        }
      } catch (e) {
        localStorage.removeItem('lk_session');
      }
    }
    setLoading(false);

    // Sync state with live Supabase authentication state shifts
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setProfile(null);
        setTenant(null);
        localStorage.removeItem('lk_session');
        return;
      }

      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        let tenantData: Tenant | null = null;
        if (profileData && profileData.tenant_id) {
          const { data: tData } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', profileData.tenant_id)
            .maybeSingle();
          tenantData = tData;
        }

        const fallbackUsername = session.user.email ? session.user.email.split('@')[0].toUpperCase() : 'OPERATOR';
        const activeProfile: Profile = profileData || {
          id: session.user.id,
          tenant_id: DEFAULT_FALLBACK_TENANT_ID,
          username: fallbackUsername,
          role: 'Owner',
          status: 'Active',
          created_at: new Date().toISOString()
        };

        const activeTenant: Tenant = tenantData || {
          id: DEFAULT_FALLBACK_TENANT_ID,
          company_code: 'LKHARDWARE',
          company_name: 'LK Hardware ERP',
          owner_name: 'Store Owner',
          owner_email: session.user.email || '',
          plan: 'Enterprise',
          status: 'Active',
          created_at: new Date().toISOString()
        };

        setUser(session.user);
        setProfile(activeProfile);
        setTenant(activeTenant);

        localStorage.setItem('lk_session', JSON.stringify({
          user: session.user,
          profile: activeProfile,
          tenant: activeTenant
        }));
      } catch (e) {
        console.warn('onAuthStateChange fallback:', e);
        const fallbackProfile: Profile = {
          id: session.user.id,
          tenant_id: DEFAULT_FALLBACK_TENANT_ID,
          username: session.user.email ? session.user.email.split('@')[0].toUpperCase() : 'OPERATOR',
          role: 'Owner',
          status: 'Active',
          created_at: new Date().toISOString()
        };
        const fallbackTenant: Tenant = {
          id: DEFAULT_FALLBACK_TENANT_ID,
          company_code: 'LKHARDWARE',
          company_name: 'LK Hardware ERP',
          owner_name: 'Store Owner',
          owner_email: session.user.email || '',
          plan: 'Enterprise',
          status: 'Active',
          created_at: new Date().toISOString()
        };

        setUser(session.user);
        setProfile(fallbackProfile);
        setTenant(fallbackTenant);

        localStorage.setItem('lk_session', JSON.stringify({
          user: session.user,
          profile: fallbackProfile,
          tenant: fallbackTenant
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, role: string) => {
    setLoading(true);
    try {
      // 1. Validate inputs securely
      if (!email || !password) {
        throw new Error('Email and password are required.');
      }

      // 2. Rate limiting check to prevent brute force attempts
      if (!authRateLimiter.isAllowed(email.toLowerCase(), { maxAttempts: 5, windowMs: 60000 })) {
        throw new Error('Too many login attempts. Please wait 1 minute before trying again.');
      }

      // 3. Authenticate with Supabase Auth
      let { data, error } = await supabase.auth.signInWithPassword({ email, password });

      // If user doesn't exist yet, attempt registration
      if (error && (error.message.includes('User not found') || error.message.includes('Invalid login credentials'))) {
        const signupRes = await supabase.auth.signUp({ email, password });
        if (signupRes.error) {
          throw new Error('Invalid email or password. Please verify your credentials.');
        }
        data = { user: signupRes.data.user, session: signupRes.data.session } as any;
        error = null;
      } else if (error) {
        throw new Error(error.message || 'Authentication failed');
      }

      if (!data?.user) {
        throw new Error('Authentication failed: No user returned');
      }

      const userId = data.user.id;

      // Fetch or provision profile & tenant records
      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      let tenantData: Tenant | null = null;

      if (!profileData) {
        const { data: existingTenants } = await supabase
          .from('tenants')
          .select('*')
          .limit(1);

        let tenantId = '';
        if (existingTenants && existingTenants.length > 0) {
          tenantData = existingTenants[0];
          tenantId = tenantData.id;
        } else {
          const { data: newTenant, error: createTenErr } = await supabase
            .from('tenants')
            .insert({
              company_code: 'LKHARDWARE',
              company_name: 'LK Hardware ERP',
              owner_name: 'Store Owner',
              owner_email: email,
              plan: 'Enterprise',
              status: 'Active'
            })
            .select()
            .single();

          if (createTenErr) throw createTenErr;
          tenantData = newTenant;
          tenantId = newTenant.id;

          await supabase.from('settings').insert({
            tenant_id: tenantId,
            invoice_prefix: 'INV',
            gstin: '27LKSERP401Z2B5',
            address: '123 Market Road, Pune, Maharashtra',
            currency: 'INR'
          });
        }

        const { data: newProfile, error: createProfErr } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            tenant_id: tenantId,
            username: email.split('@')[0].toUpperCase(),
            role: role || 'Owner',
            status: 'Active'
          })
          .select()
          .single();

        if (createProfErr) throw createProfErr;
        profileData = newProfile;
      } else if (profileData.tenant_id) {
        const { data: tenantFetch } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', profileData.tenant_id)
          .single();

        if (tenantFetch) {
          tenantData = tenantFetch;
        }
      }

      const activeProfile: Profile = profileData || {
        id: data.user.id,
        tenant_id: DEFAULT_FALLBACK_TENANT_ID,
        username: (email.split('@')[0] || 'OPERATOR').toUpperCase(),
        role: role || 'Owner',
        status: 'Active',
        created_at: new Date().toISOString()
      };

      const activeTenant: Tenant = tenantData || {
        id: DEFAULT_FALLBACK_TENANT_ID,
        company_code: 'LKHARDWARE',
        company_name: 'LK Hardware ERP',
        owner_name: 'Store Owner',
        owner_email: email,
        plan: 'Enterprise',
        status: 'Active',
        created_at: new Date().toISOString()
      };

      // Clear rate limiter on successful authentication
      authRateLimiter.reset(email.toLowerCase());

      setUser(data.user);
      setProfile(activeProfile);
      setTenant(activeTenant);

      const session = { user: data.user, profile: activeProfile, tenant: activeTenant };
      localStorage.setItem('lk_session', JSON.stringify(session));
      return session;
    } catch (err: any) {
      console.error('Authentication Error:', err?.message || err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setUser(null);
    setProfile(null);
    setTenant(null);
    localStorage.removeItem('lk_session');
  };

  return {
    user,
    profile,
    tenant,
    loading,
    signIn,
    signOut,
    isAdmin: profile?.role === 'Platform Super Admin' || profile?.role === 'Company Owner' || profile?.role === 'Owner'
  };
}
