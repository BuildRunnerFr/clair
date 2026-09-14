import { describe, expect, it } from "vitest";
import { dateWindows, MAX_RANGE_DAYS } from "@/lib/banking/truelayer/truelayer-bank-provider";

/**
 * La plage demandée au fournisseur ne doit jamais dépasser un an.
 *
 * Mesuré contre l'API : 365 jours passent, 366 sont refusés par un 400 « invalid_date_range »
 * qui fait échouer la synchronisation entière. La reprise d'historique profond en demandait
 * sept cent trente d'un coup — elle n'a donc jamais rien rapporté, et comme elle ne s'exécute
 * que dans les minutes suivant l'autorisation, chaque échec consommait la seule occasion
 * d'obtenir cet historique.
 */
const days = (a: URLSearchParams) =>
  (Date.parse(a.get("to")!) - Date.parse(a.get("from")!)) / 86_400_000 + 1;

describe("le découpage de l’historique", () => {
  it("laisse une courte période en une seule requête", () => {
    const windows = dateWindows(new Date("2026-06-01"), new Date("2026-09-01"));
    expect(windows).toHaveLength(1);
    expect(windows[0]!.get("from")).toBe("2026-06-01");
    expect(windows[0]!.get("to")).toBe("2026-09-01");
  });

  it("ne dépasse jamais la borne du fournisseur", () => {
    for (const span of [364, 365, 366, 400, 730, 900]) {
      const to = new Date("2026-09-07");
      const from = new Date(to.getTime() - span * 86_400_000);
      for (const window of dateWindows(from, to)) {
        expect(days(window), `plage de ${span} jours`).toBeLessThanOrEqual(MAX_RANGE_DAYS);
      }
    }
  });

  it("couvre toute la période sans trou ni recouvrement", () => {
    const from = new Date("2024-09-07"), to = new Date("2026-09-07");
    const windows = dateWindows(from, to);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows[0]!.get("from")).toBe("2024-09-07");
    expect(windows.at(-1)!.get("to")).toBe("2026-09-07");
    for (let index = 1; index < windows.length; index++) {
      const previous = Date.parse(windows[index - 1]!.get("to")!);
      const next = Date.parse(windows[index]!.get("from")!);
      expect(next - previous, "un jour d’écart exactement").toBe(86_400_000);
    }
  });
});
