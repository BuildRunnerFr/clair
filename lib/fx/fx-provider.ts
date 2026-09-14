import { z } from "zod";

export interface FxRate {
  rateDate: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
}

export interface FxProvider {
  readonly name: string;
  /** Rate to convert 1 unit of `from` into `to`, as published for `date` or the closest earlier publication. */
  getRate(from: string, to: string, date: string): Promise<FxRate>;
}

// Canonical host: api.frankfurter.app answers 301 towards this one, and depending on a
// permanent redirect for every rate lookup is a needless point of failure.
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1";
const TIMEOUT_MS = 8_000;

const responseSchema = z.object({
  amount: z.number(),
  base: z.string().length(3),
  // The publication actually used. The ECB publishes nothing on weekends and holidays, so
  // asking for a Sunday answers with the preceding Friday — and says so here.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.record(z.string(), z.number().positive())
});

/** European Central Bank reference rates, via Frankfurter: no key, no quota, historical by date. */
export class FrankfurterFxProvider implements FxProvider {
  readonly name = "ecb";
  constructor(private readonly http: typeof fetch = fetch) {}

  async getRate(from: string, to: string, date: string): Promise<FxRate> {
    const base = from.toUpperCase();
    const quote = to.toUpperCase();
    if (base === quote) return { rateDate: date, baseCurrency: base, quoteCurrency: quote, rate: 1 };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.http(`${FRANKFURTER_URL}/${date}?base=${base}&symbols=${quote}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Taux de change indisponible (${response.status}).`);
      const payload = responseSchema.parse(await response.json());
      const rate = payload.rates[quote];
      if (rate === undefined) throw new Error(`Le taux ${base}→${quote} n’est pas publié.`);
      return { rateDate: payload.date, baseCurrency: base, quoteCurrency: quote, rate };
    } finally {
      clearTimeout(timeout);
    }
  }
}
