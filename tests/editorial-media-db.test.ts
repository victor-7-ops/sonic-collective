import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('media assets and private derivatives require current membership and owner/editor scope',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.objects to authenticated;
  `);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,migrations),'utf8'));
  const [owner,editor,alice,bob]=[1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  for(const id of [owner,editor,alice,bob])await db.query('insert into auth.users values($1)',[id]);
  for(const [id,role] of [[owner,'owner'],[editor,'editor'],[alice,'contributor'],[bob,'contributor']])await db.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);
  await db.exec('reset role');
  const asset='11111111-1111-4111-8111-111111111111';
  await db.query(`insert into public.editorial_assets(id,owner_id,sha256,original_bytes,original_width,original_height,width,height,alt_text)
    values($1,$2,$3,1024,20,10,20,10,'Test image')`,[asset,alice,'a'.repeat(64)]);
  await db.query("update public.editorial_assets set status='ready',ready_at=now() where id=$1",[asset]);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['editorial-media',`derivatives/${asset}.webp`]);
  async function as(id:string|null) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id??'',JSON.stringify({sub:id,aal:'aal1'})]);
    await db.exec(id?'set role authenticated':'set role anon');
  }
  await as(alice);
  assert.equal((await db.query('select id from public.editorial_assets')).rows.length,1);
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
  await as(bob);
  assert.equal((await db.query('select id from public.editorial_assets')).rows.length,0);
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
  await as(editor);
  assert.equal((await db.query('select id from public.editorial_assets')).rows.length,1);
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
  await as(owner);
  assert.equal((await db.query('select id from public.editorial_assets')).rows.length,1);
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
  await db.exec('reset role');await db.query('update public.team_members set active=false where user_id=$1',[alice]);await as(alice);
  assert.equal((await db.query('select id from public.editorial_assets')).rows.length,0);
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
  await as(null);
  await assert.rejects(db.query('select id from public.editorial_assets'),/permission denied/);
  await assert.rejects(db.query('select name from storage.objects'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query<{public:boolean}>('select public from storage.buckets where id=$1',['editorial-media'])).rows[0].public,false);
});
