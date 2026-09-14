begin;

alter table public.bank_connections
  add column environment text not null default 'sandbox' check (environment = 'sandbox'),
  add column account_count integer not null default 0 check (account_count >= 0),
  add column last_error text;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.bank_connection_secrets (
  connection_id uuid primary key references public.bank_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table private.bank_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'truelayer'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index bank_connections_user_provider_idx on public.bank_connections (user_id, provider, environment);
create index bank_oauth_states_expiry_idx on private.bank_oauth_states (expires_at) where consumed_at is null;

revoke all on private.bank_connection_secrets, private.bank_oauth_states from public, anon, authenticated;

comment on table private.bank_connection_secrets is 'Sandbox-only encrypted TrueLayer tokens. Private schema; replace with a managed vault before Live.';
comment on table private.bank_oauth_states is 'Hashed, short-lived, one-time OAuth state values. Raw state is never stored.';

create function public.bank_create_oauth_state(p_state_hash text, p_user_id uuid, p_expires_at timestamptz)
returns void language sql volatile security definer set search_path = '' as $$
  insert into private.bank_oauth_states (state_hash, user_id, provider, expires_at) values (p_state_hash, p_user_id, 'truelayer', p_expires_at);
$$;

create function public.bank_consume_oauth_state(p_state_hash text, p_user_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  with consumed as (
    update private.bank_oauth_states set consumed_at = now()
    where state_hash = p_state_hash and user_id = p_user_id and provider = 'truelayer' and consumed_at is null and expires_at > now()
    returning 1
  ) select exists(select 1 from consumed);
$$;

create function public.bank_save_connection_secret(p_connection_id uuid, p_access_token_ciphertext text, p_refresh_token_ciphertext text, p_access_token_expires_at timestamptz)
returns void language sql volatile security definer set search_path = '' as $$
  insert into private.bank_connection_secrets (connection_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at, updated_at)
  values (p_connection_id, p_access_token_ciphertext, p_refresh_token_ciphertext, p_access_token_expires_at, now())
  on conflict (connection_id) do update set access_token_ciphertext = excluded.access_token_ciphertext, refresh_token_ciphertext = excluded.refresh_token_ciphertext, access_token_expires_at = excluded.access_token_expires_at, updated_at = now();
$$;

create function public.bank_get_connection_secret(p_connection_id uuid)
returns table (access_token_ciphertext text, refresh_token_ciphertext text, access_token_expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.access_token_ciphertext, s.refresh_token_ciphertext, s.access_token_expires_at from private.bank_connection_secrets s where s.connection_id = p_connection_id;
$$;

revoke execute on function public.bank_create_oauth_state(text, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.bank_consume_oauth_state(text, uuid) from public, anon, authenticated;
revoke execute on function public.bank_save_connection_secret(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.bank_get_connection_secret(uuid) from public, anon, authenticated;
grant execute on function public.bank_create_oauth_state(text, uuid, timestamptz) to service_role;
grant execute on function public.bank_consume_oauth_state(text, uuid) to service_role;
grant execute on function public.bank_save_connection_secret(uuid, text, text, timestamptz) to service_role;
grant execute on function public.bank_get_connection_secret(uuid) to service_role;

commit;
