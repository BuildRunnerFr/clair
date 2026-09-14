-- Mémorise qu'un utilisateur a vu la présentation d'accueil.
--
-- Une table à part plutôt qu'une colonne dans user_settings : celle-ci exige une devise
-- principale, qu'un compte tout neuf n'a précisément pas encore. Y loger le drapeau aurait
-- obligé à rendre la devise facultative, c'est-à-dire à affaiblir un invariant utilisé partout
-- ailleurs pour héberger une donnée qui n'a rien à voir.
--
-- L'absence de ligne vaut « jamais vue ». Pas de booléen : une date dit quand, ce qu'un booléen
-- ne dit pas, et la question « depuis quand les gens passent-ils l'accueil » se posera.
create table public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;

-- L'utilisateur écrit son propre drapeau : c'est lui qui ferme la présentation, et rien de
-- sensible ne s'y trouve. La suppression est permise pour qu'il puisse la revoir.
create policy user_onboarding_select_own on public.user_onboarding
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_onboarding_insert_own on public.user_onboarding
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_onboarding_delete_own on public.user_onboarding
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_onboarding from anon;
grant select, insert, delete on public.user_onboarding to authenticated;
