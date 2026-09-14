import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ single: vi.fn(), merchant: vi.fn(), rule: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: calls.revalidate }));
vi.mock("@/lib/auth/user", () => ({ requireUser: async () => ({ user: { id: "u1" }, supabase: {} }) }));
vi.mock("@/lib/db/supabase-transaction-repository", () => ({ SupabaseTransactionRepository: class {
  updateTransactionClassification = calls.single;
  updateMerchantClassification = calls.merchant;
  upsertManualMerchantRule = calls.rule;
} }));
import { reclassifyFromTransactions } from "@/app/transactions/actions";
const form = (scope?: string) => {
  const data = new FormData();
  data.set("transactionId", "00000000-0000-4000-8000-000000000001");
  data.set("merchant", "SHOP"); data.set("classification", "Shopping|Other");
  data.set("returnTo", "/transactions?account=abc&status=booked");
  if (scope) data.set("scope", scope);
  return data;
};
beforeEach(() => { vi.clearAllMocks(); calls.single.mockResolvedValue(1); calls.merchant.mockResolvedValue(4); calls.rule.mockResolvedValue(undefined); });
describe("correction depuis une opération", () => {
  it("ne crée aucune règle globale par défaut", async () => {
    await expect(reclassifyFromTransactions(form())).rejects.toThrow("reclassified=1");
    expect(calls.single).toHaveBeenCalledWith("u1", "00000000-0000-4000-8000-000000000001", "Shopping", "Other");
    expect(calls.rule).not.toHaveBeenCalled(); expect(calls.merchant).not.toHaveBeenCalled();
    expect(calls.revalidate.mock.calls).toEqual([["/transactions"], ["/dashboard"], ["/budgets"]]);
  });
  it("applique une règle au commerçant seulement sur demande explicite", async () => {
    await expect(reclassifyFromTransactions(form("merchant"))).rejects.toThrow("reclassified=4");
    expect(calls.rule).toHaveBeenCalledOnce(); expect(calls.merchant).toHaveBeenCalledOnce(); expect(calls.single).not.toHaveBeenCalled();
  });
  it("ne présente pas un échec d’écriture comme une réussite", async () => {
    calls.single.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(reclassifyFromTransactions(form())).rejects.toThrow("error=save_failed");
    expect(calls.revalidate).not.toHaveBeenCalled();
  });
});

it("signale une opération introuvable plutôt que zéro correction réussie", async () => {
  calls.single.mockResolvedValueOnce(0);
  await expect(reclassifyFromTransactions(form())).rejects.toThrow("error=not_found");
});
