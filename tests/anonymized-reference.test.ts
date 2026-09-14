import { describe, expect, it } from "vitest";
import { ANONYMIZED_SANDBOX_REFERENCE_CASES } from "@/lib/ai/anonymized-reference-dataset";

describe("anonymized Sandbox reference cases", () => {
  it("contains only synthetic labels and no obvious sensitive identifiers", () => {
    const serialized = JSON.stringify(ANONYMIZED_SANDBOX_REFERENCE_CASES);
    expect(ANONYMIZED_SANDBOX_REFERENCE_CASES.length).toBeGreaterThan(0);
    expect(serialized).not.toMatch(/@[a-z0-9.-]+\.|\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b|access_token|refresh_token|account_number|iban/i);
    expect(ANONYMIZED_SANDBOX_REFERENCE_CASES.every((item) => item.id.startsWith("sandbox-generic-") && item.merchant.startsWith("GENERIC"))).toBe(true);
  });
});
