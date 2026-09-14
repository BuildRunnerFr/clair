import type { BankAccount, BankBalance, BankConnectionResult, BankTransaction, BankTransactionPage } from "@/types/banking";

export interface BankProvider {
  readonly name: string;
  connect(userId: string): Promise<BankConnectionResult>;
  getAccounts(connectionId: string): Promise<BankAccount[]>;
  getBalances?(accountIds: string[]): Promise<BankBalance[]>;
  getTransactions(connectionId: string, from: Date, to: Date): Promise<BankTransaction[]>;
  getTransactionsIncremental?(connectionId: string, cursor: string | null): Promise<BankTransactionPage>;
}

/**
 * The bank refused our credentials rather than failing to answer.
 *
 * The distinction matters because the two demand opposite responses: a network fault or a
 * 500 should be retried, while a withdrawn or expired consent will fail identically forever
 * until the user re-authorises. Carrying it as a plain Error made an expired consent look
 * like an outage, so the interface offered a retry that could never succeed.
 */
export class BankAuthorizationError extends Error {
  readonly reauthorizationRequired = true;
  constructor(message: string, readonly cause?: { status?: number; operation?: string }) {
    super(message);
    this.name = "BankAuthorizationError";
  }
}

export function isBankAuthorizationError(error: unknown): error is BankAuthorizationError {
  return error instanceof BankAuthorizationError;
}
