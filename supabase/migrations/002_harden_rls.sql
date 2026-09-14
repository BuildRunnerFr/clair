-- 001_initial_schema.sql already creates the per-action policies and the anon/authenticated
-- grants directly (it was hardened in place). This migration is kept as a no-op for
-- environments where its history is already recorded, so the drops/grants below are
-- defensive idempotent statements only — no create policy here, since 001 already owns them.
drop policy if exists "users manage own accounts" on public.accounts;
drop policy if exists "users manage own transactions" on public.transactions;
drop policy if exists "users manage own categories" on public.categories;
drop policy if exists "users manage own merchant rules" on public.merchant_rules;
drop policy if exists "users manage own subscriptions" on public.subscriptions;

revoke all on public.accounts, public.transactions, public.categories, public.merchant_rules, public.subscriptions from anon;
grant select, insert, update, delete on public.accounts, public.transactions, public.categories, public.merchant_rules, public.subscriptions to authenticated;
