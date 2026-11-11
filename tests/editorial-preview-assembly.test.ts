import {test} from 'node:test';
import assert from 'node:assert/strict';
import artists from '../src/data/artists.json';
import performances from '../src/data/performances.json';
import {assembleContent,buildReleaseArtifact} from '../src/lib/editorial/releases';
import {previewFromRecords,repositoryRecords} from '../src/lib/editorial/preview';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const withRevisions=()=>repositoryRecords().map((record,index)=>({...record,revisionId:uuid(index+1)}));

test('a preview of unchanged approved content equals the release catalog',()=>{
  const records=withRevisions();
  const performance=performances.find(item=>item.approvedForSite)!;
  const preview=previewFromRecords(records,'performance',performance.id,performance);
  const release=buildReleaseArtifact(uuid(900),records);
  assert.deepEqual(preview.catalog,release.catalog);
  assert.deepEqual(preview.overrides,release.youtubeOverrides);
});

test('the base is the approved CMS content, not the repository files',()=>{
  const records=withRevisions().map(record=>record.kind==='artist'&&record.stableId===artists[0]!.id?{...record,payload:{...(record.payload as object),name:'Name edited in the CMS'}}:record);
  const performance=performances.find(item=>item.artistIds.includes(artists[0]!.id))!;
  const preview=previewFromRecords(records,'performance',performance.id,{...performance,title:'Draft title'});
  assert.equal(preview.catalog.artists.find(artist=>artist.id===artists[0]!.id)!.name,'Name edited in the CMS');
  assert.equal(preview.catalog.performances.find(item=>item.id===performance.id)!.title,'Draft title');
  // The release and the preview agree about everything except the draft overlay.
  const release=assembleContent(records,true);
  assert.equal(release.catalog.performances.find(item=>item.id===performance.id)!.title,performance.title);
});

test('previews tolerate unapproved drafts that a release would reject',()=>{
  const records=withRevisions();
  const performance={...performances.find(item=>item.approvedForSite)!,approvedForSite:false,id:'draft-only',youtubeId:'abcdefghijk',episode:undefined};
  const preview=previewFromRecords(records,'performance',performance.id,performance);
  assert.equal(preview.catalog.performances.some(item=>item.id==='draft-only'),true);
  const releaseRecords=[...records,{kind:'performance' as const,stableId:'draft-only',revisionId:uuid(901),payload:performance}];
  // Same record in a release must still satisfy release rules (approved content only is selected at build time).
  assert.doesNotThrow(()=>assembleContent(releaseRecords,false));
});

test('the base is not mutated and unsupported kinds are refused',()=>{
  const records=withRevisions();
  const before=JSON.stringify(records);
  previewFromRecords(records,'artist',artists[0]!.id,{...artists[0]!,name:'Changed'});
  assert.equal(JSON.stringify(records),before);
  assert.throws(()=>previewFromRecords(records,'series','sessions',{}),/does not have a page preview/);
});
