import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {ImportedVideo} from '../src/lib/youtube-import';
import {buildInbox,checkFullMapping,fullTargetIds,inboxCounts,inboxFilter,inboxPage,inboxPageSize,type ReviewRow} from '../src/lib/editorial/inbox';

const video=(youtubeId:string,publishedAt:string):ImportedVideo=>({youtubeId,channelId:'c',title:`T ${youtubeId}`,thumbnailUrl:`https://i.ytimg.com/vi/${youtubeId}/x.jpg`,publishedAt,durationSeconds:30,seriesId:null,embeddable:true});
const review=(youtubeId:string,payload:Record<string,unknown>):ReviewRow=>({youtubeId,itemId:`item-${youtubeId}`,reviewState:'draft',payload:{youtubeId,...payload}});
const ids={a:'aaaaaaaaaaa',b:'bbbbbbbbbbb',c:'ccccccccccc',d:'ddddddddddd'};

test('inbox classifies by human decisions only and lists newest first',()=>{
  const rows=buildInbox(
    [video(ids.a,'2026-10-01T00:00:00Z'),video(ids.b,'2026-10-03T00:00:00Z'),video(ids.c,'2026-10-02T00:00:00Z'),video(ids.d,'2026-10-04T00:00:00Z')],
    [review(ids.b,{format:'short',artistIds:['x']}),review(ids.c,{excluded:true})],new Set([ids.d]));
  assert.deepEqual(rows.map(row=>[row.video.youtubeId,row.status]),[[ids.d,'authored'],[ids.b,'reviewed'],[ids.c,'excluded'],[ids.a,'unreviewed']]);
  assert.deepEqual(rows[1]!.artistIds,['x']);
  assert.equal(rows[1]!.itemId,`item-${ids.b}`);
  assert.deepEqual(inboxCounts(rows),{all:4,unreviewed:1,reviewed:1,excluded:1,authored:1});
});

test('filters default to unreviewed and pages are bounded',()=>{
  assert.equal(inboxFilter(null),'unreviewed');assert.equal(inboxFilter('nope'),'unreviewed');assert.equal(inboxFilter('excluded'),'excluded');
  const many=Array.from({length:inboxPageSize+5},(_,i)=>video(`v${String(i).padStart(10,'0')}`,`2026-10-01T00:${String(i%60).padStart(2,'0')}:00Z`));
  const rows=buildInbox(many,[],new Set());
  assert.equal(inboxPage(rows,'unreviewed',1).rows.length,inboxPageSize);
  assert.equal(inboxPage(rows,'unreviewed',2).rows.length,5);
  assert.equal(inboxPage(rows,'unreviewed',99).page,2);
  assert.equal(inboxPage(rows,'unreviewed',-1).page,1);
  assert.equal(inboxPage(rows,'reviewed',1).total,0);
});

test('Short-to-full mapping accepts only known full targets for Shorts',()=>{
  const allowed=fullTargetIds([ids.a],[review(ids.b,{format:'full'}),review(ids.c,{format:'short'})]);
  assert.deepEqual(allowed,[ids.a,ids.b]);
  const short={format:'short',fullYoutubeId:ids.b};
  checkFullMapping(ids.c,short,{},allowed);
  checkFullMapping(ids.c,{format:'short'},{},allowed);
  checkFullMapping(ids.c,{format:'full',fullYoutubeId:ids.b},{format:'full',fullYoutubeId:ids.b},allowed);
  assert.throws(()=>checkFullMapping(ids.c,{format:'full',fullYoutubeId:ids.b},{},allowed),/Only a Short/);
  assert.throws(()=>checkFullMapping(ids.c,{...short,fullYoutubeId:ids.d},{},allowed),/available list/);
  assert.throws(()=>checkFullMapping(ids.b,{...short,fullYoutubeId:ids.b},{},allowed),/available list/);
});

test('saving a review rejects an unknown full performance before reaching the database',async()=>{
  const {applyContentAction}=await import('../src/lib/editorial/actions');
  const calls:string[]=[];
  const client={rpc:async(name:string)=>{calls.push(name);return {data:'rev',error:null};}} as never;
  const item={id:'item',stable_id:ids.c,archived_at:null,version:1} as never;
  const current={youtubeId:ids.c,format:'short'};
  const form=(target:string)=>new URLSearchParams({action:'save',version:'1',format:'short',seriesId:'__inherit__',fullYoutubeId:target});
  const bad=await applyContentAction(client,item,'youtube-review',current,form(ids.d),{fullYoutubeIds:[ids.b]});
  assert.ok('message' in bad);assert.match(bad.message,/available list/);assert.deepEqual(calls,[]);
  const good=await applyContentAction(client,item,'youtube-review',current,form(ids.b),{fullYoutubeIds:[ids.b]});
  assert.ok('redirect' in good);assert.deepEqual(calls,['save_editorial_content']);
});
