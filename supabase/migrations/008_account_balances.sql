-- Stores the account balance reported by the bank provider (TrueLayer exposes it via
-- /accounts/{id}/balance under the "balance" scope). Nullable: the mock provider and any
-- provider without balance support simply leave these empty, and a failed balance refresh
-- must never invalidate an otherwise successful transaction sync.
alter table public.accounts
  add column if not exists balance_current numeric(14, 2),
  add column if not exists balance_available numeric(14, 2),
  add column if not exists balance_updated_at timestamptz;

-- RLS is already enabled on public.accounts and its policies filter on user_id, so these
-- columns inherit the same per-user isolation. Grants are unchanged: authenticated users
-- keep select/insert/update/delete on their own rows only, anon still has nothing.
