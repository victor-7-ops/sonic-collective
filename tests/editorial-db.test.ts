import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { seedSql } from '../src/lib/editorial/content';
import { catalog } from './fixtures';

test('editorial database enforces current membership, ownership, revision locks and MFA', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
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
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name,migrations),'utf8'));
  }
  const [owner, editor, alice, bob, stranger] = [1, 2, 3, 4, 5].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  for (const id of [owner, editor, alice, bob, stranger]) await db.query('insert into auth.users values($1)', [id]);
  for (const [id, role] of [[owner,'owner'],[editor,'editor'],[alice,'contributor'],[bob,'contributor']]) {
    await db.query('insert into public.team_members(user_id,role) values($1,$2)', [id,role]);
  }
  async function as(id: string | null, aal = 'aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id ?? '',JSON.stringify({ sub:id,aal })]);
    await db.exec(id ? 'set role authenticated' : 'set role anon');
  }
  const save = (name: string, version: number, kind='artist') => db.query<{ id: string }>(
    'select public.save_editorial_content($1,$2,$3,$4) as id', [kind,name,{ name },version]);
  await as(null);
  await assert.rejects(db.query('select * from public.content_items'), /permission denied/);
  await as(stranger);
  assert.equal((await db.query('select * from public.content_items')).rows.length, 0);
  await assert.rejects(save('outsider',0), /membership required/);
  await as(alice);
  const revision = (await save('alice',0)).rows[0].id;
  const item = (await db.query<{ id: string }>('select id from public.content_items')).rows[0].id;
  await assert.rejects(save('settings',0,'site'), /Editor permission/);
  await assert.rejects(db.query("update public.team_members set role='owner'"), /permission denied/);
  await assert.rejects(db.query("update public.content_items set approved_revision_id=draft_revision_id"), /permission denied/);
  await assert.rejects(db.query("insert into public.content_revisions(item_id,version,payload) values($1,99,'{}')", [item]), /permission denied/);
  await db.query('select public.review_editorial_content($1,$2,$3)', [item,revision,'submit']);
  await assert.rejects(db.query('select public.review_editorial_content($1,$2,$3)', [item,revision,'approve']), /Editor permission/);
  await assert.rejects(save('alice',0), /Content changed/);
  await as(bob);
  assert.equal((await db.query('select * from public.content_revisions')).rows.length, 0);
  assert.equal((await db.query('select * from public.editorial_audit')).rows.length, 0);
  await assert.rejects(save('alice',1), /not assigned/);
  await as(editor);
  await assert.rejects(db.query('select public.review_editorial_content($1,$2,$3)', [item,revision,'approve']), /Multi-factor/);
  await as(editor,'aal2');
  await db.query('select public.review_editorial_content($1,$2,$3)', [item,revision,'approve']);
  const revision2 = (await save('alice',1)).rows[0].id;
  const state = (await db.query<{ review_state:string; approved_revision_id:string }>('select * from public.content_items')).rows[0];
  assert.equal(state.review_state,'draft');
  assert.equal(state.approved_revision_id,revision);
  assert.notEqual(revision2,revision);
  await assert.rejects(db.query('select public.review_editorial_content($1,$2,$3)', [item,revision,'approve']), /Content changed/);
  const originalPayload=(await db.query<{payload:unknown}>('select payload from public.content_revisions where id=$1',[revision])).rows[0].payload;
  await db.query('select public.save_editorial_content($1,$2,$3,$4)',['artist','alice',JSON.stringify(originalPayload),2]);
  const restored=(await db.query<{version:number;draft_revision_id:string;approved_revision_id:string;review_state:string}>('select * from public.content_items where id=$1',[item])).rows[0];
  assert.equal(restored.version,3);
  assert.equal(restored.approved_revision_id,revision);
  assert.equal(restored.review_state,'draft');
  assert.notEqual(restored.draft_revision_id,revision);
  await db.exec('reset role');
  await db.query('update public.team_members set active=false where user_id=$1',[editor]);
  await as(editor,'aal2');
  assert.equal((await db.query('select * from public.content_items')).rows.length,0);
  await assert.rejects(save('alice',2), /membership required/);
  await db.exec('reset role');
  await assert.rejects(db.query("update public.content_revisions set payload='{}'"), /immutable/);
  await assert.rejects(db.query('delete from public.editorial_audit'), /immutable/);
  assert.equal((await db.query<{ n:number }>('select count(*)::int as n from public.content_revisions')).rows[0].n,3);
  assert.equal((await db.query<{ public:boolean }>('select public from storage.buckets where id=\'editorial-drafts\'')).rows[0].public,false);
  const artist={...catalog().artists[0],id:'seed-artist',bio:"It's $seed_0$; $$ select 'private';"};
  const sql=seedSql([{kind:'artist',stableId:artist.id,payload:artist}]);
  await db.exec(sql);
  await db.exec(sql);
  const seeded=(await db.query<{payload:{bio:string}}>("select payload from public.content_revisions r join public.content_items i on i.id=r.item_id where i.stable_id='seed-artist'")).rows;
  assert.equal(seeded.length,1);
  assert.equal(seeded[0].payload.bio,artist.bio);
});
