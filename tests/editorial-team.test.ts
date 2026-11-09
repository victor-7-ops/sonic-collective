import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/editorial/database.types';
import { applyEditorialTeamAction,applyEditorialInvitation } from '../src/lib/editorial/team';

test('invitations require a trusted server client and MFA before provider calls',async()=>{
  const form=new URLSearchParams({requestId:'00000000-0000-4000-8000-000000000099',email:'invited@example.com',role:'contributor'});
  const client={auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1'},error:null})}}} as unknown as SupabaseClient<Database>;
  const missing=await applyEditorialInvitation(client,null,form,'http://127.0.0.1:4321');
  assert.ok('status' in missing);assert.equal(missing.status,503);
  const denied=await applyEditorialInvitation(client,{} as SupabaseClient<Database>,form,'http://127.0.0.1:4321');
  assert.ok('status' in denied);assert.equal(denied.status,403);
});

test('team form helper rejects malformed toggles and preserves null assignment inputs', async () => {
  const calls:Array<{name:string;args:Record<string,unknown>}> = [];
  const client={
    auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({error:null,data:{currentLevel:'aal2'}})}},
    rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:true,error:null};},
  } as unknown as SupabaseClient<Database>;
  const invalid=await applyEditorialTeamAction(client,new URLSearchParams({
    action:'member',userId:'00000000-0000-4000-8000-000000000001',expectedRole:'contributor',expectedActive:'true',role:'editor',active:'false',
  }));
  assert.deepEqual(invalid,{message:'Choose a valid member role and status.',status:400});
  assert.equal(calls.length,0);
  const assigned=await applyEditorialTeamAction(client,new URLSearchParams({
    action:'assignment',itemId:'00000000-0000-4000-8000-000000000010',expectedOwnerId:'',ownerId:'',
  }));
  assert.deepEqual(assigned,{redirect:'/admin/team/?updated=1'});
  assert.deepEqual(calls[0],{name:'assign_editorial_content',args:{
    p_item_id:'00000000-0000-4000-8000-000000000010',p_expected_owner_id:null,p_owner_id:null,
  }});
});

