import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('editorial archive requires editor MFA, protects references, and preserves history', async (t) => {
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
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  const [owner, editor, contributor] = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  for (const id of [owner, editor, contributor]) await db.query('insert into auth.users values($1)', [id]);
  for (const [id, role] of [[owner, 'owner'], [editor, 'editor'], [contributor, 'contributor']]) {
    await db.query('insert into public.team_members(user_id,role) values($1,$2)', [id, role]);
  }
  async function as(id: string | null, aal = 'aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id ?? '', JSON.stringify({ sub: id, aal })]);
    await db.exec(id ? 'set role authenticated' : 'set role anon');
  }
  async function seed(kind: string, stableId: string, payload: object, approved = true) {
    const item = (await db.query<{ id: string }>('insert into public.content_items(kind,stable_id) values($1,$2) returning id', [kind, stableId])).rows[0].id;
    const revision = (await db.query<{ id: string }>('insert into public.content_revisions(item_id,version,payload) values($1,1,$2) returning id', [item, payload])).rows[0].id;
    await db.query(approved
      ? "update public.content_items set version=1,draft_revision_id=$2,approved_revision_id=$2,review_state='approved' where id=$1"
      : "update public.content_items set version=1,draft_revision_id=$2,approved_revision_id=null,review_state='draft' where id=$1", [item, revision]);
    return item;
  }
  const artist = await seed('artist', 'artist-a', { id: 'artist-a' });
  await seed('performance', 'performance-a', { id: 'performance-a', artistIds: ['artist-a'] });
  await seed('performance', 'performance-draft', { id: 'performance-draft', artistIds: ['artist-a'] }, false);
  const freeArtist = await seed('artist', 'artist-b', { id: 'artist-b' });
  const featuredArtist = await seed('artist', 'artist-c', { id: 'artist-c' });
  await seed('site', 'site', { featuredArtistIds: ['artist-c'], hero: { performanceId: 'performance-b' } });
  const heroPerformance = await seed('performance', 'performance-b', { id: 'performance-b', artistIds: [] });
  const clippedPerformance = await seed('performance', 'performance-c', { id: 'performance-c', artistIds: [] });
  await seed('clip', 'clip-c', { id: 'clip-c', performanceId: 'performance-c' });

  await as(null);
  await assert.rejects(db.query('select public.archive_editorial_content($1,1,true)', [freeArtist]), /permission denied/);
  await as(contributor, 'aal2');
  await assert.rejects(db.query('select public.archive_editorial_content($1,1,true)', [freeArtist]), /Editor permission/);
  await as(editor);
  await assert.rejects(db.query('select public.archive_editorial_content($1,1,true)', [freeArtist]), /Multi-factor/);
  await as(editor, 'aal2');
  await assert.rejects(db.query('select public.archive_editorial_content($1,0,true)', [freeArtist]), /Content changed/);
  await assert.rejects(db.query('select public.archive_editorial_content($1,1,true)', [artist]), /referenced by an active draft or approved record/);
  await assert.rejects(db.query('select public.archive_editorial_content($1,1,true)', [featuredArtist]), /referenced by an active draft or approved record/);
  await assert.rejects(db.query('select public.archive_editorial_content($1,1,true)', [heroPerformance]), /referenced by an active draft or approved record/);
  await assert.rejects(db.query('select public.archive_editorial_content($1,1,true)', [clippedPerformance]), /referenced by an active draft or approved record/);

  const before = (await db.query<{ revision_count: number; version: number }>(
    'select (select count(*)::int from public.content_revisions where item_id=$1) revision_count, version from public.content_items where id=$1', [freeArtist])).rows[0];
  const archivedVersion = (await db.query<{ version: number }>('select public.archive_editorial_content($1,1,true) version', [freeArtist])).rows[0].version;
  assert.equal(archivedVersion, 2);
  const archived = (await db.query<{ archived_at: string | null; version: number }>('select archived_at,version from public.content_items where id=$1', [freeArtist])).rows[0];
  assert.ok(archived.archived_at);
  assert.equal(archived.version, 2);
  await assert.rejects(db.query('select public.save_editorial_content($1,$2,$3,$4)', ['artist', 'artist-b', { id: 'artist-b' }, 2]), /Archived content/);
  const actions = (await db.query<{ action: string }>('select action from public.editorial_audit where item_id=$1 order by id', [freeArtist])).rows;
  assert.deepEqual(actions.map(row => row.action), ['archive']);
  const afterCount = (await db.query<{ n: number }>('select count(*)::int n from public.content_revisions where item_id=$1', [freeArtist])).rows[0].n;
  assert.equal(afterCount, before.revision_count);
  await assert.rejects(db.query('select public.save_editorial_content($1,$2,$3,$4)', ['performance', 'performance-new', { id: 'performance-new', artistIds: ['artist-b'] }, 0]), /Cannot reference archived content/);

  await assert.rejects(db.query('select public.archive_editorial_content($1,1,false)', [freeArtist]), /Content changed/);
  const restoredVersion = (await db.query<{ version: number }>('select public.archive_editorial_content($1,2,false) version', [freeArtist])).rows[0].version;
  assert.equal(restoredVersion, 3);
  const history = (await db.query<{ action: string }>('select action from public.editorial_audit where item_id=$1 order by id', [freeArtist])).rows;
  assert.deepEqual(history.map(row => row.action), ['archive', 'unarchive']);
  assert.equal((await db.query<{ archived_at: string | null }>('select archived_at from public.content_items where id=$1', [freeArtist])).rows[0].archived_at, null);

  async function rejectRestoreWithStaleReference(pointer: 'draft' | 'approved') {
    await db.exec('reset role');
    const suffix = pointer;
    const referencedArtist = await seed('artist', `restore-artist-${suffix}`, { id: `restore-artist-${suffix}` });
    const referencedPayload = { id: `restore-performance-${suffix}`, artistIds: [`restore-artist-${suffix}`] };
    const clearPayload = { id: `restore-performance-${suffix}`, artistIds: [] };
    const item = (await db.query<{ id: string }>('insert into public.content_items(kind,stable_id) values($1,$2) returning id', ['performance', `restore-performance-${suffix}`])).rows[0].id;
    const oldRevision = (await db.query<{ id: string }>('insert into public.content_revisions(item_id,version,payload) values($1,1,$2) returning id', [item, referencedPayload])).rows[0].id;
    const newRevision = (await db.query<{ id: string }>('insert into public.content_revisions(item_id,version,payload) values($1,2,$2) returning id', [item, clearPayload])).rows[0].id;
    const draftRevision = pointer === 'draft' ? oldRevision : newRevision;
    const approvedRevision = pointer === 'approved' ? oldRevision : newRevision;
    await db.query("update public.content_items set version=2,draft_revision_id=$2,approved_revision_id=$3,review_state='approved' where id=$1", [item, draftRevision, approvedRevision]);

    await as(editor, 'aal2');
    await db.query('select public.archive_editorial_content($1,2,true)', [item]);
    await db.query('select public.archive_editorial_content($1,1,true)', [referencedArtist]);
    const before = (await db.query<{ archived_at: string | null; version: number; revisions: number; actions: string[] }>(
      `select archived_at,version,
        (select count(*)::int from public.content_revisions where item_id=$1) revisions,
        (select array_agg(action order by id) from public.editorial_audit where item_id=$1) actions
       from public.content_items where id=$1`, [item])).rows[0];
    await assert.rejects(db.query('select public.archive_editorial_content($1,3,false)', [item]), /Cannot reference archived content/);
    const after = (await db.query<{ archived_at: string | null; version: number; revisions: number; actions: string[] }>(
      `select archived_at,version,
        (select count(*)::int from public.content_revisions where item_id=$1) revisions,
        (select array_agg(action order by id) from public.editorial_audit where item_id=$1) actions
       from public.content_items where id=$1`, [item])).rows[0];
    assert.deepEqual(after, before, `${pointer} reference rejection must preserve archive state, version, revisions and audit`);
  }

  await rejectRestoreWithStaleReference('draft');
  await rejectRestoreWithStaleReference('approved');
});
