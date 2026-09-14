import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TrueLayer secret isolation", () => {
  it("never exposes banking secrets through NEXT_PUBLIC variables", () => {
    const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    expect(env).not.toMatch(/NEXT_PUBLIC_(?:TRUELAYER|SUPABASE_SERVICE_ROLE|BANK_TOKEN)/);
  });
  it("denies browser roles access to token and OAuth state tables", () => {
    const sql = readFileSync(new URL("../supabase/migrations/004_truelayer_sandbox.sql", import.meta.url), "utf8");
    expect(sql).toContain("create schema if not exists private");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("environment = 'sandbox'");
  });
});
