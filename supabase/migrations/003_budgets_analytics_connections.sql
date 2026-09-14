begin;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (char_length(trim(category)) between 1 and 100),
  currency text not null check (currency = upper(currency) and char_length(currency) = 3),
  monthly_limit numeric(18, 2) not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, currency)
);

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_connection_id text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'reauthorization_required', 'disabled', 'error')),
  sync_cursor text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_connection_id)
);

create index budgets_user_currency_idx on public.budgets (user_id, currency);
create index bank_connections_user_id_idx on public.bank_connections (user_id);
create index transactions_user_currency_date_idx on public.transactions (user_id, currency, transaction_date desc);
create index transactions_user_currency_category_date_idx on public.transactions (user_id, currency, category, transaction_date desc);

create trigger budgets_set_updated_at before update on public.budgets for each row execute function public.set_updated_at();
create trigger bank_connections_set_updated_at before update on public.bank_connections for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;
alter table public.bank_connections enable row level security;
revoke all on public.budgets, public.bank_connections from anon;
grant select, insert, update, delete on public.budgets, public.bank_connections to authenticated;

create policy "users select own budgets" on public.budgets for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own budgets" on public.budgets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own budgets" on public.budgets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own budgets" on public.budgets for delete to authenticated using ((select auth.uid()) = user_id);
create policy "users manage own bank connections" on public.bank_connections for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.finance_monthly_summary(
  p_month date,
  p_currency text,
  p_account_id uuid default null,
  p_category text default null
)
returns table (total_spent numeric, previous_month_spent numeric, change_percent numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with bounds as (
    select date_trunc('month', p_month::timestamp)::timestamptz as current_start,
           (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz as current_end,
           (date_trunc('month', p_month::timestamp) - interval '1 month')::timestamptz as previous_start
  ), totals as (
    select
      coalesce(sum(-t.amount) filter (where t.transaction_date >= b.current_start and t.transaction_date < b.current_end), 0) as current_total,
      coalesce(sum(-t.amount) filter (where t.transaction_date >= b.previous_start and t.transaction_date < b.current_start), 0) as previous_total
    from public.transactions t cross join bounds b
    where t.user_id = (select auth.uid()) and t.currency = upper(p_currency) and t.amount < 0 and not t.pending
      and (p_account_id is null or t.account_id = p_account_id)
      and (p_category is null or t.category = p_category)
  )
  select current_total, previous_total,
    case when previous_total = 0 then null else round(((current_total - previous_total) / previous_total) * 100, 2) end
  from totals;
$$;

create or replace function public.finance_spending_by_category(
  p_from timestamptz,
  p_to timestamptz,
  p_currency text,
  p_account_id uuid default null,
  p_category text default null
)
returns table (category text, total_spent numeric)
language sql stable security invoker set search_path = ''
as $$
  select t.category, sum(-t.amount)::numeric
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.currency = upper(p_currency) and t.amount < 0 and not t.pending
    and t.transaction_date >= p_from and t.transaction_date < p_to
    and (p_account_id is null or t.account_id = p_account_id)
    and (p_category is null or t.category = p_category)
  group by t.category order by sum(-t.amount) desc, t.category;
$$;

create or replace function public.finance_budget_status(p_month date, p_currency text)
returns table (budget_id uuid, category text, currency text, monthly_limit numeric, spent numeric, remaining numeric, percentage_used numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with bounds as (
    select date_trunc('month', p_month::timestamp)::timestamptz as month_start,
           (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz as month_end
  ), spending as (
    select t.category, sum(-t.amount)::numeric as spent
    from public.transactions t cross join bounds b
    where t.user_id = (select auth.uid()) and t.currency = upper(p_currency) and t.amount < 0 and not t.pending
      and t.transaction_date >= b.month_start and t.transaction_date < b.month_end
    group by t.category
  ), transaction_names as (
    select distinct t.category from public.transactions t
    where t.user_id = (select auth.uid()) and t.currency = upper(p_currency)
  ), names as (
    select tn.category from transaction_names tn
    union
    select b.category from public.budgets b where b.user_id = (select auth.uid()) and b.currency = upper(p_currency)
  )
  select b.id, n.category, upper(p_currency), b.monthly_limit, coalesce(s.spent, 0),
    case when b.monthly_limit is null then null else b.monthly_limit - coalesce(s.spent, 0) end,
    case when b.monthly_limit is null then null else round((coalesce(s.spent, 0) / b.monthly_limit) * 100, 2) end
  from names n
  left join spending s on s.category = n.category
  left join public.budgets b on b.user_id = (select auth.uid()) and b.currency = upper(p_currency) and b.category = n.category
  order by coalesce(s.spent, 0) desc, n.category;
$$;

create or replace function public.finance_top_merchants(
  p_month date,
  p_currency text,
  p_account_id uuid default null,
  p_category text default null,
  p_limit integer default 5
)
returns table (merchant_name text, total_spent numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  select t.merchant_name, sum(-t.amount)::numeric
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.currency = upper(p_currency) and t.amount < 0 and not t.pending
    and t.transaction_date >= date_trunc('month', p_month::timestamp)::timestamptz
    and t.transaction_date < (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz
    and (p_account_id is null or t.account_id = p_account_id)
    and (p_category is null or t.category = p_category)
  group by t.merchant_name order by sum(-t.amount) desc, t.merchant_name limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

create or replace function public.finance_spending_between(
  p_from timestamptz,
  p_to timestamptz,
  p_currency text,
  p_category text default null,
  p_account_id uuid default null
)
returns table (total_spent numeric)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(sum(-t.amount), 0)::numeric
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.currency = upper(p_currency) and t.amount < 0 and not t.pending
    and t.transaction_date >= p_from and t.transaction_date < p_to
    and (p_category is null or t.category = p_category)
    and (p_account_id is null or t.account_id = p_account_id);
$$;

create or replace function public.finance_recent_transactions(
  p_from timestamptz,
  p_to timestamptz,
  p_currency text,
  p_account_id uuid default null,
  p_category text default null,
  p_limit integer default 10
)
returns table (id uuid, account_id uuid, provider_transaction_id text, merchant_name text, description text, amount numeric, currency text, transaction_date timestamptz, category text, subcategory text, pending boolean)
language sql stable security invoker set search_path = ''
as $$
  select t.id, t.account_id, t.provider_transaction_id, t.merchant_name, t.description, t.amount, t.currency, t.transaction_date, t.category, t.subcategory, t.pending
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.currency = upper(p_currency)
    and t.transaction_date >= p_from and t.transaction_date < p_to
    and (p_account_id is null or t.account_id = p_account_id)
    and (p_category is null or t.category = p_category)
  order by t.transaction_date desc, t.id desc limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke execute on function public.finance_monthly_summary(date, text, uuid, text) from public, anon;
revoke execute on function public.finance_spending_by_category(timestamptz, timestamptz, text, uuid, text) from public, anon;
revoke execute on function public.finance_budget_status(date, text) from public, anon;
revoke execute on function public.finance_top_merchants(date, text, uuid, text, integer) from public, anon;
revoke execute on function public.finance_spending_between(timestamptz, timestamptz, text, text, uuid) from public, anon;
revoke execute on function public.finance_recent_transactions(timestamptz, timestamptz, text, uuid, text, integer) from public, anon;
grant execute on function public.finance_monthly_summary(date, text, uuid, text) to authenticated;
grant execute on function public.finance_spending_by_category(timestamptz, timestamptz, text, uuid, text) to authenticated;
grant execute on function public.finance_budget_status(date, text) to authenticated;
grant execute on function public.finance_top_merchants(date, text, uuid, text, integer) to authenticated;
grant execute on function public.finance_spending_between(timestamptz, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.finance_recent_transactions(timestamptz, timestamptz, text, uuid, text, integer) to authenticated;

commit;
