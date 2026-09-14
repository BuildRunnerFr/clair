-- Dépenses mensuelles sur une fenêtre glissante.
--
-- « Est-ce que je dépense plus qu'avant » ne se répond bien ni par un pourcentage ni par deux
-- nombres : c'est une question de forme. finance_monthly_summary compare un mois au précédent,
-- ce qui suffit à une métrique mais pas à voir une tendance.
--
-- Les mois sans dépense sont renvoyés à zéro plutôt qu'omis : une série trouée déforme un
-- graphique, en rapprochant deux points éloignés dans le temps.
create or replace function public.finance_monthly_trend(p_months integer default 6)
returns table (month date, total_spent numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with months as (
    select generate_series(
      date_trunc('month', now()) - ((least(greatest(coalesce(p_months, 6), 2), 24) - 1) * interval '1 month'),
      date_trunc('month', now()),
      interval '1 month'
    )::date as month
  ),
  spending as (
    select date_trunc('month', t.transaction_date)::date as month, sum(-t.amount_base)::numeric as total
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.amount_base is not null and t.amount < 0 and not t.pending
      and t.transaction_date >= (select min(month) from months)
    group by 1
  )
  select m.month, coalesce(s.total, 0)::numeric
  from months m
  left join spending s on s.month = m.month
  order by m.month;
$$;

revoke execute on function public.finance_monthly_trend(integer) from public, anon;
grant execute on function public.finance_monthly_trend(integer) to authenticated;
