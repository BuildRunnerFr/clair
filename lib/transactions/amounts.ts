/** Une conversion absente reste dans sa devise d’origine, jamais dans une autre unité. */
export interface MonetaryTransaction {
  amount: number;
  currency: string;
  amountBase?: number | null;
  baseCurrency?: string | null;
  pending?: boolean;
}
export function displayedAmount(item: MonetaryTransaction) {
  return item.amountBase != null && Number.isFinite(item.amountBase) && item.baseCurrency
    ? { amount: item.amountBase, currency: item.baseCurrency }
    : { amount: item.amount, currency: item.currency };
}

export function transactionTotals(items: MonetaryTransaction[]) {
  const totals = new Map<string, { currency: string; spent: number; received: number; pending: number }>();
  for (const item of items) {
    const { amount, currency } = displayedAmount(item);
    if (!Number.isFinite(amount)) continue;
    const row = totals.get(currency) ?? { currency, spent: 0, received: 0, pending: 0 };
    if (item.pending) row.pending += Math.abs(amount);
    else if (amount < 0) row.spent += -amount;
    else row.received += amount;
    totals.set(currency, row);
  }
  return [...totals.values()].map(row => ({ ...row, spent: round(row.spent), received: round(row.received), pending: round(row.pending) }));
}
const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
