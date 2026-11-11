import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchProductionBuilds,parseBuilds,summarizeBuilds,type BuildInfo} from '../src/lib/editorial/deployments';

const sha=(c:string)=>c.repeat(40);
const build=(state:BuildInfo['state'],commit:string|null,minute=0):BuildInfo=>({id:`dpl_${state}${minute}`,state,commit,message:'m',createdAt:`2026-11-11T03:0${minute}:00.000Z`,inspectorUrl:null});
const config={token:'t0k',projectId:'prj_1',teamId:'team_1'};
const respond=(body:unknown,ok=true)=>((async()=>({ok,json:async()=>body})) as unknown as typeof fetch);

test('Vercel responses are parsed defensively',()=>{
  const builds=parseBuilds({deployments:[
    {uid:'dpl_a',state:'READY',created:1794000000000,inspectorUrl:'https://vercel.com/x/y/a',meta:{githubCommitSha:sha('a'),githubCommitMessage:'Ship it'}},
    {uid:'dpl_b',state:'ERROR',created:1794000001000,inspectorUrl:'https://evil.example/x',meta:{githubCommitSha:'not-a-sha'}},
    {uid:'dpl_c',state:'WEIRD',created:1794000002000},
    {state:'READY',created:1}, {uid:'dpl_d',state:'READY'},
  ]});
  assert.deepEqual(builds.map(item=>[item.id,item.state]),[['dpl_a','ready'],['dpl_b','failed'],['dpl_c','unknown']]);
  assert.equal(builds[0]!.inspectorUrl,'https://vercel.com/x/y/a');
  assert.equal(builds[1]!.inspectorUrl,null);assert.equal(builds[1]!.commit,null);
  assert.throws(()=>parseBuilds({}),/Unexpected/);
});

test('the fetcher needs full configuration and never throws or leaks the token',async()=>{
  assert.equal(await fetchProductionBuilds({},respond({})),null);
  assert.equal(await fetchProductionBuilds({token:'x',projectId:'p'},respond({})),null);
  let seen:{url:string;auth:string}|null=null;
  const spy=(async(url:URL,init:RequestInit)=>{seen={url:String(url),auth:String((init.headers as Record<string,string>).authorization)};return {ok:true,json:async()=>({deployments:[]})};}) as unknown as typeof fetch;
  assert.deepEqual(await fetchProductionBuilds(config,spy),[]);
  assert.match(seen!.url,/projectId=prj_1/);assert.match(seen!.url,/target=production/);assert.equal(seen!.auth,'Bearer t0k');
  assert.deepEqual(await fetchProductionBuilds(config,respond({},false)),[]);
  assert.deepEqual(await fetchProductionBuilds(config,respond({nope:1})),[]);
  assert.deepEqual(await fetchProductionBuilds(config,(async()=>{throw new Error('network t0k');}) as unknown as typeof fetch),[]);
});

test('a failed build is reported as failed and the site as unchanged',()=>{
  const failed=summarizeBuilds([build('failed',sha('b'),2),build('ready',sha('a'),1)],sha('a'));
  assert.equal(failed.kind,'failed');
  assert.match(failed.headline,/failed \(commit bbbbbbb\)/);assert.match(failed.headline,/running commit aaaaaaa/);assert.match(failed.headline,/not changed/);
});

test('live is confirmed only when the newest ready build matches the live commit',()=>{
  assert.equal(summarizeBuilds([build('ready',sha('a'))],sha('a')).kind,'ok');
  assert.equal(summarizeBuilds([build('ready',sha('a'))],sha('c')).kind,'unverified');
  assert.equal(summarizeBuilds([build('ready',sha('a'))],null).kind,'unverified');
  assert.equal(summarizeBuilds([build('building',sha('b')),build('ready',sha('a'))],sha('a')).kind,'building');
  assert.equal(summarizeBuilds([build('queued',sha('b'))],sha('a')).kind,'building');
  assert.equal(summarizeBuilds([build('canceled',sha('b'))],sha('b')).kind,'unverified');
  assert.equal(summarizeBuilds(null,sha('a')).kind,'unconfigured');
  assert.equal(summarizeBuilds([],sha('a')).kind,'unavailable');
});
