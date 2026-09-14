import { describe, expect, it } from "vitest";
import type { MonthlyPoint } from "@/types/analytics";

/**
 * La moyenne des six derniers mois ne porte que sur les mois couverts.
 *
 * Elle divisait par six quoi qu'il arrive. Un compte connecté depuis trois semaines n'a qu'un
 * mois de données ; les cinq précédents reviennent à zéro faute d'être couverts par le relevé,
 * et cinquante-quatre euros dépensés s'affichaient « neuf euros de moyenne » — un chiffre faux,
 * présenté comme un repère.
 *
 * La règle reproduite ici est celle du composant : un zéro avant la première dépense connue
 * signale un mois hors du relevé, un zéro après signale un vrai mois sans dépense, et celui-là
 * compte. C'est la même distinction qui a valu une migration à finance_month_to_date.
 */
function average(points: MonthlyPoint[]): number {
  const covered = points.findIndex((point) => point.spent > 0);
  const known = covered === -1 ? [] : points.slice(covered);
  return known.length ? known.reduce((total, point) => total + point.spent, 0) / known.length : 0;
}

const months = (...spent: number[]): MonthlyPoint[] =>
  spent.map((value, index) => ({ month: `2026-0${index + 4}`, spent: value }));

describe("moyenne de la tendance", () => {
  it("ignore les mois antérieurs au relevé", () => {
    expect(average(months(0, 0, 0, 0, 0, 54.17))).toBeCloseTo(54.17, 2);
  });

  it("compte un vrai mois sans dépense", () => {
    // Après une première dépense, un zéro est une information : le mois a été calme.
    expect(average(months(0, 0, 300, 0, 300, 300))).toBeCloseTo(225, 2);
  });

  it("moyenne normalement une série complète", () => {
    expect(average(months(100, 200, 300, 400, 500, 600))).toBeCloseTo(350, 2);
  });

  it("renvoie zéro quand rien n’a jamais été dépensé", () => {
    expect(average(months(0, 0, 0, 0, 0, 0))).toBe(0);
  });
});
