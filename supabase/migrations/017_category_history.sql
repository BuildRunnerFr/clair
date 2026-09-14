-- Dépense mensuelle moyenne par catégorie, sur les mois révolus.
--
-- Sert à fixer une limite en connaissance de cause : « 200 € pour Restaurants » ne veut rien
-- dire tant qu'on ignore qu'on y dépense 244 € par mois depuis trois mois. C'est un constat sur
-- le passé, pas une prévision — mesuré sur les données réelles, aucune extrapolation du mois en
-- cours n'était assez fiable pour être affichée (voir lib/analytics/budget-alerts.ts).
--
-- Le mois en cours est exclu : partiel par définition, il tirerait toute moyenne vers le bas et
-- ferait paraître réaliste une limite qui ne l'est pas.
--
-- La moyenne porte sur les mois où la catégorie a effectivement une dépense. Compter un mois
-- sans aucune transaction du poste diviserait la moyenne par le silence — or l'absence tient
-- souvent à un historique bancaire qui ne remonte pas si loin, non à un mois sans dépense.
create or replace function public.finance_category_history(p_months integer default 6)
returns table (category text, average_monthly numeric, months_counted integer)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with bounds as (
    select date_trunc('month', now()) as current_month,
           date_trunc('month', now()) - (least(greatest(coalesce(p_months, 6), 1), 24) * interval '1 month') as earliest
  ),
  monthly as (
    select t.category, date_trunc('month', t.transaction_date) as month, sum(-t.amount_base)::numeric as total
    from public.transactions t, bounds b
    where t.user_id = (select auth.uid())
      and t.amount_base is not null and t.amount < 0 and not t.pending
      and t.transaction_date >= b.earliest and t.transaction_date < b.current_month
    group by 1, 2
    having sum(-t.amount_base) > 0
  )
  select m.category, round(avg(m.total), 2)::numeric, count(*)::integer
  from monthly m
  group by m.category
  order by 2 desc;
$$;

revoke execute on function public.finance_category_history(integer) from public, anon;
grant execute on function public.finance_category_history(integer) to authenticated;
