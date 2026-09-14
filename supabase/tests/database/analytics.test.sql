begin;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'analytics-one@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'analytics-two@example.test', '', now(), '{}', '{}', now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
insert into public.accounts (id, user_id, provider, provider_account_id, name, currency) values
  ('c0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'mock', 'analytics_eur', 'EUR', 'EUR'),
  ('d0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'mock', 'analytics_myr', 'MYR', 'MYR');
insert into public.transactions (user_id, account_id, provider_transaction_id, merchant_name, amount, currency, transaction_date, category) values
  ('30000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'eur-current', 'CAFE', -80, 'EUR', '2026-08-10', 'Food'),
  ('30000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'eur-previous', 'CAFE', -40, 'EUR', '2026-07-10', 'Food'),
  ('30000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'myr-current', 'CAFE', -500, 'MYR', '2026-08-10', 'Food');
insert into public.budgets (user_id, category, currency, monthly_limit) values ('30000000-0000-0000-0000-000000000003', 'Food', 'EUR', 100);
insert into public.budgets (user_id, category, currency, monthly_limit) values ('30000000-0000-0000-0000-000000000003', 'Transport', 'MYR', 500);

select is((select total_spent from public.finance_monthly_summary('2026-08-01', 'EUR')), 80::numeric, 'monthly total is EUR only');
select is((select previous_month_spent from public.finance_monthly_summary('2026-08-01', 'EUR')), 40::numeric, 'previous month is computed');
select is((select total_spent from public.finance_monthly_summary('2026-08-01', 'MYR')), 500::numeric, 'MYR remains separate');
select is((select spent from public.finance_budget_status('2026-08-01', 'EUR') where category = 'Food'), 80::numeric, 'budget spending is calculated');
select is((select remaining from public.finance_budget_status('2026-08-01', 'EUR') where category = 'Food'), 20::numeric, 'budget remaining is calculated');
select is((select percentage_used from public.finance_budget_status('2026-08-01', 'EUR') where category = 'Food'), 80::numeric, 'budget percentage is calculated');
select is((select spent from public.finance_budget_status('2026-08-01', 'MYR') where category = 'Transport'), 0::numeric, 'budget without transaction has zero spending');
select is((select remaining from public.finance_budget_status('2026-08-01', 'MYR') where category = 'Transport'), 500::numeric, 'budget without transaction remains complete');
select is((select percentage_used from public.finance_budget_status('2026-08-01', 'MYR') where category = 'Transport'), 0::numeric, 'budget without transaction has zero percent used');
select throws_ok($$insert into public.budgets (user_id, category, currency, monthly_limit) values ('30000000-0000-0000-0000-000000000003', 'Transport', 'MYR', 700)$$, '23505', null, 'duplicate category and currency budget is rejected');

reset role;
insert into public.accounts (id, user_id, provider, provider_account_id, name, currency) values ('e0000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'mock', 'other_eur', 'EUR', 'EUR');
insert into public.transactions (user_id, account_id, provider_transaction_id, merchant_name, amount, currency, transaction_date, category) values ('40000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 'other-user', 'PRIVATE', -999, 'EUR', '2026-08-10', 'Food');
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
select is((select total_spent from public.finance_monthly_summary('2026-08-01', 'EUR')), 80::numeric, 'RPC isolates users');
select is((select count(*) from public.finance_top_merchants('2026-08-01', 'EUR') where merchant_name = 'PRIVATE'), 0::bigint, 'top merchants isolates users');

select * from finish();
rollback;
