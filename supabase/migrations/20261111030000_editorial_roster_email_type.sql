-- auth.users.email is varchar(255); RETURN QUERY requires an exact text match, so the roster failed on hosted Supabase.
create or replace function editorial_private.list_team_members()
returns table(user_id uuid,email text,role text,active boolean,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform editorial_private.require_team_owner();
  return query
    select member.user_id,coalesce(account.email,'')::text,member.role,member.active,member.created_at
    from public.team_members member join auth.users account on account.id=member.user_id
    order by member.created_at,member.user_id;
end
$$;
