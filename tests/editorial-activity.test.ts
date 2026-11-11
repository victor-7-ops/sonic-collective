import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityFilter,buildActivity,type ActivityLabels} from '../src/lib/editorial/activity';

const labels:ActivityLabels={
  actor:id=>id==='u1'?'owner@example.com':id==='u2'?'editor@example.com':id?'A team member':'Unknown',
  item:id=>id==='i1'?{label:'artist rena',href:'/admin/content/i1/'}:null,
};
const empty={audit:[],releases:[],live:[],team:[]};

test('content, release and team events merge into one newest-first feed in plain words',()=>{
  const events=buildActivity({
    audit:[
      {id:1,actor_id:'u1',item_id:'i1',action:'save',created_at:'2026-11-11T10:00:00Z'},
      {id:2,actor_id:'u2',item_id:'i1',action:'request-changes',created_at:'2026-11-11T10:05:00Z'},
      {id:3,actor_id:null,item_id:'i1',action:'import',created_at:'2026-11-05T01:00:00Z'},
      {id:4,actor_id:'u1',item_id:null,action:'archive',created_at:'2026-11-11T09:00:00Z'},
    ],
    releases:[{id:'ea664a7a-cc56-495c-9c64-38722ad05184',created_by:'u1',created_at:'2026-11-11T11:00:00Z'}],
    live:[{id:1,release_id:'72b9a129-5b3f-4b03-9a3c-92239a7861d8',set_by:'u1',set_at:'2026-11-11T12:00:00Z'}],
    team:[{id:1,actor_id:'u1',target_user_id:'u2',item_id:null,action:'member-update',old_role:'contributor',new_role:'editor',old_active:true,new_active:true,created_at:'2026-11-11T08:00:00Z'}],
  },labels);
  assert.deepEqual(events.map(event=>`${event.actor} ${event.summary}`),[
    'owner@example.com made release 72b9a129 live',
    'owner@example.com prepared release ea664a7a',
    'editor@example.com requested changes on artist rena',
    'owner@example.com saved a draft of artist rena',
    'owner@example.com archived a record',
    'owner@example.com changed access for editor@example.com (role contributor → editor)',
    'System imported artist rena from the repository',
  ]);
  assert.equal(events[2]!.href,'/admin/content/i1/');
  assert.equal(events[4]!.href,undefined);
  assert.equal(events[0]!.href,'/admin/releases/');
});

test('every audit action has wording, and unknown future actions still show instead of being hidden',()=>{
  const actions=['create','save','submit','approve','request-changes','restore','archive','unarchive'];
  const events=buildActivity({...empty,audit:actions.map((action,index)=>({id:index,actor_id:'u1',item_id:'i1',action,created_at:`2026-11-11T10:0${index}:00Z`}))},labels);
  assert.equal(events.length,actions.length);
  assert.match(events.find(event=>event.summary.startsWith('created'))!.summary,/^created artist rena$/);
  assert.match(events.find(event=>event.summary.startsWith('restored from the archive'))!.summary,/artist rena$/);
  const future=buildActivity({...empty,audit:[{id:99,actor_id:'u1',item_id:'i1',action:'something-new',created_at:'2026-11-11T10:00:00Z'}]},labels);
  assert.equal(future[0]!.summary,'something-new artist rena');
});

test('team changes describe roles and activation, and assignments name the record',()=>{
  const team=(over:Record<string,unknown>)=>({id:1,actor_id:'u1',target_user_id:'u2',item_id:null,action:'member-update',old_role:'editor',new_role:'editor',old_active:true,new_active:false,created_at:'2026-11-11T08:00:00Z',...over}) as never;
  assert.match(buildActivity({...empty,team:[team({})]},labels)[0]!.summary,/changed access for editor@example.com \(deactivated\)$/);
  assert.match(buildActivity({...empty,team:[team({old_active:true,new_active:true})]},labels)[0]!.summary,/^changed access for editor@example.com$/);
  assert.match(buildActivity({...empty,team:[team({action:'assignment-change',item_id:'i1',new_role:null,new_active:null})]},labels)[0]!.summary,/changed who owns artist rena$/);
});

test('the feed can be filtered by type and is capped',()=>{
  const input={
    audit:Array.from({length:150},(_,i)=>({id:i,actor_id:'u1',item_id:'i1',action:'save',created_at:`2026-11-${String(1+Math.floor(i/10)).padStart(2,'0')}T10:${String(i%60).padStart(2,'0')}:00Z`})),
    releases:[{id:'ea664a7a-cc56-495c-9c64-38722ad05184',created_by:'u1',created_at:'2026-11-20T00:00:00Z'}],live:[],team:[],
  };
  assert.equal(buildActivity(input,labels).length,100);
  assert.equal(buildActivity(input,labels,'release').length,1);
  assert.equal(buildActivity(input,labels,'team').length,0);
  assert.equal(buildActivity(input,labels,'content',20).length,20);
  assert.equal(buildActivity(input,labels)[0]!.kind,'release');
  assert.deepEqual(buildActivity(empty,labels),[]);
});

test('unknown filter values fall back to everything',()=>{
  assert.equal(activityFilter('team'),'team');assert.equal(activityFilter('release'),'release');
  for(const bad of [null,'','nope','TEAM','<script>']) assert.equal(activityFilter(bad),'all');
});
