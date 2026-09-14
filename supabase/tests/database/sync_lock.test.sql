begin;
select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'lock-one@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'lock-two@example.test', '', now(), '{}', '{}', now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-0000-0000-000000000005';
insert into public.accounts (user_id, provider, provider_account_id, name, currency)
values ('50000000-0000-0000-0000-000000000005', 'mock', 'sgd-account', 'SGD', 'SGD');
insert into public.budgets (user_id, category, currency, monthly_limit)
values ('50000000-0000-0000-0000-000000000005', 'Transport', 'GBP', 500);
insert into public.bank_connections (id, user_id, provider, provider_connection_id)
values ('f0000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', 'truelayer', 'sandbox-lock');

select ok(public.bank_try_sync_lock('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 600), 'first lock succeeds');
select isnt(public.bank_try_sync_lock('f0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 600), true, 'concurrent lock is rejected');
select isnt(public.bank_release_sync_lock('f0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', true, 1, 10, null), true, 'wrong lock token cannot release');
select ok(public.bank_release_sync_lock('f0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', true, 1, 10, null), 'owner token releases lock');
select ok(public.bank_try_sync_lock('f0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 600), 'lock can be reacquired');
select is((select count(*) from public.finance_available_currencies() where currency = 'SGD'), 1::bigint, 'account currency is discovered');
select is((select count(*) from public.finance_available_currencies() where currency = 'GBP'), 1::bigint, 'budget-only currency is discovered');

select * from finish();
rollback;
