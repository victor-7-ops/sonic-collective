import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import clips from '../src/data/clips.json';
import series from '../src/data/series.json';
import site from '../src/data/site.json';
import overrides from '../src/data/youtube-overrides.json';
import {buildReleaseArtifact} from '../src/lib/editorial/releases';
import {loadApprovedReleaseRecords,type ApprovedItemRow} from '../src/lib/editorial/release-server';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function baselineRecords() {
  let revision=0;
  const records:{kind:string;stableId:string;revisionId:string;payload:unknown}[]=[];
  for(const [kind,items] of Object.entries({artist:artists,performance:performances,clip:clips,series})) {
    for(const payload of items) records.push({kind,stableId:payload.id,revisionId:uuid(++revision),payload});
  }
  records.push({kind:'site',stableId:'site',revisionId:uuid(++revision),payload:site});
  for(const payload of overrides) records.push({kind:'youtube-review',stableId:payload.youtubeId,revisionId:uuid(++revision),payload});
  return records;
}

test('release artifact validates the complete map and hashes canonically',()=>{
  const records=baselineRecords();
  const first=buildReleaseArtifact(uuid(900),records);
  const second=buildReleaseArtifact(uuid(900),[...records].reverse());
  assert.equal(first.schemaVersion,1);
  assert.equal(first.contentHash,second.contentHash);
  assert.deepEqual(first.revisionMap,second.revisionMap);
  assert.equal(first.catalog.artists.length,artists.length);
  assert.equal(first.catalog.performances.length,performances.length);
  assert.equal(first.youtubeOverrides.length,overrides.length);
});

test('release artifact rejects missing site, broken graph, media and override references',()=>{
  const records=baselineRecords();
  assert.throws(()=>buildReleaseArtifact(uuid(901),records.filter(record=>record.kind!=='site')),/site settings/);
  const brokenSite=records.map(record=>record.kind==='site'?{...record,payload:{...site,hero:{...site.hero,performanceId:'missing-performance'}}}:record);
  assert.throws(()=>buildReleaseArtifact(uuid(902),brokenSite),/Invalid release catalog/);
  const brokenMedia=records.map(record=>record.kind==='performance'?{...record,payload:{...record.payload as object,thumbnail:'/media/missing.webp'}}:record);
  assert.throws(()=>buildReleaseArtifact(uuid(903),brokenMedia),/Invalid release catalog/);
  const arbitraryClip=records.map(record=>record.kind==='clip'?{...record,payload:{...record.payload as object,src:'/media/unverified.mp4'}}:record);
  assert.throws(()=>buildReleaseArtifact(uuid(905),arbitraryClip),/Invalid release catalog/);
  const brokenOverride=records.map(record=>record.kind==='youtube-review'?{...record,payload:{...record.payload as object,artistIds:['missing-artist']}}:record);
  assert.throws(()=>buildReleaseArtifact(uuid(904),brokenOverride),/missing artist/);
});

test('approved release loader pages items, batches revisions, orders map and checks revision ownership',async()=>{
  const rows:ApprovedItemRow[]=Array.from({length:550},(_,index)=>({id:uuid(index+1000),kind:'artist',stable_id:`artist-${String(549-index).padStart(3,'0')}`,approved_revision_id:uuid(index+2000)}));
  const pageCalls:number[][]=[];const revisionBatches:number[]=[];
  const loaded=await loadApprovedReleaseRecords({
    async items(from,to){pageCalls.push([from,to]);return {data:rows.slice(from,to+1),error:null};},
    async revisions(ids){
      revisionBatches.push(ids.length);
      return {data:ids.map((id,index)=>({id,item_id:rows.find(row=>row.approved_revision_id===id)!.id,payload:{id:`payload-${index}`}})),error:null};
    },
  });
  assert.deepEqual(pageCalls,[[0,499],[500,999]]);
  assert.deepEqual(revisionBatches,[100,100,100,100,100,50]);
  assert.equal(loaded.records.length,550);
  assert.equal(loaded.expectedMap[0]?.stableId,'artist-000');
  await assert.rejects(loadApprovedReleaseRecords({
    async items(){return {data:[rows[0]!],error:null};},
    async revisions(ids){return {data:ids.map(id=>({id,item_id:uuid(999),payload:{}})),error:null};},
  }),/saved revision is unavailable/);
});

