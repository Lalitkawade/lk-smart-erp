import { handleServiceCall, ServiceResponse } from './baseService';
import { supabase } from '../api/supabase';
import type { SettingsRow, SettingsInsert } from '../types/database.types';

const isValidUUID = (id: any): boolean => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export class SettingsService {
  /**
   * Fetch company/tenant settings from Supabase
   */
  static async fetchSettings(tenantId: string): Promise<ServiceResponse<SettingsRow>> {
    if (!isValidUUID(tenantId)) {
      return handleServiceCall(
        supabase.from('settings').select('*').limit(1).single()
      );
    }

    return handleServiceCall(
      supabase.from('settings').select('*').eq('tenant_id', tenantId).maybeSingle()
    );
  }

  /**
   * Save or update company/tenant settings in Supabase
   */
  static async saveSettings(payload: SettingsInsert): Promise<ServiceResponse<SettingsRow>> {
    const activeTenantId = isValidUUID(payload.tenant_id)
      ? payload.tenant_id
      : '00000000-0000-0000-0000-000000000000';

    const cleanPayload = {
      ...payload,
      tenant_id: activeTenantId
    };

    // Check if settings row exists for tenant
    const { data: existing } = await supabase.from('settings').select('id').eq('tenant_id', activeTenantId).maybeSingle();

    if (existing?.id) {
      const { id: _id, tenant_id: _tid, created_at: _cat, ...updatePayload } = cleanPayload as any;
      return handleServiceCall(
        supabase.from('settings').update(updatePayload).eq('id', existing.id).select().single()
      );
    } else {
      return handleServiceCall(
        supabase.from('settings').insert(cleanPayload).select().single()
      );
    }
  }
}
