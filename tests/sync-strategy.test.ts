import { describe, expect, it } from "vitest";
import type { BankConnection } from "@/types/banking";
import type { BankProvider } from "@/lib/banking/bank-provider";
import { createIncrementalSyncPlan } from "@/lib/banking/sync-strategy";

const connection: BankConnection = { id: "c1", userId: "u1", provider: "mock", providerConnectionId: "external", displayName: null, status: "active", environment: "sandbox", accountCount: 1, lastError: null, syncCursor: "cursor-1", lastSyncedAt: "2026-08-20T00:00:00Z", authorizedAt: null, lastSyncDurationMs: null, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z" };
const baseProvider: BankProvider = { name: "mock", connect: async () => ({ connectionId: "c", status: "ready" }), getAccounts: async () => [], getTransactions: async () => [] };

describe("incremental bank sync strategy", () => {
  it("prefers a provider cursor when supported", () => {
    const provider = { ...baseProvider, getTransactionsIncremental: async () => ({ transactions: [], nextCursor: null, hasMore: false }) };
    expect(createIncrementalSyncPlan(connection, provider)).toEqual({ mode: "cursor", cursor: "cursor-1" });
  });
  it("uses a three-day overlap for date-range providers", () => {
    expect(createIncrementalSyncPlan(connection, baseProvider, new Date("2026-08-23T00:00:00Z"))).toEqual({ mode: "date_range", from: new Date("2026-08-17T00:00:00Z"), to: new Date("2026-08-23T00:00:00Z") });
  });
});
