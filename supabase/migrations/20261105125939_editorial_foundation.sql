create schema if not exists editorial_private;
revoke all on schema editorial_private from public, anon;
grant usage on schema editorial_private to authenticated;

create table public.team_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'editor', 'contributor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to authenticated;
create policy member_reads_self on public.team_members for select to authenticated
  using (user_id = (select auth.uid()) and active);

-- The internal lookup avoids recursive membership RLS; permissions always use current rows.
create function editorial_private.member_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.team_members where user_id = auth.uid() and active
$$;
revoke all on function editorial_private.member_role() from public, anon;
grant execute on function editorial_private.member_role() to authenticated;

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('artist','performance','clip','series','site','youtube-review')),
  stable_id text not null check (stable_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  owner_id uuid references auth.users(id) on delete restrict,
  version integer not null default 0 check (version >= 0),
  draft_revision_id uuid,
  approved_revision_id uuid,
  review_state text not null default 'draft' check (review_state in ('draft','in-review','changes-requested','approved')),
  updated_at timestamptz not null default now(),
  unique(kind, stable_id)
);
create table public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.content_items(id) on delete restrict,
  version integer not null check (version > 0),
  schema_version integer not null default 1 check (schema_version = 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 131072),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(item_id, version), unique(item_id, id)
);
alter table public.content_items add constraint draft_belongs_to_item
  foreign key (id, draft_revision_id) references public.content_revisions(item_id,id) deferrable initially deferred;
alter table public.content_items add constraint approval_belongs_to_item
  foreign key (id, approved_revision_id) references public.content_revisions(item_id,id) deferrable initially deferred;

create table public.editorial_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete restrict,
  item_id uuid references public.content_items(id) on delete restrict,
  revision_id uuid references public.content_revisions(id) on delete restrict,
  action text not null check (action in ('create','save','submit','approve','request-changes','restore','import')),
  created_at timestamptz not null default now()
);
alter table public.content_items enable row level security;
alter table public.content_revisions enable row level security;
alter table public.editorial_audit enable row level security;
revoke all on public.content_items, public.content_revisions, public.editorial_audit from anon, authenticated;
grant select on public.content_items, public.content_revisions, public.editorial_audit to authenticated;

create policy editorial_item_read on public.content_items for select to authenticated using (
  editorial_private.member_role() in ('owner','editor') or
  (editorial_private.member_role() = 'contributor' and owner_id = auth.uid() and kind in ('artist','performance','clip'))
);
create policy editorial_revision_read on public.content_revisions for select to authenticated using (
  exists (select 1 from public.content_items where id = item_id)
);
create policy editorial_audit_read on public.editorial_audit for select to authenticated using (
  editorial_private.member_role() in ('owner','editor') or
  exists (select 1 from public.content_items where id = item_id)
);

create function editorial_private.prevent_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Editorial history is immutable' using errcode = '42501';
end
$$;
revoke all on function editorial_private.prevent_mutation() from public, anon, authenticated;
create trigger immutable_revision before update or delete on public.content_revisions
  for each row execute function editorial_private.prevent_mutation();
create trigger immutable_audit before update or delete on public.editorial_audit
  for each row execute function editorial_private.prevent_mutation();

