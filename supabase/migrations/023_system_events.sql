-- Journal des incidents, pour les voir sans attendre qu'on les signale.
--
-- Ce qui casse ici casse rarement en levant une exception. Une synchronisation qui rend
-- « réautorisation requise » est un résultat parfaitement normal pour le code : rien n'est
-- attrapé, rien n'est alerté, et l'utilisateur voit simplement ses dépenses cesser de se mettre
-- à jour. Un capteur de plantages ne verrait jamais rien. Ce sont les issues métier qu'il faut
-- consigner, pas les piles d'appels.
--
-- En base et non dans les journaux de l'hébergeur : ceux-ci sont éphémères, non interrogeables,
-- et disparaissent avant qu'on pense à les lire. Ici on peut demander « quelles banques
-- échouent le plus » et obtenir une réponse.
create table public.system_events (
  id bigint generated always as identity primary key,
  -- Nul pour ce qui ne concerne personne en particulier, comme un passage de la tâche planifiée.
  user_id uuid references auth.users(id) on delete cascade,
  -- Ce qui s'est passé : « bank_sync_failed », « bank_reauthorization_required », etc.
  kind text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error')),
  -- Uniquement des codes, des compteurs et des durées. Jamais de libellé de transaction ni de
  -- nom : un journal se relit longtemps après, souvent par quelqu'un qui n'aurait pas dû lire.
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_events enable row level security;

-- L'utilisateur lit ce qui le concerne : c'est ainsi qu'il apprend que sa banque demande une
-- reconnexion. L'écriture reste à la clé de service — un journal qu'on peut modifier ne vaut rien.
create policy system_events_select_own on public.system_events
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.system_events from authenticated, anon;

create index system_events_recent_idx on public.system_events (created_at desc);
create index system_events_kind_idx on public.system_events (kind, created_at desc);
create index system_events_user_idx on public.system_events (user_id, created_at desc) where user_id is not null;
