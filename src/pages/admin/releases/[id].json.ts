import type {APIRoute} from 'astro';
import {buildReleaseArtifact} from '../../../lib/editorial/releases';

export const prerender=false;
export const GET:APIRoute=async({params,locals})=>{
  const id=params.id??'';
  if(!/^[a-f\d-]{36}$/i.test(id)) return new Response('Release not found.',{status:404});
  const role=locals.editorialMember?.role;
  if(role!=='owner'&&role!=='editor') return new Response('Only active editors and owners can download release artifacts.',{status:403});
  const result=await locals.editorialClient!.from('editorial_releases').select('id,snapshot').eq('id',id).maybeSingle();
  if(result.error) return new Response('Release artifact could not be loaded.',{status:503});
  if(!result.data) return new Response('Release not found.',{status:404});
  try {
    const artifact=buildReleaseArtifact(result.data.id,result.data.snapshot);
    return new Response(JSON.stringify(artifact),{status:200,headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Content-Disposition':`attachment; filename="sonic-collective-release-${id}.json"`,
      'Cache-Control':'private, no-store, max-age=0',
      'X-Content-Type-Options':'nosniff',
      'X-Robots-Tag':'noindex, nofollow',
    }});
  } catch {
    return new Response('The saved release snapshot failed artifact validation.',{status:422});
  }
};
