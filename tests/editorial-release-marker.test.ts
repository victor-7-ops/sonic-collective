import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReleaseMarker,readLiveRelease,releaseMarkerSchema,releaseStatus} from '../src/lib/editorial/release-marker';

const id='ea664a7a-cc56-495c-9c64-38722ad05184',hash='ef83aaf806bf'.padEnd(64,'0');
const respond=(body:unknown,ok=true)=>(async()=>({ok,json:async()=>body})) as unknown as typeof fetch;

test('markers tie a release to its content hash and a repository build to neither',()=>{
  const release=buildReleaseMarker({releaseId:id,contentHash:hash},'e1aaa60236b1946e7e092a876a7d35ae930b2b60',new Date('2026-11-11T02:00:00Z'));
  assert.equal(release.source,'release');assert.equal(release.commit?.length,40);
  const repo=buildReleaseMarker(null,undefined);
  assert.deepEqual([repo.source,repo.releaseId,repo.contentHash,repo.commit],['repository',null,null,null]);
  assert.equal(buildReleaseMarker(null,'not a sha').commit,null);
  assert.throws(()=>releaseMarkerSchema.parse({...release,contentHash:null}));
  assert.throws(()=>releaseMarkerSchema.parse({...repo,releaseId:id}));
});

test('only a matching deployed marker counts as live',async()=>{
  const marker=buildReleaseMarker({releaseId:id,contentHash:hash},undefined);
  const live=await readLiveRelease('https://example.com',respond(marker));
  assert.equal(live.state,'release');
  assert.equal(releaseStatus(id,hash,live),'live');
  assert.equal(releaseStatus(id,undefined,live),'live');
  assert.equal(releaseStatus('00000000-0000-4000-8000-000000000001',hash,live),'prepared');
  assert.equal(releaseStatus(id,'a'.repeat(64),live),'prepared');
});

test('missing, failed or malformed markers are unknown and never live',async()=>{
  for(const fetcher of [respond({},true),respond(null,false),respond({schemaVersion:2}),(async()=>{throw new Error('network');}) as unknown as typeof fetch]) {
    const live=await readLiveRelease('https://example.com',fetcher);
    assert.equal(live.state,'unknown');
    assert.equal(releaseStatus(id,hash,live),'prepared');
  }
  const repo=await readLiveRelease('https://example.com',respond(buildReleaseMarker(null,undefined)));
  assert.equal(repo.state,'repository');assert.equal(releaseStatus(id,hash,repo),'prepared');
});
