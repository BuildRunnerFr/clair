import { AccountWorkspace } from "@/components/account-workspace";
import { WelcomeWorkspace } from "@/components/welcome-workspace";
import { AssistantWorkspace } from "@/components/assistant-workspace";
import { notFound } from "next/navigation";
import { BudgetWorkspace } from "@/components/budget-workspace";
import { TransactionWorkspace } from "@/components/transaction-workspace";
import { SubscriptionsCard } from "@/components/subscriptions-card";
import type { Account, BudgetStatus, StoredTransaction } from "@/types/database";
export const metadata = { title: "Recette locale — Clair", robots: { index: false, follow: false } };
export default async function WorkspaceProbe({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<Record<string, string>> }) {
  // Aucune session contournée : cette route de fixtures n’existe pas en production.
  if (process.env.NODE_ENV !== "development" || process.env.ENABLE_MOCK_IMPORT !== "true") notFound();
  const { view } = await params;
  const query = await searchParams;
  const empty = query.empty === "1";
  const accounts: Account[] = [{ id: "00000000-0000-4000-8000-000000000001", userId: "fixture", provider: "mock", providerAccountId: "fixture", name: "Compte courant professionnel avec un nom très long", currency: "EUR", balanceCurrent: 1234, balanceAvailable: 1234, balanceOverdraft: null, balanceUpdatedAt: "2026-09-07", createdAt: "2026-01-01" }];
  const rows: BudgetStatus[] = [
    { budgetId: "00000000-0000-4000-8000-000000000002", category: "Groceries", currency: "EUR", monthlyLimit: 400, spent: 485.5, remaining: -85.5, percentageUsed: 121.375 },
    { budgetId: "00000000-0000-4000-8000-000000000003", category: "Housing", currency: "EUR", monthlyLimit: 1000, spent: 780, remaining: 220, percentageUsed: 78 },
    { budgetId: null, category: "Travel", currency: "EUR", monthlyLimit: null, spent: 1500, remaining: null, percentageUsed: null }
  ];
  const transactions: StoredTransaction[] = [-47.5, -20, -900.99, 2450, -10, -1234567.89].map((amount, index) => ({ id: `fixture-${index}`, userId: "fixture", accountId: accounts[0]!.id, providerTransactionId: `fixture-${index}`, merchantName: index === 5 ? "UN COMMERÇANT AVEC UN LIBELLÉ EXTRÊMEMENT LONG POUR VÉRIFIER LA LISIBILITÉ" : ["CARREFOUR", "STREAM", "LOYER", "SALAIRE", "UBER EATS"][index]!, description: "Libellé de banque complet — référence fictive", amount, currency: index === 1 ? "GBP" : "EUR", amountBase: index === 1 ? null : amount, baseCurrency: "EUR", category: index === 5 ? "Uncategorized" : "Groceries", subcategory: "Other", pending: index === 4, transactionDate: `2026-09-0${7 - index}T10:00:00Z` }));
  if (view === "compte") return <AccountWorkspace email="client.avec.une.adresse.longue@example.test" methods={["email", "google"]} profile={{ firstName: "Camille", lastName: "Martin", country: "FR", gender: null, birthDate: null }} connections={[]}/>;
  if (view === "bienvenue") return <WelcomeWorkspace email="client@example.test" profile={null}/>;
  if (view === "assistant") return <AssistantWorkspace email="client@example.test" conversations={[{ id: "00000000-0000-4000-8000-000000000001", title: "Explique-moi pourquoi mes prélèvements mensuels ont autant augmenté ce mois-ci" }, { id: "00000000-0000-4000-8000-000000000002", title: "Budget courses" }]}
    messages={empty ? [] : [
      { role: "user", content: "Où est-ce que j’ai trop dépensé le mois dernier ?" },
      { role: "assistant", content: "Août ressemble à vos autres mois : 1 513 € contre une médiane de 1 490 €, dans une étendue qui va de 1 240 à 2 180 €.\n\nUn poste dépasse nettement son habitude : les restaurants, à 248 € contre 190 € en moyenne, soit 58 € de plus. C’est du discrétionnaire, donc c’est là que se trouve la marge si vous en cherchez une. Le logement et les courses sont conformes.\n\nVoici les six plus grosses dépenses du mois." }
    ]}
    shown={empty ? null : { month: "2026-08", category: "Restaurants", transactions: [
      { id: "f1", date: "2026-08-23", merchant: "LE PETIT COIN", amount: 68.4, currency: "EUR", count: 1, category: "Restaurants" },
      { id: "f2", date: "2026-08-16", merchant: "TRATTORIA DELLA NONNA MARIA E FIGLI", amount: 54, currency: "EUR", count: 1, category: "Restaurants" },
      { id: "f3", date: "2026-08-09", merchant: "SUSHI SHOP", amount: 41.9, currency: "EUR", count: 1, category: "Restaurants" },
      { id: "f4", date: "2026-08-30", merchant: "BRASSERIE DU MARCHÉ", amount: 33.5, currency: "EUR", count: 1, category: "Restaurants" },
      { id: "f5", date: "2026-08-02", merchant: "UBER EATS", amount: 28.2, currency: "EUR", count: 3, category: "Restaurants" },
      { id: "f6", date: "2026-08-19", merchant: "CAFÉ DES SPORTS", amount: 22, currency: "EUR", count: 1, category: "Restaurants" }
    ] }}
    requested={null}/>;
  if (view === "budgets") return <BudgetWorkspace email="client@example.test" firstName="Client" month="2026-09" currency="EUR" rows={empty ? [] : rows} history={[{ category: "Travel", averageMonthly: 500, monthsCounted: 3 }]}/>;
  if (view === "transactions") return <TransactionWorkspace email="client@example.test" firstName="Client" filters={{}} transactions={empty ? [] : transactions} total={empty ? 0 : 106} baseCurrencyRow="EUR" accounts={accounts}/>;
  if (view === "abonnements") return <main className="shell"><h1>Récurrences de démonstration</h1><SubscriptionsCard baseCurrency="EUR" subscriptions={empty ? [] : [{ merchantName: "STREAM", currency: "EUR", latestAmount: 12, previousAmount: 10, averageAmount: 11, frequency: "monthly", lastTransactionDate: "2026-09-05" }, { merchantName: "SERVICE ANNUEL", currency: "GBP", latestAmount: 100, previousAmount: null, averageAmount: 100, frequency: "yearly", lastTransactionDate: "2026-08-01" }]}/></main>;
  notFound();
}
