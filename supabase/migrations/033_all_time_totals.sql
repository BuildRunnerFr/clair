-- Les totaux depuis le premier jour, par catégorie.
--
-- L'assistant ne savait répondre qu'à des questions bornées dans le temps : chacun de ses
-- agrégats exigeait un mois ou deux dates. « Combien de virements ai-je faits depuis la création
-- du compte ? » n'avait donc pas de réponse — et prié de couvrir tout l'historique, le modèle
-- inventait une plage plutôt que de l'omettre. La leçon est la même que pour l'affichage des
-- opérations : quand un paramètre se prête au malentendu, on le retire. Cette fonction n'en a
-- aucun.
--
-- Les crédits sont comptés à part des débits, et non soustraits. Un virement émis et un virement
-- reçu se compensent en solde mais ne se compensent pas en question : « combien j'ai envoyé »
-- et « combien j'ai reçu » sont deux choses, et une différence unique les rendrait toutes deux
-- illisibles.
--
-- Comme partout ailleurs, seules les opérations converties entrent dans les sommes : additionner
-- des livres et des euros produirait un nombre qui n'a pas d'unité. Le compte des opérations
-- écartées est rendu avec le reste, pour que l'incomplétude se voie au lieu de se deviner.
create or replace function public.finance_all_time_totals()
returns table (
  category text,
  spent numeric,
  received numeric,
  transactions integer,
  first_at timestamptz,
  last_at timestamptz,
  unconverted integer
)
language sql stable security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  select
    t.category,
    round(coalesce(sum(-t.amount_base) filter (where t.amount < 0 and t.amount_base is not null), 0), 2)::numeric,
    round(coalesce(sum(t.amount_base) filter (where t.amount > 0 and t.amount_base is not null), 0), 2)::numeric,
    count(*)::integer,
    min(t.transaction_date),
    max(t.transaction_date),
    count(*) filter (where t.amount_base is null)::integer
  from public.transactions t
  where t.user_id = (select auth.uid()) and not t.pending
  group by t.category
  order by 2 desc, t.category;
$$;

revoke execute on function public.finance_all_time_totals() from public, anon;
grant execute on function public.finance_all_time_totals() to authenticated;
