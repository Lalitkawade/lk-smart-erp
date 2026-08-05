import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase';
import type { Profile, Tenant } from '../types/erp.types';
import { authRateLimiter } from '../utils/rateLimiter';

export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [hasTenants, setHasTenants] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper to load user profile & tenant from Supabase DB
  const loadUserContext = useCallback(async (authUser: any) => {
    if (!authUser || !authUser.id) {
      setUser(null);
      setProfile(null);
      setTenant(null);
      return;
    }

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      let tenantData: Tenant | null = null;
      if (profileData?.tenant_id) {
        const { data: tData } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', profileData.tenant_id)
          .maybeSingle();
        tenantData = tData;
      }

      setUser(authUser);
      setProfile(profileData as Profile || null);
      setTenant(tenantData as Tenant || null);
    } catch (err) {
      console.error('Error loading user context:', err);
    }
  }, []);

  // Check if system has any registered tenants in Supabase DB
  const checkTenantCount = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('tenants').select('id').limit(1);
      if (!error) {
        setHasTenants(data && data.length > 0);
      }
    } catch (e) {
      console.warn('Tenant count check error:', e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      await checkTenantCount();

      // 1. Restore session directly from Supabase Auth client storage
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) {
        if (session?.user) {
          await loadUserContext(session.user);
        } else {
          setUser(null);
          setProfile(null);
          setTenant(null);
        }
        setLoading(false);
      }

      // 2. Register live listener for auth state shifts
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          if (session?.user) {
            await loadUserContext(session.user);
          } else {
            setUser(null);
            setProfile(null);
            setTenant(null);
          }
        } else if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null);
          setProfile(null);
          setTenant(null);
        }
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    }

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, [checkTenantCount, loadUserContext]);

  // Standard Login Handler using Supabase Auth
  const signIn = async (email: string, password: string, _role?: string) => {
    setLoading(true);
    try {
      if (!email || !password) {
        throw new Error('Email and password are required.');
      }

      if (!authRateLimiter.isAllowed(email.toLowerCase(), { maxAttempts: 5, windowMs: 60000 })) {
        throw new Error('Too many login attempts. Please wait 1 minute before trying again.');
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message || 'Invalid login credentials.');
      }

      if (!data?.user) {
        throw new Error('Authentication failed: No user session returned.');
      }

      authRateLimiter.reset(email.toLowerCase());
      await loadUserContext(data.user);
      return data.user;
    } catch (err: any) {
      console.error('Sign In Error:', err.message || err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // First-Time Provisioning Wizard Handler
  const provisionFirstTimeOwner = async (data: {
    companyName: string;
    companyCode: string;
    ownerName: string;
    ownerEmail: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      const { companyName, companyCode, ownerName, ownerEmail, password } = data;

      if (!companyName || !ownerEmail || !password) {
        throw new Error('Company name, owner email, and password are required.');
      }

      // 1. Register Owner Auth User in Supabase Auth first so auth.uid() is active
      let authUser: any = null;
      const { data: signUpRes, error: signUpErr } = await supabase.auth.signUp({
        email: ownerEmail,
        password: password
      });

      if (signUpErr && signUpErr.message.includes('already registered')) {
        const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: password
        });
        if (loginErr) throw new Error('Account exists but sign in failed: ' + loginErr.message);
        authUser = loginData.user;
      } else if (signUpErr) {
        throw new Error('Failed to register Auth user: ' + signUpErr.message);
      } else {
        authUser = signUpRes.user;
        if (!authUser) {
          const { data: loginData } = await supabase.auth.signInWithPassword({
            email: ownerEmail,
            password: password
          });
          authUser = loginData?.user;
        }
      }

      if (!authUser) {
        throw new Error('Auth registration completed but user instance could not be retrieved.');
      }

      // 2. Create Tenant Record
      const tenantId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000001';
      const { data: newTenant, error: tenErr } = await supabase
        .from('tenants')
        .insert({
          id: tenantId,
          company_code: companyCode || 'LKHARDWARE',
          company_name: companyName,
          owner_name: ownerName,
          owner_email: ownerEmail,
          plan: 'Enterprise',
          status: 'Active'
        })
        .select()
        .single();

      if (tenErr) {
        throw new Error('Failed to create tenant: ' + tenErr.message);
      }

      // 3. Create Profile Linked to Tenant
      const { data: newProfile, error: profErr } = await supabase
        .from('profiles')
        .insert({
          id: authUser.id,
          tenant_id: newTenant.id,
          username: ownerName.toUpperCase() || 'OWNER',
          role: 'Owner',
          status: 'Active'
        })
        .select()
        .single();

      if (profErr) {
        console.warn('Profile creation warning:', profErr.message);
      }

      // 4. Create Initial Store Settings
      await supabase.from('settings').insert({
        tenant_id: newTenant.id,
        invoice_prefix: 'INV',
        gstin: '27LKSERP401Z2B5',
        address: 'Main Store Location',
        currency: 'INR',
        business_type: 'Hardware Shop'
      });

      // 5. Sign user in to activate session
      await supabase.auth.signInWithPassword({
        email: ownerEmail,
        password: password
      });

      setUser(authUser);
      setProfile(newProfile as Profile || { id: authUser.id, tenant_id: newTenant.id, username: ownerName, role: 'Owner', status: 'Active', created_at: new Date().toISOString() });
      setTenant(newTenant as Tenant);
      setHasTenants(true);

      return { user: authUser, tenant: newTenant, profile: newProfile };
    } catch (err: any) {
      console.error('Provisioning Error:', err.message || err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign Out Warning:', e);
    }
    setUser(null);
    setProfile(null);
    setTenant(null);
    localStorage.removeItem('lk_session');
  };

  return {
    user,
    profile,
    tenant,
    hasTenants,
    loading,
    signIn,
    provisionFirstTimeOwner,
    signOut,
    isAdmin: profile?.role === 'Platform Super Admin' || profile?.role === 'Company Owner' || profile?.role === 'Owner'
  };
}
