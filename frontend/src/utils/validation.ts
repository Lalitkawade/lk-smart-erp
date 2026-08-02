import { z } from 'zod';

// Authentication Input Validation Schemas
export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address format' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
});

// Customer Input Schema
export const customerSchema = z.object({
  customer_name: z.string().trim().min(2, { message: 'Customer name is required' }).max(100),
  phone: z.string().trim().regex(/^[0-9+--\s()]{7,15}$/, { message: 'Invalid phone number format' }).optional().or(z.literal('')),
  email: z.string().trim().email({ message: 'Invalid email' }).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
  credit_limit: z.number().nonnegative().optional().default(0),
});

// Supplier Input Schema
export const supplierSchema = z.object({
  supplier_name: z.string().trim().min(2, { message: 'Supplier name is required' }).max(100),
  phone: z.string().trim().regex(/^[0-9+--\s()]{7,15}$/, { message: 'Invalid phone number format' }).optional().or(z.literal('')),
  email: z.string().trim().email({ message: 'Invalid email' }).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
});

// Product Input Schema
export const productSchema = z.object({
  product_name: z.string().trim().min(1, { message: 'Product name is required' }),
  sku: z.string().trim().max(50).optional(),
  barcode: z.string().trim().max(50).optional(),
  purchase_price: z.number().nonnegative({ message: 'Purchase price must be >= 0' }),
  selling_price: z.number().nonnegative({ message: 'Selling price must be >= 0' }),
  current_stock: z.number().default(0),
  min_stock_level: z.number().default(10),
});

/**
 * XSS Sanitization helper for user text input strings.
 * Escapes HTML characters before rendering or storing.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
