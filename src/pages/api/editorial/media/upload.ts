import type {APIRoute} from 'astro';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '../../../../lib/editorial/database.types';
import {editorialAdminClient} from '../../../../lib/editorial/server';
import {isSameOriginMutation} from '../../../../lib/editorial/access';
import {readBoundedEditorialUpload,persistEditorialImage} from '../../../../lib/editorial/media';

export const prerender=false;

type MemberClient=SupabaseClient<Database>;

async function currentMember(client:MemberClient):Promise<{response:Response}|{user:{id:string}}> {
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return {response:new Response('Sign in before uploading media.',{status:401})};
  const member=await client.from('team_members').select('role').eq('user_id',user.id).eq('active',true).maybeSingle();
  if(member.error)return {response:new Response('Team access could not be checked. Try again later.',{status:503})};
  if(!member.data||!['owner','editor','contributor'].includes(member.data.role))return {response:new Response('An active team membership is required.',{status:403})};
  return {user};
}

export async function handleEditorialMediaUpload(request:Request,client:MemberClient|null,adminFactory=()=>editorialAdminClient()):Promise<Response> {
  if(!isSameOriginMutation(request))return new Response('This form must be submitted from Sonic Collective.',{status:403});
  if(!client)return new Response('Editorial access is unavailable.',{status:503});
  const member=await currentMember(client);
  if('response' in member)return member.response;
  const admin=adminFactory();
  if(!admin)return new Response('Private media upload requires the server-only Supabase credential. No asset was created.',{status:503});
  let image;
  try {image=await readBoundedEditorialUpload(request);}
  catch(error) {return new Response(error instanceof Error?error.message:'The image upload is invalid.',{status:400});}
  const verified=await currentMember(client);
  if('response' in verified)return verified.response;
  if(verified.user.id!==member.user.id)return new Response('Your session changed during upload. Sign in again.',{status:401});
  let id:string;
  try {id=await persistEditorialImage(admin,verified.user.id,image);}
  catch(error) {return new Response(error instanceof Error?error.message:'The image could not be saved privately.',{status:503});}
  return new Response(null,{status:303,headers:{Location:`/admin/media/?uploaded=${encodeURIComponent(id)}`}});
}

export const POST:APIRoute=({request,locals})=>handleEditorialMediaUpload(request,locals.editorialClient??null);
