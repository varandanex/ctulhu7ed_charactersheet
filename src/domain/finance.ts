interface CreditFinanceBand {
  min: number;
  max: number;
  spendingLevel: string;
  cash: string;
  assets: string;
}

// Tabla configurable para resumen de ingresos y propiedades segun Credito.
// Valores orientativos para crear rapidamente el investigador en mesa.
const classicFinanceBands: CreditFinanceBand[] = [
  { min: 0, max: 0, spendingLevel: "$0.50", cash: "$10", assets: "Sin propiedades" },
  { min: 1, max: 9, spendingLevel: "$2", cash: "$50", assets: "$500" },
  { min: 10, max: 49, spendingLevel: "$10", cash: "$250", assets: "$5,000" },
  { min: 50, max: 89, spendingLevel: "$50", cash: "$1,250", assets: "$50,000" },
  { min: 90, max: 98, spendingLevel: "$250", cash: "$12,500", assets: "$500,000" },
  { min: 99, max: 99, spendingLevel: "$500", cash: "$50,000", assets: "$5,000,000" },
];

export interface FinanceSnapshot {
  spendingLevel: string;
  cash: string;
  assets: string;
}

export function getFinanceByCredit(creditRating: number): FinanceSnapshot {
  const band = classicFinanceBands.find((item) => creditRating >= item.min && creditRating <= item.max);
  if (!band) {
    return { spendingLevel: "N/A", cash: "N/A", assets: "N/A" };
  }

  return {
    spendingLevel: band.spendingLevel,
    cash: band.cash,
    assets: band.assets,
  };
}
