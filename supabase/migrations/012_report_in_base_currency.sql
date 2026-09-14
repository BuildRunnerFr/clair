-- Switches every spending aggregate onto the converted amount, so a total finally covers all
-- of a user's spending instead of one currency at a time.
--
-- p_currency changes meaning rather than disappearing: it is no longer "the currency to
-- report in" but "restrict to transactions originally in this currency", and null means all
-- of them. The reporting currency is no longer a parameter at all — it is read from the
-- user's settings, so a caller cannot ask for a total in a currency the amounts were never
-- converted into. Signatures are unchanged, which keeps these as replacements rather than
-- overloads sitting beside the old ones.
--
-- Rows whose conversion is missing are excluded from money aggregates. Counting them at their
-- face value would silently add pounds to euros — the exact defect this whole change removes.

create or replace function public.finance_base_currency()
returns text
language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select s.base_currency from public.user_settings s where s.user_id = (select auth.uid())),
    -- No setting yet: fall back to the currency carrying the most transactions, so a first
    -- visit reads sensibly instead of empty.
    (select t.currency from public.transactions t where t.user_id = (select auth.uid())
      group by t.currency order by count(*) desc, t.currency limit 1)
  );
$$;

revoke execute on function public.finance_base_currency() from public, anon;
grant execute on function public.finance_base_currency() to authenticated;

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
      coalesce(sum(-t.amount_base) filter (where t.transaction_date >= b.current_start and t.transaction_date < b.current_end), 0) as current_total,
      coalesce(sum(-t.amount_base) filter (where t.transaction_date >= b.previous_start and t.transaction_date < b.current_start), 0) as previous_total
    from public.transactions t cross join bounds b
    where t.user_id = (select auth.uid()) and t.amount_base is not null and t.amount < 0 and not t.pending
      and (p_currency is null or t.currency = upper(p_currency))
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
  select t.category, sum(-t.amount_base)::numeric
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.amount_base is not null and t.amount < 0 and not t.pending
    and t.transaction_date >= p_from and t.transaction_date < p_to
    and (p_currency is null or t.currency = upper(p_currency))
    and (p_account_id is null or t.account_id = p_account_id)
    and (p_category is null or t.category = p_category)
  group by t.category order by sum(-t.amount_base) desc, t.category;
$$;

create or replace function public.finance_budget_status(p_month date, p_currency text)
returns table (budget_id uuid, category text, currency text, monthly_limit numeric, spent numeric, remaining numeric, percentage_used numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with base as (select public.finance_base_currency() as code), bounds as (
    select date_trunc('month', p_month::timestamp)::timestamptz as month_start,
           (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz as month_end
  ), spending as (
    select t.category, sum(-t.amount_base)::numeric as spent
    from public.transactions t cross join bounds b
    where t.user_id = (select auth.uid()) and t.amount_base is not null and t.amount < 0 and not t.pending
      and t.transaction_date >= b.month_start and t.transaction_date < b.month_end
      and (p_currency is null or t.currency = upper(p_currency))
    group by t.category
  ), names as (
    select distinct t.category from public.transactions t where t.user_id = (select auth.uid())
    union
    -- Budgets are held in the reporting currency: a limit is a target for total spending,
    -- which is now expressed in one currency whatever the transactions were made in.
    select b.category from public.budgets b, base where b.user_id = (select auth.uid()) and b.currency = base.code
  )
  select b.id, n.category, base.code, b.monthly_limit, coalesce(s.spent, 0),
    case when b.monthly_limit is null then null else b.monthly_limit - coalesce(s.spent, 0) end,
    case when b.monthly_limit is null then null else round((coalesce(s.spent, 0) / b.monthly_limit) * 100, 2) end
  from names n
  cross join base
  left join spending s on s.category = n.category
  left join public.budgets b on b.user_id = (select auth.uid()) and b.currency = base.code and b.category = n.category
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
  select t.merchant_name, sum(-t.amount_base)::numeric
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.amount_base is not null and t.amount < 0 and not t.pending
    and t.transaction_date >= date_trunc('month', p_month::timestamp)::timestamptz
    and t.transaction_date < (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz
    and (p_currency is null or t.currency = upper(p_currency))
    and (p_account_id is null or t.account_id = p_account_id)
    and (p_category is null or t.category = p_category)
  group by t.merchant_name order by sum(-t.amount_base) desc, t.merchant_name limit least(greatest(coalesce(p_limit, 5), 1), 20);
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
  select coalesce(sum(-t.amount_base), 0)::numeric
  from public.transactions t
  where t.user_id = (select auth.uid()) and t.amount_base is not null and t.amount < 0 and not t.pending
    and t.transaction_date >= p_from and t.transaction_date < p_to
    and (p_currency is null or t.currency = upper(p_currency))
    and (p_category is null or t.category = p_category)
    and (p_account_id is null or t.account_id = p_account_id);
$$;

-- The output gains the converted amount beside the original, which changes the return type;
-- Postgres refuses to replace a function whose result columns differ, hence the drop.
drop function if exists public.finance_recent_transactions(timestamptz, timestamptz, text, uuid, text, integer);

create function public.finance_recent_transactions(
  p_from timestamptz,
  p_to timestamptz,
  p_currency text,
  p_account_id uuid default null,
  p_category text default null,
  p_limit integer default 10
)
returns table (id uuid, account_id uuid, provider_transaction_id text, merchant_name text, description text, amount numeric, currency text, amount_base numeric, base_currency text, transaction_date timestamptz, category text, subcategory text, pending boolean)
language sql stable security invoker set search_path = ''
as $$
  select t.id, t.account_id, t.provider_transaction_id, t.merchant_name, t.description, t.amount, t.currency,
    t.amount_base, coalesce(t.base_currency, public.finance_base_currency()),
    t.transaction_date, t.category, t.subcategory, t.pending
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.transaction_date >= p_from and t.transaction_date < p_to
    and (p_currency is null or t.currency = upper(p_currency))
    and (p_account_id is null or t.account_id = p_account_id)
    and (p_category is null or t.category = p_category)
  order by t.transaction_date desc, t.id desc limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke execute on function public.finance_recent_transactions(timestamptz, timestamptz, text, uuid, text, integer) from public, anon;
grant execute on function public.finance_recent_transactions(timestamptz, timestamptz, text, uuid, text, integer) to authenticated;
