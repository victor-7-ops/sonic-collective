import test from 'node:test';
import assert from 'node:assert/strict';
import {migratedScratchDb} from '../scripts/lib/scratch-db';
import {latestLiveChoice,resolveReleaseId} from '../src/lib/editorial/live-release';
import {redeployProduction,type BuildInfo} from '../src/lib/editorial/deployments';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,editor,alice]=[1,2,3].map(uuid);
const [r1,r2]=[11,12].map(uuid);

test('only an owner can choose the live release, with the same MFA rule as other protected actions',async t=>{
  const db=await migratedScratchDb([owner,editor,alice]);
  t.after(()=>db.close());
  for(const [id,role] of [[owner,'owner'],[editor,'editor'],[alice,'contributor']]) await db.query('insert into public.team_members(user_id,role) values($1,$2)',[id,role]);
  for(const [n,release] of [[1,r1],[2,r2]] as const) await db.query("insert into public.editorial_releases(id,request_id,created_by,expected_map,snapshot) values($1,$2,$3,'[]','[]')",[release,uuid(100+n),owner]);
  const as=async(id:string,aal='aal1')=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,aal})]);
    await db.exec('set role authenticated');
  };
  const choose=(release:string|null)=>db.query('select public.set_editorial_live_release($1)',[release]);
  const current=async()=>{await db.exec('reset role');return (await db.query<{release_id:string}>('select release_id from public.editorial_live_releases order by id desc limit 1')).rows[0]?.release_id??null;};

  await as(editor);await assert.rejects(choose(r1),/Only an active owner/);
  await as(alice);await assert.rejects(choose(r1),/Only an active owner/);
  assert.equal(await current(),null);

  await as(owner);
  await assert.rejects(choose(uuid(999)),/Release not found/);
  await assert.rejects(choose(null),/Release not found/);
  await choose(r1);assert.equal(await current(),r1);
  await as(owner);await choose(r2);assert.equal(await current(),r2);
  await as(owner);await choose(r1);assert.equal(await current(),r1);

  // Everyone on the team can see the history only if they are an owner or editor; contributors cannot.
  await as(editor);assert.equal((await db.query('select * from public.editorial_live_releases')).rows.length,3);
  await as(alice);assert.equal((await db.query('select * from public.editorial_live_releases')).rows.length,0);
  await assert.rejects(db.query("insert into public.editorial_live_releases(release_id,set_by) values($1,$2)",[r2,owner]),/permission denied/);

  // History is permanent.
  await db.exec('reset role');
  await assert.rejects(db.query("update public.editorial_live_releases set release_id=$1",[r2]),/immutable/);
  await assert.rejects(db.query('delete from public.editorial_live_releases'),/immutable/);

  // An owner who enrolled an authenticator must use it.
  await db.query("insert into auth.mfa_factors values($1,'verified')",[owner]);
  await as(owner,'aal1');await assert.rejects(choose(r2),/Multi-factor/);
  await as(owner,'aal2');await choose(r2);assert.equal(await current(),r2);
});

const clientFor=(rows:{release_id:string;set_at:string;set_by:string}[]|null,error:unknown=null)=>({from:()=>({select:()=>({order:()=>({limit:async()=>({data:rows,error})})})})}) as never;

test('the owner choice wins over the environment variable, which is only a fallback',async()=>{
  const env={CMS_RELEASE_ID:r1};
  const chosen=clientFor([{release_id:r2,set_at:'2026-11-11T05:00:00Z',set_by:owner}]);
  assert.deepEqual(await resolveReleaseId(env,chosen),{id:r2,source:'database'});
  assert.deepEqual(await resolveReleaseId(env,clientFor([])),{id:r1,source:'environment'});
  assert.deepEqual(await resolveReleaseId(env,null),{id:r1,source:'environment'});
  assert.equal(await resolveReleaseId({},clientFor([])),null);
  assert.equal(await resolveReleaseId({},null),null);
  assert.deepEqual(await latestLiveChoice(chosen),{releaseId:r2,setAt:'2026-11-11T05:00:00Z',setBy:owner});
});

