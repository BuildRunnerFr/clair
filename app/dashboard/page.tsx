import { currentLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/catalogue";
import type { Metadata } from "next";
import { z } from "zod";
import { cookies } from "next/headers";
import { Dashboard, EmptyDashboard } from "@/components/dashboard";
import { requireUser } from "@/lib/auth/user";
import { GuidedTour } from "@/components/guided-tour";
import { sampleAccounts, sampleIncomes, sampleSubscriptions, sampleSummary } from "@/lib/demo/sample-dashboard";
import { SupabaseTransactionRepository } from "@/lib/db/supabase-transaction-repository";
import { SupabaseAnalyticsRepository } from "@/lib/db/supabase-analytics-repository";
import { BankConnectionRepository } from "@/lib/db/bank-connection-repository";
import { SubscriptionRepository } from "@/lib/db/subscription-repository";
import { currentTrueLayerEnvironment } from "@/lib/banking/truelayer/config";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Tableau de bord" };

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  account: z.string().uuid().optional(),
  category: z.string().trim().max(100).optional()
});

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, supabase, profile } = await requireUser();
  // Le drapeau est lu ici et non dans le composant : une fenêtre modale qui apparaît après coup,
  // une fois la page peinte, se voit comme un défaut plutôt que comme un accueil.
  const { data: onboarded } = await supabase.from("user_onboarding").select("user_id").maybeSingle();
  const raw = await searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")));
  const now = new Date();
  const month = parsed.success && parsed.data.month ? parsed.data.month : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const transactionRepository = new SupabaseTransactionRepository(supabase);
  const analyticsRepository = new SupabaseAnalyticsRepository(supabase);
  const [accounts, anyTransaction, allConnections, availableCurrencies, cookieStore, subscriptions, incomes] = await Promise.all([transactionRepository.findAccounts(user.id), transactionRepository.getRecentTransactions(user.id, 1), new BankConnectionRepository(supabase).list(user.id), analyticsRepository.getAvailableCurrencies(), cookies(), new SubscriptionRepository(supabase).list(user.id), new SubscriptionRepository(supabase).list(user.id, "credit")]);
  // Une connexion créée en sandbox n'est pas une connexion à ta banque en live : l'afficher
  // ferait croire que tout est branché tout en privant du bouton pour connecter la vraie.
  const environment = currentTrueLayerEnvironment();
  const connections = allConnections.filter((connection) => connection.environment === environment);
  const bankNotice = buildBankNotice(raw, intlLocale(await currentLocale()));
  const bankError = typeof raw.bank_error === "string" ? raw.bank_error : undefined;
  // Un compte encore vide, jamais visité : on montre le tableau de bord garni de chiffres
  // d'exemple, le temps de la visite guidée. Décrire des cartes vides reviendrait à demander
  // d'imaginer ce qu'on décrit — exactement le travail qu'une visite doit épargner.
  if (!anyTransaction.length && !onboarded) {
    const demo = sampleSummary();
    return <>
      <GuidedTour />
      <Dashboard
        summary={demo}
        accounts={sampleAccounts()}
        categories={demo.byCategory.map((item) => item.name)}
        currencies={[demo.baseCurrency]}
        subscriptions={sampleSubscriptions()}
        incomes={sampleIncomes()}
        filters={{ month, currency: null }}
        email={user.email ?? "votre compte"}
        connections={connections}
        firstName={profile?.firstName ?? null}
        demoNotice
      />
    </>;
  }

  if (!anyTransaction.length) return <EmptyDashboard email={user.email ?? "votre compte"} firstName={profile?.firstName} connections={connections} bankNotice={bankNotice} bankError={bankError} demoAvailable={process.env.ENABLE_MOCK_IMPORT === "true"} />;
  // No currency selected means every transaction, valued in the reporting currency — the
  // default is now "everything" rather than one currency's slice of it.
  const requestedCurrency = parsed.success ? parsed.data.currency : undefined;
  const originCurrency = requestedCurrency && availableCurrencies.includes(requestedCurrency) ? requestedCurrency : null;
  const requestedAccount = parsed.success ? parsed.data.account : undefined;
  const account = requestedAccount && accounts.some((item) => item.id === requestedAccount && (originCurrency === null || item.currency === originCurrency)) ? requestedAccount : undefined;
  const category = parsed.success ? parsed.data.category : undefined;
  // Les marchands récurrents sont transmis pour être écartés du rythme quotidien : ils forment
  // les décrochements datés de la prévision, et les compter deux fois la fausserait.
  // Les deux ordres, parce qu'une banque écrit « M JEAN DUPONT » et une autre « DUPONT J ».
  const selfNames = profile?.firstName && profile.lastName
    ? [`${profile.firstName} ${profile.lastName}`, `${profile.lastName} ${profile.firstName}`]
    : [];
  const summary = await analyticsRepository.getDashboard(month, originCurrency, account, category, [...subscriptions, ...incomes].map((item) => item.merchantName), selfNames);
  const categories = [...new Set(summary.budgetStatus.map((item) => item.category))];
  return <Dashboard summary={summary} accounts={accounts} categories={categories} currencies={availableCurrencies} subscriptions={subscriptions} incomes={incomes} filters={{ month, currency: originCurrency, accountId: account, category }} email={user.email ?? "Compte connecté"} connections={connections} firstName={profile?.firstName ?? null} bankNotice={bankNotice} bankError={bankError} />;
}

function buildBankNotice(raw: Record<string, string | string[] | undefined>, locale: string): string | undefined {
  if (raw.bank === "connected") return "Connexion TrueLayer Sandbox enregistrée.";
  if (raw.bank !== "sync_ok") return undefined;
  const values = z.object({ accounts: z.coerce.number().int().nonnegative(), added: z.coerce.number().int().nonnegative(), updated: z.coerce.number().int().nonnegative(), errors: z.coerce.number().int().nonnegative(), duration_ms: z.coerce.number().int().nonnegative() }).safeParse(raw);
  if (!values.success) return "Synchronisation terminée.";
  const duration = (values.data.duration_ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 });
  return `${values.data.accounts} comptes synchronisés · ${values.data.added} transactions ajoutées · ${values.data.updated} mises à jour · ${values.data.errors} erreur · ${duration} s`;
}
