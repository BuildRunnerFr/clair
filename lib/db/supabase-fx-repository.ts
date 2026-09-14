import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { FxRate } from "@/lib/fx/fx-provider";
import type { FxRateStore } from "@/lib/fx/fx-converter";

/**
 * Reference rates are shared, not user data. Reads go through the caller's session like
 * everything else — the table simply grants select to every authenticated user. Writes need
 * the admin client, because letting any user write here would let one poison the rates used
 * to value every other user's expenses. This is the only reason an admin client appears in a
 * repository, and it never touches a user-owned row.
 */
export class SupabaseFxRepository implements FxRateStore {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly adminClient?: SupabaseClient<Database>
  ) {}

  async findRates(baseCurrency: string, requests: Array<{ quoteCurrency: string; rateDate: string }>): Promise<FxRate[]> {
    if (!requests.length) return [];
    const dates = [...new Set(requests.map((item) => item.rateDate))];
    const currencies = [...new Set(requests.map((item) => item.quoteCurrency.toUpperCase()))];
    const { data, error } = await this.client.from("fx_rates").select("rate_date,base_currency,quote_currency,rate")
      .eq("base_currency", baseCurrency.toUpperCase())
      .in("quote_currency", currencies)
      .in("rate_date", dates);
    if (error) throw new Error(`Échec de lecture des taux de change: ${error.message}`);
    return data.map((row) => ({ rateDate: row.rate_date, baseCurrency: row.base_currency, quoteCurrency: row.quote_currency, rate: Number(row.rate) }));
  }

  async saveRates(rates: FxRate[]): Promise<void> {
    if (!rates.length || !this.adminClient) return;
    const { error } = await this.adminClient.from("fx_rates").upsert(
      rates.map((rate) => ({ rate_date: rate.rateDate, base_currency: rate.baseCurrency, quote_currency: rate.quoteCurrency, rate: rate.rate })),
      { onConflict: "rate_date,base_currency,quote_currency", ignoreDuplicates: true }
    );
    if (error) throw new Error(`Échec de mise en cache des taux de change: ${error.message}`);
  }
}

/**
 * The user's reporting currency. Defaults to the currency carrying the most transactions
 * rather than an arbitrary constant, so a first visit already reads sensibly.
 */
export class UserSettingsRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getBaseCurrency(userId: string): Promise<string | null> {
    const { data, error } = await this.client.from("user_settings").select("base_currency").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`Échec de lecture des réglages: ${error.message}`);
    return data?.base_currency ?? null;
  }

  async setBaseCurrency(userId: string, baseCurrency: string): Promise<void> {
    const { error } = await this.client.from("user_settings")
      .upsert({ user_id: userId, base_currency: baseCurrency.toUpperCase(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(`Échec d’enregistrement de la devise principale: ${error.message}`);
  }
}
