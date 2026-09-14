import { categorySchema } from "@/lib/categories/taxonomy";
import type { Metadata } from "next";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { SupabaseAnalyticsRepository } from "@/lib/db/supabase-analytics-repository";
import { BudgetWorkspace } from "@/components/budget-workspace";
export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Budgets" };
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export default async function BudgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, supabase, profile } = await requireUser();
  const raw = await searchParams;
  const parsed = monthSchema.safeParse(raw.month);
  const month = parsed.success ? parsed.data : new Date().toISOString().slice(0, 7);
  const analytics = new SupabaseAnalyticsRepository(supabase);
  // Les limites et la RPC sont dans la devise du profil, pour toutes les devises d’origine.
  const [currency, rows, history, missingConversions] = await Promise.all([analytics.getBaseCurrency(), analytics.getBudgetStatus(month, null), analytics.getCategoryHistory(), analytics.getUnconvertedSpendingCount(user.id, month)]);
  const proposed = z.object({ proposalCategory: categorySchema.refine(value => !["Income", "Transfers", "Uncategorized"].includes(value)), proposalLimit: z.coerce.number().positive().max(100000000) }).safeParse(raw);
  const proposal = proposed.success ? { category: proposed.data.proposalCategory, amount: proposed.data.proposalLimit } : undefined;
  const notice = typeof raw.notice === "string" && ["saved", "removed", "invalid", "failed"].includes(raw.notice) ? raw.notice : undefined;
  return <BudgetWorkspace email={user.email ?? ""} firstName={profile?.firstName} month={month} currency={currency} rows={rows} history={history} notice={notice} missingConversions={missingConversions} proposal={proposal}/>;
}
