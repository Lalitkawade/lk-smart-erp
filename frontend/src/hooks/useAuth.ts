import { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';
import type { Profile, Tenant } from '../types/erp.types';
import { authRateLimiter } from '../utils/rateLimiter';
import { perfTracker } from '../utils/perfTracker';

export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
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

    const promise = perfTracker.trackFunction('fetchProfileAndTenant()', true, async () => {
      try {
        const { data: profileData } = await perfTracker.logQuery(
          'profiles',
          'fetchProfileAndTenant()',
          supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle() as any
        );

        let tenantData: Tenant | null = null;
        if (profileData && profileData.tenant_id) {
          const { data: tData } = await perfTracker.logQuery(
            'tenants',
            'fetchProfileAndTenant()',
            supabase.from('tenants').select('*').eq('id', profileData.tenant_id).maybeSingle() as any
          );
          tenantData = tData as any;
        }

        setProfile(profileData || null);
        setTenant(tenantData || null);
      } catch (err) {
        console.error('Error fetching profile/tenant:', err);
      } finally {
        fetchProfilePromiseRef.current = null;
      }
    });

    fetchProfilePromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    if (perfTracker.loadingStartTime === null) {
      perfTracker.loadingStartTime = performance.now();
    }

    // Realtime Auth State Change Listener (handles INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        fetchedUserIdRef.current = null;
        fetchProfilePromiseRef.current = null;
        setUser(null);
        setProfile(null);
        setTenant(null);
        setLoading(false);
        if (perfTracker.loadingEndTime === null) {
          perfTracker.loadingEndTime = performance.now();
        }
        return;
      }

      setUser(session.user);
      await fetchProfileAndTenant(session.user);
      setLoading(false);
      if (perfTracker.loadingEndTime === null) {
        perfTracker.loadingEndTime = performance.now();
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
