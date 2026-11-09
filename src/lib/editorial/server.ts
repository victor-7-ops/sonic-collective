import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { APIContext } from 'astro';
import type { Database } from './database.types';

function editorialConnection() {
  const url = process.env.SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const target = new URL(url);
  if (target.protocol !== 'https:' && !(import.meta.env.DEV && ['localhost','127.0.0.1'].includes(target.hostname))) {
    throw new Error('Invalid editorial backend URL');
  }
  return { url, key };
}

export function editorialClient(context: APIContext, responseHeaders: Headers) {
  const connection=editorialConnection();
  if(!connection) return null;
  const { url,key }=connection;
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => parseCookieHeader(context.request.headers.get('cookie') ?? '')
        .map(({ name, value }) => ({ name, value: value ?? '' })),
      setAll(cookies, headers) {
        for (const { name, value, options } of cookies) {
          context.cookies.set(name, value, { ...options, path: '/', httpOnly: true, sameSite: 'lax', secure: context.url.protocol === 'https:' });
        }
        for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
      },
    },
  });
}

export function sendPasswordRecovery(email:string,redirectTo:string) {
  const connection=editorialConnection();
  if(!connection) throw new Error('Editorial connection unavailable');
  // Recovery email may open in a different browser; the landing endpoint verifies its tokens before setting cookies.
  const client=createClient<Database>(connection.url,connection.key,{
    auth:{flowType:'implicit',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  return client.auth.resetPasswordForEmail(email,{redirectTo});
}

// Call only after current user, role and MFA checks; this client bypasses RLS.
export function editorialAdminClient() {
  const connection=editorialConnection();
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!connection||!secret) return null;
  return createClient<Database>(connection.url,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
}
