-- Archive a media-library image so it can no longer be chosen. Files stay in private storage (nothing is deleted).
-- Refused while any item's current draft or approved revision, or any prepared release, still references the image.
create function editorial_private.archive_asset(p_asset_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_asset record;
  v_role text;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  v_role := editorial_private.member_role();
  if v_role is null then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if editorial_private.mfa_unmet() then
    raise exception 'Multi-factor authentication required' using errcode='42501';
  end if;
  select owner_id,status into v_asset from public.editorial_assets where id=p_asset_id for update;
  if not found then
    raise exception 'Image not found' using errcode='22023';
  end if;
  if v_role not in ('owner','editor') and v_asset.owner_id is distinct from auth.uid() then
    raise exception 'Only an editor or the uploader can archive this image' using errcode='42501';
  end if;
  if v_asset.status <> 'ready' then
    raise exception 'Only a ready image can be archived' using errcode='22023';
  end if;
  v_path := '/media/cms/' || p_asset_id::text;
  if exists(
    select 1 from public.content_items item
    join public.content_revisions revision on revision.id in (item.draft_revision_id,item.approved_revision_id)
    where position(v_path in revision.payload::text) > 0
  ) then
    raise exception 'This image is used by current content' using errcode='23503';
  end if;
  if exists(select 1 from public.editorial_releases release where position(v_path in release.snapshot::text) > 0) then
    raise exception 'This image is part of a prepared release' using errcode='23503';
  end if;
  update public.editorial_assets set status='archived' where id=p_asset_id;
end
$$;
revoke all on function editorial_private.archive_asset(uuid) from public,anon;
grant execute on function editorial_private.archive_asset(uuid) to authenticated;
create function public.archive_editorial_asset(p_asset_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select editorial_private.archive_asset(p_asset_id)
$$;
revoke all on function public.archive_editorial_asset(uuid) from public,anon;
grant execute on function public.archive_editorial_asset(uuid) to authenticated;
