import type { Artist, Performance } from './schemas';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const localPath = (id: string, kind: 'sessions' | 'artists') => `/${kind}/${encodeURIComponent(id)}/`;
export const performanceUrl = (id: string) => localPath(id, 'sessions');
export const artistUrl = (id: string) => localPath(id, 'artists');
export function youtubeUrl(id: string): string {
  if (!VIDEO_ID.test(id)) throw new TypeError('Invalid YouTube video ID');
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}
export function canonicalUrl(path: string, origin?: string): string | undefined {
  if (!origin) return undefined;
  let url: URL;
  try { url = new URL(origin); } catch { return undefined; }
  if (!['https:', 'http:'].includes(url.protocol) || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return undefined;
  const pathname = path.startsWith('/') ? path : `/${path}`;
  return new URL(pathname.endsWith('/') ? pathname : `${pathname}/`, url.origin).toString();
}
export function artistNamesFor(performance: Performance, artists: Artist[]): string[] {
  const byId = new Map(artists.map((artist) => [artist.id, artist.name]));
  return performance.artistIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
}
