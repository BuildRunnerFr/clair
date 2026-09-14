import { describe, expect, it } from "vitest";
import { HISTORY_MONTHS, SCA_WINDOW_MINUTES, syncWindow } from "@/lib/banking/history-window";

const now = new Date("2026-09-05T12:00:00Z");
const days = (from: Date) => Math.round((now.getTime() - from.getTime()) / 86_400_000);

describe("fenêtre de synchronisation", () => {
  it("remonte deux ans dans la foulée de l’autorisation", () => {
    const { from, backfill } = syncWindow({ lastSyncedAt: null, authorizedAt: new Date("2026-09-05T11:59:00Z"), now });
    expect(from.toISOString().slice(0, 10)).toBe("2024-09-05");
    expect(backfill).toBe(true);
    expect(HISTORY_MONTHS).toBe(24);
  });

  it("reprend l’historique complet même sur une connexion déjà synchronisée", () => {
    // Une reconnexion rouvre la fenêtre : c'est le seul moment où réparer un historique amputé.
    const { from, backfill } = syncWindow({ lastSyncedAt: new Date("2026-09-04T06:00:00Z"), authorizedAt: new Date("2026-09-05T11:58:00Z"), now });
    expect(days(from)).toBeGreaterThan(700);
    expect(backfill).toBe(true);
  });

  it("retombe à 89 jours dès la fenêtre refermée", () => {
    // Le cas qui a condamné une connexion valide : hors fenêtre, demander plus renvoie 403.
    const closed = new Date(now.getTime() - (SCA_WINDOW_MINUTES + 1) * 60_000);
    const { from, backfill } = syncWindow({ lastSyncedAt: null, authorizedAt: closed, now });
    expect(days(from)).toBe(89);
    expect(backfill).toBe(false);
  });

  it("ne demande jamais plus de 89 jours à une connexion longtemps muette", () => {
    // Quatre mois sans passage : repartir du dernier dépasserait ce que la banque accorde.
    const { from } = syncWindow({ lastSyncedAt: new Date("2026-05-01T00:00:00Z"), authorizedAt: null, now });
    expect(days(from)).toBe(89);
  });

  it("repart du dernier passage, avec trois jours de recouvrement", () => {
    const { from, backfill } = syncWindow({ lastSyncedAt: new Date("2026-09-01T12:00:00Z"), authorizedAt: null, now });
    expect(from.toISOString()).toBe("2026-08-29T12:00:00.000Z");
    expect(backfill).toBe(false);
  });

  it("traite une autorisation inconnue comme une fenêtre fermée", () => {
    // Les connexions établies avant que la date soit suivie : prudence, jamais deux ans.
    expect(days(syncWindow({ lastSyncedAt: null, authorizedAt: null, now }).from)).toBe(89);
  });
});
