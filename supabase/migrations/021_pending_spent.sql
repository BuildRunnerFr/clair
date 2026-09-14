-- Ajoute le montant en attente au résumé mensuel.
--
-- Le total exclut les transactions en attente, et c'est le bon choix : leur montant peut encore
-- changer, et certaines n'aboutissent jamais. Mais il l'excluait en silence. L'utilisateur qui
-- additionne ce que la liste lui montre obtient donc un autre nombre que le tableau de bord —
-- constaté : 105,93 € à la main contre 101,93 € affichés, soit deux prélèvements en attente.
--
-- Un écart inexpliqué sur un chiffre d'argent coûte plus cher qu'il n'y paraît : il fait douter
-- de tous les autres. Le montant en attente est donc renvoyé à côté du total, pour être dit.
-- Une colonne de plus au retour : Postgres refuse alors le create or replace, la fonction doit
-- être supprimée d'abord. La migration étant transactionnelle, elle n'est à aucun moment absente
-- pour l'application.
drop function if exists public.finance_monthly_summary(date, text, uuid, text);

create function public.finance_monthly_summary(
  p_month date,
  p_currency text,
  p_account_id uuid default null,
  p_category text default null
)
returns table (total_spent numeric, previous_month_spent numeric, change_percent numeric, pending_spent numeric)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with bounds as (
    select date_trunc('month', p_month::timestamp)::timestamptz as current_start,
           (date_trunc('month', p_month::timestamp) + interval '1 month')::timestamptz as current_end,
           (date_trunc('month', p_month::timestamp) - interval '1 month')::timestamptz as previous_start
  ), totals as (
    select
      coalesce(sum(-t.amount_base) filter (where not t.pending and t.transaction_date >= b.current_start and t.transaction_date < b.current_end), 0) as current_total,
      coalesce(sum(-t.amount_base) filter (where not t.pending and t.transaction_date >= b.previous_start and t.transaction_date < b.current_start), 0) as previous_total,
      coalesce(sum(-t.amount_base) filter (where t.pending and t.transaction_date >= b.current_start and t.transaction_date < b.current_end), 0) as pending_total
    from public.transactions t cross join bounds b
    where t.user_id = (select auth.uid()) and t.amount_base is not null and t.amount < 0
      and (p_currency is null or t.currency = upper(p_currency))
      and (p_account_id is null or t.account_id = p_account_id)
      and (p_category is null or t.category = p_category)
  )
  select current_total, previous_total,
    case when previous_total = 0 then null else round(((current_total - previous_total) / previous_total) * 100, 2) end,
    pending_total
  from totals;
$$;

revoke execute on function public.finance_monthly_summary(date, text, uuid, text) from public, anon;
grant execute on function public.finance_monthly_summary(date, text, uuid, text) to authenticated;
