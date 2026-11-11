import { catalogSchema, mediaManifestEntrySchema, type Catalog } from './schemas';

export type ValidationResult = { ok: boolean; errors: string[]; catalog?: Catalog };
export function validateCatalog(input: unknown, manifestInput: unknown, fileExists: (path: string) => boolean, release = true): ValidationResult {
  const parsed = catalogSchema.safeParse(input);
  const errors: string[] = [];
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`) };
  const c = parsed.data;
  const manifest = manifestInput && typeof manifestInput === 'object' ? manifestInput as Record<string, unknown> : {};
  const checkIds = (kind: string, records: {id:string}[]) => {
    const seen = new Set<string>();
    for (const record of records) { if (seen.has(record.id)) errors.push(`${kind}.${record.id}: duplicate id`); seen.add(record.id); }
  };
  checkIds('artist',c.artists); checkIds('performance',c.performances); checkIds('clip',c.clips); checkIds('series',c.series);
  const checkGallery = (owner: string, gallery: { image: string }[] | undefined) => {
    for (const [index, item] of (gallery ?? []).entries()) {
      const entry = mediaManifestEntrySchema.safeParse(manifest[item.image]);
      if (!entry.success) errors.push(`${owner}.gallery[${index}]: missing or invalid media manifest entry`);
      else for (const v of entry.data.variants) if (!fileExists(v.src)) errors.push(`${owner}.gallery[${index}]: missing file ${v.src}`);
    }
  };
  const seriesIds = new Set(c.series.map((x) => x.id));
  const artistIds = new Set(c.artists.map((x) => x.id));
  const perfs = new Map(c.performances.map((x) => [x.id,x]));
  const videoIds = new Set<string>(); const episodes = new Set<string>();
  for (const p of c.performances) {
    if (videoIds.has(p.youtubeId)) errors.push(`performance.${p.id}.youtubeId: duplicate video id`); videoIds.add(p.youtubeId);
    if (!seriesIds.has(p.seriesId)) errors.push(`performance.${p.id}.seriesId: unknown series`);
    for (const id of p.artistIds) if (!artistIds.has(id)) errors.push(`performance.${p.id}.artistIds: unknown artist ${id}`);
    if (p.episode !== undefined) { const key=`${p.seriesId}:${p.episode}`; if(episodes.has(key)) errors.push(`performance.${p.id}.episode: duplicate episode in ${p.seriesId}`); episodes.add(key); }
    const entry=mediaManifestEntrySchema.safeParse(manifest[p.thumbnail]);
    if (!entry.success) errors.push(`performance.${p.id}.thumbnail: missing or invalid media manifest entry`);
    else for(const v of entry.data.variants) if(!fileExists(v.src)) errors.push(`performance.${p.id}.thumbnail: missing file ${v.src}`);
    checkGallery(`performance.${p.id}`,p.gallery);
  }
  for (const a of c.artists) {
    if (a.portrait) {
    if(!a.portraitAlt) errors.push(`artist.${a.id}.portraitAlt: required for portrait`);
    const entry=mediaManifestEntrySchema.safeParse(manifest[a.portrait]);
    if (!entry.success) errors.push(`artist.${a.id}.portrait: missing or invalid media manifest entry`);
    else for(const v of entry.data.variants) if(!fileExists(v.src)) errors.push(`artist.${a.id}.portrait: missing file ${v.src}`);
    }
    checkGallery(`artist.${a.id}`,a.gallery);
    for (const link of a.links) if (!link.url.startsWith('https://')) errors.push(`artist.${a.id}.links: only HTTPS URLs are allowed`);
  }
  for(const clip of c.clips){
    const parent=perfs.get(clip.performanceId);
    if(!parent) errors.push(`clip.${clip.id}.performanceId: unknown performance ${clip.performanceId}`);
    if(clip.approvedForSite && parent && !parent.approvedForSite) errors.push(`clip.${clip.id}: approved clip has an unapproved parent`);
    for(const p of [clip.src,clip.poster]) if(!fileExists(p)) errors.push(`clip.${clip.id}: missing file ${p}`);
  }
  const checkFeatured=<T extends {id:string} & Partial<Pick<import('./schemas').Performance,'approvedForSite'|'seriesId'>>>(kind:string,ids:string[],records:Map<string,T>,series?:string)=>{
    for(const id of ids){const item=records.get(id);if(!item)errors.push(`site.${kind}: unknown id ${id}`);else if(release&&item.approvedForSite===false)errors.push(`site.${kind}: ${id} is not approved`);else if(series&&item.seriesId!==series)errors.push(`site.${kind}: ${id} is not in ${series}`);}
  };
  if(c.site.spotlightPerformanceIds) checkFeatured('spotlightPerformanceIds',c.site.spotlightPerformanceIds,perfs);
  checkFeatured('featuredPerformanceIds',c.site.featuredPerformanceIds,perfs);
  checkFeatured('featuredCoverIds',c.site.featuredCoverIds,perfs,'covers');
  const artistMap=new Map(c.artists.map((x)=>[x.id,x])); checkFeatured('featuredArtistIds',c.site.featuredArtistIds,artistMap);
  const hero=perfs.get(c.site.hero.performanceId);
  if(!hero) errors.push('site.hero.performanceId: unknown performance'); else if(release&&!hero.approvedForSite) errors.push('site.hero.performanceId: hero is not approved');
  if(hero&&hero.thumbnail!==c.site.hero.poster) errors.push('site.hero.poster: must match hero performance artwork');
  if(c.site.hero.portraitClipId){const clip=c.clips.find((x)=>x.id===c.site.hero.portraitClipId);if(!clip)errors.push('site.hero.portraitClipId: unknown clip');else if(c.site.hero.portraitPerformanceId!==clip.performanceId)errors.push('site.hero.portraitPerformanceId: does not match teaser clip parent');if(!c.site.hero.portraitPoster||!fileExists(c.site.hero.portraitPoster))errors.push('site.hero.portraitPoster: missing teaser poster');if(!c.site.hero.portraitLoopSrc||!fileExists(c.site.hero.portraitLoopSrc))errors.push('site.hero.portraitLoopSrc: missing teaser loop');}
  if(!c.performances.some((x)=>x.approvedForSite))errors.push('performances: no approved content');
  return {ok:errors.length===0,errors,catalog:c};
}

