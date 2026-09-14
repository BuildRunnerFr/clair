-- Corrige finance_month_to_date : un mois sans dépense à la date de coupure est un zéro, non
-- une absence.
--
-- La version précédente groupait les dépenses par mois. Un mois où rien n'avait été dépensé du
-- 1er au N n'y produisait aucune ligne — indistinguable d'un mois que le relevé bancaire ne
-- couvre pas. L'appelant écartait donc les deux, et la comparaison perdait de vrais zéros : au
-- 3 septembre, juin n'avait rien dépensé du 1er au 3, la médiane s'en trouvait tirée vers le
-- haut et le mois en cours paraissait 80 % en dessous de l'ordinaire.
--
-- Les deux cas ne se distinguent qu'ici : « ce mois figure au relevé » se lit sur les
-- transactions, quelle que soit leur date dans le mois. On énumère donc les mois connus, puis on
-- y rattache la dépense arrêtée au jour voulu, zéro compris.
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
  ),
  -- Un mois figure au relevé dès qu'il porte une transaction, quel qu'en soit le jour ou le
  -- signe : c'est ce qui le rend comparable, même s'il n'y a rien été dépensé.
  known as (
    select distinct date_trunc('month', t.transaction_date)::date as month
    from public.transactions t, bounds b
    where t.user_id = (select auth.uid())
      and t.transaction_date >= b.earliest
      and t.transaction_date < b.target + interval '1 month'
  ),
  spending as (
    select date_trunc('month', t.transaction_date)::date as month, sum(-t.amount_base)::numeric as total
    from public.transactions t, bounds b
    where t.user_id = (select auth.uid())
      and t.amount_base is not null and t.amount < 0 and not t.pending
      and t.transaction_date >= b.earliest
      and t.transaction_date < b.target + interval '1 month'
      -- Le jour du mois, et non un nombre de jours écoulés : c'est ce qui rend février
      -- comparable à mars sans corriger de leur longueur.
      and extract(day from t.transaction_date) <= b.day_cut
    group by 1
  )
  select k.month, coalesce(s.total, 0)::numeric
  from known k
  left join spending s on s.month = k.month
  order by k.month;
$$;

revoke execute on function public.finance_month_to_date(date, integer, integer) from public, anon;
grant execute on function public.finance_month_to_date(date, integer, integer) to authenticated;
