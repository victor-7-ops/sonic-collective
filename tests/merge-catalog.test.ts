import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshot, emptySnapshot } from '../src/lib/youtube-import.js';
import { mergeCatalog } from '../src/lib/merge-catalog.js';

const video=(youtubeId:string,seriesId:'sessions'|'covers'|null=null)=>({youtubeId,channelId:'channel',title:youtubeId,thumbnailUrl:'https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg',publishedAt:'2026-11-04T00:00:00Z',durationSeconds:60,seriesId,embeddable:true});
test('exclusions hide authored videos and a null override clears imported series',()=>{
  const authored=[{youtubeId:'Curated0001',id:'curated',approvedForSite:true,seriesId:'sessions' as const}];
  const snapshot=makeSnapshot([video('Curated0001'),video('Imported001','covers')],'channel');
  const result=mergeCatalog(authored,snapshot,[{youtubeId:'Curated0001',excluded:true},{youtubeId:'Imported001',seriesId:null}]);
  assert.equal(result.availabilityByYoutubeId.Curated0001,'unavailable');
  assert.deepEqual(result.videos,[video('Imported001')]);
});
test('curated series wins, drafts and exclusions stay hidden, imports remain unattributed',()=>{
  const snapshot=makeSnapshot([video('Curated0001','covers'),video('DraftItem01'),video('Imported001')],'channel');
  const result=mergeCatalog([{youtubeId:'Curated0001',id:'stable-slug',approvedForSite:true,seriesId:'sessions'},{youtubeId:'DraftItem01',id:'draft',approvedForSite:false,seriesId:'covers'}],snapshot,[{youtubeId:'Imported001',excluded:true}]);
  assert.deepEqual(result.videos.map(v=>v.youtubeId),['Curated0001']);assert.equal(result.videos[0].seriesId,'sessions');assert.equal(result.availabilityByYoutubeId.Curated0001,'available');assert.equal(result.availabilityByYoutubeId.DraftItem01,'unverified');
});
test('uninitialized and expired snapshots do not claim authoritative absence',()=>{
  const authored=[{youtubeId:'KnownVideo01',id:'known',approvedForSite:true,seriesId:'sessions' as const}];
  assert.equal(mergeCatalog(authored,emptySnapshot('channel'),[]).availabilityByYoutubeId.KnownVideo01,'unverified');
  const expired=makeSnapshot([],'channel',new Date('2020-01-01T00:00:00Z'));
  assert.equal(mergeCatalog(authored,expired,[]).availabilityByYoutubeId.KnownVideo01,'unverified');
});
test('known embed restrictions keep the direct link without masking removal',()=>{
  const youtubeId='Curated0001';
  const authored=[{youtubeId,id:'known',approvedForSite:true,seriesId:'sessions' as const}];
  const overrides=[{youtubeId,embeddable:false as const}];
  assert.equal(mergeCatalog(authored,emptySnapshot('channel'),overrides).availabilityByYoutubeId[youtubeId],'external-only');
  assert.equal(mergeCatalog(authored,makeSnapshot([video(youtubeId)],'channel'),overrides).videos[0].embeddable,false);
  assert.equal(mergeCatalog(authored,makeSnapshot([],'channel'),overrides).availabilityByYoutubeId[youtubeId],'unavailable');
});
