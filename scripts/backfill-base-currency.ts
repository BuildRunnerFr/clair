/**
 * One-off data migration: values every existing transaction in the user's reporting currency.
 *
 * Runs with the service role because it is a maintenance task over rows that already exist,
 * outside any user request — the same reason a schema migration does not go through RLS. It
 * only ever writes the conversion columns; `amount` and `currency` are never touched.
 *
 * Idempotent: only rows whose amount_base is still null are considered, so an interrupted run
 * is resumed simply by running it again.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-base-currency.ts <EUR> [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { FrankfurterFxProvider, type FxRate } from "@/lib/fx/fx-provider";
import { convertToBase, type FxRateStore } from "@/lib/fx/fx-converter";

const baseCurrency = (process.argv[2] ?? "EUR").toUpperCase();
const dryRun = process.argv.includes("--dry-run");
const PAGE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
if (!/^[A-Z]{3}$/.test(baseCurrency)) throw new Error(`Devise principale invalide: ${baseCurrency}`);

const admin = createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const provider = new FrankfurterFxProvider();

// The app's SupabaseFxRepository is marked "server-only", which is correct for app code and
// makes it unimportable from a plain Node script. Depending on the FxRateStore interface
// instead of that implementation is exactly what the seam is for.
const store: FxRateStore = {
  async findRates(base, requests) {
    if (!requests.length) return [];
    const { data, error } = await admin.from("fx_rates").select("rate_date,base_currency,quote_currency,rate")
      .eq("base_currency", base.toUpperCase())
      .in("quote_currency", [...new Set(requests.map((item) => item.quoteCurrency.toUpperCase()))])
      .in("rate_date", [...new Set(requests.map((item) => item.rateDate))]);
    if (error) throw new Error(`Lecture des taux: ${error.message}`);
    return data.map((row) => ({ rateDate: row.rate_date, baseCurrency: row.base_currency, quoteCurrency: row.quote_currency, rate: Number(row.rate) }));
  },
  async saveRates(rates: FxRate[]) {
    if (!rates.length) return;
    const { error } = await admin.from("fx_rates").upsert(
      rates.map((rate) => ({ rate_date: rate.rateDate, base_currency: rate.baseCurrency, quote_currency: rate.quoteCurrency, rate: rate.rate })),
      { onConflict: "rate_date,base_currency,quote_currency", ignoreDuplicates: true }
    );
    if (error) throw new Error(`Mise en cache des taux: ${error.message}`);
  }
};

type Row = { id: string; user_id: string; amount: number; currency: string; transaction_date: string };

async function loadPending(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from("transactions")
      .select("id,user_id,amount,currency,transaction_date")
      .is("amount_base", null)
      // Ordered by the primary key, not by date: hundreds of rows share a transaction_date,
      // and without a unique tiebreaker the order between pages is not guaranteed — rows get
      // read twice while others are never read at all.
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Lecture des transactions: ${error.message}`);
    rows.push(...(data as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function main() {
  const pending = await loadPending();
  console.log(`Devise principale : ${baseCurrency}`);
  console.log(`Transactions à convertir : ${pending.length}`);
  if (!pending.length) return;

  const pairs = new Set(pending.map((row) => `${row.currency.toUpperCase()} ${row.transaction_date.slice(0, 10)}`));
  console.log(`Couples (devise, jour) distincts : ${pairs.size} — c'est le nombre maximum d'appels au fournisseur de taux.`);

  const conversions = await convertToBase(
    pending.map((row) => ({ amount: Number(row.amount), currency: row.currency, date: row.transaction_date })),
    baseCurrency,
    provider,
    store
  );

  // Rows sharing a rate are updated together: about a hundred statements instead of 2570.
  const groups = new Map<string, { ids: string[]; amountBase: number[]; fxRate: number; fxRateDate: string }>();
  let unconverted = 0;
  const reasons = new Map<string, number>();
  conversions.forEach((conversion, index) => {
    const row = pending[index]!;
    if (conversion.amountBase === null || conversion.fxRate === null || conversion.fxRateDate === null) {
      unconverted++;
      reasons.set(conversion.error ?? "inconnue", (reasons.get(conversion.error ?? "inconnue") ?? 0) + 1);
      return;
    }
    const key = `${row.currency}|${conversion.fxRateDate}`;
    const group = groups.get(key) ?? { ids: [], amountBase: [], fxRate: conversion.fxRate, fxRateDate: conversion.fxRateDate };
    group.ids.push(row.id);
    group.amountBase.push(conversion.amountBase);
    groups.set(key, group);
  });

  console.log(`Convertibles : ${pending.length - unconverted} · sans taux : ${unconverted}`);
  for (const [reason, count] of reasons) console.log(`  · ${count} × ${reason}`);
  if (dryRun) return console.log("--dry-run : aucune écriture.");

  let written = 0;
  for (const group of groups.values()) {
    // amount_base differs per row, so each is written with its own value; the rate metadata
    // is shared within the group.
    for (let index = 0; index < group.ids.length; index++) {
      const { error } = await admin.from("transactions").update({
        amount_base: group.amountBase[index]!,
        base_currency: baseCurrency,
        fx_rate: group.fxRate,
        fx_rate_date: group.fxRateDate
      }).eq("id", group.ids[index]!);
      if (error) throw new Error(`Écriture de la conversion: ${error.message}`);
      written++;
      if (written % 250 === 0) console.log(`  ${written} lignes converties…`);
    }
  }

  const users = [...new Set(pending.map((row) => row.user_id))];
  for (const userId of users) {
    const { error } = await admin.from("user_settings").upsert({ user_id: userId, base_currency: baseCurrency, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(`Enregistrement de la devise principale: ${error.message}`);
  }
  console.log(`Terminé : ${written} transactions converties, devise principale ${baseCurrency} enregistrée pour ${users.length} utilisateur(s).`);
}

main().catch((error) => { console.error("Échec du backfill :", error); process.exit(1); });
