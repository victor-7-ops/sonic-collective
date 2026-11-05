import type { APIRoute } from 'astro';

export const prerender=true;
const indexable=import.meta.env.PUBLIC_INDEXABLE==='true'||import.meta.env.VERCEL_ENV==='production';
export const GET:APIRoute=({site})=>new Response(`User-agent: *\n${indexable?'Allow: /':'Disallow: /'}\n${site?`Sitemap: ${new URL('/sitemap.xml',site)}\n`:''}`,{headers:{'Content-Type':'text/plain; charset=utf-8'}});
