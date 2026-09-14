-- Deux réparations qui vont ensemble : savoir quand l'utilisateur s'est authentifié, et cesser
-- d'effacer l'état qui lui permet de recommencer.
--
-- **La date d'autorisation.** Les deux ans d'historique que la directive autorise ne sont
-- accessibles que pendant la fenêtre SCA — cinq à quarante-cinq minutes après l'authentification
-- selon la banque. Passé ce délai, demander davantage que 90 jours ne renvoie pas moins de
-- données : cela renvoie access_denied. Décider de la profondeur exige donc de savoir quand
-- l'autorisation a eu lieu, ce que la table ne conservait pas.
--
-- La colonne reste nulle pour les connexions existantes, et c'est le bon défaut : une date
-- d'autorisation inconnue est traitée comme une fenêtre fermée, donc 89 jours. On perd un
-- rattrapage d'historique ; on ne condamne pas une connexion valide.
alter table public.bank_connections
  add column if not exists authorized_at timestamptz;

-- **L'état effacé.** Une synchronisation qui échoue sur un consentement expiré marquait bien la
-- connexion « reauthorization_required » — puis la libération du verrou, exécutée juste après
-- dans le finally, la repassait sans condition à « error ».
--
-- Les deux états ne diffèrent pas seulement par leur nom : c'est « reauthorization_required » qui
-- fait afficher le bouton « Reconnecter » à la place de « Synchroniser ». En l'écrasant, on
-- laissait à l'utilisateur le seul bouton qui ne pouvait pas réussir, et on lui retirait celui
-- qui l'aurait sorti de là. Constaté en usage : la reconnexion demandée n'était pas offerte.
--
-- L'état de réautorisation survit donc désormais à la libération du verrou. Il ne se quitte que
-- par une autorisation réussie, qui repasse la connexion en « active ».
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
        status = case
          when p_success then 'active'
          when status = 'reauthorization_required' then 'reauthorization_required'
          else 'error'
        end,
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

revoke execute on function public.bank_release_sync_lock(uuid, uuid, boolean, integer, integer, text) from public, anon;
grant execute on function public.bank_release_sync_lock(uuid, uuid, boolean, integer, integer, text) to authenticated;

-- Les connexions déjà condamnées par le défaut ci-dessus retrouvent l'état qui leur rend le
-- bouton. Ciblé sur le message exact qu'écrivait la réautorisation, pour ne pas relever des
-- pannes ordinaires qui, elles, se réessaient.
update public.bank_connections
set status = 'reauthorization_required'
where status = 'error' and last_error like 'Le consentement bancaire%';
