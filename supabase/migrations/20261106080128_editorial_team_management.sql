create table public.team_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete restrict,
  item_id uuid references public.content_items(id) on delete restrict,
  action text not null check (action in ('member-update','assignment-change')),
  old_role text,
  new_role text,
  old_active boolean,
  new_active boolean,
  old_owner_id uuid references auth.users(id) on delete restrict,
  new_owner_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.team_audit enable row level security;
revoke all on public.team_audit from anon,authenticated;
grant select on public.team_audit to authenticated;
create policy owner_reads_team_audit on public.team_audit for select to authenticated
  using ((select editorial_private.member_role())='owner');
grant all on public.team_audit to service_role;
grant usage,select on sequence public.team_audit_id_seq to service_role;
create trigger immutable_team_audit before update or delete on public.team_audit
  for each row execute function editorial_private.prevent_mutation();

create function editorial_private.require_team_owner() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(1396918349);
  if auth.uid() is null or editorial_private.member_role() is distinct from 'owner' then
    raise exception using errcode='PT001',message='TEAM_NOT_OWNER';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception using errcode='PT002',message='TEAM_MFA_REQUIRED';
  end if;
end
$$;
revoke all on function editorial_private.require_team_owner() from public,anon,authenticated;

create function editorial_private.list_team_members()
returns table(user_id uuid,email text,role text,active boolean,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform editorial_private.require_team_owner();
  return query
    select member.user_id,coalesce(account.email,''),member.role,member.active,member.created_at
    from public.team_members member join auth.users account on account.id=member.user_id
    order by member.created_at,member.user_id;
end
$$;
revoke all on function editorial_private.list_team_members() from public,anon;
grant execute on function editorial_private.list_team_members() to authenticated;
create function public.list_editorial_members()
returns table(user_id uuid,email text,role text,active boolean,created_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from editorial_private.list_team_members()
$$;
revoke all on function public.list_editorial_members() from public,anon;
grant execute on function public.list_editorial_members() to authenticated;

create function editorial_private.update_team_member(
  p_user_id uuid,p_expected_role text,p_expected_active boolean,p_role text,p_active boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_member public.team_members;
  v_active_owners integer;
begin
  perform editorial_private.require_team_owner();
  if p_user_id is null or p_expected_role is null or p_expected_active is null or p_role is null or
     p_role not in ('owner','editor','contributor') or p_active is null then
    raise exception using errcode='PT003',message='TEAM_INVALID_INPUT';
  end if;
  select * into v_member from public.team_members where user_id=p_user_id for update;
  if not found then raise exception using errcode='PT006',message='TEAM_MEMBER_NOT_FOUND'; end if;
  if v_member.role is distinct from p_expected_role or v_member.active is distinct from p_expected_active then
    raise exception using errcode='PT004',message='TEAM_CONFLICT';
  end if;
  if v_member.role=p_role and v_member.active=p_active then return false; end if;
  if v_member.role='owner' and v_member.active and (p_role<>'owner' or not p_active) then
    select count(*)::int into v_active_owners from public.team_members where role='owner' and active;
    if v_active_owners<=1 then raise exception using errcode='PT005',message='TEAM_LAST_ACTIVE_OWNER'; end if;
  end if;
  update public.team_members set role=p_role,active=p_active where user_id=p_user_id;
  insert into public.team_audit(actor_id,target_user_id,action,old_role,new_role,old_active,new_active)
    values(auth.uid(),p_user_id,'member-update',v_member.role,p_role,v_member.active,p_active);
  return true;
end
$$;
revoke all on function editorial_private.update_team_member(uuid,text,boolean,text,boolean) from public,anon;
grant execute on function editorial_private.update_team_member(uuid,text,boolean,text,boolean) to authenticated;
create function public.update_editorial_member(
  p_user_id uuid,p_expected_role text,p_expected_active boolean,p_role text,p_active boolean
) returns boolean language sql security invoker set search_path = '' as $$
  select editorial_private.update_team_member(p_user_id,p_expected_role,p_expected_active,p_role,p_active)
$$;
revoke all on function public.update_editorial_member(uuid,text,boolean,text,boolean) from public,anon;
grant execute on function public.update_editorial_member(uuid,text,boolean,text,boolean) to authenticated;

create function editorial_private.assign_team_content(p_item_id uuid,p_expected_owner_id uuid,p_owner_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_item public.content_items;
  v_role text;
  v_active boolean;
begin
  perform editorial_private.require_team_owner();
  if p_item_id is null then raise exception using errcode='PT003',message='TEAM_INVALID_INPUT'; end if;
  select * into v_item from public.content_items where id=p_item_id for update;
  if not found then raise exception using errcode='PT006',message='TEAM_CONTENT_NOT_FOUND'; end if;
  if v_item.archived_at is not null then raise exception using errcode='PT003',message='TEAM_CONTENT_ARCHIVED'; end if;
  if v_item.owner_id is distinct from p_expected_owner_id then
    raise exception using errcode='PT004',message='TEAM_CONFLICT';
  end if;
  if p_owner_id is not null then
    select role,active into v_role,v_active from public.team_members where user_id=p_owner_id;
    if not found or v_role<>'contributor' or not v_active or v_item.kind not in ('artist','performance','clip') then
      raise exception using errcode='PT003',message='TEAM_INVALID_ASSIGNMENT';
    end if;
  end if;
  if v_item.owner_id is not distinct from p_owner_id then return v_item.version; end if;
  update public.content_items set owner_id=p_owner_id,version=version+1,updated_at=now() where id=p_item_id;
  insert into public.team_audit(actor_id,item_id,action,old_owner_id,new_owner_id)
    values(auth.uid(),p_item_id,'assignment-change',v_item.owner_id,p_owner_id);
  return v_item.version+1;
end
$$;
revoke all on function editorial_private.assign_team_content(uuid,uuid,uuid) from public,anon;
grant execute on function editorial_private.assign_team_content(uuid,uuid,uuid) to authenticated;
create function public.assign_editorial_content(p_item_id uuid,p_expected_owner_id uuid,p_owner_id uuid)
returns integer language sql security invoker set search_path = '' as $$
  select editorial_private.assign_team_content(p_item_id,p_expected_owner_id,p_owner_id)
$$;
revoke all on function public.assign_editorial_content(uuid,uuid,uuid) from public,anon;
grant execute on function public.assign_editorial_content(uuid,uuid,uuid) to authenticated;
