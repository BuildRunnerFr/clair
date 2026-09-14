-- Foundations for a single reporting currency per user.
--
-- The original amount is never touched: `amount` / `currency` stay exactly what the bank
-- reported. The conversion is stored alongside it, frozen at the rate of the transaction
-- date, so a report produced today still reads the same next month. Recomputing from a
-- live rate would silently rewrite past totals every morning.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_currency text not null check (char_length(base_currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "users select own settings" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own settings" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own settings" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own settings" on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;

-- Shared reference data, deliberately NOT user-scoped: an ECB reference rate is a public
-- fact and holds nothing personal. It is readable by every authenticated user but writable
-- only by service_role — if any user could write here, one could poison the rates used to
-- value everyone else's expenses.
create table if not exists public.fx_rates (
  rate_date date not null,
  base_currency text not null check (char_length(base_currency) = 3),
  quote_currency text not null check (char_length(quote_currency) = 3),
  rate numeric(20, 10) not null check (rate > 0),
  source text not null default 'ecb',
  fetched_at timestamptz not null default now(),
  primary key (rate_date, base_currency, quote_currency)
);

alter table public.fx_rates enable row level security;

create policy "authenticated read fx rates" on public.fx_rates
  for select to authenticated using (true);

revoke all on public.fx_rates from anon;
revoke insert, update, delete on public.fx_rates from authenticated;
grant select on public.fx_rates to authenticated;

-- The conversion, denormalised onto the transaction so aggregation stays a plain sum and the
-- historical value never drifts. Nullable: a transaction already in the base currency needs
-- no conversion, and a missing rate must not block an import.
alter table public.transactions
  add column if not exists amount_base numeric(14, 2),
  add column if not exists base_currency text,
  add column if not exists fx_rate numeric(20, 10),
  -- The date of the rate actually applied. It can differ from transaction_date: the ECB
  -- publishes nothing on weekends and holidays, so the previous business day is used, and
  -- storing which one keeps the conversion auditable.
  add column if not exists fx_rate_date date;

create index if not exists transactions_user_base_date_idx
  on public.transactions (user_id, base_currency, transaction_date desc);
