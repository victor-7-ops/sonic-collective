import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {mfaRequirementUnmet} from '../src/lib/editorial/mfa';

const levels=(data:{currentLevel:string;nextLevel:string}|null,error:unknown=null)=>({auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data,error})}}}) as never;

test('authenticator is required only for accounts that enrolled a factor',async()=>{
  assert.equal(await mfaRequirementUnmet(levels({currentLevel:'aal1',nextLevel:'aal1'})),false);
  assert.equal(await mfaRequirementUnmet(levels({currentLevel:'aal1',nextLevel:'aal2'})),true);
  assert.equal(await mfaRequirementUnmet(levels({currentLevel:'aal2',nextLevel:'aal2'})),false);
  assert.equal(await mfaRequirementUnmet(levels(null,new Error('x'))),true);
});

test('database applies the same optional rule to every protected function',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email varchar(255)); create table auth.mfa_factors(user_id uuid,status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
  `);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,migrations),'utf8'));
  const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'o@example.com',other,'p@example.com']);
  await db.query("insert into public.team_members(user_id,role) values($1,'owner')",[owner]);
  const as=async(id:string,aal:string)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,aal})]);
    await db.exec('set role authenticated');
  };
  const unmet=async(id:string,aal:string)=>{await as(id,aal);return (await db.query<{v:boolean}>('select editorial_private.mfa_unmet() as v')).rows[0]!.v;};
  const roster=async(aal:string)=>{await as(owner,aal);return db.query('select * from public.list_editorial_members()');};

  // Not enrolled: aal1 is enough.
  assert.equal(await unmet(owner,'aal1'),false);
  assert.equal((await roster('aal1')).rows.length,1);
  // An unverified factor does not count as enrolled.
  await db.exec('reset role');await db.query("insert into auth.mfa_factors values($1,'unverified')",[owner]);
  assert.equal(await unmet(owner,'aal1'),false);
  // Enrolled: aal1 is rejected by the protected functions, aal2 passes.
  await db.exec('reset role');await db.query("update auth.mfa_factors set status='verified' where user_id=$1",[owner]);
  assert.equal(await unmet(owner,'aal1'),true);
  await assert.rejects(roster('aal1'),/TEAM_MFA_REQUIRED/);
  assert.equal(await unmet(owner,'aal2'),false);
  assert.equal((await roster('aal2')).rows.length,1);
  // Another account without a factor is unaffected.
  assert.equal(await unmet(other,'aal1'),false);
});
