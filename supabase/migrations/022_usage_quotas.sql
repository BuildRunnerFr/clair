-- Compteurs d'usage, pour borner ce que chaque compte peut dépenser.
--
-- Rien n'empêchait jusqu'ici un utilisateur d'interroger l'assistant en boucle ou de relancer
-- la catégorisation indéfiniment. Chaque appel est facturé à l'exploitant, pas à lui : le coût
-- variable était donc illimité et à sens unique.
--
-- Le compteur vit en base et non en mémoire : les fonctions serverless ne partagent rien, et un
-- compteur par instance se remettrait à zéro à chaque démarrage à froid — autant ne rien
-- compter. Postgres est déjà là, ce qui évite d'ajouter Redis pour trois entiers.

create table public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Ce qui est compté : « assistant », « categorization », « bank_sync ».
  resource text not null,
  -- Début de la fenêtre, en jours UTC. Une fenêtre glissante demanderait de garder chaque
  -- appel ; une fenêtre fixe tient en une ligne par jour et par ressource, et se comprend au
  -- premier coup d'œil : « vous avez utilisé 12 de vos 40 messages aujourd'hui ».
  window_start date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, resource, window_start)
);

alter table public.usage_counters enable row level security;

-- Lecture seule pour l'utilisateur : il peut voir sa consommation, jamais l'écrire. L'écriture
-- passe exclusivement par la fonction ci-dessous, qui décide et incrémente d'un seul geste.
create policy usage_counters_select_own on public.usage_counters
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.usage_counters from authenticated, anon;

/*
 * Consomme une unité de quota, et dit si elle était disponible.
 *
 * Décision et incrément dans la même instruction : deux requêtes simultanées ne peuvent pas
 * lire toutes deux « 39 sur 40 » et passer toutes deux. C'est exactement le défaut d'un
 * compteur lu puis écrit, et il se manifeste précisément quand on cherche à en abuser.
 *
 * security definer parce que l'utilisateur n'a pas le droit d'écrire dans la table — sinon il
 * pourrait remettre son propre compteur à zéro. La fonction ne touche jamais qu'à la ligne de
 * l'appelant, déterminée par auth.uid() et non par un argument.
 */
create or replace function public.consume_quota(p_resource text, p_limit integer)
returns table (allowed boolean, used integer, quota integer)
language plpgsql volatile security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_user uuid := (select auth.uid());
  v_used integer;
begin
  if v_user is null then
    raise exception 'Aucun utilisateur authentifié' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'Quota invalide' using errcode = '22023';
  end if;

  insert into public.usage_counters (user_id, resource, window_start, used, updated_at)
  values (v_user, p_resource, current_date, 1, now())
  on conflict (user_id, resource, window_start)
    -- Le refus ne consomme pas : au-delà de la limite le compteur cesse de monter, sans quoi
    -- une rafale de tentatives repousserait indéfiniment le retour à la normale.
    do update set used = case when public.usage_counters.used >= p_limit
                              then public.usage_counters.used
                              else public.usage_counters.used + 1 end,
                  updated_at = now()
  returning public.usage_counters.used into v_used;

  return query select v_used <= p_limit, v_used, p_limit;
end;
$$;

revoke execute on function public.consume_quota(text, integer) from public, anon;
grant execute on function public.consume_quota(text, integer) to authenticated;

-- Les compteurs des jours passés n'ont aucune valeur une fois la fenêtre close.
create index usage_counters_window_idx on public.usage_counters (window_start);
