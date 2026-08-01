import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

// Retrieve keys from environment context with valid fallback credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mhauoldtvisooujiozcb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oYXVvbGR0dmlzb291amlvemNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NTQzNzIsImV4cCI6MjEwMDAzMDM3Mn0.Rq-gNPt7-XtgLJSdLSz97wd6dEjExIlIZtVP7JhahbM';

// Create Strongly Typed Supabase Client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
