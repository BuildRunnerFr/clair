-- Qui est l'utilisateur, au-delà de son adresse email.
--
-- Chaque champ répond à un usage, et c'est la condition pour le demander : une donnée
-- personnelle collectée « au cas où » est un manquement au principe de minimisation, pas une
-- précaution.
--
--   prénom, nom  — s'adresser à quelqu'un par son nom plutôt que par « Bonjour » ;
--   pays         — décider quelles banques lui proposer, la couverture étant nationale. C'est
--                  le seul champ dont l'absence dégrade réellement le service ;
--   naissance    — vérifier la majorité, qu'un service financier suppose ;
--   genre        — facultatif, et une position « ne se prononce pas » est proposée au même
--                  rang que les autres. Rien dans l'application n'en dépend.
--
-- Les trois derniers acceptent le vide. Un formulaire d'accueil qui bloque sur une case dont
-- personne ne voit l'utilité fait perdre l'utilisateur avant qu'il ait vu le produit.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text check (char_length(first_name) between 1 and 80),
  last_name text check (char_length(last_name) between 1 and 80),
  birth_date date check (birth_date > '1900-01-01' and birth_date < current_date),
  -- Une contrainte fermée plutôt qu'un texte libre : ce qui entre en base doit être ce que
  -- l'interface propose, quel que soit le formulaire qui l'écrit.
  gender text check (gender in ('female', 'male', 'other', 'undisclosed')),
  -- ISO 3166-1 alpha-2. Deux lettres majuscules, et la liste des pays couverts vit dans le
  -- code : elle change avec l'agrégateur, pas avec le schéma.
  country text check (country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "users select own profile" on public.user_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own profile" on public.user_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own profile" on public.user_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own profile" on public.user_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_profiles from anon;
grant select, insert, update, delete on public.user_profiles to authenticated;

create or replace function public.touch_user_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch on public.user_profiles;
create trigger user_profiles_touch before update on public.user_profiles
  for each row execute function public.touch_user_profile();
