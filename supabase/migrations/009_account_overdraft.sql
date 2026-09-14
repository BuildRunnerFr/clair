-- TrueLayer's /accounts/{id}/balance also reports the arranged overdraft facility, which is
-- what explains an available balance higher than the current one. Storing it lets the UI
-- show why the two differ instead of leaving the gap unexplained.
alter table public.accounts
  add column if not exists balance_overdraft numeric(14, 2);
