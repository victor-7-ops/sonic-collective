import type { APIRoute } from 'astro';
import { getYoutubeSnapshot, feedSnapshot } from '../lib/discovery';

export const prerender = true;
export const GET: APIRoute = async () => new Response(JSON.stringify(feedSnapshot(await getYoutubeSnapshot())), {
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
});
