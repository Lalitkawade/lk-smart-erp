// Helper utility for clean date, time, and currency formatting across LK Hardware ERP

export function formatDate(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatDateTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + ' | ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export function formatCurrency(amountInput?: number | string | null): string {
  const num = Number(amountInput || 0);
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function getProductUnitRates(product: any) {
  const piecesPerPack = Math.max(0.000001, Number(product?.pieces_per_pack || 1));
  const purchasePrice = Number(product?.purchase_price || 0);
  const sellingPrice = Number(product?.selling_price || 0);
  const baseCost = piecesPerPack > 0 ? (purchasePrice / piecesPerPack) : purchasePrice;
  const profitPerSellingUnit = sellingPrice - baseCost;
  const marginPercent = baseCost > 0 ? (profitPerSellingUnit / baseCost) * 100 : 0;
  const packSellingPrice = sellingPrice * piecesPerPack;

  return {
    piecesPerPack,
    purchasePrice,        // Purchase Price per Purchase Unit (e.g. ₹100 / Box)
    baseCost,             // Calculated Base Unit Cost = Purchase Price / Conversion Factor (e.g. ₹1 / Nos)
    sellingPrice,         // Selling Price per Selling Unit (e.g. ₹2 / Nos)
    profitPerSellingUnit, // Profit per Selling Unit (e.g. ₹1 / Nos)
    marginPercent,        // Margin % (e.g. 100%)
    packSellingPrice,     // Pack Selling Price = Selling Price * Conversion Factor (e.g. ₹200 / Box)
    piecePrice: sellingPrice,     // Alias for legacy sales UI compatibility
    packPrice: packSellingPrice   // Alias for legacy sales UI compatibility
  };
}
