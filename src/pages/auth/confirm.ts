import type { APIRoute } from 'astro';
export const prerender = false;
export const GET: APIRoute = async ({ url,locals,redirect }) => {
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (!token_hash || token_hash.length > 2048 || !['invite','recovery'].includes(type ?? '')) {
    return new Response('This invitation or recovery link is invalid.',{status:400});
  }
  const result = await locals.editorialClient!.auth.verifyOtp({token_hash,type:type as 'invite'|'recovery'});
  if (result.error) return new Response('This link has expired or was already used. Request a new link.',{status:400});
  return redirect('/admin/account/',303);
};
