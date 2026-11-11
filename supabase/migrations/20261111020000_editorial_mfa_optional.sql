-- Authenticator use becomes optional: required only for accounts that enrolled a verified factor.
-- Rewrites only the aal2 condition in the existing functions, leaving everything else untouched.
create function editorial_private.mfa_unmet() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'aal','aal1') = 'aal2' then return false; end if;
  return exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified');
end
$$;
revoke all on function editorial_private.mfa_unmet() from public,anon;
grant execute on function editorial_private.mfa_unmet() to authenticated;

do $migration$
declare
  v_function record;
  v_old constant text := $old$coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'$old$;
  v_count integer := 0;
begin
  for v_function in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('editorial_private','public') and position(v_old in p.prosrc)>0
  loop
    execute replace(pg_get_functiondef(v_function.oid),v_old,'editorial_private.mfa_unmet()');
    v_count := v_count+1;
  end loop;
  if v_count <> 4 then raise exception 'Expected to update 4 functions, updated %', v_count; end if;
end
$migration$;
