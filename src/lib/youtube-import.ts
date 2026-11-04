import { createHash } from 'node:crypto';
import { z } from 'zod';

export const importedVideoSchema = z.object({
  youtubeId: z.string().regex(/^[\w-]{11}$/), channelId: z.string().min(1), title: z.string().min(1),
  thumbnailUrl: z.url().refine((value) => new URL(value).protocol === 'https:' && new URL(value).hostname === 'i.ytimg.com'),
  publishedAt: z.iso.datetime({ offset: true }), durationSeconds: z.number().int().positive(),
  seriesId: z.enum(['sessions', 'covers']).nullable(), embeddable: z.boolean(),
});
export const youtubeSnapshotSchema = z.object({
  schemaVersion: z.literal(1), initialized: z.boolean(), channelId: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  validatedAt: z.iso.datetime({ offset: true }).nullable(), expiresAt: z.iso.datetime({ offset: true }).nullable(),
  purged: z.object({ at: z.iso.datetime({ offset: true }), reason: z.literal('expired') }).optional(),
  videos: z.array(importedVideoSchema),
});
export type ImportedVideo = z.infer<typeof importedVideoSchema>;
export type YoutubeSnapshot = z.infer<typeof youtubeSnapshotSchema>;
export const emptySnapshot = (channelId: string): YoutubeSnapshot => ({ schemaVersion: 1, initialized: false, channelId, contentHash: hashVideos([]), validatedAt: null, expiresAt: null, videos: [] });
export function hashVideos(videos: ImportedVideo[]) {
  const canonical = [...videos].sort((a, b) => a.youtubeId.localeCompare(b.youtubeId)).map((v) => ({ youtubeId:v.youtubeId,channelId:v.channelId,title:v.title,thumbnailUrl:v.thumbnailUrl,publishedAt:v.publishedAt,durationSeconds:v.durationSeconds,seriesId:v.seriesId,embeddable:v.embeddable }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export function parseDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return null;
  if(value.includes('T')&&!match.slice(2).some(Boolean))return null;
  const seconds = Number(match[1] ?? 0)*86400+Number(match[2] ?? 0)*3600+Number(match[3] ?? 0)*60+Number(match[4] ?? 0);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}
export function makeSnapshot(videos: ImportedVideo[], channelId: string, now = new Date(), initialized = true): YoutubeSnapshot {
  const unique = [...new Map(videos.map((video) => [video.youtubeId, importedVideoSchema.parse(video)])).values()].sort((a,b)=>a.youtubeId.localeCompare(b.youtubeId));
  return youtubeSnapshotSchema.parse({ schemaVersion:1,initialized,channelId,contentHash:hashVideos(unique),validatedAt:initialized?now.toISOString():null,expiresAt:initialized?new Date(now.getTime()+30*86400000).toISOString():null,videos:initialized?unique:[] });
}
export function validateSnapshot(input: unknown, channelId?: string): YoutubeSnapshot {
  const snapshot=youtubeSnapshotSchema.parse(input);
  if(channelId&&snapshot.channelId!==channelId)throw new Error('Snapshot channel does not match configured channel');
  if(new Set(snapshot.videos.map((video)=>video.youtubeId)).size!==snapshot.videos.length)throw new Error('Snapshot contains duplicate YouTube IDs');
  if(snapshot.contentHash!==hashVideos(snapshot.videos))throw new Error('Snapshot content hash does not match its records');
  if(snapshot.initialized&&(!snapshot.validatedAt||!snapshot.expiresAt))throw new Error('Initialized snapshot is missing freshness timestamps');
  if(!snapshot.initialized&&(snapshot.videos.length||snapshot.validatedAt||snapshot.expiresAt))throw new Error('Uninitialized snapshot cannot contain imported metadata');
  return snapshot;
}
export function purgeExpiredSnapshot(snapshot:YoutubeSnapshot,now=new Date()):YoutubeSnapshot {
  if(snapshot.purged||!snapshot.initialized||!snapshot.expiresAt||Date.parse(snapshot.expiresAt)>now.getTime())return snapshot;
  const purged=makeSnapshot([],snapshot.channelId,now);purged.purged={at:now.toISOString(),reason:'expired'};return purged;
}
