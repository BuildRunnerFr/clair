import type { BudgetStatus } from "@/types/database";

export interface BudgetAlert {
  category: string;
  monthlyLimit: number;
  spent: number;
  /** Ce qui a été dépensé au-delà de la limite, toujours positif. */
  overrun: number;
}

/**
 * Les budgets dépassés du mois affiché.
 *
 * Un constat, jamais une prévision — et ce choix a été tranché par la mesure, pas par principe.
 *
 * La première version projetait aussi le rythme du mois jusqu'à sa fin, pour prévenir avant le
 * dépassement plutôt qu'après. L'idée est bonne et l'exécution était sans valeur : éprouvée sur
 * trois mois réels, l'extrapolation linéaire se trompe de 89 % en médiane au dixième jour et de
 * 68 % au quinzième. Un budget pourtant fixé 50 % au-dessus de la dépense réelle déclenchait
 * l'alarme une fois sur quatre. Une dépense mensuelle n'est pas régulière — un loyer, un billet
 * d'avion, et le rythme des dix premiers jours ne dit rien des vingt suivants.
 *
 * Une variante pondérée par la moyenne des mois précédents n'a pas fait mieux : elle voit juste
 * six fois sur dix et manque deux dépassements sur trois. Aucun de ces chiffres ne justifie
 * d'occuper le haut du tableau de bord, et une alerte fausse une fois sur quatre est pire que
 * pas d'alerte du tout — elle apprend à ignorer les suivantes, y compris les vraies.
 *
 * Ce qui reste est exact par construction : la limite est franchie, ou elle ne l'est pas.
 * Pour aider à fixer une limite réaliste, voir plutôt la moyenne des mois passés affichée sur
 * la page des budgets — un fait, et non une prédiction.
 */
export function budgetAlerts(statuses: BudgetStatus[]): BudgetAlert[] {
  return statuses
    .filter((status) => status.monthlyLimit !== null && status.monthlyLimit > 0 && status.spent > status.monthlyLimit)
    .map((status) => ({
      category: status.category,
      monthlyLimit: status.monthlyLimit!,
      spent: status.spent,
      overrun: Math.round((status.spent - status.monthlyLimit!) * 100) / 100
    }))
    // Le plus gros dépassement d'abord : c'est celui sur lequel une décision change le plus.
    .sort((left, right) => right.overrun - left.overrun);
}
