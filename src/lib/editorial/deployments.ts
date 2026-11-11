// Recent production builds, read from Vercel with a server-side token, so the admin can tell a failed build
// from a live release. The token never leaves the server; any failure is shown as "unavailable", never as success.
export type BuildState='ready'|'building'|'queued'|'failed'|'canceled'|'unknown';
export type BuildInfo={id:string;state:BuildState;commit:string|null;message:string;createdAt:string;inspectorUrl:string|null};
export type DeploymentConfig={token?:string;projectId?:string;teamId?:string};

const stateMap:Record<string,BuildState>={READY:'ready',BUILDING:'building',INITIALIZING:'building',QUEUED:'queued',ERROR:'failed',CANCELED:'canceled'};

export function parseBuilds(body:unknown):BuildInfo[] {
  const list=(body as {deployments?:unknown})?.deployments;
  if(!Array.isArray(list)) throw new Error('Unexpected deployments response.');
  return list.flatMap(raw=>{
    const item=raw as {uid?:unknown;id?:unknown;state?:unknown;readyState?:unknown;created?:unknown;inspectorUrl?:unknown;meta?:{githubCommitSha?:unknown;githubCommitMessage?:unknown}};
    const id=typeof item.uid==='string'?item.uid:typeof item.id==='string'?item.id:null;
    if(!id||typeof item.created!=='number') return [];
    const sha=item.meta?.githubCommitSha;
    return [{
      id,state:stateMap[String(item.state??item.readyState)]??'unknown',
      commit:typeof sha==='string'&&/^[a-f\d]{7,40}$/i.test(sha)?sha:null,
      message:typeof item.meta?.githubCommitMessage==='string'?item.meta.githubCommitMessage.slice(0,200):'',
      createdAt:new Date(item.created).toISOString(),
      inspectorUrl:typeof item.inspectorUrl==='string'&&item.inspectorUrl.startsWith('https://vercel.com/')?item.inspectorUrl:null,
    }];
  });
}

export async function fetchProductionBuilds(config:DeploymentConfig,fetcher:typeof fetch=fetch):Promise<BuildInfo[]|null> {
  if(!config.token||!config.projectId||!config.teamId) return null;
  try {
    const url=new URL('https://api.vercel.com/v6/deployments');
    url.search=new URLSearchParams({projectId:config.projectId,teamId:config.teamId,target:'production',limit:'6'}).toString();
    const response=await fetcher(url,{headers:{authorization:`Bearer ${config.token}`},cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok) return [];
    return parseBuilds(await response.json());
  } catch {return [];}
}

export type BuildSummary={
  kind:'unconfigured'|'unavailable'|'ok'|'failed'|'building'|'unverified';
  headline:string;builds:BuildInfo[];
};

/** Compares the newest production build with the commit the live site says it was built from. */
export function summarizeBuilds(builds:BuildInfo[]|null,liveCommit:string|null):BuildSummary {
  if(builds===null) return {kind:'unconfigured',headline:'Build status is not configured.',builds:[]};
  if(builds.length===0) return {kind:'unavailable',headline:'Build status could not be read from Vercel.',builds:[]};
  const latest=builds[0]!;
  const short=(commit:string|null)=>commit?commit.slice(0,7):'unknown';
  const live=liveCommit?`The live site is running commit ${short(liveCommit)}.`:'The live site did not report which commit it runs.';
  if(latest.state==='failed') return {kind:'failed',builds,headline:`The latest production build failed (commit ${short(latest.commit)}). ${live} The site was not changed.`};
  if(latest.state==='building'||latest.state==='queued') return {kind:'building',builds,headline:`A production build is ${latest.state==='queued'?'queued':'running'} (commit ${short(latest.commit)}). ${live}`};
  if(latest.state==='ready'&&liveCommit&&latest.commit&&latest.commit.toLowerCase().startsWith(liveCommit.slice(0,7).toLowerCase())) return {kind:'ok',builds,headline:`The latest production build is live (commit ${short(latest.commit)}).`};
  return {kind:'unverified',builds,headline:`The latest build is ${latest.state} (commit ${short(latest.commit)}), but it is not confirmed live. ${live}`};
}

/** Starts a new production build of the newest ready deployment, so a changed live-release choice takes effect. */
export async function redeployProduction(config:DeploymentConfig,fetcher:typeof fetch=fetch):Promise<{ok:true;id:string}|{ok:false;reason:string}> {
  if(!config.token||!config.projectId||!config.teamId) return {ok:false,reason:'Vercel access is not configured.'};
  const builds=await fetchProductionBuilds(config,fetcher);
  const source=builds?.find(build=>build.state==='ready');
  if(!source) return {ok:false,reason:'No finished production build was found to redeploy.'};
  try {
    const url=new URL('https://api.vercel.com/v13/deployments');
    url.search=new URLSearchParams({teamId:config.teamId,forceNew:'1'}).toString();
    const response=await fetcher(url,{
      method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},
      body:JSON.stringify({name:'sonic-collective',project:config.projectId,deploymentId:source.id,target:'production'}),
      cache:'no-store',signal:AbortSignal.timeout(15000),
    });
    if(!response.ok) return {ok:false,reason:`Vercel refused the redeploy (HTTP ${response.status}).`};
    const body=await response.json() as {id?:unknown};
    return typeof body.id==='string'?{ok:true,id:body.id}:{ok:false,reason:'Vercel did not return a deployment.'};
  } catch {return {ok:false,reason:'Vercel could not be reached.'};}
}
