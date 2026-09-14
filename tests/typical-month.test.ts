import { describe, expect, it } from "vitest";
import { typicalMonth } from "@/lib/analytics/typical-month";

const points = [
  { month: "2026-06", total: 605 },
  { month: "2026-07", total: 1326 },
  { month: "2026-08", total: 1102 },
  { month: "2026-09", total: 1200 }
];

describe("mois type", () => {
  it("situe le mois affiché par rapport à la médiane des mois passés", () => {
    const result = typicalMonth(points, "2026-09")!;
    expect(result.typical).toBe(1102);
    expect(result.current).toBe(1200);
    expect(result.changePercent).toBe(9);
    expect(result.monthsCompared).toBe(3);
  });

  it("renvoie l’étendue observée, sans quoi l’écart se lit comme un signal", () => {
    const result = typicalMonth(points, "2026-09")!;
    expect(result).toMatchObject({ lowest: 605, highest: 1326, position: "ordinaire" });
  });

  it("dit d’un mois qu’il est ordinaire tant qu’il tient dans l’étendue connue", () => {
    // Au 3 du mois, l'étendue réelle allait de 0 à 343 € : un écart de −78 % à la médiane y était
    // un mois banal. Sans cette nuance, le pourcentage seul alarmait pour rien.
    expect(typicalMonth([{ month: "2026-06", total: 0 }, { month: "2026-07", total: 343 },
                         { month: "2026-08", total: 278 }, { month: "2026-09", total: 62 }], "2026-09"))
      .toMatchObject({ changePercent: -78, position: "ordinaire" });
  });

  it("situe un cumul sorti de l’étendue, au-dessus comme en dessous", () => {
    expect(typicalMonth([...points.slice(0, 3), { month: "2026-09", total: 2400 }], "2026-09")!.position).toBe("au-dessus");
    expect(typicalMonth([...points.slice(0, 3), { month: "2026-09", total: 100 }], "2026-09")!.position).toBe("en-dessous");
  });

  it("garde un mois à zéro, qui est une dépense nulle et non une absence de données", () => {
    // Constaté sur les données réelles : au 3 du mois, juin n'avait encore rien dépensé. L'écarter
    // tirait la médiane vers le haut et faisait paraître le mois en cours 80 % sous l'ordinaire.
    // Les mois hors relevé sont écartés par la requête, seule à pouvoir les distinguer.
    const result = typicalMonth([{ month: "2026-05", total: 0 }, ...points], "2026-09")!;
    expect(result.monthsCompared).toBe(4);
    expect(result.lowest).toBe(0);
  });

  it("ne compare rien quand aucun mois passé n’est disponible", () => {
    expect(typicalMonth([{ month: "2026-09", total: 500 }], "2026-09")).toBeNull();
  });

  it("traite un mois affiché sans dépense comme un cumul nul, non comme une absence", () => {
    const result = typicalMonth(points.slice(0, 3), "2026-09")!;
    expect(result.current).toBe(0);
    expect(result.position).toBe("en-dessous");
  });

  it("prend la moyenne des deux médians quand les mois sont en nombre pair", () => {
    expect(typicalMonth([
      { month: "2026-06", total: 100 }, { month: "2026-07", total: 200 },
      { month: "2026-08", total: 300 }, { month: "2026-09", total: 400 },
      { month: "2026-10", total: 0 }
    ], "2026-10")!.typical).toBe(250);
  });
});
