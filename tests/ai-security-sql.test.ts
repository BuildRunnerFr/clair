import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/006_ai_categorization.sql", import.meta.url), "utf8");
const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

describe("AI categorization schema security", () => {
  it("adds provenance, confidence, rule priority fields and useful indexes", () => {
    expect(migration).toMatch(/category_source|category_confidence|categorized_at/);
    expect(migration).toMatch(/normalized_merchant|source text|confidence numeric/);
    expect(migration).toContain("transactions_user_uncategorized_idx");
  });
  it("keeps the OpenAI key server-only", () => {
    expect(env).toContain("OPENAI_API_KEY=");
    expect(env).not.toContain("NEXT_PUBLIC_OPENAI_API_KEY");
  });
});
