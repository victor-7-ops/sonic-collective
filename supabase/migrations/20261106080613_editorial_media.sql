insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('editorial-media','editorial-media',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create table public.editorial_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check(status in ('pending','ready','failed','archived')),
  original_path text generated always as ('originals/'||id::text||'/source') stored unique,
  derivative_path text generated always as ('derivatives/'||id::text||'.webp') stored unique,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  original_bytes integer not null check(original_bytes between 1 and 15728640),
  original_width integer not null check(original_width between 1 and 12000),
  original_height integer not null check(original_height between 1 and 12000),
  width integer not null check(width between 1 and 2400),
  height integer not null check(height between 1 and 2400),
  alt_text text not null check(length(trim(alt_text)) between 1 and 500),
  focal_x double precision not null default 0.5 check(focal_x between 0 and 1),
  focal_y double precision not null default 0.5 check(focal_y between 0 and 1),
  created_at timestamptz not null default now(),
  ready_at timestamptz
);
alter table public.editorial_assets enable row level security;
revoke all on public.editorial_assets from public,anon,authenticated;
grant select on public.editorial_assets to authenticated;
grant all on public.editorial_assets to service_role;
create policy editorial_assets_read_permitted on public.editorial_assets for select to authenticated
  using((select editorial_private.member_role()) in ('owner','editor','contributor')
    and (owner_id=(select auth.uid()) or (select editorial_private.member_role()) in ('owner','editor')));

create function editorial_private.guard_editorial_asset() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.status<>'pending' then raise exception 'Assets must be created pending validation' using errcode='22023'; end if;
    return new;
  end if;
  if row(new.id,new.owner_id,new.sha256,new.original_bytes,
    new.original_width,new.original_height,new.width,new.height,new.alt_text,new.focal_x,new.focal_y,new.created_at)
    is distinct from row(old.id,old.owner_id,old.sha256,old.original_bytes,
    old.original_width,old.original_height,old.width,old.height,old.alt_text,old.focal_x,old.focal_y,old.created_at) then
    raise exception 'Asset metadata is immutable' using errcode='55000';
  end if;
  if not ((old.status='pending' and new.status in ('ready','failed')) or (old.status='ready' and new.status='archived')) then
    raise exception 'Invalid asset status transition' using errcode='55000';
  end if;
  if new.status='ready' and new.ready_at is null then raise exception 'Ready assets require a validation time' using errcode='22023'; end if;
  if new.status<>'ready' and new.ready_at is distinct from old.ready_at then raise exception 'Only ready time may change during finalization' using errcode='55000'; end if;
  return new;
end
$$;
revoke all on function editorial_private.guard_editorial_asset() from public,anon,authenticated;
create trigger guard_editorial_asset before insert or update on public.editorial_assets
  for each row execute function editorial_private.guard_editorial_asset();

-- Storage remains private with no client policies; the server signs only RLS-permitted derivatives.
