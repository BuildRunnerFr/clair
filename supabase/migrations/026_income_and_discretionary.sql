-- Ce qui entre, et ce qui reste : les deux chiffres qui manquaient.
--
-- L'application ne montrait que les dépenses. Or une dépense ne se juge pas seule — mille euros
-- est un mois économe ou un mois ruineux selon ce qui est entré. Le rapport des deux est le
-- chiffre le plus parlant d'un budget, et le salaire était déjà en base : il était simplement
-- écarté par le `amount < 0` de tous les agrégats.
--
-- Les virements entre comptes de l'utilisateur sont exclus des deux côtés, et il faut que ce
-- soit des deux côtés. Un virement vers un livret ressort en crédit sur l'un et en débit sur
-- l'autre : compté à l'entrée seulement, il gonfle les revenus ; compté à la sortie seulement,
-- il fait passer pour dépensé de l'argent qui a été épargné. Exclu partout, l'épargne calculée
-- ici est juste.
--
-- Le total de dépenses de finance_monthly_summary, lui, ne change pas : c'est un chiffre affiché
-- depuis le début, et le déplacer en silence ferait douter de tous les autres. L'écart entre les
-- deux est donc énoncé à l'écran plutôt que subi — « hors virements internes ».
drop function if exists public.finance_month_flows(date, text, uuid);

create function public.finance_month_flows(
  p_month date,
  p_currency text,
  p_account_id uuid default null
)
returns table (income numeric, outflow numeric, transfers_excluded numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with bounds as (
    select date_trunc('month', p_month::timestamp)::timestamptz as month_start,
           (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz as month_end
  ), scoped as (
    select t.amount_base, t.category
    from public.transactions t cross join bounds b
    where t.user_id = (select auth.uid())
      and t.amount_base is not null and not t.pending
      and t.transaction_date >= b.month_start and t.transaction_date < b.month_end
      and (p_currency is null or t.currency = upper(p_currency))
      and (p_account_id is null or t.account_id = p_account_id)
  )
  select
    coalesce(sum(amount_base) filter (where amount_base > 0 and category <> 'Transfers'), 0)::numeric,
    coalesce(sum(-amount_base) filter (where amount_base < 0 and category <> 'Transfers'), 0)::numeric,
    coalesce(sum(abs(amount_base)) filter (where category = 'Transfers'), 0)::numeric
  from scoped;
$$;

revoke execute on function public.finance_month_flows(date, text, uuid) from public, anon;
grant execute on function public.finance_month_flows(date, text, uuid) to authenticated;

-- Les dépenses du quotidien, jour par jour, sur les mois passés.
--
-- C'est la seule part incertaine de la prévision de solde : les prélèvements récurrents sont
-- connus au montant et au jour près, le reste doit s'estimer. Plutôt que d'extrapoler le rythme
-- du mois en cours — ce qui donnait 89 % d'erreur médiane au dixième jour — on regarde ce qui a
-- réellement été dépensé sur la même fin de mois les mois précédents.
--
-- Les marchands récurrents sont exclus par la liste que l'application transmet : ce sont eux qui
-- forment les décrochements datés de la courbe, et les compter ici les compterait deux fois.
--
-- Les jours sans dépense ne produisent pas de ligne. L'appelant somme par mois, et un mois
-- entièrement absent ne compte simplement pas : il ne peut pas être distingué d'un mois que le
-- relevé ne couvre pas, et le supposer à zéro rendrait la prévision optimiste.
create or replace function public.finance_discretionary_by_day(
  p_months integer default 6,
  p_currency text default null,
  p_exclude text[] default '{}'
)
returns table (month text, day integer, total numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  select
    to_char(t.transaction_date, 'YYYY-MM'),
    extract(day from t.transaction_date)::integer,
    sum(-t.amount_base)::numeric
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.amount_base is not null and t.amount_base < 0 and not t.pending
    and t.category <> 'Transfers'
    and not (t.merchant_name = any(coalesce(p_exclude, '{}')))
    and (p_currency is null or t.currency = upper(p_currency))
    and t.transaction_date >= date_trunc('month', now()) - (least(greatest(coalesce(p_months, 6), 1), 24) * interval '1 month')
  group by 1, 2
  order by 1, 2;
$$;

revoke execute on function public.finance_discretionary_by_day(integer, text, text[]) from public, anon;
grant execute on function public.finance_discretionary_by_day(integer, text, text[]) to authenticated;
