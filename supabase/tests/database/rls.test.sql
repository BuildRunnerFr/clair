begin;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'one@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'two@example.test', '', now(), '{}', '{}', now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select lives_ok($$insert into public.accounts (id, user_id, provider, provider_account_id, name, currency) values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'mock', 'mock_eur', 'EUR', 'EUR')$$, 'user can insert own account');
select throws_ok($$insert into public.accounts (user_id, provider, provider_account_id, name, currency) values ('20000000-0000-0000-0000-000000000002', 'mock', 'forbidden', 'Forbidden', 'EUR')$$, '42501', null, 'user cannot insert another user account');

reset role;
insert into public.accounts (id, user_id, provider, provider_account_id, name, currency) values ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'mock', 'mock_myr', 'MYR', 'MYR');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select is((select count(*) from public.accounts), 1::bigint, 'user sees only own account');
select throws_ok($$insert into public.transactions (user_id, account_id, provider_transaction_id, amount, currency, transaction_date) values ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'cross-account', -1, 'MYR', now())$$, '42501', null, 'user cannot attach transaction to another user account');
select lives_ok($$insert into public.transactions (user_id, account_id, provider_transaction_id, amount, currency, transaction_date) values ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'own-transaction', -1, 'EUR', now())$$, 'user can insert transaction on own account');

select * from finish();
rollback;
