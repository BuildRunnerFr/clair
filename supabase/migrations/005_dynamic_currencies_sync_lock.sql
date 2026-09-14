begin;

alter table public.bank_connections
  add column sync_lock_id uuid,
  add column sync_locked_until timestamptz,
  add column last_sync_duration_ms integer check (last_sync_duration_ms is null or last_sync_duration_ms >= 0);

create index bank_connections_active_sync_lock_idx
  on public.bank_connections (sync_locked_until)
  where sync_lock_id is not null;

create or replace function public.finance_available_currencies()
returns table (currency text, transaction_count bigint, last_activity timestamptz)
language sql stable security invoker set search_path = ''
as $$
  with known as (
    select upper(a.currency) as currency, 0::bigint as transaction_count, null::timestamptz as last_activity
    from public.accounts a where a.user_id = (select auth.uid())
    union all
    select upper(b.currency), 0::bigint, null::timestamptz
    from public.budgets b where b.user_id = (select auth.uid())
    union all
    select upper(t.currency), count(*)::bigint, max(t.transaction_date)
    from public.transactions t where t.user_id = (select auth.uid())
    group by upper(t.currency)
  )
  select k.currency, sum(k.transaction_count)::bigint, max(k.last_activity)
  from known k
  where k.currency ~ '^[A-Z]{3}$'
  group by k.currency
  order by max(k.last_activity) desc nulls last, sum(k.transaction_count) desc, k.currency;
$$;

create or replace function public.bank_try_sync_lock(p_connection_id uuid, p_lock_id uuid, p_ttl_seconds integer default 600)
returns boolean
language sql volatile security invoker set search_path = ''
as $$
  with locked as (
    update public.bank_connections
    set sync_lock_id = p_lock_id,
        sync_locked_until = now() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 1800))
    where id = p_connection_id
      and user_id = (select auth.uid())
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
      and user_id = (select auth.uid())
      and sync_lock_id = p_lock_id
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke execute on function public.finance_available_currencies() from public, anon;
revoke execute on function public.bank_try_sync_lock(uuid, uuid, integer) from public, anon;
revoke execute on function public.bank_release_sync_lock(uuid, uuid, boolean, integer, integer, text) from public, anon;
grant execute on function public.finance_available_currencies() to authenticated;
grant execute on function public.bank_try_sync_lock(uuid, uuid, integer) to authenticated;
grant execute on function public.bank_release_sync_lock(uuid, uuid, boolean, integer, integer, text) to authenticated;

commit;
