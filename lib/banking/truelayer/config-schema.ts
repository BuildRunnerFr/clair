import { z } from "zod";

/**
 * Pure validation, deliberately free of "server-only" so the live guardrails can actually be
 * tested. A guardrail nobody can write a test against is a comment, not a safeguard.
 */
export const LIVE_ACKNOWLEDGEMENT = "i-understand-this-reads-real-bank-accounts";

export const TRUELAYER_ENDPOINTS = {
  sandbox: {
    authorization: "https://auth.truelayer-sandbox.com/",
    token: "https://auth.truelayer-sandbox.com/connect/token",
    data: "https://api.truelayer-sandbox.com/data/v1"
  },
  live: {
    authorization: "https://auth.truelayer.com/",
    token: "https://auth.truelayer.com/connect/token",
    data: "https://api.truelayer.com/data/v1"
  }
} as const;

/**
 * L'environnement courant, sans valider toute la configuration : le tableau de bord doit
 * pouvoir savoir s'il tourne en live pour n'afficher que les connexions correspondantes,
 * même lorsque TrueLayer n'est pas configuré du tout.
 */
export function bankEnvironmentFrom(value: string | undefined): "sandbox" | "live" {
  return value?.trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export const truelayerConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
  acknowledgement: z.string().optional(),
  encryptionKey: z.string().optional(),
  providers: z.string().optional()
}).superRefine((value, ctx) => {
  if (value.environment !== "live") return;

  // Live is reachable, but never by flipping a single variable: a .env copied between
  // environments, or one typo, would otherwise be enough to start reading real accounts.
  if (value.acknowledgement !== LIVE_ACKNOWLEDGEMENT) {
    ctx.addIssue({ code: "custom", message: `TRUELAYER_ENV=live exige TRUELAYER_LIVE_CONFIRMED="${LIVE_ACKNOWLEDGEMENT}".` });
  }

  // An authorization code returned over plain HTTP is readable in transit, and that code is
  // exchangeable for a token granting access to real accounts.
  if (!value.redirectUri.startsWith("https://")) {
    ctx.addIssue({ code: "custom", message: "En live, TRUELAYER_REDIRECT_URI doit utiliser https." });
  }

  // Verified at configuration time rather than at first write: a missing or weak key must
  // stop the application at startup, not halfway through storing a token it cannot protect.
  const key = value.encryptionKey ? Buffer.from(value.encryptionKey, "base64") : null;
  if (!key || key.length !== 32) {
    ctx.addIssue({ code: "custom", message: "En live, BANK_TOKEN_ENCRYPTION_KEY doit être une clé de 32 octets encodée en base64." });
  } else if (key.every((byte) => byte === key[0])) {
    ctx.addIssue({ code: "custom", message: "La clé de chiffrement bancaire est une valeur de remplissage, pas une clé aléatoire." });
  }
});

export type TrueLayerConfigInput = z.input<typeof truelayerConfigSchema>;
export type TrueLayerConfig = z.infer<typeof truelayerConfigSchema> & {
  endpoints: (typeof TRUELAYER_ENDPOINTS)[keyof typeof TRUELAYER_ENDPOINTS];
};

export function buildTrueLayerConfig(input: TrueLayerConfigInput): TrueLayerConfig {
  const result = truelayerConfigSchema.safeParse(input);
  if (!result.success) {
    // Reasons are surfaced because these are configuration mistakes, not secrets — and a
    // silent "invalid configuration" is what makes a live migration painful to debug.
    throw new Error(`Configuration TrueLayer invalide : ${result.error.issues.map((issue) => issue.message).join(" · ")}`);
  }
  return { ...result.data, endpoints: TRUELAYER_ENDPOINTS[result.data.environment] };
}
