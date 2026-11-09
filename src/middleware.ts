import { defineMiddleware } from 'astro:middleware';
import { editorialClient } from './lib/editorial/server';
import { isEditorialPath, isSameOriginMutation, privateHeaders } from './lib/editorial/access';

export const onRequest = defineMiddleware(async (context, next) => {
  if (!isEditorialPath(context.url.pathname)) return next();
  const headers = new Headers(privateHeaders());
  const finish = (response: Response) => {
    for (const [name,value] of headers) response.headers.set(name,value);
    return response;
  };
  if (!['GET','HEAD','POST'].includes(context.request.method)) {
    return finish(new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, POST' } }));
  }
  if (context.request.method === 'POST' && !isSameOriginMutation(context.request)) {
    return finish(new Response('This form must be submitted from Sonic Collective.', { status: 403 }));
  }
  try {
    const client = editorialClient(context, headers);
    if (!client) return finish(new Response('The editorial dashboard is awaiting its separate Supabase connection.', { status: 503 }));
    context.locals.editorialClient = client;
    const open = ['/admin/login/','/admin/recover/','/auth/confirm/','/auth/landing/','/auth/session/'].includes(context.url.pathname);
    const { data: { user }, error } = await client.auth.getUser();
    if (!user || error) {
      if (open) return finish(await next());
      return finish(context.redirect('/admin/login/', 303));
    }
    const membership = await client.from('team_members').select('role').eq('user_id',user.id).eq('active',true).maybeSingle();
    if (membership.error) return finish(new Response('Editorial access could not be verified. Try again later.', { status: 503 }));
    const role = membership.data?.role;
    if (role !== 'owner' && role !== 'editor' && role !== 'contributor') {
      if (open) return finish(await next());
      return finish(new Response('An active Sonic Collective team invitation is required.', { status: 403 }));
    }
    context.locals.editorialMember = { userId: user.id, email: user.email ?? '', role };
    return finish(await next());
  } catch {
    return finish(new Response('The editorial service is temporarily unavailable. Your published site is unaffected.', { status: 503 }));
  }
});
