import type { BankConnection } from "@/types/banking";
import type { BankProvider } from "./bank-provider";

export type IncrementalSyncPlan =
  | { mode: "cursor"; cursor: string | null }
  | { mode: "date_range"; from: Date; to: Date };

export function createIncrementalSyncPlan(connection: BankConnection, provider: BankProvider, now = new Date()): IncrementalSyncPlan {
  if (provider.getTransactionsIncremental) return { mode: "cursor", cursor: connection.syncCursor };
  const lastSync = connection.lastSyncedAt ? new Date(connection.lastSyncedAt) : new Date(now.getTime() - 90 * 86_400_000);
  const overlapStart = new Date(lastSync.getTime() - 3 * 86_400_000);
  return { mode: "date_range", from: overlapStart, to: now };
}
