import type { Product, SalesInvoice, PurchaseBill, Expense, JobCard } from '../types/erp.types';

// Empty lists for real live production data
export const initialProducts: Product[] = [];
export const initialSales: Array<SalesInvoice & { items?: any[] }> = [];
export const initialPurchases: PurchaseBill[] = [];
export const initialExpenses: Expense[] = [];
export const initialJobCards: JobCard[] = [];
