import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/001_initial_schema.sql", import.meta.url), "utf8");
const tables = ["accounts", "transactions", "categories", "merchant_rules", "subscriptions"];

describe("Supabase security migration", () => {
  it.each(tables)("enables RLS and indexes user_id on %s", (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toMatch(new RegExp(`create index [^;]+ on public\\.${table} \\(user_id`));
  });
  it("limits policies to authenticated users and rejects anonymous table access", () => {
    expect(migration).toContain("from anon");
    expect(migration).not.toMatch(/create policy[^;]+to anon/is);
    expect(migration.match(/to authenticated/g)?.length).toBeGreaterThanOrEqual(11);
  });
  it("guards duplicates and account ownership", () => {
    expect(migration).toContain("unique (user_id, account_id, provider_transaction_id)");
    expect(migration).toMatch(/exists \(select 1 from public\.accounts a where a\.id = account_id and a\.user_id = \(select auth\.uid\(\)\)\)/);
  });
});
