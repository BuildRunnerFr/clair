export function getUtcMonthBounds(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Mois invalide");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    monthDate: `${month}-01`,
    from: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    to: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString()
  };
}

export function budgetLevel(percentage: number | null): "none" | "ok" | "warning" | "over" {
  if (percentage === null) return "none";
  if (percentage >= 100) return "over";
  if (percentage >= 80) return "warning";
  return "ok";
}

export function calculateBudgetStatus(limit: number, spent: number) {
  if (limit <= 0) throw new Error("La limite doit être positive");
  const remaining = limit - spent;
  const percentageUsed = Math.round((spent / limit) * 10_000) / 100;
  return { limit, spent, remaining, percentageUsed, level: budgetLevel(percentageUsed) };
}
