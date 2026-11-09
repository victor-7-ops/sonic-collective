alter table public.content_items add column archived_at timestamptz;

alter table public.editorial_audit drop constraint editorial_audit_action_check;
alter table public.editorial_audit add constraint editorial_audit_action_check
  check (action in ('create','save','submit','approve','request-changes','restore','import','archive','unarchive'));

create function editorial_private.reject_archived_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.archived_at is not null and new.archived_at is not null and (
    new.version is distinct from old.version or
    new.draft_revision_id is distinct from old.draft_revision_id or
    new.approved_revision_id is distinct from old.approved_revision_id or
    new.review_state is distinct from old.review_state
  ) then
    raise exception 'Archived content must be restored before editing' using errcode = '55000';
  end if;
  return new;
end
$$;
revoke all on function editorial_private.reject_archived_mutation() from public, anon, authenticated;
create trigger reject_archived_content_mutation before update on public.content_items
  for each row execute function editorial_private.reject_archived_mutation();

create function editorial_private.assert_unarchived_reference(p_kind text,p_stable_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_archived_at timestamptz;
begin
  select archived_at into v_archived_at from public.content_items
    where kind=p_kind and stable_id=p_stable_id for share;
  if found and v_archived_at is not null then
    raise exception 'Cannot reference archived content' using errcode = '23503';
  end if;
end
$$;
revoke all on function editorial_private.assert_unarchived_reference(text,text) from public, anon, authenticated;

create function editorial_private.content_references(p_kind text,p_payload jsonb)
returns table(target_kind text,target_stable_id text) language sql immutable set search_path = '' as $$
  select 'artist',artist_id from jsonb_array_elements_text(coalesce(p_payload->'artistIds','[]'::jsonb)) as ids(artist_id)
    where p_kind in ('performance','youtube-review')
  union all
  select 'series',p_payload->>'seriesId' where p_kind in ('performance','youtube-review') and p_payload->>'seriesId' is not null
  union all
  select 'performance',p_payload->>'performanceId' where p_kind='clip' and p_payload->>'performanceId' is not null
  union all
  select 'artist',artist_id from jsonb_array_elements_text(coalesce(p_payload->'featuredArtistIds','[]'::jsonb)) as ids(artist_id)
    where p_kind='site'
  union all
  select 'performance',performance_id from (
    select jsonb_array_elements_text(coalesce(p_payload->'spotlightPerformanceIds','[]'::jsonb)) as performance_id
    union all select jsonb_array_elements_text(coalesce(p_payload->'featuredPerformanceIds','[]'::jsonb))
    union all select jsonb_array_elements_text(coalesce(p_payload->'featuredCoverIds','[]'::jsonb))
    union all select jsonb_array_elements_text(jsonb_build_array(p_payload->'hero'->>'performanceId',p_payload->'hero'->>'portraitPerformanceId'))
  ) performances where p_kind='site' and performance_id is not null
  union all
  select 'clip',p_payload->'hero'->>'portraitClipId'
    where p_kind='site' and p_payload->'hero'->>'portraitClipId' is not null
$$;
revoke all on function editorial_private.content_references(text,jsonb) from public, anon, authenticated;

create function editorial_private.validate_content_references(p_kind text,p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_reference record;
begin
  for v_reference in select * from editorial_private.content_references(p_kind,p_payload) loop
    perform editorial_private.assert_unarchived_reference(v_reference.target_kind,v_reference.target_stable_id);
  end loop;
end
$$;
revoke all on function editorial_private.validate_content_references(text,jsonb) from public, anon, authenticated;

create function editorial_private.reject_archived_references() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.content_items where id=new.item_id;
  perform editorial_private.validate_content_references(v_kind,new.payload);
  return new;
end
$$;
revoke all on function editorial_private.reject_archived_references() from public, anon, authenticated;
create trigger reject_archived_content_reference before insert on public.content_revisions
  for each row execute function editorial_private.reject_archived_references();

create function editorial_private.archive_content(p_item_id uuid,p_expected_version integer,p_archived boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_role text := editorial_private.member_role();
  v_item public.content_items;
  v_revision uuid;
  v_payload jsonb;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  if v_role not in ('owner','editor') then
    raise exception 'Editor permission required' using errcode = '42501';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication required' using errcode = '42501';
  end if;
  if p_item_id is null or p_expected_version is null or p_expected_version < 0 or p_archived is null then
    raise exception 'Invalid archive input' using errcode = '22023';
  end if;

  select * into v_item from public.content_items where id=p_item_id for update;
  if not found then raise exception 'Content access denied' using errcode = '42501'; end if;
  if v_item.version <> p_expected_version then
    raise exception 'Content changed; reload before archiving' using errcode = '40001';
  end if;
  if (v_item.archived_at is not null) = p_archived then
    raise exception 'Content archive state changed; reload before continuing' using errcode = '40001';
  end if;

  if p_archived and exists (
    select 1
    from public.content_items source
    cross join lateral unnest(array[source.draft_revision_id,source.approved_revision_id]) as pointer(revision_id)
    join public.content_revisions revision on revision.id=pointer.revision_id
    cross join lateral editorial_private.content_references(source.kind,revision.payload) reference
    where source.archived_at is null and source.id <> v_item.id
      and reference.target_kind=v_item.kind and reference.target_stable_id=v_item.stable_id
  ) then
    raise exception 'Content is referenced by an active draft or approved record' using errcode = '23503';
  end if;

  if not p_archived then
    for v_revision in select distinct pointer.revision_id from unnest(array[v_item.draft_revision_id,v_item.approved_revision_id]) as pointer(revision_id) where pointer.revision_id is not null loop
      select payload into v_payload from public.content_revisions where id=v_revision and item_id=v_item.id;
      perform editorial_private.validate_content_references(v_item.kind,v_payload);
    end loop;
  end if;

  v_revision := coalesce(v_item.draft_revision_id,v_item.approved_revision_id);
  update public.content_items
    set archived_at=case when p_archived then now() else null end,
        version=version+1,updated_at=now()
    where id=p_item_id;
  insert into public.editorial_audit(actor_id,item_id,revision_id,action)
    values(auth.uid(),p_item_id,v_revision,case when p_archived then 'archive' else 'unarchive' end);
  return p_expected_version+1;
end
$$;
revoke all on function editorial_private.archive_content(uuid,integer,boolean) from public, anon;
grant execute on function editorial_private.archive_content(uuid,integer,boolean) to authenticated;

create function public.archive_editorial_content(p_item_id uuid,p_expected_version integer,p_archived boolean)
returns integer language sql security invoker set search_path = '' as $$
  select editorial_private.archive_content(p_item_id,p_expected_version,p_archived)
$$;
revoke all on function public.archive_editorial_content(uuid,integer,boolean) from public, anon;
grant execute on function public.archive_editorial_content(uuid,integer,boolean) to authenticated;
