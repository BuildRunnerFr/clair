-- Balance history, in two layers.
--
-- Layer A (available today): reconstruct the past from the current balance and the
-- transactions that followed it — balance(day) = current_balance - sum(amount after day).
-- It works immediately on existing transaction history, but drifts if transactions are missing.
--
-- Layer B (accurate, accumulates from now on): a snapshot written at every sync. It is empty
-- today, so nothing can be plotted from it yet; once enough points exist it becomes the
-- trustworthy source and the reconstruction is only needed before the first snapshot.

create table if not exists public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  currency text not null check (char_length(currency) = 3),
  balance_current numeric(14, 2) not null,
  balance_available numeric(14, 2),
  balance_overdraft numeric(14, 2),
  captured_at timestamptz not null default now(),
  -- One snapshot per account and per day: a sync run twice in a day updates the same row
  -- instead of inflating the series.
  captured_on date not null generated always as ((captured_at at time zone 'UTC')::date) stored,
  unique (account_id, captured_on)
);

create index if not exists account_balance_snapshots_user_captured_idx
  on public.account_balance_snapshots (user_id, captured_on desc);

alter table public.account_balance_snapshots enable row level security;

create policy "users select own balance snapshots" on public.account_balance_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own balance snapshots" on public.account_balance_snapshots
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );
create policy "users update own balance snapshots" on public.account_balance_snapshots
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own balance snapshots" on public.account_balance_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.account_balance_snapshots from anon;
grant select, insert, update, delete on public.account_balance_snapshots to authenticated;

-- Reconstructs the daily balance for one currency. Never mixes currencies, and takes no
-- user_id: like every other finance_* function it derives the caller from auth.uid().
create or replace function public.finance_balance_history(
  p_from timestamptz,
  p_to timestamptz,
  p_currency text,
  p_account_id uuid default null
)
returns table (day date, balance numeric, reconstructed boolean)
language sql stable security invoker set search_path = ''
as $$
  with current_total as (
    select coalesce(sum(a.balance_current), 0)::numeric as amount
    from public.accounts a
    where a.user_id = (select auth.uid())
      and a.currency = upper(p_currency)
      and a.balance_current is not null
      and (p_account_id is null or a.id = p_account_id)
  ),
  days as (
    select generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day')::date as day
  ),
  snapshots as (
    select s.captured_on, sum(s.balance_current)::numeric as amount
    from public.account_balance_snapshots s
    where s.user_id = (select auth.uid())
      and s.currency = upper(p_currency)
      and (p_account_id is null or s.account_id = p_account_id)
    group by s.captured_on
  )
  select
    d.day,
    -- A real snapshot always wins over the reconstruction.
    coalesce(
      (select amount from snapshots s where s.captured_on = d.day),
      (select amount from current_total) - coalesce((
        select sum(t.amount)
        from public.transactions t
        where t.user_id = (select auth.uid())
          and t.currency = upper(p_currency)
          and not t.pending
          and (p_account_id is null or t.account_id = p_account_id)
          and t.transaction_date >= (d.day + interval '1 day')
      ), 0)
    )::numeric as balance,
    not exists (select 1 from snapshots s where s.captured_on = d.day) as reconstructed
  from days d
  order by d.day;
$$;

revoke execute on function public.finance_balance_history(timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.finance_balance_history(timestamptz, timestamptz, text, uuid) to authenticated;
