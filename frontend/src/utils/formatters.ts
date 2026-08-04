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
  const piecesPerPack = Math.max(1, Number(product?.pieces_per_pack || 1));
  const rawSellingPrice = Number(product?.selling_price || 0);
  const rawPieceSellingPrice = Number(product?.piece_selling_price || 0);
  const purchasePrice = Number(product?.purchase_price || 0);

  let piecePrice = 0;
  let packPrice = 0;

  if (piecesPerPack > 1) {
    if (rawPieceSellingPrice > 0) {
      piecePrice = rawPieceSellingPrice;
    } else if (rawSellingPrice > 0) {
      if (rawSellingPrice < purchasePrice || (purchasePrice > 0 && rawSellingPrice <= purchasePrice * 0.5)) {
        piecePrice = rawSellingPrice;
      } else {
        piecePrice = rawSellingPrice / piecesPerPack;
      }
    }

    if (rawSellingPrice >= piecePrice * piecesPerPack) {
      packPrice = rawSellingPrice;
    } else if (rawSellingPrice > piecePrice && rawSellingPrice > purchasePrice) {
      packPrice = rawSellingPrice;
    } else {
      packPrice = piecePrice * piecesPerPack;
    }
  } else {
    piecePrice = rawPieceSellingPrice || rawSellingPrice;
    packPrice = rawSellingPrice || rawPieceSellingPrice;
  }

  return {
    piecesPerPack,
    piecePrice,
    packPrice
  };
}
