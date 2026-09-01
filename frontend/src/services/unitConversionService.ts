import { ProductRow, ProductUnitConversionRow } from '../types/database.types';

export const SYSTEM_UNITS = [
  'NOS', 'PCS', 'KG', 'GRAM', 'FT', 'METER', 
  'BUNDLE', 'BOX', 'PKT', 'DOZEN', 'LTR', 'QTL'
];

export const UNIT_LABELS: Record<string, string> = {
  'NOS': 'Number',
  'PCS': 'Pieces',
  'KG': 'Kilogram',
  'GRAM': 'Gram',
  'FT': 'Feet',
  'METER': 'Meter',
  'BUNDLE': 'Bundle',
  'BOX': 'Box',
  'PKT': 'Packet',
  'DOZEN': 'Dozen',
  'LTR': 'Litre',
  'QTL': 'Quintal'
};

/**
 * Returns allowed purchase and selling units for a product, and its base unit.
 */
export const getProductUnitConfig = (product: ProductRow) => {
  const baseUnit = product.base_unit || 'PCS';
  // Fallback to baseUnit if array is missing or empty
  const purchaseUnits = product.purchase_units?.length ? product.purchase_units : [baseUnit];
  const sellingUnits = product.selling_units?.length ? product.selling_units : [baseUnit];

  return {
    baseUnit,
    purchaseUnits,
    sellingUnits
  };
};

/**
 * Retrieves the conversion factor for a given unit to the base unit.
 * Automatically returns 1 if unit === baseUnit.
 * Handles standard mathematical conversions if explicitly enabled by business rules.
 */
export const getConversionFactor = (
  conversions: ProductUnitConversionRow[],
  unit: string,
  baseUnit: string
): number | null => {
  if (!unit || !baseUnit) return null;
  
  const upperUnit = unit.toUpperCase();
  const upperBase = baseUnit.toUpperCase();

  // 1. Same unit is always factor 1
  if (upperUnit === upperBase) return 1.0;

  // 2. Look for product-specific conversion in the database
  const productConversion = conversions.find(
    c => c.unit_code.toUpperCase() === upperUnit && c.base_unit_code.toUpperCase() === upperBase
  );
  if (productConversion && productConversion.conversion_factor > 0) {
    return Number(productConversion.conversion_factor);
  }

  // 3. Optional: Global standard conversions (e.g. 1 QTL = 100 KG)
  // Only apply these if the user hasn't overridden them for the product
  if (upperUnit === 'QTL' && upperBase === 'KG') return 100;
  if (upperUnit === 'KG' && upperBase === 'GRAM') return 1000;
  if (upperUnit === 'DOZEN' && upperBase === 'PCS') return 12;
  if (upperUnit === 'DOZEN' && upperBase === 'NOS') return 12;

  // No valid conversion found
  return null;
};

/**
 * Converts a transactional quantity into the base unit quantity.
 */
export const calculateBaseQuantity = (
  quantity: number,
  conversionFactor: number
): number => {
  // Use precise math to avoid floating point issues
  // Round to 4 decimal places internally, then to Number
  return Number((Number(quantity) * Number(conversionFactor)).toFixed(4));
};

/**
 * Validates if sufficient stock exists for a sale.
 */
export const validateStockAvailability = (
  currentStockBaseQty: number,
  requiredBaseQty: number
): { isValid: boolean; message?: string } => {
  const current = Number(currentStockBaseQty || 0);
  const required = Number(requiredBaseQty || 0);

  if (required > current) {
    return {
      isValid: false,
      message: `Insufficient stock. Available: ${current}. Required: ${required}.`
    };
  }

  return { isValid: true };
};
