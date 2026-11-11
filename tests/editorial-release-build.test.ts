import {test} from 'node:test';
import assert from 'node:assert/strict';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import clips from '../src/data/clips.json';
import series from '../src/data/series.json';
import site from '../src/data/site.json';
import overrides from '../src/data/youtube-overrides.json';
import {isReleaseId,loadReleaseArtifact,requestedReleaseId} from '../src/lib/editorial/release-build';
import {buildReleaseArtifact} from '../src/lib/editorial/releases';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function snapshotRecords() {
  let revision=0;
  const records:{kind:string;stableId:string;revisionId:string;payload:unknown}[]=[];
  for(const [kind,items] of Object.entries({artist:artists,performance:performances,clip:clips,series})) for(const payload of items) records.push({kind,stableId:payload.id,revisionId:uuid(++revision),payload});
  records.push({kind:'site',stableId:'site',revisionId:uuid(++revision),payload:site});
  for(const payload of overrides) records.push({kind:'youtube-review',stableId:payload.youtubeId,revisionId:uuid(++revision),payload});
  return records;
}
const client=(row:{id:string;snapshot:unknown}|null,error:unknown=null)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error})})})})}) as never;

test('release IDs are recognised in every real form, and nothing else',()=>{
  for(const real of ['ea664a7a-cc56-495c-9c64-38722ad05184','72b9a129-5b3f-4b03-9a3c-92239a7861d8','34865cf1-6132-4aab-96ba-b58e640d3adf',uuid(1)]) assert.equal(isReleaseId(real),true,real);
  for(const bad of ['','latest','ea664a7a-cc56-495c-9c64-38722ad0518','ea664a7a-cc56-495c-9c64-38722ad05184x','../../etc','ea664a7a-cc56-095c-9c64-38722ad05184']) assert.equal(isReleaseId(bad),false,bad);
});

test('release selection is explicit, well-formed and unambiguous',()=>{
  assert.equal(requestedReleaseId({}),null);
  assert.equal(requestedReleaseId({CMS_RELEASE_ID:'  '}),null);
  assert.equal(requestedReleaseId({CMS_RELEASE_ID:uuid(5)}),uuid(5));
  assert.throws(()=>requestedReleaseId({CMS_RELEASE_ID:'latest'}),/UUID/);
  assert.throws(()=>requestedReleaseId({CMS_RELEASE_ID:uuid(5),CMS_RELEASE_FILE:'/tmp/x.json'}),/not both/);
});

test('a stored release loads as a validated artifact with a stable hash',async()=>{
  const records=snapshotRecords();
  const artifact=await loadReleaseArtifact(client({id:uuid(900),snapshot:records}),uuid(900));
  assert.equal(artifact.releaseId,uuid(900));
  assert.equal(artifact.contentHash,buildReleaseArtifact(uuid(900),records).contentHash);
});

test('missing, unreadable or invalid releases abort the build',async()=>{
  await assert.rejects(()=>loadReleaseArtifact(client(null),uuid(1)),/does not exist/);
  await assert.rejects(()=>loadReleaseArtifact(client(null,new Error('db')),uuid(1)),/could not be read/);
  await assert.rejects(()=>loadReleaseArtifact(client({id:uuid(2),snapshot:snapshotRecords().filter(record=>record.kind!=='site')}),uuid(2)),/site settings/);
  await assert.rejects(()=>loadReleaseArtifact(client({id:uuid(3),snapshot:'not-an-array'}),uuid(3)));
});
