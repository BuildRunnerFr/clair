/**
 * Mesure l'erreur de la prévision de trésorerie sur l'historique réel.
 *
 *   npx tsx --env-file=.env.local scripts/backtest-forecast.ts [email]
 *
 * Une projection de dépenses a déjà été écrite ici puis retirée : extrapoler le rythme du début
 * de mois donnait 89 % d'erreur médiane au dixième jour. La leçon n'est pas qu'il ne faut pas
 * prévoir, c'est qu'il faut mesurer avant d'afficher.
 *
 * La prévision de solde a deux termes. Les prélèvements récurrents sont connus au montant et au
 * jour près : leur erreur est nulle par construction. Reste les dépenses du quotidien, estimées
 * par la médiane de ce qui a été dépensé sur la même fin de mois les mois passés. C'est donc
 * elles, et elles seules, que ce script met à l'épreuve.
 *
 * Le protocole exclut le mois testé de ses propres comparaisons — sans quoi on mesurerait la
 * capacité du calcul à se souvenir, pas à prévoir.
 *
 * Rien n'est écrit sur disque et aucun libellé n'est affiché : seules sortent des statistiques.
 */
import { createClient } from "@supabase/supabase-js";
import { detectSubscriptions } from "../lib/subscriptions/detect";
import { discretionaryOutlook, type DailySpend } from "../lib/analytics/cashflow";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
const db = createClient(url, serviceRoleKey);

const wanted = process.argv[2];
const { data: listed, error: listError } = await db.auth.admin.listUsers();
if (listError) throw new Error(`Comptes illisibles : ${listError.message}`);

const candidates = wanted ? listed.users.filter((user) => user.email === wanted) : listed.users;
if (!candidates.length) throw new Error("Aucun compte correspondant.");

for (const user of candidates) {
  const rows: Array<{ merchant_name: string; amount_base: number | null; amount: number; currency: string; base_currency: string | null; transaction_date: string; category: string; pending: boolean }> = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("transactions")
      .select("merchant_name,amount_base,amount,currency,base_currency,transaction_date,category,pending")
      .eq("user_id", user.id)
      .order("transaction_date")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`Transactions illisibles : ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  if (rows.length < 30) continue;

  const recurring = new Set(detectSubscriptions(rows.map((row) => ({
    merchantName: row.merchant_name,
    amount: row.amount_base ?? row.amount,
    currency: row.base_currency ?? row.currency,
    transactionDate: row.transaction_date
  }))).map((item) => item.merchantName));

  const daily = new Map<string, number>();
  for (const row of rows) {
    const value = row.amount_base ?? row.amount;
    if (row.pending || value >= 0 || row.category === "Transfers" || recurring.has(row.merchant_name)) continue;
    const date = new Date(row.transaction_date);
    const key = `${date.toISOString().slice(0, 7)}|${date.getUTCDate()}`;
    daily.set(key, (daily.get(key) ?? 0) - value);
  }
  const spend: DailySpend[] = [...daily].map(([key, total]) => {
    const [month, day] = key.split("|");
    return { month: month!, day: Number(day), total };
  });

  const months = [...new Set(spend.map((row) => row.month))].sort();
  // Le mois en cours est incomplet : le tester reviendrait à comparer une prévision à une
  // réalité qui n'a pas fini d'arriver.
  const complete = months.slice(0, -1);
  const errors: Array<{ day: number; absolute: number; relative: number | null; covered: boolean }> = [];

  for (const month of complete) {
    const others = spend.filter((row) => row.month !== month);
    const inMonth = spend.filter((row) => row.month === month);
    for (const cut of [5, 10, 15, 20, 25]) {
      const actual = inMonth.filter((row) => row.day > cut).reduce((total, row) => total + row.total, 0);
      const predicted = discretionaryOutlook(others, month, cut);
      if (!predicted.monthsObserved) continue;
      const absolute = Math.abs(predicted.typical - actual);
      errors.push({
        day: cut,
        absolute,
        relative: actual > 0 ? absolute / actual : null,
        // La question qui décide de l'affichage : la bande contient-elle la réalité ? Une ligne
        // centrale fausse mais encadrée reste honnête ; une bande qui rate est un mensonge.
        covered: actual >= predicted.low && actual <= predicted.high
      });
    }
  }

  console.log(`\n${rows.length} transactions · ${months.length} mois · ${complete.length} mois complets · ${recurring.size} marchands récurrents écartés`);
  if (!errors.length) { console.log("Pas assez d'historique pour un contrôle."); continue; }

  console.log("\njour  cas   erreur médiane   erreur relative médiane   bande couvrante");
  for (const cut of [5, 10, 15, 20, 25]) {
    const slice = errors.filter((item) => item.day === cut);
    if (!slice.length) continue;
    const relatives = slice.map((item) => item.relative).filter((value): value is number => value !== null);
    console.log(
      `${String(cut).padStart(3)}  ${String(slice.length).padStart(4)}   ${median(slice.map((item) => item.absolute)).toFixed(2).padStart(9)} €   ${(relatives.length ? `${(median(relatives) * 100).toFixed(0)} %` : "—").padStart(21)}   ${(slice.filter((item) => item.covered).length / slice.length * 100).toFixed(0)} %`
    );
  }
  const relatives = errors.map((item) => item.relative).filter((value): value is number => value !== null);
  console.log(`\nglobal : ${median(errors.map((item) => item.absolute)).toFixed(2)} € d'erreur médiane, ${relatives.length ? `${(median(relatives) * 100).toFixed(0)} %` : "—"} en relatif, bande couvrante dans ${(errors.filter((item) => item.covered).length / errors.length * 100).toFixed(0)} % des cas`);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
