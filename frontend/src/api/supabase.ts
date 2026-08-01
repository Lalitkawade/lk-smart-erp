import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

// Retrieve keys from environment context
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gjvpazhivmvdwzcqgqmm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key-placeholder';

// Create Strongly Typed Supabase Client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
