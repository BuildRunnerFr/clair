import "server-only";

import { bankEnvironmentFrom, buildTrueLayerConfig, TRUELAYER_ENDPOINTS, type TrueLayerConfig } from "./config-schema";

export type { TrueLayerConfig };
export { TRUELAYER_ENDPOINTS };

/** Reads the environment and delegates every rule to the testable schema. */
export function getTrueLayerConfig(): TrueLayerConfig {
  const environment = process.env.TRUELAYER_ENV?.trim();
  return buildTrueLayerConfig({
    clientId: process.env.TRUELAYER_CLIENT_ID,
    clientSecret: process.env.TRUELAYER_CLIENT_SECRET,
    redirectUri: process.env.TRUELAYER_REDIRECT_URI,
    environment,
    acknowledgement: process.env.TRUELAYER_LIVE_CONFIRMED?.trim(),
    encryptionKey: process.env.BANK_TOKEN_ENCRYPTION_KEY,
    // Sandbox pins the mock bank; live leaves this unset so TrueLayer shows its own picker,
    // which is where the user selects their actual bank.
    providers: process.env.TRUELAYER_PROVIDERS?.trim() || (environment === "live" ? undefined : "uk-cs-mock")
  } as Parameters<typeof buildTrueLayerConfig>[0]);
}

export function currentTrueLayerEnvironment() {
  return bankEnvironmentFrom(process.env.TRUELAYER_ENV);
}

export const TRUELAYER_SCOPES = ["info", "accounts", "balance", "transactions", "offline_access"] as const;
