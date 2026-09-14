import { describe, expect, it } from "vitest";
import { redactForAi } from "@/lib/ai/redact";

// Libellés au format Société Générale. La forme est celle du relevé, les valeurs sont fictives.
describe("masquage avant envoi à l’IA", () => {
  it("retire le nom du destinataire d’un virement émis", () => {
    const out = redactForAi("000001 VIR INSTANTANE EMIS WERO POUR: PAUL M IBAN: XXXXXXXXXXXXXXXXXXXXXXX1234 DATE: 14/03/2026 10:15 REF: 1234567890");
    expect(out).not.toMatch(/PAUL/i);
    expect(out).not.toMatch(/1234/);
    expect(out).toContain("[TIERS]");
    // Ce qui permet de classer survit : c'est un virement instantané émis.
    expect(out).toMatch(/VIR INSTANTANE EMIS/);
  });

  it("retire le nom de l’émetteur d’un virement reçu", () => {
    const out = redactForAi("VIR INST RE 1234567 DE: MLLE JEANNE DURAND DATE: 12/03/2026 09:41 MOTIF: Remboursement REF: 998877665544");
    expect(out).not.toMatch(/JEANNE|DURAND/i);
    expect(out).toContain("[TIERS]");
    expect(out).toMatch(/VIR INST RE/);
  });

  it("garde l’organisme d’un prélèvement, qui est le signal utile", () => {
    // Sans cette exception, « PRET CREDIMODELE » disparaîtrait et l'IA ne pourrait plus
    // reconnaître une mensualité de crédit.
    const out = redactForAi("PRELEVEMENT EUROPEEN 123456 DE: PRET CREDIMODELE.PERSO-CREDIMODELE SA ID: FR76300030001200005678901 MOTIF: MENSUALITE PRET PERSO");
    expect(out).toMatch(/PRET CREDIMODELE/);
    expect(out).toMatch(/MENSUALITE PRET PERSO/);
    expect(out).not.toMatch(/FR76300030001200005678901/);
  });

  it("masque un IBAN complet et sa forme tronquée par la banque", () => {
    expect(redactForAi("IBAN FR7630006000011234567890189")).not.toMatch(/FR7630006/);
    // Les quatre derniers chiffres suffisent à rapprocher deux relevés : ils sortent aussi.
    expect(redactForAi("IBAN: XXXXXXXXXXXXXXXXXXXXXXX4321")).not.toMatch(/4321/);
  });

  it("masque adresses email et liens", () => {
    expect(redactForAi("PAIEMENT contact@exemple.fr")).not.toMatch(/exemple\.fr/);
    expect(redactForAi("ACHAT https://boutique.example/commande/42")).not.toMatch(/boutique/);
  });

  it("laisse intact un libellé de commerçant ordinaire", () => {
    // Le masquage ne doit pas dégrader le cas courant, qui est l'écrasante majorité.
    expect(redactForAi("CARREFOUR MARKET 4412")).toBe("CARREFOUR MARKET 4412");
    expect(redactForAi("COTISATION MENSUELLE CARTE")).toBe("COTISATION MENSUELLE CARTE");
    expect(redactForAi("AIRBNB * AB12CD34EF")).toBe("AIRBNB * AB12CD34EF");
  });

  it("borne la longueur et supporte une entrée vide", () => {
    expect(redactForAi("A".repeat(400)).length).toBe(120);
    expect(redactForAi("")).toBe("");
  });
});

describe("références longues", () => {
  it("masque une référence plus longue que la borne, cas constaté en production", () => {
    // « REF: 987654321098765432109876 » passait entier : une borne haute de 19 chiffres
    // consommait les 19 premiers puis exigeait une frontière de mot au milieu du nombre.
    const out = redactForAi("VIR INST RE DE: X DATE: 21/03/2026 REF: 987654321098765432109876");
    expect(out).not.toMatch(/98765432109876543/);
  });

  it("n’avale pas l’espace qui suit un nombre masqué", () => {
    expect(redactForAi("VIR INST RE 1234567 DE: DUPONT")).toMatch(/\] DE:/);
  });
});
