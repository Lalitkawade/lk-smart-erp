import { supabase } from '../api/supabase';
export { supabase };

export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

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
