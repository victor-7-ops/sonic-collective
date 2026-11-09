import site from '../data/site.json';
import { siteConfigSchema, type Catalog, type Artist, type Clip, type Performance, type Series } from './schemas';
import {getConfiguredReleaseArtifact} from './editorial/releases';

const normalize = <T extends { id: string }>(entries: { id: string; data: Omit<T, 'id'> }[]) => entries.map((entry) => ({ ...entry.data, id: entry.id }) as T);
export async function getRawCatalog(): Promise<Catalog> {
  const release=await getConfiguredReleaseArtifact();
  if(release) return release.catalog;
  const {getCollection}=await import('astro:content');
  const [artists, performances, clips, series] = await Promise.all([
    getCollection('artists'), getCollection('performances'), getCollection('clips'), getCollection('series'),
  ]);
  return {
    artists: normalize<Artist>(artists), performances: normalize<Performance>(performances),
    clips: normalize<Clip>(clips), series: normalize<Series>(series), site: siteConfigSchema.parse(site),
  };
}
export async function getCatalog(): Promise<Catalog> {
  const raw = await getRawCatalog();
  const performances = raw.performances.filter((item) => item.approvedForSite);
  const allowed = new Set(performances.map((item) => item.id));
  const clips = raw.clips.filter((item) => item.approvedForSite && allowed.has(item.performanceId));
  const artistIds = new Set(performances.flatMap((item) => item.artistIds));
  const artists = raw.artists.filter((item) => artistIds.has(item.id));
  return { ...raw, artists, performances, clips };
}
