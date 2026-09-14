/**
 * Preflight check for a production environment.
 *
 * Reads only the variables, never their values into the output: a misconfiguration report
 * that prints secrets is its own incident. Run it locally against a copy of the production
 * variables, or in a deployment step, before letting anyone connect a real bank.
 *
 *   npx tsx --env-file=.env.production.local scripts/check-production-config.ts
 */
import { buildTrueLayerConfig } from "@/lib/banking/truelayer/config-schema";

const problems: string[] = [];
const warnings: string[] = [];
const ok: string[] = [];

const env = (name: string) => process.env[name]?.trim() || undefined;

function required(name: string) {
  if (env(name)) { ok.push(`${name} présent`); return true; }
  problems.push(`${name} est absent.`);
  return false;
}

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY", "BANK_TOKEN_ENCRYPTION_KEY"]) {
  required(name);
}

const appUrl = env("NEXT_PUBLIC_APP_URL");
const redirectUri = env("TRUELAYER_REDIRECT_URI");
const environment = env("TRUELAYER_ENV");

// The magic link is built from NEXT_PUBLIC_APP_URL: pointing at localhost in production sends
// every user a link to their own machine.
if (appUrl && !appUrl.startsWith("https://")) {
  problems.push("NEXT_PUBLIC_APP_URL doit être en https en production — les liens de connexion en dépendent.");
} else if (appUrl?.includes("localhost")) {
  problems.push("NEXT_PUBLIC_APP_URL pointe encore sur localhost.");
}

if (env("ENABLE_MOCK_IMPORT") === "true") {
  warnings.push("ENABLE_MOCK_IMPORT=true : l’import de démonstration reste accessible en production.");
} else {
  ok.push("Import de démonstration désactivé");
}

if (appUrl && redirectUri) {
  try {
    if (new URL(appUrl).origin !== new URL(redirectUri).origin) {
      problems.push("TRUELAYER_REDIRECT_URI et NEXT_PUBLIC_APP_URL n’ont pas la même origine : le callback n’aboutira pas.");
    } else {
      ok.push("Callback TrueLayer sur la même origine que l’application");
    }
  } catch {
    problems.push("TRUELAYER_REDIRECT_URI ou NEXT_PUBLIC_APP_URL n’est pas une URL valide.");
  }
}

// Delegates to the very rules the application enforces at startup, so this check cannot drift
// from the real behaviour.
try {
  const config = buildTrueLayerConfig({
    clientId: env("TRUELAYER_CLIENT_ID"),
    clientSecret: env("TRUELAYER_CLIENT_SECRET"),
    redirectUri,
    environment,
    acknowledgement: env("TRUELAYER_LIVE_CONFIRMED"),
    encryptionKey: env("BANK_TOKEN_ENCRYPTION_KEY"),
    providers: env("TRUELAYER_PROVIDERS")
  } as Parameters<typeof buildTrueLayerConfig>[0]);
  ok.push(`TrueLayer configuré en ${config.environment} (${new URL(config.endpoints.data).host})`);
  if (config.environment === "live" && env("TRUELAYER_CLIENT_ID")?.startsWith("sandbox-")) {
    problems.push("TRUELAYER_ENV=live mais le client_id est un identifiant sandbox.");
  }
} catch (error) {
  problems.push(error instanceof Error ? error.message : "Configuration TrueLayer invalide.");
}

if (!env("OPENAI_API_KEY")) warnings.push("OPENAI_API_KEY absent : la catégorisation IA sera désactivée (les règles locales continuent).");

for (const line of ok) console.log(`  ok      ${line}`);
for (const line of warnings) console.log(`  attention ${line}`);
for (const line of problems) console.error(`  BLOQUANT  ${line}`);

console.log(`\n${ok.length} vérification(s) passée(s), ${warnings.length} avertissement(s), ${problems.length} bloquant(s).`);
if (problems.length) process.exit(1);
