-- Permet à la tâche planifiée de prendre le verrou de synchronisation.
--
-- Constaté en production dès le premier passage : deux connexions examinées, deux échecs, en
-- 706 ms. Bien trop rapide pour de vraies synchronisations — la tâche échouait avant même
-- d'appeler la banque.
--
-- La cause : ces deux fonctions filtrent sur auth.uid(), qui est nul lorsqu'on les appelle avec
-- la clé de service. Le verrou n'était donc jamais obtenu, et chaque connexion repartait
-- aussitôt en « synchronisation déjà en cours ». Une vérification côté tables avait bien été
-- faite avant d'écrire la tâche, mais elle n'avait pas couvert les fonctions SQL.
--
-- Le filtre tolère désormais un auth.uid() nul. C'est sans risque ici, et pour une raison
-- précise : l'exécution de ces deux fonctions est révoquée pour anon et accordée aux seuls
-- utilisateurs authentifiés. Un appelant sans identité ne peut donc être que la clé de service,
-- qui agit pour le compte d'un utilisateur déjà résolu — la tâche a lu la connexion et son
-- propriétaire avant d'arriver ici.
--
-- Pour un utilisateur authentifié, rien ne change : auth.uid() n'est pas nul, le filtre
-- s'applique, et la RLS de bank_connections s'applique par-dessus puisque les fonctions restent
-- en security invoker.

create or replace function public.bank_try_sync_lock(p_connection_id uuid, p_lock_id uuid, p_ttl_seconds integer default 600)
returns boolean
language sql volatile security invoker set search_path = ''
as $$
  with locked as (
    update public.bank_connections
    set sync_lock_id = p_lock_id,
        sync_locked_until = now() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 1800))
    where id = p_connection_id
      and ((select auth.uid()) is null or user_id = (select auth.uid()))
      and (sync_lock_id is null or sync_locked_until < now())
    returning 1
  )
  select exists(select 1 from locked);
$$;

create or replace function public.bank_release_sync_lock(
  p_connection_id uuid,
  p_lock_id uuid,
  p_success boolean,
  p_account_count integer,
  p_duration_ms integer,
  p_error text default null
)
returns boolean
language sql volatile security invoker set search_path = ''
as $$
  with released as (
    update public.bank_connections
    set sync_lock_id = null,
        sync_locked_until = null,
        status = case when p_success then 'active' else 'error' end,
        account_count = case when p_success then greatest(p_account_count, 0) else account_count end,
        last_synced_at = case when p_success then now() else last_synced_at end,
        last_sync_duration_ms = greatest(p_duration_ms, 0),
        last_error = case when p_success then null else left(coalesce(p_error, 'La synchronisation a échoué.'), 180) end
    where id = p_connection_id
      and ((select auth.uid()) is null or user_id = (select auth.uid()))
      -- Le jeton de verrou reste exigé : il garantit qu'on ne libère que le verrou qu'on a pris,
      -- et non celui d'une synchronisation concurrente qui vient de commencer.
      and sync_lock_id = p_lock_id
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke execute on function public.bank_try_sync_lock(uuid, uuid, integer) from public, anon;
revoke execute on function public.bank_release_sync_lock(uuid, uuid, boolean, integer, integer, text) from public, anon;
grant execute on function public.bank_try_sync_lock(uuid, uuid, integer) to authenticated;
grant execute on function public.bank_release_sync_lock(uuid, uuid, boolean, integer, integer, text) to authenticated;
