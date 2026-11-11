import {tableDigest,type Row} from './backup';

/** Supabase Auth accounts, without secrets: password hashes and tokens are never exposed by the API or stored here. */
export type AuthUser={
  id:string;email:string|null;createdAt:string|null;confirmedAt:string|null;lastSignInAt:string|null;
  bannedUntil:string|null;providers:string[];
};
type RawUser={
  id?:unknown;email?:unknown;created_at?:unknown;email_confirmed_at?:unknown;last_sign_in_at?:unknown;banned_until?:unknown;
  app_metadata?:{providers?:unknown};
};

const text=(value:unknown)=>typeof value==='string'&&value?value:null;

export function toAuthUser(raw:RawUser):AuthUser|null {
  const id=text(raw.id);
  if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const providers=Array.isArray(raw.app_metadata?.providers)?(raw.app_metadata!.providers as unknown[]).filter((p):p is string=>typeof p==='string').sort():[];
  return {
    id,email:text(raw.email),createdAt:text(raw.created_at),confirmedAt:text(raw.email_confirmed_at),
    lastSignInAt:text(raw.last_sign_in_at),bannedUntil:text(raw.banned_until),providers,
  };
}

/** Reads every account through a paged reader (the Auth admin API). Throws rather than returning a partial list. */
export async function exportAuthUsers(listPage:(page:number,perPage:number)=>Promise<{users:RawUser[]}>,perPage=200):Promise<AuthUser[]> {
  const users=new Map<string,AuthUser>();
  for(let page=1;page<=1000;page++) {
    const batch=(await listPage(page,perPage)).users;
    for(const raw of batch) {
      const user=toAuthUser(raw);
      if(!user) throw new Error('An Auth account had no valid ID; the backup was stopped.');
      users.set(user.id,user);
    }
    if(batch.length<perPage) return [...users.values()].sort((a,b)=>a.id<b.id?-1:1);
  }
  throw new Error('Too many Auth accounts to export safely.');
}

export const authDigest=(users:AuthUser[])=>tableDigest(users as unknown as Row[]);

/** Every account the CMS refers to must exist in the Auth backup, otherwise a restore would break references. */
export function checkAuthCoverage(users:readonly AuthUser[],referencedIds:Iterable<string>):string[] {
  const known=new Set(users.map(user=>user.id));
  const missing=[...new Set(referencedIds)].filter(id=>!known.has(id));
  return missing.length?[`${missing.length} account${missing.length===1?'':'s'} referenced by the CMS ${missing.length===1?'is':'are'} missing from the Auth backup.`]:[];
}

export type AuthAdmin={auth:{admin:{createUser(attributes:Record<string,unknown>):Promise<{error:{message:string}|null}>}}};

/**
 * Recreates accounts with their original IDs so every CMS reference still resolves. Passwords cannot be restored;
 * each person signs in through a recovery link. Not exercised against a real project yet; dryRun lists what would be created.
 */
export async function restoreAuthUsers(admin:AuthAdmin,users:readonly AuthUser[],options:{dryRun?:boolean}={}):Promise<{created:string[];skipped:string[];failed:string[]}> {
  const result={created:[] as string[],skipped:[] as string[],failed:[] as string[]};
  for(const user of users) {
    if(!user.email) {result.skipped.push(user.id);continue;}
    if(options.dryRun) {result.created.push(user.id);continue;}
    const outcome=await admin.auth.admin.createUser({id:user.id,email:user.email,email_confirm:Boolean(user.confirmedAt)});
    (outcome.error?result.failed:result.created).push(user.id);
  }
  return result;
}

// Every column in the editorial tables that points at an Auth account (see the migrations' "references auth.users").
const accountColumns=['user_id','owner_id','created_by','actor_id','target_user_id','old_owner_id','new_owner_id','requested_by','auth_user_id','author_id','set_by'];

export function referencedAccountIds(data:Record<string,Row[]>):string[] {
  const ids=new Set<string>();
  for(const rows of Object.values(data)) for(const row of rows) for(const column of accountColumns) {
    const value=row[column];
    if(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) ids.add(value);
  }
  return [...ids];
}
