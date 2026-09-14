-- Conversations de l'assistant.
--
-- Le contenu est de la donnée personnelle au même titre qu'une transaction : une question
-- comme « combien j'ai dépensé chez mon psychiatre » en dit autant que la ligne bancaire
-- correspondante. Le RLS est donc posé exactement comme sur le reste, et l'insertion d'un
-- message vérifie que la conversation appartient bien à l'appelant — sans quoi un utilisateur
-- pourrait écrire dans le fil d'un autre en devinant un identifiant.

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists assistant_conversations_user_idx on public.assistant_conversations (user_id, updated_at desc);
create index if not exists assistant_messages_conversation_idx on public.assistant_messages (conversation_id, created_at);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

create policy "users select own conversations" on public.assistant_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own conversations" on public.assistant_conversations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own conversations" on public.assistant_conversations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own conversations" on public.assistant_conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users select own messages" on public.assistant_messages
  for select to authenticated using ((select auth.uid()) = user_id);
-- La double condition est volontaire : posséder le message ne suffit pas, la conversation
-- visée doit aussi être la sienne.
create policy "users insert own messages" on public.assistant_messages
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "users delete own messages" on public.assistant_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.assistant_conversations from anon;
revoke all on public.assistant_messages from anon;
grant select, insert, update, delete on public.assistant_conversations to authenticated;
grant select, insert, delete on public.assistant_messages to authenticated;
