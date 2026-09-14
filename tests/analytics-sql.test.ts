import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/migrations/003_budgets_analytics_connections.sql", import.meta.url), "utf8");
const functions = ["finance_monthly_summary", "finance_spending_by_category", "finance_budget_status", "finance_top_merchants", "finance_spending_between", "finance_recent_transactions"];

describe("financial SQL RPCs", () => {
  it.each(functions)("secures %s with invoker rights and auth.uid", (name) => {
    const start = sql.indexOf(`function public.${name}`);
    const next = sql.indexOf("create or replace function", start + 20);
    const body = sql.slice(start, next === -1 ? undefined : next);
    expect(body).toContain("security invoker");
    expect(body).toContain("auth.uid()");
    expect(body).not.toMatch(/p_user_id|user_id uuid/);
    expect(sql).toContain(`grant execute on function public.${name}`);
  });

  it("enforces currency separation and budget uniqueness", () => {
    expect(sql.match(/currency = upper\(p_currency\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("unique (user_id, category, currency)");
  });

  it("enables RLS for budgets and token-free connection metadata", () => {
    expect(sql).toContain("alter table public.budgets enable row level security");
    expect(sql).toContain("alter table public.bank_connections enable row level security");
    expect(sql).not.toMatch(/access_token|refresh_token|client_secret/);
  });
});
