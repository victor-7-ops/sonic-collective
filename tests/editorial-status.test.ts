import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentFacts,loadContentFacts} from '../src/lib/editorial/status';
import {buildReleaseMarker,type LiveRelease} from '../src/lib/editorial/release-marker';

const rev=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const item=(over:Partial<{version:number;draft_revision_id:string|null;approved_revision_id:string|null;review_state:string}>={})=>({version:3,draft_revision_id:rev(3),approved_revision_id:rev(3),review_state:'approved',...over});

test('draft, review, approved and live are reported as separate facts',()=>{
  const same=contentFacts(item(),3,{state:'release',revisionId:rev(3),version:3});
  assert.deepEqual([same.draft,same.review,same.approved,same.live,same.draftAhead],
    ['Revision 3 (latest saved)','Approved','Revision 3 (same as the draft)','Revision 3 (the approved revision)',false]);
  // Saving after approval: the draft is ahead, review resets, live still shows the older approved content.
  const ahead=contentFacts(item({version:5,draft_revision_id:rev(5),review_state:'draft'}),3,{state:'release',revisionId:rev(3),version:3});
  assert.equal(ahead.review,'Draft');assert.equal(ahead.draftAhead,true);
  assert.match(ahead.approved,/Revision 3; the draft is 2 revisions ahead/);
});

test('live is never claimed without evidence',()=>{
  assert.match(contentFacts(item(),3,{state:'unknown'}).live,/Unknown/);
  assert.match(contentFacts(item(),3,{state:'repository'}).live,/repository files/);
  assert.equal(contentFacts(item(),3,{state:'release',revisionId:null,version:null}).live,'Not in the live release');
  assert.match(contentFacts(item({version:4,draft_revision_id:rev(4)}),3,{state:'release',revisionId:rev(2),version:2}).live,/Revision 2, older than the approved/);
  assert.equal(contentFacts(item({approved_revision_id:null,review_state:'draft'}),null,{state:'unknown'}).approved,'Never approved');
});

const marker=(releaseId:string):LiveRelease=>({state:'release',marker:buildReleaseMarker({releaseId,contentHash:'a'.repeat(64)},undefined)});
function client(snapshot:unknown,versions:Record<string,number>,releaseError:unknown=null) {
  return {from:(table:string)=>({select:()=>table==='editorial_releases'
    ?{eq:()=>({maybeSingle:async()=>({data:snapshot===null?null:{snapshot},error:releaseError})})}
    :{in:async(_c:string,ids:string[])=>({data:ids.filter(id=>id in versions).map(id=>({id,version:versions[id]})),error:null})}})} as never;
}

test('live revision comes from the deployed release snapshot',async()=>{
  const releaseId='ea664a7a-cc56-495c-9c64-38722ad05184';
  const row={...item({version:4,draft_revision_id:rev(4)}),kind:'artist',stable_id:'rena'};
  const snapshot=[{kind:'artist',stableId:'rena',revisionId:rev(2)},{kind:'artist',stableId:'other',revisionId:rev(9)}];
  const facts=await loadContentFacts(client(snapshot,{[rev(2)]:2,[rev(3)]:3}),row,'https://x.test',marker(releaseId));
  assert.match(facts.live,/Revision 2, older than the approved/);assert.match(facts.approved,/Revision 3; the draft is 1 revision ahead/);
  const missing=await loadContentFacts(client([{kind:'artist',stableId:'someone-else',revisionId:rev(1)}],{[rev(3)]:3}),row,'https://x.test',marker(releaseId));
  assert.equal(missing.live,'Not in the live release');
  const broken=await loadContentFacts(client(null,{},new Error('db')),row,'https://x.test',marker(releaseId));
  assert.match(broken.live,/Unknown/);
  const repo=await loadContentFacts(client(null,{[rev(3)]:3}),row,'https://x.test',{state:'repository',marker:buildReleaseMarker(null,undefined)});
  assert.match(repo.live,/repository files/);
});
