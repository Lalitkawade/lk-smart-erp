import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

// Retrieve keys from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables! Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env configuration.'
  );
}

// Create Strongly Typed Supabase Client
export const supabase = createClient<Database>(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

