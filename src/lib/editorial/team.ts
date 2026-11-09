import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { z } from 'zod';

type TeamError = {code?:string;message?:string}|null;
type TeamOutcome = {redirect:string}|{message:string;status:400|403|409};
type InvitationOutcome = {redirect:string}|{message:string;status:400|403|409|503;requestId:string;email:string;role:string};
const roles=['owner','editor','contributor'] as const;
const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

export async function listEditorialTeam(client:SupabaseClient<Database>) {
  const result=await client.rpc('list_editorial_members');
  return {members:result.data,error:result.error};
}

export function editorialTeamError(error:TeamError):Exclude<TeamOutcome,{redirect:string}> {
  if(error?.code==='PT001') return {message:'Only an active team owner can manage members and assignments.',status:403};
  if(error?.code==='PT002') return {message:'Verify your authenticator in Account before managing the team.',status:403};
  if(error?.code==='PT004') return {message:'Team or assignment data changed. Reload and try again.',status:409};
  if(error?.code==='PT005') return {message:'The team must keep at least one active owner.',status:400};
  if(error?.code==='PT006') return {message:'That member or content record is no longer available.',status:400};
  if(error?.message==='TEAM_CONTENT_ARCHIVED') return {message:'Restore archived content before changing its assignment.',status:400};
  if(error?.code==='PT003') return {message:'Choose an active contributor and an assignable content record.',status:400};
  return {message:'The team change could not be saved.',status:400};
}

export async function applyEditorialTeamAction(client:SupabaseClient<Database>,form:URLSearchParams):Promise<TeamOutcome> {
  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.error||assurance.data.currentLevel!=='aal2') {
    return {message:'Verify your authenticator in Account before managing the team.',status:403};
  }
  let error:TeamError=null;
  if(form.get('action')==='member') {
    const userId=form.get('userId')??'',expectedRole=form.get('expectedRole')??'',role=form.get('role')??'';
    const expectedActive=form.get('expectedActive')??'',activeValue=form.get('active'),active=activeValue==='true';
    if(!uuid.test(userId)||!roles.includes(expectedRole as typeof roles[number])||!roles.includes(role as typeof roles[number])||!['true','false'].includes(expectedActive)||(activeValue!==null&&activeValue!=='true')) {
      return {message:'Choose a valid member role and status.',status:400};
    }
    const result=await client.rpc('update_editorial_member',{
      p_user_id:userId,p_expected_role:expectedRole,p_expected_active:expectedActive==='true',p_role:role,p_active:active,
    });
    error=result.error;
  } else if(form.get('action')==='assignment') {
    const itemId=form.get('itemId')??'',expectedOwnerId=form.get('expectedOwnerId')||null,ownerId=form.get('ownerId')||null;
    if(!uuid.test(itemId)||(expectedOwnerId&&!uuid.test(expectedOwnerId))||(ownerId&&!uuid.test(ownerId))) {
      return {message:'Choose a valid content assignment.',status:400};
    }
    // The SQL RPC intentionally accepts null for unassigned records; generated Args currently types UUID inputs as strings.
    const result=await client.rpc('assign_editorial_content',{
      p_item_id:itemId,p_expected_owner_id:expectedOwnerId as string,p_owner_id:ownerId as string,
    });
    error=result.error;
  } else return {message:'Unknown team action.',status:400};
  return error?editorialTeamError(error):{redirect:'/admin/team/?updated=1'};
}

function invitationError(error:TeamError):{message:string;status:400|403|409} {
  if(error?.code==='PT001'||error?.code==='PT002') return editorialTeamError(error);
  if(error?.code==='PI003') return {message:'This address already has an Auth account. No team role was changed.',status:409};
  if(error?.code==='PI004') return {message:'An invitation for this address is already pending.',status:409};
  if(error?.code==='PI002'||error?.code==='PI006') return {message:'This invitation request changed or is no longer available. Reload the team page.',status:409};
  if(error?.code==='PI001') return {message:'Enter a valid email, request, and editor or contributor role.',status:400};
  return {message:'The invitation could not be completed. Check its status before retrying.',status:400};
}