create function editorial_private.save_content(
  p_kind text, p_stable_id text, p_payload jsonb, p_expected_version integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_role text := editorial_private.member_role();
  v_item public.content_items;
  v_revision uuid;
  v_new boolean := false;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('artist','performance','clip','series','site','youtube-review')
    or p_stable_id is null or p_stable_id !~ '^[A-Za-z0-9_-]{1,120}$'
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 131072 or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Invalid content input' using errcode = '22023';
  end if;
  if v_role = 'contributor' and p_kind not in ('artist','performance','clip') then
    raise exception 'Editor permission required' using errcode = '42501';
  end if;
  select * into v_item from public.content_items where kind = p_kind and stable_id = p_stable_id for update;
  if not found then
    if p_expected_version <> 0 then
      raise exception 'Content changed; reload before saving' using errcode = '40001';
    end if;
    insert into public.content_items(kind,stable_id,owner_id) values(p_kind,p_stable_id,auth.uid()) returning * into v_item;
    v_new := true;
  end if;
  if v_role = 'contributor' and v_item.owner_id is distinct from auth.uid() then
    raise exception 'Content is not assigned to you' using errcode = '42501';
  end if;
  if v_item.version <> p_expected_version then
    raise exception 'Content changed; reload before saving' using errcode = '40001';
  end if;
  insert into public.content_revisions(item_id,version,payload,created_by)
    values(v_item.id,v_item.version+1,p_payload,auth.uid()) returning id into v_revision;
  update public.content_items set version=version+1,draft_revision_id=v_revision,review_state='draft',updated_at=now() where id=v_item.id;
  insert into public.editorial_audit(actor_id,item_id,revision_id,action)
    values(auth.uid(),v_item.id,v_revision,case when v_new then 'create' else 'save' end);
  return v_revision;
end
$$;
revoke all on function editorial_private.save_content(text,text,jsonb,integer) from public, anon;
grant execute on function editorial_private.save_content(text,text,jsonb,integer) to authenticated;

create function public.save_editorial_content(p_kind text,p_stable_id text,p_payload jsonb,p_expected_version integer)
returns uuid language sql security invoker set search_path = '' as $$
  select editorial_private.save_content(p_kind,p_stable_id,p_payload,p_expected_version)
$$;
revoke all on function public.save_editorial_content(text,text,jsonb,integer) from public, anon;
grant execute on function public.save_editorial_content(text,text,jsonb,integer) to authenticated;

create function editorial_private.review_content(p_item_id uuid,p_revision_id uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role text := editorial_private.member_role();
  v_item public.content_items;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('submit','approve','request-changes') then
    raise exception 'Invalid review action' using errcode = '22023';
  end if;
  select * into v_item from public.content_items where id=p_item_id for update;
  if not found or (v_role='contributor' and (v_item.owner_id is distinct from auth.uid() or v_item.kind not in ('artist','performance','clip'))) then
    raise exception 'Content access denied' using errcode = '42501';
  end if;
  if p_revision_id is null or p_revision_id is distinct from v_item.draft_revision_id then
    raise exception 'Content changed; review the current revision' using errcode = '40001';
  end if;
  if p_action <> 'submit' and v_role not in ('owner','editor') then
    raise exception 'Editor permission required' using errcode = '42501';
  end if;
  if p_action <> 'submit' and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication required' using errcode = '42501';
  end if;
  update public.content_items set
    review_state=case p_action when 'submit' then 'in-review' when 'approve' then 'approved' else 'changes-requested' end,
    approved_revision_id=case when p_action='approve' then p_revision_id else approved_revision_id end,
    updated_at=now() where id=p_item_id;
  insert into public.editorial_audit(actor_id,item_id,revision_id,action) values(auth.uid(),p_item_id,p_revision_id,p_action);
end
$$;
revoke all on function editorial_private.review_content(uuid,uuid,text) from public, anon;
grant execute on function editorial_private.review_content(uuid,uuid,text) to authenticated;
create function public.review_editorial_content(p_item_id uuid,p_revision_id uuid,p_action text)
returns void language sql security invoker set search_path = '' as $$
  select editorial_private.review_content(p_item_id,p_revision_id,p_action)
$$;
revoke all on function public.review_editorial_content(uuid,uuid,text) from public, anon;
grant execute on function public.review_editorial_content(uuid,uuid,text) to authenticated;

grant all on public.team_members,public.content_items,public.content_revisions,public.editorial_audit to service_role;
grant usage,select on sequence public.editorial_audit_id_seq to service_role;

-- Uploads are disabled until server-side asset finalization is implemented.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('editorial-drafts','editorial-drafts',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']),
  ('editorial-public','editorial-public',true,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);