test('release RPC requires editor MFA, compares the approved map, snapshots active rows and is immutable/idempotent',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'') ,'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
  `);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,migrations),'utf8'));
  const owner=uuid(1),editor=uuid(2),contributor=uuid(3);
  for(const id of [owner,editor,contributor]) await db.query('insert into auth.users values($1)',[id]);
  for(const [id,role] of [[owner,'owner'],[editor,'editor'],[contributor,'contributor']]) await db.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);
  async function as(id:string|null,aal='aal1') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id??'',JSON.stringify({sub:id,aal})]);
    await db.exec(id?'set role authenticated':'set role anon');
  }
  async function seed(stableId:string) {
    const item=(await db.query<{id:string}>('insert into public.content_items(kind,stable_id) values(\'artist\',$1) returning id',[stableId])).rows[0]!.id;
    const revision=(await db.query<{id:string}>('insert into public.content_revisions(item_id,version,payload) values($1,1,$2) returning id',[item,{id:stableId}])).rows[0]!.id;
    await db.query("update public.content_items set version=1,draft_revision_id=$2,approved_revision_id=$2,review_state='approved' where id=$1",[item,revision]);
    return item;
  }
  const active=await seed('active-artist');const archived=await seed('archived-artist');
  await as(editor,'aal2');await db.query('select public.archive_editorial_content($1,1,true)',[archived]);
  let expected=(await db.query<{map:unknown}>('select coalesce(jsonb_agg(jsonb_build_object(\'kind\',kind,\'stableId\',stable_id,\'revisionId\',approved_revision_id) order by kind,stable_id),\'[]\'::jsonb) map from public.content_items where archived_at is null and approved_revision_id is not null')).rows[0]!.map;
  await as(null);await assert.rejects(db.query('select public.create_editorial_release($1,$2)',[uuid(100),expected]),/permission denied/);
  await as(contributor,'aal2');await assert.rejects(db.query('select public.create_editorial_release($1,$2)',[uuid(100),expected]),/Editor permission/);
  await as(editor);await assert.rejects(db.query('select public.create_editorial_release($1,$2)',[uuid(100),expected]),/Multi-factor/);
  await as(editor,'aal2');await assert.rejects(db.query('select public.create_editorial_release($1,$2)',[uuid(100),[]]),/Approved content changed/);
  await db.exec('reset role');
  const newerRevision=(await db.query<{id:string}>('insert into public.content_revisions(item_id,version,payload) select id,2,jsonb_build_object(\'id\',stable_id,\'changed\',true) from public.content_items where stable_id=\'active-artist\' returning id')).rows[0]!.id;
  await db.query('update public.content_items set version=2,draft_revision_id=$1,approved_revision_id=$1 where stable_id=\'active-artist\'',[newerRevision]);
  await as(editor,'aal2');
  await assert.rejects(db.query('select public.create_editorial_release($1,$2)',[uuid(101),expected]),/Approved content changed/);
  expected=(await db.query<{map:unknown}>('select coalesce(jsonb_agg(jsonb_build_object(\'kind\',kind,\'stableId\',stable_id,\'revisionId\',approved_revision_id) order by kind,stable_id),\'[]\'::jsonb) map from public.content_items where archived_at is null and approved_revision_id is not null')).rows[0]!.map;
  const releaseId=(await db.query<{id:string}>('select public.create_editorial_release($1,$2) id',[uuid(100),expected])).rows[0]!.id;
  const snapshot=(await db.query<{snapshot:{stableId:string}[]}>('select snapshot from public.editorial_releases where id=$1',[releaseId])).rows[0]!.snapshot;
  assert.deepEqual(snapshot.map(record=>record.stableId),['active-artist']);
  assert.equal((await db.query<{id:string}>('select public.create_editorial_release($1,$2) id',[uuid(100),expected])).rows[0]!.id,releaseId);
  await assert.rejects(db.query('select public.create_editorial_release($1,$2)',[uuid(100),[]]),/already used/);
  await db.exec('reset role');
  await assert.rejects(db.query('update public.editorial_releases set snapshot=\'[]\'::jsonb where id=$1',[releaseId]),/Editorial releases are immutable/);
  await assert.rejects(db.query('delete from public.editorial_releases where id=$1',[releaseId]),/Editorial releases are immutable/);
  await db.query('update public.team_members set active=false where user_id=$1',[editor]);
  await assert.rejects(db.query('select public.create_editorial_release($1,$2)',[uuid(100),expected]),/Active team membership required/);
  await db.exec('reset role');
  assert.ok(active);
});

