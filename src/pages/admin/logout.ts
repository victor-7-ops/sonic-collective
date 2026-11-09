import type { APIRoute } from 'astro';
export const prerender = false;
export const POST: APIRoute = async ({ locals, redirect }) => {
  const result = await locals.editorialClient!.auth.signOut();
  if (result.error) return new Response('Sign out failed. Please try again.', { status: 503 });
  return redirect('/admin/login/',303);
};
