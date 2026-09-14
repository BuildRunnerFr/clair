import { describe, expect, it, vi } from "vitest";
import { buildSafeCategorizationPayload, OpenAIProvider } from "@/lib/ai/openai-provider";

const response = (output: unknown, status = 200) => new Response(JSON.stringify(output), { status, headers: { "content-type": "application/json" } });
const input = { merchant: "OVO ENERGY", description: "OVO ENERGY", amount: -82.14, currency: "GBP", existingCategories: ["Utilities", "Transport"] };

describe("OpenAIProvider", () => {
  it("uses structured Responses output and validates it", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(response({ output_text: JSON.stringify({ category: "Utilities", subcategory: "Electricity", confidence: 0.97, reason: "UK energy supplier" }) }));
    const provider = new OpenAIProvider("server-secret", http);
    await expect(provider.categorizeTransaction(input)).resolves.toMatchObject({ category: "Utilities", confidence: 0.97 });
    const request = JSON.parse(String(http.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ model: "gpt-5.6-luna", store: false, max_output_tokens: 800, reasoning: { effort: "none" }, text: { format: { type: "json_schema", strict: true } } });
    expect(JSON.stringify(request)).not.toContain("server-secret");
  });

  it("keeps legacy effort compatibility only when explicitly selecting gpt-5-mini", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(response({ output_text: JSON.stringify({ category: "Utilities", subcategory: "Other", confidence: 0.8, reason: "Supplier" }) }));
    await new OpenAIProvider("server-secret", http, { model: "gpt-5-mini" }).categorizeTransaction(input);
    expect(JSON.parse(String(http.mock.calls[0][1]?.body))).toMatchObject({ model: "gpt-5-mini", reasoning: { effort: "minimal" } });
  });

  it("rejects arbitrary model names", () => {
    expect(() => new OpenAIProvider("server-secret", fetch, { model: "untrusted-model" })).toThrow("non autorisé");
  });

  it("reads the nested output shape returned by the REST Responses API", async () => {
    const result = JSON.stringify({ category: "Utilities", subcategory: "Gas", confidence: 0.94, reason: "Energy supplier" });
    const http = vi.fn<typeof fetch>().mockResolvedValue(response({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: result }] }] }));
    await expect(new OpenAIProvider("server-secret", http).categorizeTransaction(input)).resolves.toMatchObject({ category: "Utilities", subcategory: "Gas" });
  });

  it("rejects a category outside the taxonomy", async () => {
    const invalidCategory = new OpenAIProvider("secret", vi.fn<typeof fetch>().mockResolvedValue(response({ output_text: JSON.stringify({ category: "Crime", subcategory: "Other", confidence: 1, reason: "bad" }) })));
    await expect(invalidCategory.categorizeTransaction(input)).rejects.toThrow();
  });

  it("garde la catégorie et retombe sur Other quand la sous-catégorie appartient à une autre", async () => {
    // Ce test exigeait auparavant un rejet. Sur les données réelles, cette sévérité perdait
    // un cinquième des appels payés alors que la catégorie renvoyée était juste.
    const invalidSubcategory = new OpenAIProvider("secret", vi.fn<typeof fetch>().mockResolvedValue(response({ output_text: JSON.stringify({ category: "Utilities", subcategory: "Salary", confidence: 1, reason: "bad" }) })));
    await expect(invalidSubcategory.categorizeTransaction(input)).resolves.toMatchObject({ category: "Utilities", subcategory: "Other" });
  });

  it("surfaces a timeout without exposing secrets", async () => {
    const provider = new OpenAIProvider("private-key", vi.fn<typeof fetch>().mockRejectedValue(new DOMException("Timed out", "TimeoutError")));
    await expect(provider.categorizeTransaction(input)).rejects.toThrow("Timed out");
  });

  it("removes emails, URLs, IBANs and long numbers from the payload", () => {
    const payload = buildSafeCategorizationPayload({ ...input, description: "john@example.com https://bank.test GB82WEST12345698765432 card 4242 4242 4242 4242" });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/john@example|bank\.test|GB82WEST|4242 4242/);
    expect(serialized).not.toMatch(/account|access_token|refresh_token|iban/i);
  });
});

describe("sous-catégorie renvoyée par le modèle", () => {
  const reply = (category: string, subcategory: string) => async () => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify({ category, subcategory, confidence: 0.95, reason: "test" }) }] }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  const input = { merchant: "X", description: "X", amount: 10, currency: "EUR", existingCategories: [] };

  it("accepte une sous-catégorie correcte à la casse près", async () => {
    // Observé en production : le modèle répondait « Convenience store », la taxonomie dit
    // « Convenience Store ». La réponse était juste et pourtant rejetée.
    const provider = new OpenAIProvider("key", reply("Groceries", "Convenience store") as never);
    await expect(provider.categorizeTransaction(input)).resolves.toMatchObject({ category: "Groceries", subcategory: "Convenience Store" });
  });

  it("retombe sur Other quand la sous-catégorie est inventée, sans perdre la catégorie", async () => {
    // « Travel booking service » n'existe pas ; la catégorie Travel, elle, est le signal utile.
    const provider = new OpenAIProvider("key", reply("Travel", "Travel booking service") as never);
    await expect(provider.categorizeTransaction(input)).resolves.toMatchObject({ category: "Travel", subcategory: "Other" });
  });

  it("refuse toujours une catégorie hors taxonomie", async () => {
    // La tolérance ne porte que sur la sous-catégorie : une catégorie inventée reste rejetée.
    const provider = new OpenAIProvider("key", reply("Crypto Trading", "Other") as never);
    await expect(provider.categorizeTransaction(input)).rejects.toThrow();
  });
});
