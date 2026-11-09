grant usage on schema editorial_private to service_role;

create table public.editorial_invitations (
  request_id uuid primary key,
  email text not null check(email=lower(email) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role text not null check(role in ('editor','contributor')),
  status text not null check(status in ('pending','failed','accepted','sent','needs-attention')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete restrict,
  attempt_count integer not null default 1 check(attempt_count>0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index editorial_invitation_pending_email on public.editorial_invitations(email)
  where status in ('pending','accepted','needs-attention');
alter table public.editorial_invitations enable row level security;
revoke all on public.editorial_invitations from public,anon,authenticated;
grant select on public.editorial_invitations to authenticated;
create policy owner_reads_editorial_invitations on public.editorial_invitations for select to authenticated
  using ((select editorial_private.member_role())='owner');
grant all on public.editorial_invitations to service_role;

create table public.editorial_invitation_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.editorial_invitations(request_id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('requested','retry','provider-failed','provider-accepted','member-added','needs-attention')),
  error_code text,
  created_at timestamptz not null default now()
);
alter table public.editorial_invitation_events enable row level security;
revoke all on public.editorial_invitation_events from public,anon,authenticated;
grant select on public.editorial_invitation_events to authenticated;
create policy owner_reads_editorial_invitation_events on public.editorial_invitation_events for select to authenticated
  using ((select editorial_private.member_role())='owner');
grant all on public.editorial_invitation_events to service_role;
grant usage,select on sequence public.editorial_invitation_events_id_seq to service_role;
create trigger immutable_editorial_invitation_event before update or delete on public.editorial_invitation_events
  for each row execute function editorial_private.prevent_mutation();

alter table public.team_audit drop constraint team_audit_action_check;
alter table public.team_audit add constraint team_audit_action_check
  check(action in ('member-update','assignment-change','member-invited'));

create function editorial_private.prepare_editorial_invitation(p_request_id uuid,p_email text,p_role text)
returns table(status text,should_send boolean,auth_user_id uuid,error_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_invitation public.editorial_invitations;
  v_existing boolean;
begin
  perform editorial_private.require_team_owner();
  if p_request_id is null or p_email is null or length(v_email) not between 3 and 254 or
     v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_role not in ('editor','contributor') then
    raise exception using errcode='PI001',message='INVITATION_INVALID_INPUT';
  end if;
  select * into v_invitation from public.editorial_invitations where request_id=p_request_id for update;
  if found then
    if v_invitation.requested_by<>auth.uid() or v_invitation.email<>v_email or v_invitation.role<>p_role then
      raise exception using errcode='PI002',message='INVITATION_REQUEST_MISMATCH';
    end if;
    if v_invitation.status='failed' then
      select exists(select 1 from auth.users where lower(email)=v_email) into v_existing;
      if v_existing then
        update public.editorial_invitations set status='needs-attention',error_code='auth_user_exists',updated_at=now()
          where request_id=p_request_id returning * into v_invitation;
        insert into public.editorial_invitation_events(request_id,actor_id,action,error_code)
          values(p_request_id,auth.uid(),'needs-attention','auth_user_exists');
        return query select v_invitation.status,false,v_invitation.auth_user_id,v_invitation.error_code;
        return;
      end if;
      update public.editorial_invitations set status='pending',attempt_count=attempt_count+1,error_code=null,updated_at=now()
        where request_id=p_request_id returning * into v_invitation;
      insert into public.editorial_invitation_events(request_id,actor_id,action)
        values(p_request_id,auth.uid(),'retry');
      return query select v_invitation.status,true,v_invitation.auth_user_id,v_invitation.error_code;
      return;
    end if;
    return query select v_invitation.status,false,v_invitation.auth_user_id,v_invitation.error_code;
    return;
  end if;

  select exists(select 1 from auth.users where lower(email)=v_email) into v_existing;
  if v_existing then raise exception using errcode='PI003',message='INVITATION_ACCOUNT_EXISTS'; end if;
  begin
    insert into public.editorial_invitations(request_id,email,role,status,requested_by)
      values(p_request_id,v_email,p_role,'pending',auth.uid()) returning * into v_invitation;
  exception when unique_violation then
    raise exception using errcode='PI004',message='INVITATION_ALREADY_PENDING';
  end;
  insert into public.editorial_invitation_events(request_id,actor_id,action)
    values(p_request_id,auth.uid(),'requested');
  return query select v_invitation.status,true,v_invitation.auth_user_id,v_invitation.error_code;
end
$$;
revoke all on function editorial_private.prepare_editorial_invitation(uuid,text,text) from public,anon;
grant execute on function editorial_private.prepare_editorial_invitation(uuid,text,text) to authenticated;
create function public.prepare_editorial_invitation(p_request_id uuid,p_email text,p_role text)
returns table(status text,should_send boolean,auth_user_id uuid,error_code text)
language sql security invoker set search_path = '' as $$
  select * from editorial_private.prepare_editorial_invitation(p_request_id,p_email,p_role)
$$;
revoke all on function public.prepare_editorial_invitation(uuid,text,text) from public,anon;
grant execute on function public.prepare_editorial_invitation(uuid,text,text) to authenticated;

create function editorial_private.record_editorial_invitation_result(
  p_request_id uuid,p_actor_id uuid,p_result text,p_auth_user_id uuid,p_error_code text
) returns table(status text,error_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.editorial_invitations;
  v_email text;
  v_existing boolean;
begin
  if p_request_id is null or p_actor_id is null or p_result not in ('accepted','failed') then
    raise exception using errcode='PI001',message='INVITATION_INVALID_INPUT';
  end if;
  select * into v_invitation from public.editorial_invitations where request_id=p_request_id for update;
  if not found then raise exception using errcode='PI005',message='INVITATION_NOT_FOUND'; end if;
  if v_invitation.requested_by<>p_actor_id or not exists(
    select 1 from public.team_members where user_id=p_actor_id and role='owner' and active
  ) then raise exception using errcode='PI006',message='INVITATION_OWNER_CHANGED'; end if;
  if v_invitation.status<>'pending' then
    return query select v_invitation.status,v_invitation.error_code;
    return;
  end if;
  if p_result='accepted' then
    select lower(email) into v_email from auth.users where id=p_auth_user_id;
    if p_auth_user_id is null or v_email is distinct from v_invitation.email then
      update public.editorial_invitations set status='needs-attention',error_code='auth_identity_mismatch',updated_at=now()
        where request_id=p_request_id returning * into v_invitation;
      insert into public.editorial_invitation_events(request_id,actor_id,action,error_code)
        values(p_request_id,p_actor_id,'needs-attention','auth_identity_mismatch');
    elsif exists(select 1 from public.team_members where user_id=p_auth_user_id) then
      update public.editorial_invitations set status='needs-attention',auth_user_id=p_auth_user_id,error_code='team_member_exists',updated_at=now()
        where request_id=p_request_id returning * into v_invitation;
      insert into public.editorial_invitation_events(request_id,actor_id,action,error_code)
        values(p_request_id,p_actor_id,'needs-attention','team_member_exists');
    else
      update public.editorial_invitations set status='accepted',auth_user_id=p_auth_user_id,error_code=null,updated_at=now()
        where request_id=p_request_id returning * into v_invitation;
      insert into public.editorial_invitation_events(request_id,actor_id,action)
        values(p_request_id,p_actor_id,'provider-accepted');
    end if;
  else
    select exists(select 1 from auth.users where lower(email)=v_invitation.email) into v_existing;
    if v_existing then
      update public.editorial_invitations set status='needs-attention',error_code='provider_outcome_unknown',updated_at=now()
        where request_id=p_request_id returning * into v_invitation;
      insert into public.editorial_invitation_events(request_id,actor_id,action,error_code)
        values(p_request_id,p_actor_id,'needs-attention','provider_outcome_unknown');
    else
      update public.editorial_invitations set status='failed',error_code=case when p_error_code in ('provider_unavailable','provider_rejected') then p_error_code else 'provider_error' end,updated_at=now()
        where request_id=p_request_id returning * into v_invitation;
      insert into public.editorial_invitation_events(request_id,actor_id,action,error_code)
        values(p_request_id,p_actor_id,'provider-failed',v_invitation.error_code);
    end if;
  end if;
  return query select v_invitation.status,v_invitation.error_code;
end
$$;
revoke all on function editorial_private.record_editorial_invitation_result(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function editorial_private.record_editorial_invitation_result(uuid,uuid,text,uuid,text) to service_role;
create function public.record_editorial_invitation_result(p_request_id uuid,p_actor_id uuid,p_result text,p_auth_user_id uuid default null,p_error_code text default null)
returns table(status text,error_code text)
language sql security invoker set search_path = '' as $$
  select * from editorial_private.record_editorial_invitation_result(p_request_id,p_actor_id,p_result,p_auth_user_id,p_error_code)
$$;
revoke all on function public.record_editorial_invitation_result(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_editorial_invitation_result(uuid,uuid,text,uuid,text) to service_role;

create function editorial_private.activate_editorial_invitation(p_request_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.editorial_invitations;
  v_email text;
begin
  perform editorial_private.require_team_owner();
  select * into v_invitation from public.editorial_invitations where request_id=p_request_id for update;
  if not found then raise exception using errcode='PI005',message='INVITATION_NOT_FOUND'; end if;
  if v_invitation.requested_by<>auth.uid() then raise exception using errcode='PI006',message='INVITATION_OWNER_CHANGED'; end if;
  if v_invitation.status='sent' then return 'sent'; end if;
  if v_invitation.status<>'accepted' or v_invitation.auth_user_id is null then
    raise exception using errcode='PI007',message='INVITATION_NOT_READY';
  end if;
  select lower(email) into v_email from auth.users where id=v_invitation.auth_user_id;
  if v_email is distinct from v_invitation.email then
    update public.editorial_invitations set status='needs-attention',error_code='auth_identity_mismatch',updated_at=now()
      where request_id=p_request_id;
    insert into public.editorial_invitation_events(request_id,actor_id,action,error_code)
      values(p_request_id,auth.uid(),'needs-attention','auth_identity_mismatch');
    return 'needs-attention';
  end if;
  if exists(select 1 from public.team_members where user_id=v_invitation.auth_user_id) then
    update public.editorial_invitations set status='needs-attention',error_code='team_member_exists',updated_at=now()
      where request_id=p_request_id;
    insert into public.editorial_invitation_events(request_id,actor_id,action,error_code)
      values(p_request_id,auth.uid(),'needs-attention','team_member_exists');
    return 'needs-attention';
  end if;
  insert into public.team_members(user_id,role,active) values(v_invitation.auth_user_id,v_invitation.role,true);
  insert into public.team_audit(actor_id,target_user_id,action,new_role,new_active)
    values(auth.uid(),v_invitation.auth_user_id,'member-invited',v_invitation.role,true);
  update public.editorial_invitations set status='sent',error_code=null,updated_at=now(),completed_at=now()
    where request_id=p_request_id;
  insert into public.editorial_invitation_events(request_id,actor_id,action)
    values(p_request_id,auth.uid(),'member-added');
  return 'sent';
end
$$;
revoke all on function editorial_private.activate_editorial_invitation(uuid) from public,anon;
grant execute on function editorial_private.activate_editorial_invitation(uuid) to authenticated;
create function public.activate_editorial_invitation(p_request_id uuid)
returns text language sql security invoker set search_path = '' as $$
  select editorial_private.activate_editorial_invitation(p_request_id)
$$;
revoke all on function public.activate_editorial_invitation(uuid) from public,anon;
grant execute on function public.activate_editorial_invitation(uuid) to authenticated;

