-- Ce qui entre, décidé sur la structure et non sur une étiquette.
--
-- Les revenus s'obtenaient en additionnant les crédits dont la catégorie n'était pas
-- « Transfers ». Sur des données réelles, cela donnait zéro : les trente entrées d'argent d'un
-- compte portaient toutes un libellé commençant par « FROM », et le classement les rangeait
-- toutes en virement. Une allocation familiale, un salaire, un remboursement entre amis — tout
-- disparaissait du calcul.
--
-- Faire dépendre un montant d'une catégorie devinée était l'erreur. Un virement entre comptes
-- de l'utilisateur se reconnaît à sa forme, pas à son nom :
--
--   1. Il a une contrepartie. Le même montant part d'un autre compte du même utilisateur, à
--      quelques jours près. C'est la définition même, et elle ne se trompe jamais.
--   2. À défaut — l'autre compte n'est pas connecté —, le libellé porte le nom de
--      l'utilisateur lui-même. « FROM M JEAN DUPONT » n'est pas un revenu.
--
-- Tout le reste est un mouvement avec l'extérieur : allocation, salaire, remboursement, cadeau.
-- Cela entre dans les revenus, et c'est ce que l'utilisateur attend d'y trouver.
--
-- Les noms viennent du profil et sont transmis en paramètre : la base n'a pas à savoir comment
-- l'application les compose, et l'appelant peut passer plusieurs formes — « Prénom Nom » comme
-- « Nom Prénom ».
drop function if exists public.finance_month_flows(date, text, uuid);
drop function if exists public.finance_month_flows(date, text, uuid, text[]);

create function public.finance_month_flows(
  p_month date,
  p_currency text,
  p_account_id uuid default null,
  p_self_names text[] default '{}'
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
    select t.id, t.account_id, t.amount_base, t.merchant_name, t.description, t.transaction_date
    from public.transactions t cross join bounds b
    where t.user_id = (select auth.uid())
      and t.amount_base is not null and not t.pending
      and t.transaction_date >= b.month_start and t.transaction_date < b.month_end
      and (p_currency is null or t.currency = upper(p_currency))
      and (p_account_id is null or t.account_id = p_account_id)
  ), marked as (
    select
      s.amount_base,
      (
        -- Une contrepartie sur un autre compte du même utilisateur : même montant, sens opposé,
        -- à trois jours près. La fenêtre absorbe le délai d'exécution d'un virement.
        exists (
          select 1
          from public.transactions o
          where o.user_id = (select auth.uid())
            and o.account_id <> s.account_id
            and o.amount_base is not null
            and abs(o.amount_base + s.amount_base) < 0.01
            and o.transaction_date between s.transaction_date - interval '3 days'
                                       and s.transaction_date + interval '3 days'
        )
        -- Ou le nom de l'utilisateur dans le libellé : un compte à soi, ailleurs.
        or exists (
          select 1 from unnest(coalesce(p_self_names, '{}')) as self(name)
          where length(self.name) > 4
            and (upper(s.merchant_name) like '%' || upper(self.name) || '%'
              or upper(s.description) like '%' || upper(self.name) || '%')
        )
      ) as internal
    from scoped s
  )
  select
    coalesce(sum(amount_base) filter (where amount_base > 0 and not internal), 0)::numeric,
    coalesce(sum(-amount_base) filter (where amount_base < 0 and not internal), 0)::numeric,
    coalesce(sum(abs(amount_base)) filter (where internal), 0)::numeric
  from marked;
$$;

revoke execute on function public.finance_month_flows(date, text, uuid, text[]) from public, anon;
grant execute on function public.finance_month_flows(date, text, uuid, text[]) to authenticated;
