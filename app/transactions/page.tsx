import { redirect } from "next/navigation";
import { TransactionWorkspace } from "@/components/transaction-workspace";
import type { Metadata } from "next";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { SupabaseTransactionRepository } from "@/lib/db/supabase-transaction-repository";
import { SupabaseAnalyticsRepository } from "@/lib/db/supabase-analytics-repository";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Transactions" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const querySchema = z.object({
  status: z.enum(["booked", "pending"]).optional(),
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(60).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  page: z.coerce.number().int().min(1).max(200).optional(),
  account: z.string().uuid().optional(),
  reclassified: z.coerce.number().int().min(0).max(100000).optional(),
  error: z.string().trim().max(40).optional()
});

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, supabase, profile } = await requireUser();
  const raw = await searchParams;
  const cleaned: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(querySchema.shape)) {
    if (raw[key] === undefined || raw[key] === "") continue;
    const parsed = schema.safeParse(raw[key]);
    if (parsed.success) cleaned[key] = parsed.data;
  }
  const filters = querySchema.parse(cleaned);
  const page = filters.page ?? 1;

  // Le mois délimite une fenêtre plutôt qu'il ne filtre une colonne : les bornes se calculent
  // ici, la base compare simplement des dates.
  const from = filters.month ? `${filters.month}-01T00:00:00Z` : undefined;
  const to = filters.month ? new Date(Date.UTC(Number(filters.month.slice(0, 4)), Number(filters.month.slice(5, 7)), 1)).toISOString() : undefined;

  const repository = new SupabaseTransactionRepository(supabase);
  const [{ transactions, total }, baseCurrencyRow, accounts, totals] = await Promise.all([
    repository.searchTransactions(user.id, { query: filters.q, category: filters.category, account: filters.account, status: filters.status, from, to, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    new SupabaseAnalyticsRepository(supabase).getBaseCurrency(),
    repository.findAccounts(user.id),
    repository.searchTotals(user.id, { query: filters.q, category: filters.category, account: filters.account, status: filters.status, from, to })
  ]);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > lastPage) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && key !== "page") params.set(key, String(value));
    if (lastPage > 1) params.set("page", String(lastPage));
    redirect(`/transactions${params.size ? `?${params}` : ""}`);
  }
  return <TransactionWorkspace transactions={transactions} total={total} totals={totals} baseCurrencyRow={baseCurrencyRow} accounts={accounts} filters={filters} email={user.email ?? ""} firstName={profile?.firstName}/>;
}
