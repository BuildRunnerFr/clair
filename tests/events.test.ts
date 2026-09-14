import { describe, expect, it } from "vitest";
import { safeContext } from "@/lib/observability/events";

describe("contexte d’un événement", () => {
  it("garde nombres et booléens", () => {
    expect(safeContext({ durationMs: 1240, accountCount: 2, retried: true })).toEqual({ durationMs: 1240, accountCount: 2, retried: true });
  });

  it("garde les codes courts", () => {
    expect(safeContext({ reason: "reauthorization_required", environment: "live" }))
      .toEqual({ reason: "reauthorization_required", environment: "live" });
  });

  it("écarte tout ce qui ressemble à un libellé", () => {
    // Un journal se relit des mois plus tard, souvent par quelqu'un qui n'avait pas à voir les
    // données de qui que ce soit. Une phrase y a sa place, jamais.
    expect(safeContext({ label: "VIR INSTANTANE EMIS POUR PAUL M" })).toEqual({});
    expect(safeContext({ merchant: "Carrefour Market" })).toEqual({});
  });

  it("écarte les identifiants et les valeurs trop longues", () => {
    expect(safeContext({ ref: "987654321098765432109876" })).toEqual({});
    expect(safeContext({ iban: "FR7630006000011234567890189" })).toEqual({});
    expect(safeContext({ blob: "x".repeat(80) })).toEqual({});
  });

  it("écarte objets, tableaux, null et nombres non finis", () => {
    expect(safeContext({ nested: { a: 1 }, list: [1, 2], nothing: null, nan: Number.NaN })).toEqual({});
  });

  it("ne laisse pas passer une chaîne vide", () => {
    expect(safeContext({ code: "   " })).toEqual({});
  });
});
