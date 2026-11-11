-- Every revision that references a media-library image (/media/cms/<uuid>) must reference an image that exists,
-- is ready, and that the author may use: editors and owners may use any ready image; contributors only their own.
-- Runs inside the database so no application path can skip it. Internal contexts without a signed-in user
-- (seeding, restore) are not affected.
create function editorial_private.check_asset_references() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_match text[];
  v_asset record;
  v_role text;
begin
  if auth.uid() is null then return new; end if;
  v_role := editorial_private.member_role();
  for v_match in
    select regexp_matches(new.payload::text,'/media/cms/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','g')
  loop
    select owner_id,status into v_asset from public.editorial_assets where id=v_match[1]::uuid;
    if not found then
      raise exception 'A referenced image does not exist' using errcode='22023';
    end if;
    if v_asset.status <> 'ready' then
      raise exception 'A referenced image is not ready' using errcode='22023';
    end if;
    if v_role is distinct from 'owner' and v_role is distinct from 'editor' and v_asset.owner_id is distinct from auth.uid() then
      raise exception 'A referenced image belongs to another team member' using errcode='42501';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function editorial_private.check_asset_references() from public,anon,authenticated;
create trigger check_asset_references before insert on public.content_revisions
  for each row execute function editorial_private.check_asset_references();
