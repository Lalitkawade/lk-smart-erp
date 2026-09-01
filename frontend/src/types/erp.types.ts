import type { Database } from './database.types';

export type Tenant = Database['public']['Tables']['tenants']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Product = Database['public']['Tables']['products']['Row'] & {
  hsn?: string | null;
  p_unit?: string | null;
  s_unit?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  pieces_per_pack?: number | null;
  piece_selling_price?: number | null;
  size?: string | null;
  weight?: string | null;
  description?: string | null;
  allow_decimal?: boolean | null;
  allow_purchase_unit_selling?: boolean | null;
  track_base_unit?: boolean | null;
};
export type SalesInvoice = Database['public']['Tables']['sales_invoices']['Row'];
export type SalesItem = Database['public']['Tables']['sales_items']['Row'];
export type PurchaseBill = Database['public']['Tables']['purchase_bills']['Row'];
export type PurchaseItem = Database['public']['Tables']['purchase_items']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Supplier = Database['public']['Tables']['suppliers']['Row'];
export type JobCard = Database['public']['Tables']['job_cards']['Row'];
export type JobCardPart = Database['public']['Tables']['job_card_parts']['Row'];
export type Settings = Database['public']['Tables']['settings']['Row'];

// Configurable Business Module Types
export type BusinessType =
  | 'General Store'
  | 'Automobile Garage'
  | 'Mobile Shop'
  | 'Fertilizer Shop'
  | 'Hardware Shop'
  | 'Medical Store'
  | 'Restaurant';

export interface CartItem {
  product: Product;
  qty: number;
  qtyText?: string;
  rate: number;
  isLoose?: boolean;
}

export interface SplitPaymentDetails {
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
}

export interface ClientOnboardingPayload {
  companyCode: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  plan: 'Basic' | 'Professional' | 'Enterprise';
}

export interface ServiceJobCardPayload {
  vehicleNumber: string;
  vehicleModel: string;
  ownerPhone: string;
  mechanicId: string | null;
  labourCharges: number;
  partsUsed: Array<{ productId: string; qty: number; rate: number }>;
}
