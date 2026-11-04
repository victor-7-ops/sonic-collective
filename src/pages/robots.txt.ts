import type { APIRoute } from 'astro';

export const prerender=true;
export const GET:APIRoute=({site})=>new Response(`User-agent: *\nDisallow: /\n${site?`Sitemap: ${new URL('/sitemap.xml',site)}\n`:''}`,{headers:{'Content-Type':'text/plain; charset=utf-8'}});
