import { handleServiceCall, ServiceResponse } from './baseService';
import { supabase } from '../api/supabase';
import type { ExpenseRow, ExpenseInsert, ExpenseUpdate } from '../types/database.types';

const isValidUUID = (id: any): boolean => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export class ExpenseService {
  /**
   * Fetch all expenses for a tenant
   */
  static async fetchExpenses(tenantId: string): Promise<ServiceResponse<ExpenseRow[]>> {
    if (!isValidUUID(tenantId)) {
      return handleServiceCall(
        supabase.from('expenses').select('*').order('expense_date', { ascending: false })
      );
    }

    return handleServiceCall(
      supabase.from('expenses').select('*').eq('tenant_id', tenantId).order('expense_date', { ascending: false })
    );
  }

  /**
   * Create a new expense entry
   */
  static async createExpense(payload: ExpenseInsert): Promise<ServiceResponse<ExpenseRow>> {
    const cleanPayload = {
      ...payload,
      tenant_id: isValidUUID(payload.tenant_id)
        ? payload.tenant_id
        : '00000000-0000-0000-0000-000000000000'
    };

    return handleServiceCall(
      supabase.from('expenses').insert(cleanPayload).select().single()
    );
  }

  /**
   * Update an existing expense entry
   */
  static async updateExpense(id: string, payload: ExpenseUpdate): Promise<ServiceResponse<ExpenseRow>> {
    return handleServiceCall(
      supabase.from('expenses').update(payload).eq('id', id).select().single()
    );
  }

  /**
   * Delete an expense entry
   */
  static async deleteExpense(id: string): Promise<ServiceResponse<null>> {
    return handleServiceCall(
      supabase.from('expenses').delete().eq('id', id)
    );
  }
}