export async function applyEditorialInvitation(
  client:SupabaseClient<Database>,admin:SupabaseClient<Database>|null,form:URLSearchParams,appOrigin:string,
):Promise<InvitationOutcome> {
  let requestId=form.get('requestId')??'',email=(form.get('email')??'').trim().toLowerCase(),role=form.get('role')??'';
  const outcome=(message:string,status:400|403|409|503):InvitationOutcome=>({message,status,requestId,email,role});
  if(!admin) return outcome('Invitations need SUPABASE_SECRET_KEY in the private server environment before they can be sent.',503);
  if(!uuid.test(requestId)||!z.email().safeParse(email).success||!['editor','contributor'].includes(role)) {
    return outcome('Enter a valid email and choose editor or contributor access.',400);
  }
  let origin:string;
  try {
    const parsed=new URL(appOrigin);
    if(parsed.origin!==appOrigin) return outcome('The invitation callback is not configured for this site.',400);
    origin=parsed.origin;
  } catch { return outcome('The invitation callback is not configured for this site.',400); }
  const callback=new URL('/auth/landing/',origin).href;
  try {
    const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if(assurance.error||assurance.data.currentLevel!=='aal2') return outcome('Verify your authenticator in Account before inviting a member.',403);
    const prepared=await client.rpc('prepare_editorial_invitation',{
      p_request_id:requestId,p_email:email,p_role:role,
    });
    if(prepared.error) {const error=invitationError(prepared.error);return outcome(error.message,error.status);}
    const request=prepared.data?.[0];
    if(!request) return outcome('The invitation state could not be read. Do not submit another request.',503);
    if(request.status==='sent') return {redirect:'/admin/team/?invitation=sent'};
    if(request.status==='needs-attention') return outcome('This request needs owner review. No role was changed and no email will be resent.',409);
    if(request.status==='pending'&&!request.should_send) return outcome('This request is still pending. No duplicate email was sent; review its status before retrying.',409);
    if(request.status==='accepted') {
      const activated=await client.rpc('activate_editorial_invitation',{p_request_id:requestId});
      if(activated.error) {const error=invitationError(activated.error);return outcome(`The Auth invitation is recorded, but team access is not active yet. ${error.message} Retry this request to finish activation without resending email.`,error.status);}
      return activated.data==='sent'?{redirect:'/admin/team/?invitation=sent'}:outcome('The Auth invitation exists, but team access needs owner review.',409);
    }

    let invitedUserId:string|null=null,providerFailed=false;
    try {
      const invitation=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:callback});
      invitedUserId=invitation.data.user?.id??null;
      providerFailed=Boolean(invitation.error)||!invitedUserId;
    } catch { providerFailed=true; }
    const actor=(await client.auth.getUser()).data.user;
    if(!actor) return outcome('Your session changed. Check the saved invitation status before retrying.',503);
    const recorded=await admin.rpc('record_editorial_invitation_result',{
      p_request_id:requestId,p_actor_id:actor.id,
      p_result:providerFailed?'failed':'accepted',
      ...(invitedUserId?{p_auth_user_id:invitedUserId}:{}),
      ...(providerFailed?{p_error_code:'provider_error'}:{}),
    });
    if(recorded.error) return outcome('The delivery result could not be recorded safely. The request remains pending; do not resend it until its status is reconciled.',503);
    const state=recorded.data?.[0];
    if(!state) return outcome('The delivery result could not be verified. The request remains pending; do not resend it until its status is reconciled.',503);
    if(state.status==='failed') return outcome('The invitation email could not be sent. This request is marked failed and can be retried.',400);
    if(state.status==='needs-attention') return outcome('Auth may have created an account, but its invitation state needs owner review. No role was changed.',409);
    if(state.status!=='accepted') return outcome('The invitation is still pending. No duplicate email was sent.',409);
    const activated=await client.rpc('activate_editorial_invitation',{p_request_id:requestId});
    if(activated.error) {const error=invitationError(activated.error);return outcome(`Auth accepted the invitation, but team access is not active yet. ${error.message} Retry this request to finish activation without resending email.`,error.status);}
    return activated.data==='sent'?{redirect:'/admin/team/?invitation=sent'}:outcome('The Auth invitation exists, but team access needs owner review.',409);
  } catch {
    return outcome('The invitation request did not finish. Check its saved status before retrying.',503);
  }
}
