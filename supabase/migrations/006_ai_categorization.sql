begin;

alter table public.merchant_rules
  add column normalized_merchant text,
  add column source text not null default 'manual' check (source in ('manual', 'ai', 'default')),
  add column confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  add column updated_at timestamptz not null default now();

update public.merchant_rules
set normalized_merchant = upper(trim(regexp_replace(merchant_pattern, '[^[:alnum:]]+', ' ', 'g')));

alter table public.merchant_rules
  alter column normalized_merchant set not null;

alter table public.merchant_rules
  add constraint merchant_rules_user_normalized_unique unique (user_id, normalized_merchant);

alter table public.transactions
  add column category_source text check (category_source in ('default', 'rule', 'ai', 'manual', 'uncategorized')),
  add column category_confidence numeric(4, 3) check (category_confidence is null or category_confidence between 0 and 1),
  add column categorized_at timestamptz;

update public.transactions
set category_source = case when category = 'Uncategorized' then 'uncategorized' else 'default' end,
    categorized_at = case when category = 'Uncategorized' then null else updated_at end;

create index merchant_rules_user_source_idx
  on public.merchant_rules (user_id, source);
create index transactions_user_uncategorized_idx
  on public.transactions (user_id, transaction_date desc)
  where category = 'Uncategorized';

create trigger merchant_rules_set_updated_at
before update on public.merchant_rules
for each row execute function public.set_updated_at();

commit;
