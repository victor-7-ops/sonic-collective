import test from 'node:test';
import assert from 'node:assert/strict';
import type {PGlite} from '@electric-sql/pglite';
import {migratedScratchDb} from '../scripts/lib/scratch-db';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import clips from '../src/data/clips.json';
import series from '../src/data/series.json';
import site from '../src/data/site.json';
import overrides from '../src/data/youtube-overrides.json';
import {seedSql} from '../src/lib/editorial/content';
import {backupTables,buildManifest,checkIntegrity,exportBackup,restoreBackup,tableDigest,verifyManifest,type BackupData,type BackupTable} from '../src/lib/editorial/backup';

const ids=[1,2,3].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const [owner,editor,alice]=ids;

const migratedDb=()=>migratedScratchDb(ids);
// to_jsonb mirrors what the hosted API returns, including timestamp microseconds.
const readAll=(db:PGlite)=>(table:BackupTable)=>db.query<{r:Record<string,unknown>}>(`select to_jsonb(t) r from public.${table} t`).then(result=>result.rows.map(row=>row.r));

test('backup and restore reproduce the editorial database exactly and the result is usable',async t=>{
  const src=await migratedDb();const dst=await migratedDb();
  t.after(async()=>{await src.close();await dst.close();});

  for(const [id,role] of [[owner,'owner'],[editor,'editor'],[alice,'contributor']]) await src.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);
  const records=[
    ...artists.map(payload=>({kind:'artist' as const,stableId:payload.id,payload})),
    ...performances.map(payload=>({kind:'performance' as const,stableId:payload.id,payload})),
    ...clips.map(payload=>({kind:'clip' as const,stableId:payload.id,payload})),
    ...series.map(payload=>({kind:'series' as const,stableId:payload.id,payload})),
    {kind:'site' as const,stableId:'site',payload:site},
    ...overrides.map(payload=>({kind:'youtube-review' as const,stableId:payload.youtubeId,payload})),
  ];
  await src.exec(seedSql(records));

  // Realistic activity beyond the seed: a contributor draft, a reviewer comment, an image, a release.
  const as=async(id:string)=>{
    await src.exec('reset role');
    await src.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,aal:'aal1'})]);
    await src.exec('set role authenticated');
  };
  await as(alice);
  await src.query("select public.save_editorial_content('artist','backup-artist',$1,0)",[{id:'backup-artist',name:'Backup Artist',aliases:[],kind:'solo',focalPoint:'50% 50%',portraitLayout:'portrait',links:[]}]);
  const draft=(await src.query<{id:string;draft_revision_id:string}>("select id,draft_revision_id from public.content_items where stable_id='backup-artist'")).rows[0]!;
  await src.query("select public.review_editorial_content($1,$2,'submit')",[draft.id,draft.draft_revision_id]);
  await as(editor);
  await src.query("select public.request_editorial_changes($1,$2,'Add a biography.')",[draft.id,draft.draft_revision_id]);
  await src.exec('reset role');
  await src.query("insert into public.editorial_assets(owner_id,status,sha256,original_bytes,original_width,original_height,width,height,alt_text,ready_at) values($1,'pending',$2,100,10,10,10,10,'Test image',null)",[alice,'a'.repeat(64)]);
  await src.exec("update public.editorial_assets set status='ready',ready_at=now()");
  await src.query("insert into public.editorial_releases(request_id,created_by,expected_map,snapshot,created_at) values($1,$2,'[]','[]','2026-11-05 13:45:43.433254+00')",[ids[0],owner]);

  const {data,manifest}=await exportBackup(readAll(src));
  assert.deepEqual(verifyManifest(data,manifest),[]);
  assert.ok(data.content_items.length>130);
  assert.equal(data.editorial_review_comments.length,1);
  assert.equal(data.editorial_assets.length,1);
  assert.deepEqual(await checkIntegrity(src),[]);

  // The backup survives a trip through plain JSON files, as it would on disk.
  const reloaded=JSON.parse(JSON.stringify(data)) as BackupData;
  await restoreBackup(dst,reloaded);
  const again=await exportBackup(readAll(dst));
  for(const table of backupTables) assert.equal(again.manifest.tables[table].sha256,manifest.tables[table].sha256,`${table} differs after restore`);
  assert.deepEqual(await checkIntegrity(dst),[]);
  // Timestamps keep their microseconds through the round trip.
  assert.equal(again.data.editorial_releases[0]!.created_at,'2026-11-05T13:45:43.433254+00:00');
  // Generated asset paths are rebuilt, not copied.
  assert.equal((await dst.query<{p:string}>('select derivative_path p from public.editorial_assets')).rows[0]!.p.startsWith('derivatives/'),true);

  // The restored database keeps working: new writes get fresh identity values and obey the same rules.
  await dst.exec('reset role');
  await dst.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[alice,JSON.stringify({sub:alice,aal:'aal1'})]);
  await dst.exec('set role authenticated');
  await dst.query("select public.save_editorial_content('artist','after-restore',$1,0)",[{id:'after-restore',name:'After Restore'}]);
  await dst.exec('reset role');
  assert.equal(Number((await dst.query<{n:number}>('select count(*) n from public.content_items')).rows[0]!.n),data.content_items.length+1);
  assert.equal(Number((await dst.query<{n:number}>("select count(*) n from public.editorial_audit")).rows[0]!.n),data.editorial_audit.length+1);
});

