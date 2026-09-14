"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CATEGORY_NAMES } from "@/lib/categories/taxonomy";
import { requireUser } from "@/lib/auth/user";
import { SupabaseAnalyticsRepository } from "@/lib/db/supabase-analytics-repository";

const budgetSchema = z.object({
  category: z.string().trim().refine(value => CATEGORY_NAMES.includes(value as typeof CATEGORY_NAMES[number]) && !["Income", "Transfers", "Uncategorized"].includes(value)),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  monthly_limit: z.coerce.number().positive().max(100_000_000),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
});

export async function saveBudget(formData: FormData) {
  const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/budgets?notice=invalid");
  const { user, supabase } = await requireUser();
  const repository = new SupabaseAnalyticsRepository(supabase);
  const currency = await repository.getBaseCurrency();
  if (parsed.data.currency !== currency) redirect("/budgets?notice=invalid");
  try { await repository.upsertBudget(user.id, parsed.data.category, currency, parsed.data.monthly_limit); }
  catch { redirect(`/budgets?month=${parsed.data.month}&notice=failed`); }
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect(`/budgets?month=${parsed.data.month}&notice=saved`);
}

export async function removeBudget(formData: FormData) {
  const parsed = z.object({ budget_id: z.string().uuid(), currency: z.string().regex(/^[A-Z]{3}$/), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/budgets?notice=invalid");
  const { user, supabase } = await requireUser();
  try { await new SupabaseAnalyticsRepository(supabase).deleteBudget(user.id, parsed.data.budget_id); }
  catch { redirect(`/budgets?month=${parsed.data.month}&notice=failed`); }
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect(`/budgets?month=${parsed.data.month}&notice=removed`);
}
