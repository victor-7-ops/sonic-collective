import type { APIRoute } from 'astro';
import { getDiscoveryCatalog } from '../lib/discovery';
import legacyRoutes from '../data/legacy-watch-routes.json';
import { canonicalUrl, performanceUrl, artistUrl } from '../lib/urls';

export const prerender=true;
export const GET:APIRoute=async({site})=>{
  if(!site)return new Response('Sitemap deferred until SITE_URL is configured.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  const catalog=await getDiscoveryCatalog();
  const paths=['/','/about/','/sessions/','/artists/',...catalog.performances.map((item)=>performanceUrl(item.id)),...catalog.artists.map((item)=>artistUrl(item.id)),...catalog.imported.map((item)=>item.href),...(legacyRoutes as {youtubeId:string}[]).map((item)=>`/watch/${item.youtubeId}/`)];
  const urls=[...new Set(paths.map((path)=>canonicalUrl(path,site.toString())).filter((url):url is string=>!!url))];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url)=>`<url><loc>${url.replaceAll('&','&amp;')}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
