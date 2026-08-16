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
  created_at?: string;
}

export const calculateRequestsPerMonth = (demand: UnstockedDemand): number => {
  if (!demand.created_at) return 0; // Fallback if missing
  const createdDate = new Date(demand.created_at).getTime();
  const now = new Date().getTime();
  const diffDays = Math.max(1, (now - createdDate) / (1000 * 60 * 60 * 24));
  return (demand.request_count / diffDays) * 30;
};

export const getVelocityString = (demand: UnstockedDemand): string => {
  if (!demand.created_at) return '';
  const createdDate = new Date(demand.created_at).getTime();
  const now = new Date().getTime();
  const diffDays = Math.max(1, (now - createdDate) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 30) {
    return `${demand.request_count}/Mo`;
  } else {
    const months = Math.round(diffDays / 30);
    return `${demand.request_count}/${months} Mo`;
  }
};

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
  };

  const activeTenantId = tenantId || 'default-hardware-erp';

  const fetchDemands = async () => {
    if (!activeTenantId) return;
    setIsLoading(true);

    try {
      if (tenantId) {
        const { data, error } = await supabase
          .from('unstocked_item_demands')
          .select('*')
          .eq('tenant_id', activeTenantId)
          .order('request_count', { ascending: false });

        if (!error && Array.isArray(data)) {
          setDemands(data as UnstockedDemand[]);
        }
      }
    } catch (e) {
      console.warn('Supabase fetch notice for unstocked_item_demands:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    fetchDemands();
  }, [tenantId]);

  const logDemand = async (rawItemName: string) => {
    const itemName = rawItemName.trim();
    if (!itemName || !tenantId) return;

    const existingIndex = demands.findIndex(
      d => d.item_name.toLowerCase() === itemName.toLowerCase() && d.status === 'Pending'
    );

    if (existingIndex >= 0) {
      const existing = demands[existingIndex];
      const newCount = existing.request_count + 1;
      await supabase
        .from('unstocked_item_demands')
        .update({
          request_count: newCount,
          last_requested_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('unstocked_item_demands')
        .insert([
          {
            tenant_id: activeTenantId,
            item_name: itemName,
            request_count: 1,
            status: 'Pending',
            last_requested_at: new Date().toISOString()
          }
        ]);
    }
    fetchDemands();
  };

  const incrementDemand = async (id: string) => {
    const item = demands.find(d => d.id === id);
    if (!item) return;
    logDemand(item.item_name);
  };

  const updateItemThreshold = async (id: string, minQty: number) => {
    const val = Math.max(1, minQty);
    if (tenantId) {
      try {
        await supabase
          .from('unstocked_item_demands')
          .update({ min_alert_qty: val })
          .eq('id', id);
        fetchDemands();
      } catch (e) {
        console.warn('Supabase update notice for min_alert_qty:', e);
      }
    }
  };

  const dismissDemand = async (id: string) => {
    if (tenantId) {
      try {
        await supabase
          .from('unstocked_item_demands')
          .delete()
          .eq('id', id);
        fetchDemands();
      } catch (e) {
        console.warn('Supabase delete notice:', e);
      }
    }
  };

  const highDemandAlerts = demands.filter(d => {
    const threshold = d.min_alert_qty !== undefined ? d.min_alert_qty : alertThreshold;
    const isCountHigh = d.request_count >= threshold;
    const isVelocityHigh = calculateRequestsPerMonth(d) >= 2;
    // An item is high demand if its count reaches threshold AND it gets at least 2 requests per month on average
    // Or if it doesn't have a created_at date (legacy items), we just fallback to the count
    const meetsVelocity = d.created_at ? isVelocityHigh : true;

    return isCountHigh && meetsVelocity && d.status === 'Pending';
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
