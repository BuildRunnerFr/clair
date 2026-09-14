"use server";

import { revalidatePath } from "next/cache";
import { MockBankProvider } from "@/lib/banking/mock-bank-provider";
import { syncTransactions } from "@/lib/banking/sync-transactions";
import { SupabaseTransactionRepository } from "@/lib/db/supabase-transaction-repository";
import { requireUser } from "@/lib/auth/user";
import { createSyncConverter } from "@/lib/fx/sync-converter";

export async function importDemoData() {
  if (process.env.ENABLE_MOCK_IMPORT !== "true") throw new Error("L’import de démonstration est désactivé.");
  const { user, supabase } = await requireUser();
  const provider = new MockBankProvider();
  const connection = await provider.connect(user.id);
  const repository = new SupabaseTransactionRepository(supabase);
  await syncTransactions(user.id, connection.connectionId, provider, repository, {
    from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-08-31T23:59:59Z")
  }, undefined, await createSyncConverter(supabase, user.id));
  revalidatePath("/dashboard");
}
