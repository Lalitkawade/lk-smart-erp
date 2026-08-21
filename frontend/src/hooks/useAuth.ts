import { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';
import type { Profile, Tenant } from '../types/erp.types';
import { authRateLimiter } from '../utils/rateLimiter';

const CACHE_KEY_PROFILE = 'lk_auth_profile_v1';
const CACHE_KEY_TENANT = 'lk_auth_tenant_v1';

export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  
  // Lazily initialize from localStorage for instant loading
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_PROFILE);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  
  const [tenant, setTenant] = useState<Tenant | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_TENANT);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  
  const [loading, setLoading] = useState(true);
  const fetchedUserIdRef = useRef<string | null>(null);
  const fetchProfilePromiseRef = useRef<Promise<void> | null>(null);

  const fetchProfileAndTenant = async (authUser: any) => {
    if (!authUser?.id) return;
    if (fetchedUserIdRef.current === authUser.id) {
      return;
    }
    if (fetchProfilePromiseRef.current) {
      return fetchProfilePromiseRef.current;
    }

    fetchedUserIdRef.current = authUser.id;

    const promise = (async () => {
      try {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle() as any;

        let tenantData: Tenant | null = null;
        if (profileData && profileData.tenant_id) {
          const { data: tData } = await supabase.from('tenants').select('*').eq('id', profileData.tenant_id).maybeSingle() as any;
          tenantData = tData as any;
        }

        setProfile(profileData || null);
        setTenant(tenantData || null);
        
        // Cache to localStorage
        if (profileData) localStorage.setItem(CACHE_KEY_PROFILE, JSON.stringify(profileData));
        else localStorage.removeItem(CACHE_KEY_PROFILE);
        
        if (tenantData) localStorage.setItem(CACHE_KEY_TENANT, JSON.stringify(tenantData));
        else localStorage.removeItem(CACHE_KEY_TENANT);
      } catch (err) {
        console.error('Error fetching profile/tenant:', err);
      } finally {
        fetchProfilePromiseRef.current = null;
      }
    })();

    fetchProfilePromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    // 1. Immediately check session to bypass slow INITIAL_SESSION event
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        
        // If we have cached profile & tenant, unlock UI instantly! (0ms perceived load time)
        const hasCachedData = localStorage.getItem(CACHE_KEY_PROFILE) && localStorage.getItem(CACHE_KEY_TENANT);
        if (hasCachedData) {
          setLoading(false);
        }
        
        // Fetch in background (stale-while-revalidate)
        fetchProfileAndTenant(session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // 2. Realtime Auth State Change Listener (handles INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        fetchedUserIdRef.current = null;
        fetchProfilePromiseRef.current = null;
        setUser(null);
        setProfile(null);
        setTenant(null);
        localStorage.removeItem(CACHE_KEY_PROFILE);
        localStorage.removeItem(CACHE_KEY_TENANT);
        setLoading(false);
        return;
      }

      setUser(session.user);
      
      if (event === 'SIGNED_IN') {
        // Block UI on initial login to fetch tenant safely
        setLoading(true);
        await fetchProfileAndTenant(session.user);
        setLoading(false);
      } else {
        // Background refresh for other events (INITIAL_SESSION, TOKEN_REFRESHED)
        fetchProfileAndTenant(session.user).finally(() => setLoading(false));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, _role: string) => {
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
        throw new Error(error.message || 'Authentication failed');
      }

      if (!data?.user) {
        throw new Error('Authentication failed: No user returned');
      }

      authRateLimiter.reset(email.toLowerCase());
      return data;
    } catch (err: any) {
      console.error('Authentication Error:', err?.message || err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    fetchedUserIdRef.current = null;
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setUser(null);
    setProfile(null);
    setTenant(null);
    localStorage.removeItem(CACHE_KEY_PROFILE);
    localStorage.removeItem(CACHE_KEY_TENANT);
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
