interface CreditFinanceBand {
  min: number;
  max: number;
  spendingLevel: string;
}

// Niveles de vida segun el Credito; los importes se consultan en la Tabla II del manual.
const classicFinanceBands: CreditFinanceBand[] = [
  { min: 0, max: 0, spendingLevel: "Indigente" },
  { min: 1, max: 9, spendingLevel: "Pobre" },
  { min: 10, max: 49, spendingLevel: "Medio" },
  { min: 50, max: 89, spendingLevel: "Adinerado" },
  { min: 90, max: 98, spendingLevel: "Rico" },
  { min: 99, max: 99, spendingLevel: "Inmensamente rico" },
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
    cash: "",
    assets: "",
  };
}
