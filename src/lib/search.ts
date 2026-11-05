import type { Artist, CatalogQuery, Performance } from './schemas';

export const normalizeSearch = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
export function parseCatalogQuery(search: URLSearchParams | string): CatalogQuery {
  const params = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const format=params.get('format');
  const series = params.get('series'); const sort = params.get('sort');
  return { format: format==='full'||format==='short'||format==='unreviewed'?format:'all', q: (params.get('q') ?? '').trim().slice(0, 100), series: series === 'sessions' || series === 'covers' ? series : 'all', sort: sort === 'az' || sort === 'newest' ? sort : 'featured' };
}
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
export function filterPerformances(items: Performance[], artists: Artist[], query: CatalogQuery): Performance[] {
  const artistMap = new Map(artists.map((a) => [a.id, a]));
  const tokens = normalizeSearch(query.q).split(' ').filter(Boolean);
  return items.filter((item) => {
    if (query.series !== 'all' && item.seriesId !== query.series) return false;
    const participants = item.artistIds.flatMap((id) => { const a=artistMap.get(id); return a ? [a.name, ...a.aliases] : []; });
    const haystack = normalizeSearch([item.title, item.originalTitle ?? '', ...item.aliases, ...participants].join(' '));
    return tokens.every((token) => haystack.includes(token));
  }).slice().sort((a,b) => query.sort === 'az' ? collator.compare(a.title,b.title) || a.id.localeCompare(b.id) : query.sort==='newest' ? (Date.parse(b.publishedAt??'')||0)-(Date.parse(a.publishedAt??'')||0)||a.id.localeCompare(b.id) : a.featuredOrder-b.featuredOrder || a.id.localeCompare(b.id));
}
export function filterCatalogItems<T extends {id:string;title:string;searchText:string;seriesId:'sessions'|'covers'|null;source:'curated'|'youtube';featuredOrder?:number;publishedAt?:string;format?:'full'|'short'}>(items:T[],query:CatalogQuery):T[] {
  const tokens=normalizeSearch(query.q).split(' ').filter(Boolean);
  return items.filter((item)=>(!query.format||query.format==='all'||(query.format==='unreviewed'?!item.format:item.format===query.format))&&(query.series==='all'||item.seriesId===query.series)&&tokens.every((token)=>normalizeSearch(item.searchText).includes(token))).slice().sort((a,b)=>{
    if(query.sort==='az')return collator.compare(a.title,b.title)||a.id.localeCompare(b.id);
    const date=(item:T)=>item.publishedAt?Date.parse(item.publishedAt):NaN;
    if(query.sort==='newest')return (Number.isFinite(date(b))?date(b):-Infinity)-(Number.isFinite(date(a))?date(a):-Infinity)||a.id.localeCompare(b.id);
    if(a.source!==b.source)return a.source==='curated'?-1:1;
    return a.source==='curated'?(a.featuredOrder??Infinity)-(b.featuredOrder??Infinity)||a.id.localeCompare(b.id):(Number.isFinite(date(b))?date(b):-Infinity)-(Number.isFinite(date(a))?date(a):-Infinity)||a.id.localeCompare(b.id);
  });
}