test('damaged or incomplete backups are detected before and after restore',async t=>{
  const db=await migratedDb();
  t.after(()=>db.close());
  await db.query("insert into public.team_members(user_id,role) values($1,'owner')",[owner]);
  await db.exec(seedSql([{kind:'artist',stableId:artists[0]!.id,payload:artists[0]!}]));
  const {data,manifest}=await exportBackup(readAll(db));
  assert.deepEqual(verifyManifest(data,manifest),[]);

  const edited=structuredClone(data);
  (edited.content_revisions[0]!.payload as Record<string,unknown>).name='Tampered';
  assert.match(verifyManifest(edited,manifest).join(' '),/content_revisions: contents do not match/);
  const truncated=structuredClone(data);truncated.content_items=[];
  assert.match(verifyManifest(truncated,manifest).join(' '),/content_items: expected 1 rows, found 0/);
  assert.match(verifyManifest({...data,team_members:undefined as never},manifest).join(' '),/missing team_members/);
  assert.match(verifyManifest(data,{...manifest,schemaVersion:2 as never}).join(' '),/Unsupported/);

  // Integrity checks catch a restore that lost a revision or the last owner.
  await db.exec('set session_replication_role = replica');
  await db.exec('delete from public.content_revisions');
  await db.exec('delete from public.team_members');
  await db.exec('set session_replication_role = origin');
  const problems=(await checkIntegrity(db)).join(' ');
  assert.match(problems,/draft revision is missing/);
  assert.match(problems,/approved revision is missing/);
  assert.match(problems,/no active owner/);
  assert.doesNotMatch(problems,/version is behind/);
});

test('an item may be ahead of its draft revision (archiving bumps the version) but never behind it',async t=>{
  const db=await migratedDb();
  t.after(()=>db.close());
  await db.query("insert into public.team_members(user_id,role) values($1,'owner')",[owner]);
  await db.exec(seedSql([{kind:'artist',stableId:artists[0]!.id,payload:artists[0]!}]));
  assert.deepEqual(await checkIntegrity(db),[]);
  await db.exec('update public.content_items set version=version+1');
  assert.deepEqual(await checkIntegrity(db),[]);
  await db.exec('update public.content_items set version=version+1');
  assert.deepEqual(await checkIntegrity(db),[]);
  await db.exec('set session_replication_role = replica');
  await db.exec('update public.content_items set version=0');
  await db.exec('set session_replication_role = origin');
  assert.match((await checkIntegrity(db)).join(' '),/1 items whose version is behind their draft revision/);
});

test('manifest digests ignore row order but not content',()=>{
  const rows=[{id:1,v:'a'},{id:2,v:'b'}];
  assert.equal(tableDigest(rows),tableDigest([...rows].reverse()));
  assert.notEqual(tableDigest(rows),tableDigest([{id:1,v:'a'},{id:2,v:'c'}]));
  const data=Object.fromEntries(backupTables.map(table=>[table,[]])) as unknown as BackupData;
  assert.equal(buildManifest(data).tables.content_items.rows,0);
});
