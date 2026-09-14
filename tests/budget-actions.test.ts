import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: calls.revalidate }));
vi.mock("@/lib/auth/user", () => ({ requireUser: async () => ({ user: { id: "u1" }, supabase: {} }) }));
vi.mock("@/lib/db/supabase-analytics-repository", () => ({ SupabaseAnalyticsRepository: class {
  getBaseCurrency = async () => "EUR";
  upsertBudget = calls.save;
  deleteBudget = calls.remove;
} }));
import { saveBudget, removeBudget } from "@/app/budgets/actions";
const form = (values: Record<string, string | undefined> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ month: "2026-09", category: "Groceries", currency: "EUR", monthly_limit: "123.45", ...values })) if (value !== undefined) data.set(key, value);
  return data;
};
beforeEach(() => { vi.clearAllMocks(); calls.save.mockResolvedValue({}); calls.remove.mockResolvedValue(undefined); });
describe("actions de budget", () => {
  it("enregistre dans la devise de restitution et conserve le mois", async () => {
    await expect(saveBudget(form())).rejects.toThrow("/budgets?month=2026-09&notice=saved");
    expect(calls.save).toHaveBeenCalledWith("u1", "Groceries", "EUR", 123.45);
  });
  it.each([{ currency: "GBP" }, { monthly_limit: "NaN" }, { monthly_limit: "0" }, { category: "Income" }, { category: "Transfers" }])("refuse un budget incohérent %j", async values => {
    await expect(saveBudget(form(values))).rejects.toThrow("notice=invalid");
    expect(calls.save).not.toHaveBeenCalled();
  });
  it("affiche un retour exploitable en cas d’erreur de stockage", async () => {
    calls.save.mockRejectedValueOnce(new Error("unavailable"));
    await expect(saveBudget(form())).rejects.toThrow("notice=failed");
    expect(calls.revalidate).not.toHaveBeenCalled();
  });
  it("retire la limite pour le seul utilisateur courant", async () => {
    await expect(removeBudget(form({ budget_id: "00000000-0000-4000-8000-000000000001" }))).rejects.toThrow("notice=removed");
    expect(calls.remove).toHaveBeenCalledWith("u1", "00000000-0000-4000-8000-000000000001");
  });
});
