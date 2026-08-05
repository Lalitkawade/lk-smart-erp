import { supabase } from '../api/supabase';
export { supabase };

export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

export const isValidUUID = (id: any): boolean =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const generateValidUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export async function handleServiceCall<T>(
  promise: any
): Promise<ServiceResponse<T>> {
  try {
    const { data, error } = await promise;
    if (error) {
      console.error('⚡ Service Layer Error:', error.message || error);
      return { data: null, error: error.message || 'Database error occurred.' };
    }
    return { data, error: null };
  } catch (err: any) {
    console.error('⚡ Service Layer Unexpected Exception:', err);
    return { data: null, error: err.message || 'Unexpected connection error.' };
  }
}
