import { describe, expect, it } from "vitest";
import { evaluateCategorizationReference } from "@/lib/ai/evaluate-reference";
import { OpenAIProvider } from "@/lib/ai/openai-provider";
import { CATEGORIZATION_REFERENCE_DATASET } from "@/lib/ai/reference-dataset";

const liveDescribe = process.env.RUN_OPENAI_EVAL === "1" ? describe : describe.skip;

liveDescribe("OpenAI Luna reference evaluation (live, opt-in)", () => {
  it("meets the categorization baseline", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY est requise pour le test live.");
    const result = await evaluateCategorizationReference(new OpenAIProvider(apiKey, fetch, { model: "gpt-5.6-luna" }), CATEGORIZATION_REFERENCE_DATASET, 3);
    console.info("[openai-reference-eval]", result);
    expect(result.errors).toBe(0);
    expect(result.categoryAccuracy).toBeGreaterThanOrEqual(0.85);
    expect(result.exactAccuracy).toBeGreaterThanOrEqual(0.75);
    expect(result.autoApplyCategoryPrecision).toBeGreaterThanOrEqual(0.9);
  }, 300_000);
});
