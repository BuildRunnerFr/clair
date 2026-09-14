create extension if not exists pgcrypto;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  name text not null,
  currency text not null check (char_length(currency) = 3),
  created_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider_transaction_id text not null,
  merchant_name text not null default '',
  description text not null default '',
  amount numeric(18, 6) not null,
  currency text not null check (char_length(currency) = 3),
  transaction_date timestamptz not null,
  category text not null default 'Uncategorized',
  subcategory text not null default 'Other',
  pending boolean not null default false,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id, provider_transaction_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  monthly_budget numeric(18, 2) check (monthly_budget is null or monthly_budget >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_pattern text not null,
  category text not null,
  subcategory text not null,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_pattern)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_name text not null,
  average_amount numeric(18, 6) not null check (average_amount >= 0),
  currency text not null check (char_length(currency) = 3),
  frequency text not null,
  last_transaction_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_name, currency)
);

create index accounts_user_id_idx on public.accounts (user_id);
create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index transactions_provider_id_idx on public.transactions (provider_transaction_id);
create index transactions_merchant_idx on public.transactions (user_id, merchant_name);
create index categories_user_id_idx on public.categories (user_id);
create index merchant_rules_user_id_idx on public.merchant_rules (user_id);
create index subscriptions_user_id_idx on public.subscriptions (user_id);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.categories enable row level security;
alter table public.merchant_rules enable row level security;
alter table public.subscriptions enable row level security;

revoke all on public.accounts, public.transactions, public.categories, public.merchant_rules, public.subscriptions from anon;
grant select, insert, update, delete on public.accounts, public.transactions, public.categories, public.merchant_rules, public.subscriptions to authenticated;

create policy "users select own accounts" on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own accounts" on public.accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own accounts" on public.accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own accounts" on public.accounts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users select own transactions" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own transactions" on public.transactions for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
);
create policy "users update own transactions" on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
);
create policy "users delete own transactions" on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users manage own categories" on public.categories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own merchant rules" on public.merchant_rules for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own subscriptions" on public.subscriptions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
