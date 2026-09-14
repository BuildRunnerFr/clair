import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { FinanceTools } from "@/lib/ai/assistant/finance-tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
it("un appel du modèle prépare une proposition sans écrire dans les budgets", async () => {
  const from = vi.fn(() => { throw new Error("Aucune écriture autorisée"); });
  const rpc = vi.fn().mockResolvedValue({ data: "EUR", error: null });
  const onProposal = vi.fn();
  const tools = new FinanceTools({ from, rpc } as unknown as SupabaseClient<Database>, onProposal);
  expect(await tools.run("set_budget", { category: "Groceries", monthlyLimit: 250 })).toMatchObject({ saved: false, requiresConfirmation: true, category: "Groceries", monthlyLimit: 250, currency: "EUR" });
  expect(from).not.toHaveBeenCalled();
  expect(onProposal).toHaveBeenCalledWith({ type: "budget_proposal", proposal: { category: "Groceries", monthlyLimit: 250, currency: "EUR" } });
});
