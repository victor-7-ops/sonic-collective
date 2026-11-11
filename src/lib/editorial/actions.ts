import type {SupabaseClient} from '@supabase/supabase-js';
import {ZodError} from 'zod';
import type {Database,Tables} from './database.types';
import {parseEditorialPayload,type EditorialKind} from './content';
import {applyEditorialForm} from './forms';
import type {MediaChoices} from './media-choices';
import {checkFullMapping} from './inbox';
import {mfaRequirementUnmet} from './mfa';

type Outcome = {redirect:string} | {payload:Record<string,unknown>;message:string;status:400|409;submitted:[string,string][]};

/** What the editor submitted, returned with a refused save so the page can put it back in the form. */
export function submittedValues(form:URLSearchParams):[string,string][] {
  return [...form.entries()].filter(([key])=>!['action','version','revision','requestId'].includes(key));
}
/** The revision the editor chose, or null if it is missing or not an ID. */
const chosenRevision=(form:URLSearchParams):string|null=>{
  const value=form.get('revision');
  return value&&/^[a-f\d-]{36}$/i.test(value)?value:null;
};
/** The item version the form was loaded at, or null if absent or not a whole number. */
const formVersion=(form:URLSearchParams):number|null=>{
  const value=Number(form.get('version'));
  return form.has('version')&&Number.isSafeInteger(value)?value:null;
};
/** Serialization failures mean someone else changed the record first. */
const statusFor=(error:{code?:string}):400|409=>error.code==='40001'?409:400;

export async function applyContentAction(
  client:SupabaseClient<Database>,
  item:Tables<'content_items'>,
  kind:EditorialKind,
  current:Record<string,unknown>,
  form:URLSearchParams,
  choices?:{fullYoutubeIds?:readonly string[];media?:MediaChoices},
):Promise<Outcome> {
  let payload=current;
  let status:400|409=400;
  let restoredFrom:string|undefined;
  try {
    const action=form.get('action');
    const editorPath=`/admin/content/${item.id}/`;
    if(action==='archive'||action==='unarchive') {
      const archived=action==='archive';
      if(Boolean(item.archived_at)===archived) throw new Error('The archive state changed. Reload and try again.');
      const expected=formVersion(form);
      if(expected===null||expected!==item.version) throw new Error('Content changed. Reload before changing its archive state.');
      const unmet=await mfaRequirementUnmet(client);
      if(unmet) throw new Error('Verify your authenticator in Account before archiving content.');
      const result=await client.rpc('archive_editorial_content',{p_item_id:item.id,p_expected_version:expected,p_archived:archived});
      if(result.error) {
        status=statusFor(result.error);
        throw new Error(status===409?'Content changed or is already in that archive state. Reload and try again.':'The archive action was not permitted or could not be completed.');
      }
      return {redirect:`${editorPath}?${archived?'archived':'unarchived'}=1`};
    }
    if(item.archived_at) throw new Error('Archived content is read-only. Restore it before editing.');
    if(action==='save'||action==='restore') {
      if(action==='restore') {
        const revision=chosenRevision(form);
        if(!revision) throw new Error('Choose a saved revision to restore.');
        const restored=await client.from('content_revisions').select('payload').eq('id',revision).eq('item_id',item.id).maybeSingle();
        if(restored.error||!restored.data) throw new Error('The revision could not be restored.');
        payload=restored.data.payload as Record<string,unknown>;
        restoredFrom=revision;
      } else payload=applyEditorialForm(kind,payload,form,choices?.media);
      const validated=parseEditorialPayload(kind,item.stable_id,payload);
      if(kind==='youtube-review'&&action==='save') checkFullMapping(item.stable_id,payload,current,choices?.fullYoutubeIds??[]);
      const expected=formVersion(form);
      if(expected===null||expected<1) throw new Error('Invalid revision. Reload the content.');
      const result=await client.rpc('save_editorial_content',{p_kind:kind,p_stable_id:item.stable_id,p_payload:validated,p_expected_version:expected});
      if(result.error) {
        status=statusFor(result.error);
        throw new Error(status===409?'Someone saved a newer revision. Copy your changes before reloading; your input is preserved below.':'The draft could not be saved. Try again later.');
      }
      const savedVersion=expected+1;
      return {redirect:restoredFrom?`${editorPath}?restoredFrom=${restoredFrom}&restoredAs=${savedVersion}`:`${editorPath}?saved=1`};
    }
    if(action!=='submit'&&action!=='approve'&&action!=='request-changes') throw new Error('Unknown content action.');
    const revision=chosenRevision(form);
    if(!revision) throw new Error('Choose a saved revision to review.');
    if(action!=='submit') {
      const unmet=await mfaRequirementUnmet(client);
      if(unmet) throw new Error('Verify your authenticator in Account before approving content.');
    }
    let result;
    if(action==='request-changes') {
      const comment=(form.get('comment')??'').trim();
      if(!comment||comment.length>2000) throw new Error('Explain what needs to change (1 to 2000 characters).');
      result=await client.rpc('request_editorial_changes',{p_item_id:item.id,p_revision_id:revision,p_body:comment});
    } else result=await client.rpc('review_editorial_content',{p_item_id:item.id,p_revision_id:revision,p_action:action});
    if(result.error) {
      status=statusFor(result.error);
      throw new Error(status===409?'A newer revision exists. Reload and review it.':'The review action was not permitted or could not be saved.');
    }
    return {redirect:editorPath};
  } catch(error) {
    const message=error instanceof ZodError?error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '):error instanceof Error?error.message:'Unable to save.';
    return {payload,message,status,submitted:form.get('action')==='save'?submittedValues(form):[]};
  }
}
