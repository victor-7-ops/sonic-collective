import type {SupabaseClient} from '@supabase/supabase-js';
import {ZodError} from 'zod';
import type {Database,Tables} from './database.types';
import {parseEditorialPayload,type EditorialKind} from './content';
import {applyEditorialForm} from './forms';

type Outcome = {redirect:string} | {payload:Record<string,unknown>;message:string;status:400|409};
export async function applyContentAction(
  client:SupabaseClient<Database>,
  item:Tables<'content_items'>,
  kind:EditorialKind,
  current:Record<string,unknown>,
  form:URLSearchParams,
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
      const expected=Number(form.get('version'));
      if(!form.has('version')||!Number.isSafeInteger(expected)||expected!==item.version) throw new Error('Content changed. Reload before changing its archive state.');
      const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if(assurance.error||assurance.data.currentLevel!=='aal2') throw new Error('Verify your authenticator in Account before archiving content.');
      const result=await client.rpc('archive_editorial_content',{p_item_id:item.id,p_expected_version:expected,p_archived:archived});
      if(result.error) {
        status=result.error.code==='40001'?409:400;
        throw new Error(status===409?'Content changed or is already in that archive state. Reload and try again.':'The archive action was not permitted or could not be completed.');
      }
      return {redirect:`${editorPath}?${archived?'archived':'unarchived'}=1`};
    }
    if(item.archived_at) throw new Error('Archived content is read-only. Restore it before editing.');
    if(action==='save'||action==='restore') {
      if(action==='restore') {
        const revision=form.get('revision');
        if(!revision||!/^[a-f\d-]{36}$/i.test(revision)) throw new Error('Choose a saved revision to restore.');
        const restored=await client.from('content_revisions').select('payload').eq('id',revision).eq('item_id',item.id).maybeSingle();
        if(restored.error||!restored.data) throw new Error('The revision could not be restored.');
        payload=restored.data.payload as Record<string,unknown>;
        restoredFrom=revision;
      } else payload=applyEditorialForm(kind,payload,form);
      const validated=parseEditorialPayload(kind,item.stable_id,payload);
      const expected=Number(form.get('version'));
      if(!form.has('version')||!Number.isSafeInteger(expected)||expected<1) throw new Error('Invalid revision. Reload the content.');
      const result=await client.rpc('save_editorial_content',{p_kind:kind,p_stable_id:item.stable_id,p_payload:validated,p_expected_version:expected});
      if(result.error) {
        status=result.error.code==='40001'?409:400;
        throw new Error(status===409?'Someone saved a newer revision. Copy your changes before reloading; your input is preserved below.':'The draft could not be saved. Try again later.');
      }
      const savedVersion=expected+1;
      return {redirect:restoredFrom?`${editorPath}?restoredFrom=${restoredFrom}&restoredAs=${savedVersion}`:`${editorPath}?saved=1`};
    }
    if(action!=='submit'&&action!=='approve'&&action!=='request-changes') throw new Error('Unknown content action.');
    const revision=form.get('revision');
    if(!revision||!/^[a-f\d-]{36}$/i.test(revision)) throw new Error('Choose a saved revision to review.');
    if(action!=='submit') {
      const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if(assurance.error||assurance.data.currentLevel!=='aal2') throw new Error('Verify your authenticator in Account before approving content.');
    }
    const result=await client.rpc('review_editorial_content',{p_item_id:item.id,p_revision_id:revision,p_action:action});
    if(result.error) {
      status=result.error.code==='40001'?409:400;
      throw new Error(status===409?'A newer revision exists. Reload and review it.':'The review action was not permitted or could not be saved.');
    }
    return {redirect:editorPath};
  } catch(error) {
    const message=error instanceof ZodError?error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '):error instanceof Error?error.message:'Unable to save.';
    return {payload,message,status};
  }
}
