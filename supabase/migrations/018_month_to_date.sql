-- Dépenses cumulées à date égale, mois par mois.
--
-- « Est-ce que je dépense plus que d'habitude » ne se répond pas en comparant un mois entamé à
-- des mois entiers : au 3 du mois, tout mois en cours paraît exemplaire. La comparaison n'a de
-- sens qu'à date égale — le cumul du 1er au N du mois, contre le cumul du 1er au N des mois
-- passés. Aucune extrapolation n'intervient : les deux termes sont des dépenses constatées.
--
-- Le mois demandé est inclus dans le résultat, pour que l'appelant compare sans avoir à
-- recalculer son propre cumul selon une autre règle que celle-ci.
create or replace function public.finance_month_to_date(p_month date, p_day integer, p_months integer default 6)
returns table (month date, total numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with bounds as (
    select date_trunc('month', p_month) as target,
           date_trunc('month', p_month) - (least(greatest(coalesce(p_months, 6), 1), 24) * interval '1 month') as earliest,
           least(greatest(coalesce(p_day, 31), 1), 31) as day_cut
  )
  select date_trunc('month', t.transaction_date)::date, sum(-t.amount_base)::numeric
  from public.transactions t, bounds b
  where t.user_id = (select auth.uid())
    and t.amount_base is not null and t.amount < 0 and not t.pending
    and t.transaction_date >= b.earliest
    and t.transaction_date < b.target + interval '1 month'
    -- Le jour du mois, et non un nombre de jours écoulés : c'est ce qui rend février
    -- comparable à mars sans corriger de leur longueur.
    and extract(day from t.transaction_date) <= b.day_cut
  group by 1
  order by 1;
$$;

revoke execute on function public.finance_month_to_date(date, integer, integer) from public, anon;
grant execute on function public.finance_month_to_date(date, integer, integer) to authenticated;
