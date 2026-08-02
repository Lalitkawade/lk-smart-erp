import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';

export interface UnstockedDemand {
  id: string;
  tenant_id: string;
  item_name: string;
  request_count: number;
  min_alert_qty?: number;
  status: 'Pending' | 'Added to Stock' | 'Dismissed';
  last_requested_at: string;
}

export function useDemandTracker(tenantId?: string) {
  const [demands, setDemands] = useState<UnstockedDemand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [alertThreshold, setThresholdState] = useState<number>(() => {
    const saved = localStorage.getItem('lk_demand_alert_threshold');
    return saved ? Math.max(1, parseInt(saved) || 5) : 5;
  });

  const setAlertThreshold = (newThreshold: number) => {
    const val = Math.max(1, newThreshold);
    setThresholdState(val);
    localStorage.setItem('lk_demand_alert_threshold', val.toString());
    window.dispatchEvent(new Event('storage'));
  };

  const activeTenantId = tenantId || 'default-hardware-erp';

  // Load demands from Supabase with LocalStorage fallback
  const fetchDemands = async () => {
    if (!activeTenantId) return;
    setIsLoading(true);
    
    // Sync threshold from local storage
    const savedThreshold = localStorage.getItem('lk_demand_alert_threshold');
    if (savedThreshold) {
      setThresholdState(Math.max(1, parseInt(savedThreshold) || 5));
    }

    // Read local cache first for instant UI rendering
    let localDemands: UnstockedDemand[] = [];
    const cached = localStorage.getItem('lk_unstocked_demands');
    if (cached) {
      try {
        localDemands = JSON.parse(cached);
        if (Array.isArray(localDemands)) {
          setDemands(localDemands);
        }
      } catch (e) {}
    }

    try {
      if (tenantId) {
        const { data, error } = await supabase
          .from('unstocked_item_demands')
          .select('*')
          .eq('tenant_id', activeTenantId)
          .order('request_count', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          // Merge Supabase items with any local items
          const dbMap = new Map(data.map(d => [d.item_name.toLowerCase(), d]));
          localDemands.forEach(localItem => {
            if (!dbMap.has(localItem.item_name.toLowerCase())) {
              data.unshift(localItem);
            }
          });

          setDemands(data as UnstockedDemand[]);
          localStorage.setItem('lk_unstocked_demands', JSON.stringify(data));
        }
      }
    } catch (e) {
      console.warn('Supabase fetch notice for unstocked_item_demands:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDemands();
    
    const handleSync = () => {
      const cached = localStorage.getItem('lk_unstocked_demands');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setDemands(parsed);
          }
        } catch (e) {}
      } else {
        setDemands([]);
      }
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('lk_demand_updated', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('lk_demand_updated', handleSync);
    };
  }, [tenantId]);

  const notifySync = () => {
    window.dispatchEvent(new Event('lk_demand_updated'));
  };

  // Log or increment a requested item (0ms instant optimistic update)
  const logDemand = (rawItemName: string) => {
    const itemName = rawItemName.trim();
    if (!itemName) return;

    // Check if existing item exists (case-insensitive)
    const existingIndex = demands.findIndex(
      d => d.item_name.toLowerCase() === itemName.toLowerCase() && d.status === 'Pending'
    );

    let updatedDemands = [...demands];
    let newDemandItem: UnstockedDemand;

    if (existingIndex >= 0) {
      const existing = updatedDemands[existingIndex];
      const newCount = existing.request_count + 1;
      newDemandItem = {
        ...existing,
        request_count: newCount,
        last_requested_at: new Date().toISOString()
      };
      updatedDemands[existingIndex] = newDemandItem;
    } else {
      newDemandItem = {
        id: 'demand-' + Date.now(),
        tenant_id: activeTenantId,
        item_name: itemName,
        request_count: 1,
        status: 'Pending',
        last_requested_at: new Date().toISOString()
      };
      updatedDemands = [newDemandItem, ...demands];
    }

    // Update state & local storage immediately for instant rendering
    setDemands(updatedDemands);
    localStorage.setItem('lk_unstocked_demands', JSON.stringify(updatedDemands));
    notifySync();

    // Non-blocking async background sync to Supabase
    if (tenantId) {
      Promise.race([
        (async () => {
          if (existingIndex >= 0) {
            await supabase
              .from('unstocked_item_demands')
              .update({
                request_count: newDemandItem.request_count,
                last_requested_at: newDemandItem.last_requested_at
              })
              .eq('id', newDemandItem.id);
          } else {
            const { data } = await supabase
              .from('unstocked_item_demands')
              .insert([
                {
                  tenant_id: activeTenantId,
                  item_name: itemName,
                  request_count: 1,
                  status: 'Pending',
                  last_requested_at: newDemandItem.last_requested_at
                }
              ])
              .select()
              .single();

            if (data) {
              newDemandItem.id = data.id;
              localStorage.setItem('lk_unstocked_demands', JSON.stringify(updatedDemands));
              notifySync();
            }
          }
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), 3000))
      ]).catch(err => {
        console.warn('Supabase sync notice for unstocked_item_demands:', err);
      });
    }
  };

  // Increment demand count directly by ID
  const incrementDemand = async (id: string) => {
    const item = demands.find(d => d.id === id);
    if (!item) return;
    logDemand(item.item_name);
  };

  // Update min alert threshold for an individual item
  const updateItemThreshold = async (id: string, minQty: number) => {
    const val = Math.max(1, minQty);
    const updated = demands.map(d => d.id === id ? { ...d, min_alert_qty: val } : d);
    setDemands(updated);
    localStorage.setItem('lk_unstocked_demands', JSON.stringify(updated));
    notifySync();

    if (tenantId) {
      try {
        await supabase
          .from('unstocked_item_demands')
          .update({ min_alert_qty: val })
          .eq('id', id);
      } catch (e) {
        console.warn('Supabase update notice for min_alert_qty:', e);
      }
    }
  };

  // Remove/Dismiss demand item
  const dismissDemand = async (id: string) => {
    const updated = demands.filter(d => d.id !== id);
    setDemands(updated);
    localStorage.setItem('lk_unstocked_demands', JSON.stringify(updated));
    notifySync();

    if (tenantId) {
      try {
        await supabase
          .from('unstocked_item_demands')
          .delete()
          .eq('id', id);
      } catch (e) {
        console.warn('Supabase delete notice:', e);
      }
    }
  };

  // High demand warnings (count >= item.min_alert_qty || alertThreshold)
  const highDemandAlerts = demands.filter(d => {
    const threshold = d.min_alert_qty !== undefined ? d.min_alert_qty : alertThreshold;
    return d.request_count >= threshold && d.status === 'Pending';
  });

  return {
    demands,
    highDemandAlerts,
    alertThreshold,
    setAlertThreshold,
    updateItemThreshold,
    logDemand,
    incrementDemand,
    dismissDemand,
    isLoading,
    refreshDemands: fetchDemands
  };
}
