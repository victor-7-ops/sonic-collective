import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';

/**
 * Authenticator use is optional: it is required only for accounts that enrolled a verified factor
 * (their next assurance level is aal2). Mirrors editorial_private.mfa_unmet() in the database.
 * Failure to read the level is treated as unmet so privileged actions fail closed.
 */
export async function mfaRequirementUnmet(client:SupabaseClient<Database>):Promise<boolean> {
  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.error) return true;
  return assurance.data.currentLevel!=='aal2'&&assurance.data.nextLevel==='aal2';
}
