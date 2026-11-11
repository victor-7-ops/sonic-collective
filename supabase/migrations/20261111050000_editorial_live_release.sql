-- Which release production should be built from. Append-only: the newest row is the current choice.
create table public.editorial_live_releases (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.editorial_releases(id) on delete restrict,
  set_by uuid not null references auth.users(id) on delete restrict,
  set_at timestamptz not null default now()
);
alter table public.editorial_live_releases enable row level security;
revoke all on public.editorial_live_releases from public,anon,authenticated;
grant select on public.editorial_live_releases to authenticated;
grant all on public.editorial_live_releases to service_role;
grant usage,select on sequence public.editorial_live_releases_id_seq to service_role;
create policy live_release_read on public.editorial_live_releases for select to authenticated
  using (editorial_private.member_role() in ('owner','editor'));
create trigger immutable_live_release before update or delete on public.editorial_live_releases
  for each row execute function editorial_private.prevent_mutation();

create function editorial_private.set_live_release(p_release_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if auth.uid() is null or editorial_private.member_role() is distinct from 'owner' then
    raise exception 'Only an active owner can choose the live release' using errcode='42501';
  end if;
  if editorial_private.mfa_unmet() then
    raise exception 'Multi-factor authentication required' using errcode='42501';
  end if;
  if p_release_id is null or not exists(select 1 from public.editorial_releases where id=p_release_id) then
    raise exception 'Release not found' using errcode='22023';
  end if;
  insert into public.editorial_live_releases(release_id,set_by) values(p_release_id,auth.uid()) returning id into v_id;
  return v_id;
end
$$;
revoke all on function editorial_private.set_live_release(uuid) from public,anon;
grant execute on function editorial_private.set_live_release(uuid) to authenticated;
create function public.set_editorial_live_release(p_release_id uuid) returns bigint
language sql security invoker set search_path = '' as $$
  select editorial_private.set_live_release(p_release_id)
$$;
revoke all on function public.set_editorial_live_release(uuid) from public,anon;
grant execute on function public.set_editorial_live_release(uuid) to authenticated;
