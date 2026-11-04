import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, makeSnapshot, emptySnapshot, purgeExpiredSnapshot } from '../src/lib/youtube-import.js';
import { candidateSnapshot, fetchCycle, writeAtomic } from '../scripts/sync-youtube.js';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('parses ISO durations with hours and days; rejects zero, malformed and ongoing',()=>{
  assert.equal(parseDuration('PT1H1M1S'),3661);assert.equal(parseDuration('P1DT2H'),93600);assert.equal(parseDuration('PT0S'),null);assert.equal(parseDuration('P2D'),172800);assert.equal(parseDuration('P'),null);assert.equal(parseDuration('P1Y'),null);assert.equal(parseDuration('P1DT'),null);
});
test('uninitialized empty snapshot is distinct from a complete empty cycle',()=>{
  const before=emptySnapshot('channel'),result=candidateSnapshot([],before,new Date('2026-11-04T00:00:00Z'));
  assert.equal(result.changed,true);assert.equal(result.needsPublish,true);assert.equal(result.snapshot.initialized,true);
});
test('maintenance is due at seven days even when content hash is unchanged',()=>{
  const initial=makeSnapshot([], 'channel',new Date('2026-11-01T00:00:00Z'));
  const result=candidateSnapshot([],initial,new Date('2026-11-08T00:00:00Z'));
  assert.equal(result.changed,false);assert.equal(result.maintenanceDue,true);assert.equal(result.needsPublish,true);
});
test('expiry maintenance purges metadata and records the explicit purge marker',()=>{
  const snapshot=makeSnapshot([{youtubeId:'AbCdEfGhIjK',channelId:'channel',title:'Song',thumbnailUrl:'https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg',publishedAt:'2026-11-01T00:00:00Z',durationSeconds:60,seriesId:null,embeddable:true}],'channel',new Date('2026-11-01T00:00:00Z'));
  const purged=purgeExpiredSnapshot(snapshot,new Date('2026-12-01T00:00:00Z'));assert.deepEqual(purged.videos,[]);assert.equal(purged.purged?.reason,'expired');
});
test('blocks broad removal while permitting a smaller authoritative deletion',()=>{
  const rows=Array.from({length:8},(_,i)=>({youtubeId:`id${String(i).padStart(9,'0')}`,channelId:'channel',title:`Video ${i}`,thumbnailUrl:'https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg',publishedAt:'2026-11-01T00:00:00Z',durationSeconds:100,seriesId:null,embeddable:true}));
  const previous=makeSnapshot(rows,'channel',new Date('2026-11-01T00:00:00Z'));
  assert.throws(()=>candidateSnapshot(rows.slice(0,5),previous),/Unexpected removal guard/);
  assert.equal(candidateSnapshot(rows.slice(0,5),previous,new Date(),'reviewed API removal').changed,true);
  assert.equal(candidateSnapshot(rows.slice(0,7),previous).changed,true);
});
test('fetches all pages and batches videos by 50, then filters foreign/private/live/invalid entries',async()=>{
  const ids=Array.from({length:51},(_,i)=>`v${String(i).padStart(9,'0')}`),batches:number[]=[];
  const fetcher=async(input:URL|RequestInfo)=>{
    const url=new URL(String(input));let body:any;
    if(url.pathname.endsWith('/channels'))body={items:[{id:'UCCxO94rfXnMpYf7DH_sd6Bw',contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]};
    else if(url.pathname.endsWith('/playlistItems'))body=url.searchParams.has('pageToken')?{items:[{contentDetails:{videoId:ids[50]}}]}:{items:[...ids.slice(0,50),ids[0]].map(videoId=>({contentDetails:{videoId}})),nextPageToken:'next'};
    else {const group=url.searchParams.get('id')!.split(',');batches.push(group.length);body={items:group.map(id=>({id,snippet:{title:id,channelId:id===ids[0]?'foreign':'UCCxO94rfXnMpYf7DH_sd6Bw',publishedAt:'2026-11-04T00:00:00Z',thumbnails:{high:{url:'https://i.ytimg.com/vi/x/hqdefault.jpg'}}},contentDetails:{duration:id===ids[1]?'P1DT1H':'PT1M'},status:{privacyStatus:id===ids[2]?'private':'public',embeddable:id!==ids[3]},...(id===ids[4]?{liveStreamingDetails:{actualStartTime:'2026-11-04T00:00:00Z'}}:{})}))};}
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await fetchCycle(async(input,init)=>{assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'),'test-key');return fetcher(input) as Promise<Response>;},'test-key',new Date('2026-11-04T00:00:00Z'),[]);
  assert.deepEqual(batches,[50,1]);assert.equal(result.videos.length,48);assert.equal(result.videos.find(v=>v.youtubeId===ids[1])?.durationSeconds,90000);assert.equal(result.videos.find(v=>v.youtubeId===ids[3])?.embeddable,false);assert.ok(result.reasons.some(r=>r.includes('live stream')));
});
test('playlist authorization error fails the whole cycle',async()=>{
  const fetcher=async(input:URL|RequestInfo)=>{const url=new URL(String(input));if(url.pathname.endsWith('/channels'))return new Response(JSON.stringify({items:[{id:'UCCxO94rfXnMpYf7DH_sd6Bw',contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]}));return new Response('{}',{status:403});};
  await assert.rejects(fetchCycle(fetcher as typeof fetch,'key',new Date(),[]),/YouTube API rejected/);
});
test('retries bounded 429 responses and stops immediately for invalid keys',async()=>{
  let calls=0;const retrying=async()=>{calls++;return new Response(calls===1?'{}':calls===2?JSON.stringify({items:[{id:'UCCxO94rfXnMpYf7DH_sd6Bw',contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]}):JSON.stringify({items:'malformed'}),{status:calls===1?429:200});};
  // The first call succeeds after one retry, then malformed data fails closed.
  await assert.rejects(fetchCycle(retrying as typeof fetch,'key',new Date(),[]),/Malformed playlist response/);assert.equal(calls,3);
  let throttled=0;await assert.rejects(fetchCycle((async()=>{throttled++;return new Response('{}',{status:429});}) as typeof fetch,'key',new Date(),[]),/HTTP 429/);assert.equal(throttled,3);
  let denied=0;const invalid=async()=>{denied++;return new Response('{}',{status:401});};
  await assert.rejects(fetchCycle(invalid as typeof fetch,'key',new Date(),[]),/rejected the key/);assert.equal(denied,1);
});
test('successful empty authoritative video response is distinct from a denied response',async()=>{
  const fetcher=async(input:URL|RequestInfo)=>{const url=new URL(String(input));if(url.pathname.endsWith('/channels'))return new Response(JSON.stringify({items:[{id:'UCCxO94rfXnMpYf7DH_sd6Bw',contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]}));if(url.pathname.endsWith('/playlistItems'))return new Response(JSON.stringify({items:[{contentDetails:{videoId:'AbCdEfGhIjK'}}]}));return new Response(JSON.stringify({items:[]}));};
  const result=await fetchCycle(fetcher as typeof fetch,'key',new Date(),[]);assert.equal(result.videos.length,0);
});
test('atomic replacement failure leaves the existing destination intact',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'youtube-snapshot-'));const target=join(dir,'snapshot.json');await mkdir(target);await writeFile(join(target,'keep.txt'),'previous');
  try{await assert.rejects(writeAtomic(target,'new'));assert.equal(await readFile(join(target,'keep.txt'),'utf8'),'previous');}finally{await rm(dir,{recursive:true,force:true});}
});