test('team RPCs enforce owner MFA, serialized last-owner protection, assignment rules, and audit', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on all functions in schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
  `);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  const [owner, secondOwner, editor, contributor, secondContributor] = [1, 2, 3, 4, 5].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  const users = [[owner,'owner@example.test','owner'],[secondOwner,'second@example.test','owner'],[editor,'editor@example.test','editor'],[contributor,'contributor@example.test','contributor'],[secondContributor,'other@example.test','contributor']] as const;
  for (const [id,email] of users) await db.query('insert into auth.users(id,email) values($1,$2)', [id,email]);
  for (const [id,,role] of users) await db.query('insert into public.team_members(user_id,role) values($1,$2)', [id,role]);
  async function as(id: string | null, aal = 'aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id ?? '', JSON.stringify({ sub: id, aal })]);
    await db.exec(id ? 'set role authenticated' : 'set role anon');
  }
  const item = (await db.query<{ id: string }>("insert into public.content_items(kind,stable_id) values('artist','team-assign-target') returning id")).rows[0].id;

  await as(null, 'aal2');
  await assert.rejects(db.query('select * from public.list_editorial_members()'), /permission denied/);
  await as(editor, 'aal2');
  await assert.rejects(db.query('select * from public.list_editorial_members()'), /TEAM_NOT_OWNER/);
  await assert.rejects(db.query('select public.update_editorial_member($1,$2,$3,$4,$5)', [contributor,'contributor',true,'editor',true]), /TEAM_NOT_OWNER/);
  await as(owner);
  await assert.rejects(db.query('select * from public.list_editorial_members()'), /TEAM_MFA_REQUIRED/);
  await assert.rejects(db.query('select public.assign_editorial_content($1,$2,$3)', [item,null,contributor]), /TEAM_MFA_REQUIRED/);

  await as(owner, 'aal2');
  const listed = (await db.query<{ user_id: string; email: string; role: string; active: boolean }>('select * from public.list_editorial_members()')).rows;
  assert.equal(listed.length, users.length);
  assert.equal(listed.find(member => member.user_id === owner)?.email, 'owner@example.test');
  await assert.rejects(db.query('select public.update_editorial_member($1,$2,$3,$4,$5)', [contributor,'contributor',true,null,true]), /TEAM_INVALID_INPUT/);

  const changed = await db.query<{ changed: boolean }>('select public.update_editorial_member($1,$2,$3,$4,$5) changed', [secondContributor,'contributor',true,'editor',false]);
  assert.equal(changed.rows[0].changed, true);
  await db.query('select public.update_editorial_member($1,$2,$3,$4,$5)', [secondContributor,'editor',false,'contributor',true]);
  await db.query('select public.update_editorial_member($1,$2,$3,$4,$5)', [secondOwner,'owner',true,'editor',true]);
  await assert.rejects(db.query('select public.update_editorial_member($1,$2,$3,$4,$5)', [owner,'owner',true,'editor',true]), /TEAM_LAST_ACTIVE_OWNER/);
  await assert.rejects(db.query('select public.update_editorial_member($1,$2,$3,$4,$5)', [secondContributor,'editor',true,'owner',true]), /TEAM_CONFLICT/);

  const version = (await db.query<{ version: number }>('select public.assign_editorial_content($1,$2,$3) version', [item,null,contributor])).rows[0].version;
  assert.equal(version, 1);
  await assert.rejects(db.query('select public.assign_editorial_content($1,$2,$3)', [item,null,secondContributor]), /TEAM_CONFLICT/);
  await assert.rejects(db.query('select public.assign_editorial_content($1,$2,$3)', [item,contributor,secondOwner]), /TEAM_INVALID_ASSIGNMENT/);
  const reassigned = (await db.query<{ version: number }>('select public.assign_editorial_content($1,$2,$3) version', [item,contributor,secondContributor])).rows[0].version;
  assert.equal(reassigned, 2);

  await db.exec('reset role');
  const site = (await db.query<{ id: string }>("insert into public.content_items(kind,stable_id) values('site','settings') returning id")).rows[0].id;
  const archivedItem = (await db.query<{ id: string }>("insert into public.content_items(kind,stable_id) values('artist','archived-team-item') returning id")).rows[0].id;
  await as(owner, 'aal2');
  await assert.rejects(db.query('select public.assign_editorial_content($1,$2,$3)', [site,null,contributor]), /TEAM_INVALID_ASSIGNMENT/);
  await db.query('select public.archive_editorial_content($1,0,true)', [archivedItem]);
  await assert.rejects(db.query('select public.assign_editorial_content($1,$2,$3)', [archivedItem,null,contributor]), /TEAM_CONTENT_ARCHIVED/);
  await as(secondOwner, 'aal2');
  await assert.rejects(db.query('select * from public.list_editorial_members()'), /TEAM_NOT_OWNER/);
  assert.equal((await db.query('select * from public.team_audit')).rows.length, 0);
  await as(contributor, 'aal2');
  await assert.rejects(db.query("update public.team_members set role='owner'"), /permission denied/);
  assert.equal((await db.query('select * from public.team_audit')).rows.length, 0);

  await as(owner, 'aal2');
  const auditCount = (await db.query<{ count: number }>('select count(*)::int count from public.team_audit')).rows[0].count;
  assert.equal(auditCount, 5);
  const assignmentAudit = (await db.query<{ old_owner_id: string | null; new_owner_id: string | null }>("select old_owner_id,new_owner_id from public.team_audit where action='assignment-change' order by id desc limit 1")).rows[0];
  assert.deepEqual(assignmentAudit, { old_owner_id: contributor, new_owner_id: secondContributor });
  await db.exec('reset role');
  await assert.rejects(db.query("update public.team_audit set action='member-update'"), /immutable/);
  await assert.rejects(db.query('delete from public.team_audit'), /immutable/);
  await db.query('update public.team_members set active=false where user_id=$1', [owner]);
  await as(owner, 'aal2');
  await assert.rejects(db.query('select * from public.list_editorial_members()'), /TEAM_NOT_OWNER/);
  await db.exec('reset role');
  await db.query('update public.team_members set active=true where user_id=$1',[owner]);
  await as(owner,'aal2');
  const requestId='00000000-0000-4000-8000-000000000401';
  const invitedId='00000000-0000-4000-8000-000000000402';
  const prepared=await db.query<{should_send:boolean}>('select * from public.prepare_editorial_invitation($1,$2,$3)',[requestId,'Invited@Example.com','contributor']);
  assert.equal(prepared.rows[0].should_send,true);
  const retry=await db.query<{should_send:boolean}>('select * from public.prepare_editorial_invitation($1,$2,$3)',[requestId,'invited@example.com','contributor']);
  assert.equal(retry.rows[0].should_send,false);
  await assert.rejects(db.query('select * from public.record_editorial_invitation_result($1,$2,$3,$4,$5)',[requestId,owner,'accepted',invitedId,null]),/permission denied/);
  await db.exec('reset role');
  await db.query('insert into auth.users(id,email) values($1,$2)',[invitedId,'invited@example.com']);
  await db.exec('set role service_role');
  const recorded=await db.query<{status:string}>('select * from public.record_editorial_invitation_result($1,$2,$3,$4,$5)',[requestId,owner,'accepted',invitedId,null]);
  assert.equal(recorded.rows[0].status,'accepted');
  await as(owner,'aal2');
  assert.equal((await db.query<{status:string}>('select public.activate_editorial_invitation($1) status',[requestId])).rows[0].status,'sent');
  assert.equal((await db.query<{status:string}>('select public.activate_editorial_invitation($1) status',[requestId])).rows[0].status,'sent');
  await db.exec('reset role');
  assert.equal((await db.query<{role:string}>('select role from public.team_members where user_id=$1',[invitedId])).rows[0].role,'contributor');
});
