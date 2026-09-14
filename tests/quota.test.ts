import { describe, expect, it } from "vitest";
import { QUOTAS, quotaMessage, toVerdict } from "@/lib/quota/policy";

describe("verdict de quota", () => {
  it("traduit un décompte en reste", () => {
    expect(toVerdict({ allowed: true, used: 12, quota: 40 })).toEqual({ allowed: true, used: 12, quota: 40, remaining: 28 });
  });

  it("ne descend jamais sous zéro", () => {
    // Le compteur cesse de monter au-delà de la limite, mais une ligne écrite avant un
    // changement de limite peut la dépasser : « −3 messages restants » ne veut rien dire.
    expect(toVerdict({ allowed: false, used: 45, quota: 40 }).remaining).toBe(0);
  });

  it("laisse passer quand le compteur ne renvoie rien", () => {
    // Un compteur illisible ne doit pas rendre l'application inutilisable : le risque est une
    // dépense, pas une fuite, et l'incident se lit dans les journaux.
    expect(toVerdict(undefined).allowed).toBe(true);
  });
});

describe("message de refus", () => {
  it("dit la limite et quand elle repart", () => {
    const message = quotaMessage("assistant", { allowed: false, used: 40, quota: 40, remaining: 0 });
    expect(message).toContain("40");
    expect(message).toContain("questions à l’assistant");
    expect(message).toContain("minuit");
  });

  it("nomme chaque ressource en clair", () => {
    for (const resource of Object.keys(QUOTAS) as Array<keyof typeof QUOTAS>) {
      const message = quotaMessage(resource, { allowed: false, used: 1, quota: 1, remaining: 0 });
      // Ni nom technique ni code : le message est lu par quelqu'un qui vient d'être refusé.
      expect(message).not.toMatch(/bank_sync|categorization|assistant"/);
      expect(message.length).toBeGreaterThan(30);
    }
  });
});

describe("limites", () => {
  it("laisse un usage normal passer largement", () => {
    // Les limites bornent ce qu'un compte peut coûter, elles ne rationnent pas un usage
    // ordinaire : quelqu'un qui les atteint en une journée signale un mauvais calibrage.
    expect(QUOTAS.assistant).toBeGreaterThanOrEqual(20);
    expect(QUOTAS.bank_sync).toBeGreaterThanOrEqual(10);
    expect(QUOTAS.categorization).toBeGreaterThanOrEqual(3);
  });
});
