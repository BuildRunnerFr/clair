import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/migrations/005_dynamic_currencies_sync_lock.sql", import.meta.url), "utf8");

describe("currency and synchronization SQL", () => {
  it("discovers currencies across accounts, transactions and budgets without a hard-coded list", () => {
    expect(sql).toContain("from public.accounts");
    expect(sql).toContain("from public.transactions");
    expect(sql).toContain("from public.budgets");
    expect(sql).not.toMatch(/'EUR'|'MYR'|'GBP'/);
    expect(sql).toContain("auth.uid()");
  });

  it("acquires one expiring connection-scoped lock and releases only with its token", () => {
    expect(sql).toContain("sync_locked_until < now()");
    expect(sql).toContain("sync_lock_id = p_lock_id");
    expect(sql).toContain("user_id = (select auth.uid())");
    expect(sql).toContain("greatest(p_ttl_seconds, 60)");
  });
});
