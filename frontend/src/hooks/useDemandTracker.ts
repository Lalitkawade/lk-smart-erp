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

    // First read local cache for instant UI rendering
    const cached = localStorage.getItem('lk_unstocked_demands');
    if (cached) {
      try {
        setDemands(JSON.parse(cached));
      } catch (e) {}
    }

    try {
      if (tenantId) {
        const { data, error } = await supabase
          .from('unstocked_item_demands')
          .select('*')
          .eq('tenant_id', activeTenantId)
          .order('request_count', { ascending: false });

        if (!error && data) {
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
    window.addEventListener('storage', fetchDemands);
    return () => window.removeEventListener('storage', fetchDemands);
  }, [tenantId]);

  // Log or increment a requested item
  const logDemand = async (rawItemName: string) => {
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
      updatedDemands.unshift(newDemandItem);
    }

    // Update state & local storage immediately
    setDemands(updatedDemands);
    localStorage.setItem('lk_unstocked_demands', JSON.stringify(updatedDemands));

    // Async sync to Supabase without blocking UI
    if (tenantId) {
      try {
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
          }
        }
      } catch (err) {
        console.warn('Supabase sync notice for unstocked_item_demands:', err);
      }
    }

    window.dispatchEvent(new Event('storage'));
  };

  // Increment demand count directly by ID
  const incrementDemand = async (id: string) => {
    const item = demands.find(d => d.id === id);
    if (!item) return;
    await logDemand(item.item_name);
  };

  // Update min alert threshold for an individual item
  const updateItemThreshold = async (id: string, minQty: number) => {
    const val = Math.max(1, minQty);
    const updated = demands.map(d => d.id === id ? { ...d, min_alert_qty: val } : d);
    setDemands(updated);
    localStorage.setItem('lk_unstocked_demands', JSON.stringify(updated));

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
    window.dispatchEvent(new Event('storage'));
  };

  // Remove/Dismiss demand item
  const dismissDemand = async (id: string) => {
    const updated = demands.filter(d => d.id !== id);
    setDemands(updated);
    localStorage.setItem('lk_unstocked_demands', JSON.stringify(updated));

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
    window.dispatchEvent(new Event('storage'));
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