test('an unreadable choice or an ambiguous configuration stops the build instead of guessing',async()=>{
  await assert.rejects(()=>resolveReleaseId({},clientFor(null,new Error('db'))),/could not be read/);
  await assert.rejects(()=>resolveReleaseId({CMS_RELEASE_ID:'latest'},null),/UUID/);
  await assert.rejects(()=>resolveReleaseId({CMS_RELEASE_ID:r1,CMS_RELEASE_FILE:'/x.json'},null),/not both/);
});

const build=(id:string,state:BuildInfo['state']):Record<string,unknown>=>({uid:id,state:state==='failed'?'ERROR':state.toUpperCase(),created:1794000000000+id.length});
const config={token:'t0k',projectId:'prj_1',teamId:'team_1'};

test('redeploy targets the newest finished production build and reports failures plainly',async()=>{
  const calls:{url:string;method:string;body?:unknown;auth?:string}[]=[];
  const fetcher=((list:Record<string,unknown>[],post:{ok:boolean;status:number;body:unknown})=>(async(url:URL,init?:RequestInit)=>{
    const method=init?.method??'GET';
    calls.push({url:String(url),method,body:init?.body?JSON.parse(String(init.body)):undefined,auth:(init?.headers as Record<string,string>|undefined)?.authorization});
    return method==='GET'?{ok:true,json:async()=>({deployments:list})}:{ok:post.ok,status:post.status,json:async()=>post.body};
  }) as unknown as typeof fetch);

  const ok=await redeployProduction(config,fetcher([build('dpl_new','building'),build('dpl_ready','ready'),build('dpl_old','ready')],{ok:true,status:200,body:{id:'dpl_created'}}));
  assert.deepEqual(ok,{ok:true,id:'dpl_created'});
  const post=calls.find(call=>call.method==='POST')!;
  assert.deepEqual(post.body,{name:'sonic-collective',project:'prj_1',deploymentId:'dpl_ready',target:'production'});
  assert.match(post.url,/forceNew=1/);assert.equal(post.auth,'Bearer t0k');

  assert.deepEqual(await redeployProduction({},fetcher([],{ok:true,status:200,body:{}})),{ok:false,reason:'Vercel access is not configured.'});
  assert.match((await redeployProduction(config,fetcher([build('dpl_x','failed')],{ok:true,status:200,body:{}}))as {reason:string}).reason,/No finished production build/);
  const refused=await redeployProduction(config,fetcher([build('dpl_ready','ready')],{ok:false,status:403,body:{}})) as {reason:string};
  assert.match(refused.reason,/HTTP 403/);assert.doesNotMatch(refused.reason,/t0k/);
  const odd=await redeployProduction(config,fetcher([build('dpl_ready','ready')],{ok:true,status:200,body:{}})) as {reason:string};
  assert.match(odd.reason,/did not return/);
});

test('releases that were live before are identified, newest choice first, excluding the current one',async()=>{
  const {previouslyLive}=await import('../src/lib/editorial/live-release');
  const history=[
    {release_id:r2,set_at:'2026-11-11T05:00:00Z'},
    {release_id:r1,set_at:'2026-11-11T04:00:00Z'},
    {release_id:r2,set_at:'2026-11-11T03:00:00Z'},
    {release_id:uuid(13),set_at:'2026-11-10T01:00:00Z'},
  ];
  const result=previouslyLive(history,r2);
  assert.deepEqual([...result.keys()].sort(),[r1,uuid(13)].sort());
  assert.equal(result.get(r1),'2026-11-11T04:00:00Z');
  assert.equal(result.has(r2),false);
  assert.equal(previouslyLive(history,null).get(r2),'2026-11-11T05:00:00Z');
  assert.equal(previouslyLive([],r1).size,0);
});
