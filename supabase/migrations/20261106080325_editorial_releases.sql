create table public.editorial_releases (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  expected_map jsonb not null check (jsonb_typeof(expected_map)='array'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='array'),
  created_at timestamptz not null default now()
);
alter table public.editorial_releases enable row level security;
revoke all on public.editorial_releases from public,anon,authenticated;
grant select on public.editorial_releases to authenticated;
create policy editorial_release_read on public.editorial_releases for select to authenticated
  using (editorial_private.member_role() in ('owner','editor'));

create function editorial_private.prevent_release_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Editorial releases are immutable' using errcode='42501';
end
$$;
revoke all on function editorial_private.prevent_release_mutation() from public,anon,authenticated;
create trigger immutable_editorial_release before update or delete on public.editorial_releases
  for each row execute function editorial_private.prevent_release_mutation();

create function editorial_private.create_release(p_request_id uuid,p_expected_map jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_existing public.editorial_releases;
  v_expected jsonb;
  v_snapshot jsonb;
  v_release_id uuid;
begin
  select role into v_role from public.team_members where user_id=auth.uid() and active for share;
  if auth.uid() is null or v_role is null then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if v_role not in ('owner','editor') then
    raise exception 'Editor permission required' using errcode='42501';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication required' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_map is null or jsonb_typeof(p_expected_map)<>'array' then
    raise exception 'Invalid release request' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_existing from public.editorial_releases where request_id=p_request_id;
  if found then
    if v_existing.created_by<>auth.uid() or v_existing.expected_map is distinct from p_expected_map then
      raise exception 'Release request ID was already used' using errcode='22023';
    end if;
    return v_existing.id;
  end if;

  -- SHARE prevents phantom content-item inserts/updates while the approved map is compared and captured.
  lock table public.content_items in share mode;
  select role into v_role from public.team_members where user_id=auth.uid() and active for share;
  if auth.uid() is null or v_role is null then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if v_role not in ('owner','editor') then
    raise exception 'Editor permission required' using errcode='42501';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication required' using errcode='42501';
  end if;
  -- A concurrent retry may have committed while this request waited for the table lock.
  select * into v_existing from public.editorial_releases where request_id=p_request_id;
  if found then
    if v_existing.created_by<>auth.uid() or v_existing.expected_map is distinct from p_expected_map then
      raise exception 'Release request ID was already used' using errcode='22023';
    end if;
    return v_existing.id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind',item.kind,'stableId',item.stable_id,'revisionId',item.approved_revision_id
    ) order by item.kind collate "C",item.stable_id collate "C"),'[]'::jsonb)
    into v_expected
    from public.content_items item
    where item.archived_at is null and item.approved_revision_id is not null;
  if p_expected_map is distinct from v_expected then
    raise exception 'Approved content changed; reload before creating a release' using errcode='40001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'kind',item.kind,'stableId',item.stable_id,'revisionId',revision.id,'payload',revision.payload
    ) order by item.kind collate "C",item.stable_id collate "C"),'[]'::jsonb)
    into v_snapshot
    from public.content_items item
    join public.content_revisions revision on revision.id=item.approved_revision_id and revision.item_id=item.id
    where item.archived_at is null and item.approved_revision_id is not null;

  insert into public.editorial_releases(request_id,created_by,expected_map,snapshot)
    values(p_request_id,auth.uid(),v_expected,v_snapshot) returning id into v_release_id;
  return v_release_id;
end
$$;
revoke all on function editorial_private.create_release(uuid,jsonb) from public,anon,authenticated;
grant execute on function editorial_private.create_release(uuid,jsonb) to authenticated;

create function public.create_editorial_release(p_request_id uuid,p_expected_map jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select editorial_private.create_release(p_request_id,p_expected_map)
$$;
revoke all on function public.create_editorial_release(uuid,jsonb) from public,anon;
grant execute on function public.create_editorial_release(uuid,jsonb) to authenticated;
