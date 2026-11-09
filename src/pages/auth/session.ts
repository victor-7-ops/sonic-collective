import type { APIRoute } from 'astro';
import { readEditorialForm } from '../../lib/editorial/access';
import { emailSession } from '../../lib/editorial/email-session';
export const prerender=false;
export const POST: APIRoute=async({request,locals})=>{
  try {
    const form=await readEditorialForm(request);
    const session=emailSession(form.toString());
    if(!session)return new Response('Invalid sign-in link.',{status:400});
    const client=locals.editorialClient!;
    const result=await client.auth.setSession(session);
    if(result.error||!result.data.user)return new Response('Invalid sign-in link.',{status:401});
    const verified=await client.auth.getUser();
    if(verified.error||!verified.data.user){await client.auth.signOut();return new Response('Invalid sign-in link.',{status:401});}
    const member=await client.from('team_members').select('role').eq('user_id',verified.data.user.id).eq('active',true).maybeSingle();
    if(member.error||!member.data){await client.auth.signOut();return new Response('An active team invitation is required.',{status:403});}
    return new Response(null,{status:204});
  } catch {return new Response('The sign-in link could not be accepted.',{status:400});}
};
